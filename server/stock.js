// Voorraad (v4.12): wat er in huis is, per pak met een eigen THT-datum.
// Inboeken: boodschap afvinken, barcode scannen of zelf toevoegen.
// Uitboeken: 'Gekookt' bij een recept (oudste THT eerst), uitscannen of zelf afboeken.
import { getDb, tx } from './db.js';
import * as repo from './repo.js';
import { knownBarcode } from './scan.js';

/** Gewicht van één stuk als het ingrediënt per stuk gaat (eieren, paprika's...), anders null. Zelfde grens als elders: ≥ 30 g. */
export const pieceWeight = (ing) => (Number(ing?.unit_weight_g) >= 30 ? Number(ing.unit_weight_g) : null);
/** Gram omrekenen naar hele stuks voor ingrediënten die per stuk gaan; komt het niet op hele stuks uit (300 g kipfilet), dan null. */
export const toPieces = (grams, ing) => {
  const w = pieceWeight(ing);
  if (!w) return null;
  const n = Number(grams) / w;
  return n >= 0.95 && Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : null;
};

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const round = (n) => Math.round(Number(n) * 10) / 10;
const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = (date) => (date ? Math.round((new Date(date) - new Date(today())) / 86400000) : null);
/** Oudste THT eerst; pakken zonder datum als laatste, daarna op volgorde van inboeken. */
const FIFO = "ORDER BY best_before IS NULL, best_before, added_at, id";
const addDaysISO = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Standaard houdbaarheid van een maaltijd/restjes. */
export const MEAL_DAYS = { koelkast: 3, vriezer: 90 };

function checkDate(d) {
  if (d == null || d === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw err('THT-datum moet JJJJ-MM-DD zijn');
  return String(d);
}

/** Eén of meer pakken van een ingrediënt in huis zetten. */
export function addStock({ ingredient_id, grams, best_before = null, count = 1, source = 'manual', week = null, item_key = null }) {
  const ing = repo.getIngredient(Number(ingredient_id));
  if (!ing) throw err('Ingrediënt niet gevonden', 404);
  const g = Number(grams);
  if (!(g > 0)) throw Object.assign(err('Hoeveel gram is het?'), { needs_grams: true });
  const n = Math.max(1, Math.round(Number(count) || 1));
  const date = checkDate(best_before);
  const ins = getDb().prepare('INSERT INTO stock_items (ingredient_id, grams_left, grams_initial, best_before, source, week, item_key) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(Number(ins.run(ing.id, g, g, date, source, week, item_key).lastInsertRowid));
  return ids.map(getItem);
}

export function getItem(id) {
  const row = getDb().prepare(`SELECT s.*, i.name, i.category, i.image_url, i.unit_weight_g FROM stock_items s JOIN ingredients i ON i.id = s.ingredient_id WHERE s.id = ?`).get(Number(id));
  return row ? decorate(row) : null;
}

function decorate(row) {
  const days = daysUntil(row.best_before);
  return { ...row, grams_left: round(row.grams_left), unit_weight_g: pieceWeight(row), days_left: days, expired: days != null && days < 0, expiring: days != null && days >= 0 && days <= 3 };
}

export function updateItem(id, { grams_left, best_before }) {
  const item = getItem(id);
  if (!item) throw err('Niet gevonden in de voorraad', 404);
  const g = grams_left === undefined ? item.grams_left : Number(grams_left);
  if (!(g >= 0)) throw err('Ongeldig gewicht');
  if (g === 0) return removeItem(id) && null;
  const date = best_before === undefined ? item.best_before : checkDate(best_before);
  getDb().prepare('UPDATE stock_items SET grams_left = ?, grams_initial = MAX(grams_initial, ?), best_before = ? WHERE id = ?').run(g, g, date, item.id);
  return getItem(id);
}

export function removeItem(id) {
  return getDb().prepare('DELETE FROM stock_items WHERE id = ?').run(Number(id)).changes > 0;
}

/** Overzicht per ingrediënt, met de pakken (oudste THT eerst). */
export function listStock() {
  const rows = getDb().prepare(`SELECT s.*, i.name, i.category, i.image_url, i.unit_weight_g FROM stock_items s JOIN ingredients i ON i.id = s.ingredient_id
    ORDER BY i.name COLLATE NOCASE, s.best_before IS NULL, s.best_before, s.added_at, s.id`).all().map(decorate);
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.ingredient_id)) groups.set(r.ingredient_id, { ingredient_id: r.ingredient_id, name: r.name, category: r.category, image_url: r.image_url, unit_weight_g: r.unit_weight_g, grams: 0, items: [] });
    const g = groups.get(r.ingredient_id);
    g.grams = round(g.grams + r.grams_left);
    g.items.push(r);
  }
  const list = [...groups.values()].map((g) => ({
    ...g,
    best_before: g.items.find((i) => i.best_before)?.best_before || null,
    expiring: g.items.some((i) => i.expiring),
    expired: g.items.some((i) => i.expired),
  }));
  const attention = rows.filter((r) => r.expired || r.expiring);
  const meals = listMeals();
  return { ingredients: list, attention, meals, meal_attention: meals.filter((m) => m.expired || m.expiring), count: rows.length + meals.length };
}

