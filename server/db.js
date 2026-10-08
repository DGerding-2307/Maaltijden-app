import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { seedDatabase } from './seed.js';

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
  price_source TEXT DEFAULT 'schatting', -- schatting | handmatig (| jumbo uit eerdere versies)
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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let db;

export function openDatabase(file = process.env.DB_FILE || path.resolve('data/maaltijden.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  const count = db.prepare('SELECT COUNT(*) AS c FROM ingredients').get().c;
  if (count === 0 && process.env.SKIP_SEED !== '1') seedDatabase(db);
  return db;
}

// Kolommen die in latere versies zijn toegevoegd; bestaande databases worden automatisch bijgewerkt.
const MIGRATIONS = [
  ['ingredients', 'off_code', 'TEXT'],
  ['ingredients', 'nutriscore', 'TEXT'],
  ['ingredients', 'nutrition_updated_at', 'TEXT'],
  ['meal_plan', 'leftover_of', 'INTEGER'],
  ['shopping_state', 'have', 'INTEGER NOT NULL DEFAULT 0'],
];

function migrate(db) {
  for (const [table, column, type] of MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  // De Jumbo-accountkoppeling is verwijderd: een eventueel bewaarde sessie opruimen.
  db.prepare("DELETE FROM settings WHERE key IN ('jumbo_token', 'jumbo_email')").run();
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
