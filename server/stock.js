// Voorraad (v4.12): wat er in huis is, per pak met een eigen THT-datum.
// Inboeken: boodschap afvinken, barcode scannen of zelf toevoegen.
// Uitboeken: 'Gekookt' bij een recept (oudste THT eerst), uitscannen of zelf afboeken.
import { getDb, tx } from './db.js';
import * as repo from './repo.js';
import { knownBarcode } from './scan.js';

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const round = (n) => Math.round(Number(n) * 10) / 10;
const today = () => new Date().toISOString().slice(0, 10);
const daysUntil = (date) => (date ? Math.round((new Date(date) - new Date(today())) / 86400000) : null);
/** Oudste THT eerst; pakken zonder datum als laatste, daarna op volgorde van inboeken. */
const FIFO = "ORDER BY best_before IS NULL, best_before, added_at, id";

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
  const row = getDb().prepare(`SELECT s.*, i.name, i.category, i.image_url FROM stock_items s JOIN ingredients i ON i.id = s.ingredient_id WHERE s.id = ?`).get(Number(id));
  return row ? decorate(row) : null;
}

function decorate(row) {
  const days = daysUntil(row.best_before);
  return { ...row, grams_left: round(row.grams_left), days_left: days, expired: days != null && days < 0, expiring: days != null && days >= 0 && days <= 3 };
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
  const rows = getDb().prepare(`SELECT s.*, i.name, i.category, i.image_url FROM stock_items s JOIN ingredients i ON i.id = s.ingredient_id
    ORDER BY i.name COLLATE NOCASE, s.best_before IS NULL, s.best_before, s.added_at, s.id`).all().map(decorate);
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.ingredient_id)) groups.set(r.ingredient_id, { ingredient_id: r.ingredient_id, name: r.name, category: r.category, image_url: r.image_url, grams: 0, items: [] });
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
  return { ingredients: list, attention, count: rows.length };
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
export function cookRecipe({ recipe_id, servings = null, plan_entry_id = null }) {
  let recipeId = Number(recipe_id) || null;
  let persons = Number(servings) || null;
  if (plan_entry_id) {
    const entry = repo.getPlanEntry(Number(plan_entry_id));
    if (!entry) throw err('Maaltijd niet gevonden', 404);
    if (entry.leftover_of) throw err('Dit is een restje: daarvoor gaat er niets van de voorraad af');
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
    const { lastInsertRowid } = db.prepare('INSERT INTO stock_cooks (recipe_id, plan_entry_id, servings, moves) VALUES (?, ?, ?, ?)')
      .run(recipe.id, plan_entry_id ? Number(plan_entry_id) : null, recipe.persons, JSON.stringify(moves));
    return { id: Number(lastInsertRowid), recipe_id: recipe.id, title: recipe.title, servings: recipe.persons, lines };
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
  return { ...known, name: ing?.name, grams: known.grams || Number(ing?.package_grams) || null, in_stock: stockByIngredient().get(known.ingredient_id) || 0 };
}