/** Gram in huis per ingrediënt-id. */
export function stockByIngredient() {
  return new Map(getDb().prepare('SELECT ingredient_id, SUM(grams_left) AS g FROM stock_items GROUP BY ingredient_id').all().map((r) => [r.ingredient_id, round(r.g)]));
}

/**
 * Hoeveelheid afboeken, oudste THT eerst. Geeft de bewegingen terug (voor ongedaan maken).
 * Is er minder in huis dan gevraagd, dan gaat alles van dat ingrediënt op en meldt `short` het tekort.
 */
export function consume(ingredientId, grams, db = getDb()) {
  let need = Number(grams);
  if (!(need > 0)) return { moves: [], used: 0, short: 0 };
  const items = db.prepare(`SELECT * FROM stock_items WHERE ingredient_id = ? ${FIFO}`).all(Number(ingredientId));
  const moves = [];
  for (const it of items) {
    if (need <= 0.0001) break;
    const take = Math.min(it.grams_left, need);
    need -= take;
    moves.push({ ...it, taken: take });
    if (it.grams_left - take <= 0.5) db.prepare('DELETE FROM stock_items WHERE id = ?').run(it.id);
    else db.prepare('UPDATE stock_items SET grams_left = ? WHERE id = ?').run(it.grams_left - take, it.id);
  }
  const used = Number(grams) - Math.max(0, need);
  return { moves, used: round(used), short: round(Math.max(0, need)) };
}

