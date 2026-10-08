import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltins, OFF_CATEGORY_BY_NAME } from './seed.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  aliases TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Overig',
  -- voedingswaarden per 100 g
  kcal REAL, protein REAL, carbs REAL, sugar REAL, fat REAL, sat_fat REAL, fiber REAL, salt REAL,
  unit_weight_g REAL,          -- gewicht van 1 stuk/teen/blik etc.
  density REAL DEFAULT 1,      -- g per ml
  pantry INTEGER NOT NULL DEFAULT 0, -- voorraadkast (zout, olie...) → niet standaard op boodschappenlijst
  -- prijsinformatie (geschatte supermarktprijs; jumbo_*-kolommen zijn uit eerdere versies en worden niet meer gevuld)
  price_cents INTEGER,         -- prijs van één verpakking
  package_grams REAL,          -- inhoud van één verpakking in gram
  package_label TEXT,
  jumbo_id TEXT, jumbo_name TEXT, jumbo_url TEXT, jumbo_query TEXT, jumbo_image TEXT,
  price_source TEXT DEFAULT 'schatting', -- schatting | open prices | handmatig (| jumbo uit eerdere versies)
  price_updated_at TEXT,
  nutrition_source TEXT DEFAULT 'NEVO (benadering)'
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  servings INTEGER NOT NULL DEFAULT 4,
  prep_minutes INTEGER, cook_minutes INTEGER,
  category TEXT NOT NULL DEFAULT 'Hoofdgerecht',
  cuisine TEXT NOT NULL DEFAULT 'Nederlands',
  tags TEXT NOT NULL DEFAULT '[]',
  steps TEXT NOT NULL DEFAULT '[]',
  image_url TEXT, source_url TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  rating INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity REAL,
  unit TEXT NOT NULL DEFAULT '',
  grams REAL,
  note TEXT NOT NULL DEFAULT '',
  optional INTEGER NOT NULL DEFAULT 0,
  section TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_ingredients(recipe_id);

CREATE TABLE IF NOT EXISTS meal_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- YYYY-MM-DD
  meal TEXT NOT NULL DEFAULT 'diner',
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
  title TEXT,                      -- vrije invoer (bv. "uit eten", "restjes")
  servings INTEGER NOT NULL DEFAULT 2,
  note TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_plan_date ON meal_plan(date);

CREATE TABLE IF NOT EXISTS shopping_state (
  week TEXT NOT NULL,
  item_key TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, item_key)
);

CREATE TABLE IF NOT EXISTS shopping_extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL,
  name TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS off_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sex TEXT,                     -- 'm' | 'v'
  birth_year INTEGER,
  height_cm REAL,
  activity REAL DEFAULT 1.375,
  goal TEXT DEFAULT 'onderhoud', -- afvallen | onderhoud | aankomen
  start_weight_kg REAL,
  target_weight_kg REAL,
  kcal_target_override INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS food_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal TEXT NOT NULL DEFAULT 'tussendoor',
  type TEXT NOT NULL DEFAULT 'free',       -- recipe | ingredient | free
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  plan_entry_id INTEGER REFERENCES meal_plan(id) ON DELETE SET NULL,
  servings REAL, grams REAL,
  name TEXT NOT NULL,
  kcal REAL, protein REAL, carbs REAL, sugar REAL, fat REAL, sat_fat REAL, fiber REAL, salt REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_food_log_day ON food_log(person_id, date);

CREATE TABLE IF NOT EXISTS weight_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (person_id, date)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let db;
let lastSync = null;

/** Wat de laatste start heeft toegevoegd aan standaardrecepten en -ingrediënten. */
export function lastBuiltinSync() {
  return lastSync;
}

/**
 * @param file        databasebestand
 * @param appVersion  versie van de app; bij een andere versie dan de vorige keer wordt eerst een back-up gemaakt
 */
export function openDatabase(file = process.env.DB_FILE || path.resolve('data/maaltijden.db'), { appVersion = null } = {}) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  if (appVersion && file !== ':memory:') backupBeforeUpgrade(file, appVersion);
  db.exec(SCHEMA);
  migrate(db);
  const count = db.prepare('SELECT COUNT(*) AS c FROM ingredients').get().c;
  // Nieuwe database: alles invullen. Bestaande database: nieuwe standaardrecepten en -ingrediënten toevoegen.
  if (process.env.SKIP_SEED !== '1') lastSync = syncBuiltins(db, { fresh: count === 0 });
  if (appVersion) setSetting('app_version', appVersion);
  return db;
}

/**
 * Bij een nieuwe versie: eerst een kopie van de database maken in data/backups/ (de laatste 5 blijven bewaard),
 * zodat je na een mislukte update altijd terug kunt.
 */
function backupBeforeUpgrade(file, appVersion) {
  const hasSettings = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get();
  if (!hasSettings) return;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'app_version'").get();
  const previous = row ? JSON.parse(row.value) : 'onbekend';
  if (previous === appVersion) return;
  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const target = path.join(dir, `maaltijden-${String(previous).replace(/[^\w.-]/g, '_')}-${stamp}.db`);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const old = fs.readdirSync(dir).filter((f) => f.startsWith('maaltijden-') && f.endsWith('.db')).sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
  for (const f of old.slice(5)) fs.rmSync(path.join(dir, f), { force: true });
  console.log(`Back-up gemaakt vóór update ${previous} → ${appVersion}: ${target}`);
}

// Kolommen die in latere versies zijn toegevoegd; bestaande databases worden automatisch bijgewerkt.
const MIGRATIONS = [
  ['ingredients', 'off_code', 'TEXT'],
  ['ingredients', 'nutriscore', 'TEXT'],
  ['ingredients', 'nutrition_updated_at', 'TEXT'],
  ['meal_plan', 'leftover_of', 'INTEGER'],
  ['shopping_state', 'have', 'INTEGER NOT NULL DEFAULT 0'],
  ['ingredients', 'off_category', 'TEXT'],
  ['ingredients', 'price_count', 'INTEGER'],
  ['ingredients', 'price_note', 'TEXT'],
  ['recipes', 'builtin_key', 'TEXT'],
  ['recipes', 'image_credit', 'TEXT'],
  ['ingredients', 'image_url', 'TEXT'],
  ['ingredients', 'shop_url', 'TEXT'],
];

function migrate(db) {
  for (const [table, column, type] of MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  // De Jumbo-accountkoppeling is verwijderd: een eventueel bewaarde sessie opruimen.
  db.prepare("DELETE FROM settings WHERE key IN ('jumbo_token', 'jumbo_email')").run();
  // 'pandanrijst' is sinds v2.4 een eigen ingrediënt
  db.prepare("UPDATE ingredients SET aliases = replace(aliases, 'pandanrijst,', '') WHERE name = 'witte rijst'").run();
  // Bestaande databases: Open Food Facts-categorie invullen voor de standaardingrediënten
  const setCat = db.prepare('UPDATE ingredients SET off_category = ? WHERE name = ? AND off_category IS NULL');
  for (const [name, tag] of Object.entries(OFF_CATEGORY_BY_NAME)) setCat.run(tag, name);
}

export function getDb() {
  if (!db) openDatabase();
  return db;
}

/** Voer een functie uit binnen een transactie. */
export function tx(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn(d);
    d.exec('COMMIT');
    return result;
  } catch (err) {
    d.exec('ROLLBACK');
    throw err;
  }
}

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value) {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}