/** Bewegingen terugdraaien: verwijderde pakken komen terug, aangebroken pakken krijgen hun gewicht terug. */
function restore(db, moves) {
  for (const m of moves) {
    if (m.kind === 'meal_added') { db.prepare('DELETE FROM stock_meals WHERE id = ?').run(m.id); continue; }
    if (m.kind === 'meal') {
      if (db.prepare('SELECT id FROM stock_meals WHERE id = ?').get(m.id)) db.prepare('UPDATE stock_meals SET portions_left = portions_left + ? WHERE id = ?').run(m.taken, m.id);
      else db.prepare('INSERT INTO stock_meals (id, recipe_id, title, portions_left, portions_initial, best_before, location, source, plan_entry_id, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(m.id, m.recipe_id, m.title, m.taken, m.portions_initial, m.best_before, m.location, m.source, m.plan_entry_id, m.added_at);
      continue;
    }
    const exists = db.prepare('SELECT id FROM stock_items WHERE id = ?').get(m.id);
    if (exists) db.prepare('UPDATE stock_items SET grams_left = grams_left + ? WHERE id = ?').run(m.taken, m.id);
    else db.prepare('INSERT INTO stock_items (id, ingredient_id, grams_left, grams_initial, best_before, source, week, item_key, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(m.id, m.ingredient_id, m.taken, m.grams_initial, m.best_before, m.source, m.week, m.item_key, m.added_at);
  }
}

/** Zelf afboeken (knop of uitscannen). Zonder gewicht: het hele oudste pak. */
export function consumeIngredient(ingredientId, grams = null) {
  return tx((db) => {
    let g = Number(grams);
    if (!(g > 0)) {
      const oldest = db.prepare(`SELECT grams_left FROM stock_items WHERE ingredient_id = ? ${FIFO} LIMIT 1`).get(Number(ingredientId));
      if (!oldest) throw err('Dit staat niet in de voorraad', 404);
      g = oldest.grams_left;
    }
    const res = consume(ingredientId, g, db);
    if (!res.used) throw err('Dit staat niet in de voorraad', 404);
    return { used: res.used, short: res.short };
  });
}

/** 'Gekookt': de ingrediënten van een recept (voor het aantal personen) afboeken. */
export function cookRecipe({ recipe_id, servings = null, plan_entry_id = null, leftover_portions = null }) {
  let recipeId = Number(recipe_id) || null;
  let persons = Number(servings) || null;
  if (plan_entry_id) {
    const entry = repo.getPlanEntry(Number(plan_entry_id));
    if (!entry) throw err('Maaltijd niet gevonden', 404);
    // Restjes of een maaltijd uit de voorraad: dan gaan er porties af, geen ingrediënten
    if (entry.leftover_of || entry.stock_meal_id) return eatPlanned(entry);
    recipeId = recipeId || entry.recipe_id;
    persons = persons || entry.servings;
  }
  const recipe = recipeId ? repo.getRecipe(recipeId, persons) : null;
  if (!recipe) throw err('Recept niet gevonden', 404);
  return tx((db) => {
    const moves = [];
    const lines = [];
    for (const row of recipe.ingredients) {
      if (!row.ingredient_id || !(row.computed_grams > 0)) continue;
      const res = consume(row.ingredient_id, row.computed_grams, db);
      moves.push(...res.moves);
      if (res.used || res.short) lines.push({ ingredient_id: row.ingredient_id, name: row.name, used: res.used, short: res.short });
    }
    // Extra gekookt voor restjes? Die porties gaan automatisch als maaltijd de voorraad in.
    let leftovers = null;
    const extra = plan_entry_id
      ? db.prepare('SELECT COALESCE(SUM(servings), 0) AS s FROM meal_plan WHERE leftover_of = ?').get(Number(plan_entry_id)).s
      : Number(leftover_portions) || 0;
    if (extra > 0) {
      const meal = insertMeal(db, { recipe_id: recipe.id, title: recipe.title, portions: extra, source: 'restjes', plan_entry_id: plan_entry_id ? Number(plan_entry_id) : null });
      moves.push({ kind: 'meal_added', id: meal.id });
      leftovers = meal;
    }
    const { lastInsertRowid } = db.prepare('INSERT INTO stock_cooks (recipe_id, plan_entry_id, servings, moves) VALUES (?, ?, ?, ?)')
      .run(recipe.id, plan_entry_id ? Number(plan_entry_id) : null, recipe.persons, JSON.stringify(moves));
    return { id: Number(lastInsertRowid), recipe_id: recipe.id, title: recipe.title, servings: recipe.persons, lines, leftovers };
  });
}

export function undoCook(id) {
  return tx((db) => {
    const row = db.prepare('SELECT * FROM stock_cooks WHERE id = ?').get(Number(id));
    if (!row) throw err('Niet gevonden', 404);
    restore(db, JSON.parse(row.moves || '[]'));
    db.prepare('DELETE FROM stock_cooks WHERE id = ?').run(row.id);
    return { ok: true };
  });
}

/** Is deze maaltijd al als gekookt afgeboekt? */
export function cookedPlanEntries(ids) {
  if (!ids.length) return new Map();
  const rows = getDb().prepare(`SELECT id, plan_entry_id FROM stock_cooks WHERE plan_entry_id IN (${ids.map(() => '?').join(',')})`).all(...ids.map(Number));
  return new Map(rows.map((r) => [r.plan_entry_id, r.id]));
}

/**
 * Boodschap afvinken = in voorraad. Vinkje weg = die pakken weer uit de voorraad.
 * Zonder bekend pakgewicht: `needs_grams` (de app vraagt dan hoeveel gram het is).
 */
export function checkShoppingItem(week, key, checked, { grams = null, best_before = null } = {}) {
  const db = getDb();
  if (!checked) {
    repo.setShoppingCheck(week, key, false);
    const removed = db.prepare('DELETE FROM stock_items WHERE week = ? AND item_key = ?').run(week, key).changes;
    return { checked: false, stock_removed: Number(removed) };
  }
  const item = repo.getShoppingList(week).items.find((i) => i.key === key);
  if (!item?.ingredient_id) {
    repo.setShoppingCheck(week, key, true);
    return { checked: true, stock_added: [] };
  }
  const already = db.prepare('SELECT COUNT(*) AS c FROM stock_items WHERE week = ? AND item_key = ?').get(week, key).c;
  if (already) {
    repo.setShoppingCheck(week, key, true);
    return { checked: true, stock_added: [] };
  }
  const packs = [];
  if (Number(grams) > 0) packs.push({ grams: Number(grams), count: 1 });
  else for (const p of item.package_picks || []) if (p.grams > 0) packs.push({ grams: p.grams, count: p.count || 1 });
  if (!packs.length) return { checked: false, needs_grams: true, name: item.name, suggested_grams: item.grams || null };
  repo.setShoppingCheck(week, key, true);
  const added = [];
  for (const p of packs) added.push(...addStock({ ingredient_id: item.ingredient_id, grams: p.grams, count: p.count, best_before, source: 'shop', week, item_key: key }));
  return { checked: true, stock_added: added };
}

/** Na een scan: wat weten we al van deze barcode (ingrediënt + pakgewicht)? */
export function barcodeInfo(ean) {
  const known = knownBarcode(ean);
  if (!known) return null;
  const ing = repo.getIngredient(known.ingredient_id);
  return { ...known, name: ing?.name, unit_weight_g: pieceWeight(ing), grams: known.grams || Number(ing?.package_grams) || null, in_stock: stockByIngredient().get(known.ingredient_id) || 0 };
}

// ---- Maaltijden in de voorraad (restjes, zelfgemaakte porties) ----

const MEAL_SELECT = `SELECT m.*, r.image_url, r.image_thumb FROM stock_meals m LEFT JOIN recipes r ON r.id = m.recipe_id`;

function decorateMeal(row) {
  const days = daysUntil(row.best_before);
  return { ...row, portions_left: round(row.portions_left), days_left: days, expired: days != null && days < 0, expiring: days != null && days >= 0 && days <= 1 };
}

export function getMeal(id, db = getDb()) {
  const row = db.prepare(`${MEAL_SELECT} WHERE m.id = ?`).get(Number(id));
  return row ? decorateMeal(row) : null;
}

export function listMeals() {
  return getDb().prepare(`${MEAL_SELECT} ORDER BY m.best_before IS NULL, m.best_before, m.added_at, m.id`).all().map(decorateMeal);
}

function insertMeal(db, { recipe_id = null, title = null, portions = 1, best_before = null, location = 'koelkast', source = 'manual', plan_entry_id = null }) {
  let rid = Number(recipe_id) || null;
  let name = String(title || '').trim();
  if (rid) {
    const r = db.prepare('SELECT id, title FROM recipes WHERE id = ?').get(rid);
    if (!r) throw err('Recept niet gevonden', 404);
    name = name || r.title;
  }
  if (!name) throw err('Welke maaltijd is het?');
  const p = Number(portions);
  if (!(p > 0)) throw err('Hoeveel porties?');
  const loc = location === 'vriezer' ? 'vriezer' : 'koelkast';
  const date = checkDate(best_before) || addDaysISO(today(), MEAL_DAYS[loc]);
  const { lastInsertRowid } = db.prepare('INSERT INTO stock_meals (recipe_id, title, portions_left, portions_initial, best_before, location, source, plan_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(rid, name.slice(0, 120), p, p, date, loc, source, plan_entry_id);
  return getMeal(Number(lastInsertRowid), db);
}

/** Een maaltijd (of restjes) in de voorraad zetten. Zonder THT: koelkast 3 dagen, vriezer 3 maanden. */
export function addMeal(data) {
  return insertMeal(getDb(), data || {});
}

export function updateMeal(id, { portions_left, best_before, location }) {
  const m = getMeal(id);
  if (!m) throw err('Maaltijd niet gevonden in de voorraad', 404);
  const p = portions_left === undefined ? m.portions_left : Number(portions_left);
  if (!(p >= 0)) throw err('Ongeldig aantal porties');
  if (p === 0) return removeMeal(id) && null;
  const loc = location === undefined ? m.location : location === 'vriezer' ? 'vriezer' : 'koelkast';
  const date = best_before === undefined ? m.best_before : checkDate(best_before);
  getDb().prepare('UPDATE stock_meals SET portions_left = ?, portions_initial = MAX(portions_initial, ?), best_before = ?, location = ? WHERE id = ?').run(p, p, date, loc, m.id);
  return getMeal(id);
}

export function removeMeal(id) {
  return getDb().prepare('DELETE FROM stock_meals WHERE id = ?').run(Number(id)).changes > 0;
}

/** Porties van maaltijden afhalen (in de gegeven volgorde). */
function takePortions(db, meals, portions) {
  let need = Number(portions);
  const moves = [];
  for (const m of meals) {
    if (need <= 0.0001) break;
    const take = Math.min(m.portions_left, need);
    need -= take;
    moves.push({ kind: 'meal', ...m, taken: take });
    if (m.portions_left - take <= 0.0001) db.prepare('DELETE FROM stock_meals WHERE id = ?').run(m.id);
    else db.prepare('UPDATE stock_meals SET portions_left = ? WHERE id = ?').run(m.portions_left - take, m.id);
  }
  return { moves, used: round(Number(portions) - Math.max(0, need)), short: round(Math.max(0, need)) };
}

/** Zelf porties van een maaltijd afboeken (standaard 1). */
export function eatMeal(id, portions = 1) {
  return tx((db) => {
    const m = db.prepare('SELECT * FROM stock_meals WHERE id = ?').get(Number(id));
    if (!m) throw err('Maaltijd niet gevonden in de voorraad', 404);
    const res = takePortions(db, [m], Number(portions) > 0 ? Number(portions) : 1);
    return { used: res.used, title: m.title, portions_left: round(Math.max(0, m.portions_left - res.used)) };
  });
}

/**
 * Restjes of een maaltijd uit de voorraad als 'opgegeten' afboeken: eerst de gekoppelde maaltijd,
 * dan de restjes van de oorspronkelijke maaltijd, dan andere porties van hetzelfde recept (oudste eerst).
 */
function eatPlanned(entry) {
  return tx((db) => {
    const seen = new Set();
    const meals = [];
    const push = (rows) => { for (const r of rows) if (!seen.has(r.id)) { seen.add(r.id); meals.push(r); } };
    const ORDER = 'ORDER BY best_before IS NULL, best_before, added_at, id';
    if (entry.stock_meal_id) push(db.prepare('SELECT * FROM stock_meals WHERE id = ?').all(entry.stock_meal_id));
    if (entry.leftover_of) push(db.prepare(`SELECT * FROM stock_meals WHERE plan_entry_id = ? ${ORDER}`).all(entry.leftover_of));
    if (entry.recipe_id) push(db.prepare(`SELECT * FROM stock_meals WHERE recipe_id = ? ${ORDER}`).all(entry.recipe_id));
    if (!meals.length) throw err('Deze maaltijd staat niet (meer) in de voorraad', 404);
    const res = takePortions(db, meals, entry.servings || 1);
    const { lastInsertRowid } = db.prepare('INSERT INTO stock_cooks (recipe_id, plan_entry_id, servings, moves) VALUES (?, ?, ?, ?)')
      .run(entry.recipe_id || null, entry.id, entry.servings, JSON.stringify(res.moves));
    return { id: Number(lastInsertRowid), recipe_id: entry.recipe_id || null, title: meals[0].title, servings: entry.servings, lines: [], meal_used: res.used, meal_short: res.short };
  });
}

/** Een maaltijd uit de voorraad inplannen: geen boodschappen, 'opgegeten' haalt de porties eraf. */
export function planMeal(id, { date, meal = 'diner', servings = 1 }) {
  const m = getMeal(id);
  if (!m) throw err('Maaltijd niet gevonden in de voorraad', 404);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw err('Kies een dag');
  const n = Math.max(1, Math.round(Number(servings) || 1));
  const planId = repo.addPlanEntry({ date, meal, recipe_id: m.recipe_id, title: m.recipe_id ? null : m.title, servings: n, note: m.location === 'vriezer' ? 'uit de vriezer' : 'uit de voorraad' });
  getDb().prepare('UPDATE meal_plan SET no_shopping = 1, stock_meal_id = ? WHERE id = ?').run(m.id, planId);
  return { id: planId };
}
