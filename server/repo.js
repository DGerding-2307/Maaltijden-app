// Data-toegang: recepten, ingrediënten, planning en boodschappen.
import { getDb, tx } from './db.js';
import { computeRecipe, buildShoppingList, NUTRIENTS, effectiveAmount, pricePerGram } from './calc.js';
import { addDays } from './seed.js';

const ING_FIELDS = [
  'name', 'aliases', 'category', ...NUTRIENTS, 'unit_weight_g', 'density', 'pantry',
  'price_cents', 'package_grams', 'package_label', 'jumbo_id', 'jumbo_name', 'jumbo_url', 'jumbo_query', 'jumbo_image',
  'price_source', 'price_updated_at', 'nutrition_source', 'off_code', 'nutriscore', 'nutrition_updated_at', 'off_category', 'price_count', 'price_note',
  'image_url', 'shop_url', 'amount_rule',
];

// ---------- Ingrediënten ----------

export function listIngredients(q = '') {
  const db = getDb();
  if (q) {
    const like = `%${q}%`;
    return db.prepare('SELECT * FROM ingredients WHERE name LIKE ? OR aliases LIKE ? ORDER BY name').all(like, like);
  }
  return db.prepare('SELECT * FROM ingredients ORDER BY category, name').all();
}

export function getIngredient(id) {
  return getDb().prepare('SELECT * FROM ingredients WHERE id = ?').get(id) || null;
}

export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singular(s) {
  return s.replace(/(en|s)$/, '');
}

/** Zoek het best passende ingrediënt bij een (vrije) naam. */
export function matchIngredient(name) {
  const target = normalizeName(name);
  if (!target) return null;
  const all = getDb().prepare('SELECT * FROM ingredients').all();
  let best = null;
  let bestScore = 0;
  for (const ing of all) {
    const names = [ing.name, ...String(ing.aliases || '').split(',')].map(normalizeName).filter(Boolean);
    for (const n of names) {
      let score = 0;
      if (n === target) score = 100;
      else if (singular(n) === singular(target)) score = 95;
      else if (target.split(' ').includes(n) || target.split(' ').map(singular).includes(singular(n))) score = 60 + n.length;
      else if (target.includes(n) && n.length >= 4) score = 40 + n.length;
      if (score > bestScore) { bestScore = score; best = ing; }
    }
  }
  return bestScore >= 45 ? best : null;
}

export function saveIngredient(data, id = null) {
  const db = getDb();
  // Productfoto (bv. uit Open Food Facts) alleen gebruiken als het ingrediënt nog geen foto heeft
  if (data.fallback_image_url && data.image_url === undefined && !(id && getIngredient(id)?.image_url)) {
    data = { ...data, image_url: data.fallback_image_url };
  }
  const values = ING_FIELDS.map((f) => {
    const v = data[f];
    if (v === undefined || v === '') return null;
    if (f === 'pantry') return v ? 1 : 0;
    return v;
  });
  if (id) {
    const existing = getIngredient(id);
    if (!existing) return null;
    const merged = ING_FIELDS.map((f, i) => (data[f] === undefined ? existing[f] : values[i]));
    db.prepare(`UPDATE ingredients SET ${ING_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...merged, id);
    return getIngredient(id);
  }
  const defaults = { category: 'Overig', aliases: '', density: 1, pantry: 0, price_source: 'schatting', nutrition_source: 'handmatig' };
  const finalValues = ING_FIELDS.map((f, i) => values[i] ?? defaults[f] ?? null);
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO ingredients (${ING_FIELDS.join(', ')}) VALUES (${ING_FIELDS.map(() => '?').join(', ')})`)
    .run(...finalValues);
  return getIngredient(Number(lastInsertRowid));
}

/** Extra naam onthouden, zodat die voortaan automatisch aan dit ingrediënt wordt gekoppeld. */
export function addIngredientAlias(id, alias) {
  const ing = getIngredient(id);
  const name = String(alias || '').trim().toLowerCase();
  if (!ing || !name || name === ing.name.toLowerCase()) return ing;
  const list = String(ing.aliases || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.map((s) => s.toLowerCase()).includes(name)) list.push(name);
  getDb().prepare('UPDATE ingredients SET aliases = ? WHERE id = ?').run(list.join(','), id);
  return getIngredient(id);
}

/** Eén ingrediëntregel van een recept (opnieuw) koppelen. */
export function linkRecipeIngredient(recipeId, rowId, ingredientId) {
  const res = getDb().prepare('UPDATE recipe_ingredients SET ingredient_id = ? WHERE id = ? AND recipe_id = ?')
    .run(ingredientId ? Number(ingredientId) : null, rowId, recipeId);
  return res.changes > 0;
}

export function deleteIngredient(id) {
  getDb().prepare('DELETE FROM ingredients WHERE id = ?').run(id);
}

// ---------- Recepten ----------

function parseRecipe(r) {
  return { ...r, tags: JSON.parse(r.tags || '[]'), steps: JSON.parse(r.steps || '[]'), favorite: !!r.favorite };
}

function rowsFor(recipeId) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id').all(recipeId);
  const ingStmt = db.prepare('SELECT * FROM ingredients WHERE id = ?');
  return rows.map((row) => ({
    ...row,
    optional: !!row.optional,
    ingredient: row.ingredient_id ? ingStmt.get(row.ingredient_id) || null : null,
  }));
}

/** @param persons optioneel: hoeveelheden, voeding en kosten voor dit aantal personen */
export function getRecipe(id, persons = null) {
  const r = getDb().prepare('SELECT * FROM recipes WHERE id = ?').get(id);
  if (!r) return null;
  const recipe = parseRecipe(r);
  const rows = rowsFor(id);
  const factor = persons > 0 ? persons / (recipe.servings || 1) : 1;
  const computed = computeRecipe(recipe, rows, factor);
  return { ...recipe, ...computed, servings: recipe.servings, persons: computed.servings, ingredients: computed.lines, lines: undefined };
}

export function listRecipes({ q = '', tag = '', category = '', favorite = false, maxMinutes = 0, maxPrice = 0, have = [], sort = 'title' } = {}) {
  const db = getDb();
  const all = db.prepare('SELECT * FROM recipes').all().map(parseRecipe);
  const term = normalizeName(q);
  let list = all.filter((r) => {
    if (favorite && !r.favorite) return false;
    if (category && r.category !== category) return false;
    if (tag && !r.tags.includes(tag)) return false;
    const total = (r.prep_minutes || 0) + (r.cook_minutes || 0);
    if (maxMinutes && total > maxMinutes) return false;
    return true;
  });
  if (term) {
    const ingNames = db.prepare('SELECT recipe_id, name FROM recipe_ingredients').all();
    const byRecipe = new Map();
    for (const row of ingNames) byRecipe.set(row.recipe_id, (byRecipe.get(row.recipe_id) || '') + ' ' + normalizeName(row.name));
    list = list.filter((r) => normalizeName(`${r.title} ${r.description} ${r.tags.join(' ')}`).includes(term) || (byRecipe.get(r.id) || '').includes(term));
  }
  // "Wat kan ik maken?": ingrediënten die je in huis hebt (voorraadkast-artikelen tellen niet mee)
  // Een term telt als hij het gekoppelde ingrediënt is, of als los woord/deel van de ingrediëntnaam
  // voorkomt ("rijst" → witte rijst én zilvervliesrijst).
  const haveIds = new Set();
  const haveNames = [];
  for (const h of have) {
    const m = matchIngredient(h);
    if (m) haveIds.add(m.id);
    const n = normalizeName(h);
    if (n.length >= 3) haveNames.push(n, singular(n));
  }
  const summaries = list.map((r) => {
    const rows = rowsFor(r.id);
    const c = computeRecipe(r, rows);
    let pantryMatch = null;
    if (have.length) {
      const needed = rows.filter((row) => !row.optional && !row.ingredient?.pantry);
      const hits = needed.filter((row) => (row.ingredient_id && haveIds.has(row.ingredient_id))
        || haveNames.some((n) => normalizeName(`${row.name} ${row.ingredient?.name || ''}`).includes(n)));
      pantryMatch = {
        matched: hits.length,
        total: needed.length,
        missing: needed.filter((row) => !hits.includes(row)).map((row) => row.ingredient?.name || row.name),
      };
    }
    return {
      pantry_match: pantryMatch,
      ...r,
      steps: undefined,
      total_minutes: (r.prep_minutes || 0) + (r.cook_minutes || 0),
      kcal_per_serving: c.nutrition_per_serving.kcal,
      protein_per_serving: c.nutrition_per_serving.protein,
      cost_per_serving_cents: c.cost_per_serving_cents,
      missing_price: c.missing_price,
    };
  }).filter((r) => (!maxPrice || r.cost_per_serving_cents <= maxPrice) && (!have.length || r.pantry_match.matched > 0));
  const sorters = {
    title: (a, b) => a.title.localeCompare(b.title, 'nl'),
    newest: (a, b) => b.id - a.id,
    price: (a, b) => a.cost_per_serving_cents - b.cost_per_serving_cents,
    kcal: (a, b) => a.kcal_per_serving - b.kcal_per_serving,
    time: (a, b) => a.total_minutes - b.total_minutes,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
  };
  if (have.length) {
    summaries.sort((a, b) => (b.pantry_match.matched / b.pantry_match.total) - (a.pantry_match.matched / a.pantry_match.total)
      || a.pantry_match.missing.length - b.pantry_match.missing.length);
  } else summaries.sort(sorters[sort] || sorters.title);
  return summaries;
}

export function listTags() {
  const tags = new Map();
  for (const r of getDb().prepare('SELECT tags FROM recipes').all()) {
    for (const t of JSON.parse(r.tags || '[]')) tags.set(t, (tags.get(t) || 0) + 1);
  }
  return [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

/**
 * Sla een recept op (nieuw of bestaand). Ingrediëntregels zonder ingredient_id worden automatisch
 * gekoppeld aan de ingrediëntendatabase op basis van de naam.
 */
export function saveRecipe(data, id = null) {
  return tx((db) => {
    const fields = {
      title: String(data.title || 'Naamloos recept').trim(),
      description: data.description || '',
      servings: Math.max(1, Number(data.servings) || 4),
      prep_minutes: data.prep_minutes === '' || data.prep_minutes == null ? null : Number(data.prep_minutes),
      cook_minutes: data.cook_minutes === '' || data.cook_minutes == null ? null : Number(data.cook_minutes),
      category: data.category || 'Hoofdgerecht',
      cuisine: data.cuisine || 'Nederlands',
      tags: JSON.stringify((data.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean)),
      steps: JSON.stringify((data.steps || []).map((s) => String(s).trim()).filter(Boolean)),
      image_url: data.image_url || null,
      source_url: data.source_url || null,
      favorite: data.favorite ? 1 : 0,
      // Kan als vlees (of bijgerecht) bij een ander gerecht gekozen worden
      is_side: data.is_side ? 1 : 0,
      rating: data.rating ? Number(data.rating) : null,
      notes: data.notes || '',
    };
    if (id) {
      // Bronvermelding van een meegeleverde foto blijft alleen staan zolang die foto niet is vervangen
      const old = db.prepare('SELECT image_url, image_credit FROM recipes WHERE id = ?').get(id);
      fields.image_credit = old && old.image_url === fields.image_url ? old.image_credit : null;
    }
    const keys = Object.keys(fields);
    let recipeId = id;
    if (id) {
      const res = db.prepare(`UPDATE recipes SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
        .run(...Object.values(fields), id);
      if (res.changes === 0) return null;
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
    } else {
      const { lastInsertRowid } = db.prepare(`INSERT INTO recipes (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
        .run(...Object.values(fields));
      recipeId = Number(lastInsertRowid);
    }
    const ins = db.prepare(`INSERT INTO recipe_ingredients (recipe_id, ingredient_id, name, quantity, unit, grams, note, optional, section, position, amount_rule, min_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    (data.ingredients || []).forEach((row, i) => {
      const name = String(row.name || '').trim();
      if (!name) return;
      let ingredientId = row.ingredient_id ? Number(row.ingredient_id) : null;
      if (ingredientId && !getIngredient(ingredientId)) ingredientId = null;
      if (!ingredientId && row.auto_match !== false) ingredientId = matchIngredient(name)?.id ?? null;
      ins.run(
        recipeId, ingredientId, name,
        row.quantity === '' || row.quantity == null ? null : Number(row.quantity),
        row.unit || '', row.grams === '' || row.grams == null ? null : Number(row.grams),
        row.note || '', row.optional ? 1 : 0, row.section || '', i,
        ['none', 'round', 'package'].includes(row.amount_rule) ? row.amount_rule : null,
        Number(row.min_quantity) > 0 ? Number(row.min_quantity) : null,
      );
    });
    return recipeId;
  });
}

export function setFavorite(id, favorite) {
  getDb().prepare('UPDATE recipes SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
}

export function setRating(id, rating) {
  getDb().prepare('UPDATE recipes SET rating = ? WHERE id = ?').run(rating || null, id);
}

export function deleteRecipe(id) {
  getDb().prepare('DELETE FROM recipes WHERE id = ?').run(id);
}

/** Meerdere recepten tegelijk verwijderen (ook uit de planning). */
export function deleteRecipes(ids) {
  const list = [...new Set((ids || []).map(Number).filter(Boolean))];
  tx((db) => {
    const del = db.prepare('DELETE FROM recipes WHERE id = ?');
    for (const id of list) del.run(id);
  });
  return list.length;
}

// ---------- Planning ----------

export function getPlan(start, days = 7) {
  const end = addDays(start, days - 1);
  const rows = getDb().prepare(`SELECT p.*, r.title AS recipe_title, r.servings AS recipe_servings, r.image_url, r.prep_minutes, r.cook_minutes
    FROM meal_plan p LEFT JOIN recipes r ON r.id = p.recipe_id
    WHERE p.date BETWEEN ? AND ? ORDER BY p.date, p.position, p.id`).all(start, end);
  const cache = new Map();
  const entries = rows.map((row) => {
    let info = null;
    if (row.recipe_id) {
      // Per aantal personen berekenen: hele verpakkingen en afgeronde stuks schalen niet lineair
      const factor = row.servings / (row.recipe_servings || 1);
      const key = `${row.recipe_id}:${factor}`;
      if (!cache.has(key)) {
        const r = parseRecipe(getDb().prepare('SELECT * FROM recipes WHERE id = ?').get(row.recipe_id));
        cache.set(key, computeRecipe(r, rowsFor(row.recipe_id), factor));
      }
      const c = cache.get(key);
      info = {
        kcal_per_serving: c.nutrition_per_serving.kcal,
        nutrition_per_serving: c.nutrition_per_serving,
        // Restjes zijn al betaald bij de oorspronkelijke maaltijd
        cost_cents: row.leftover_of ? 0 : c.cost_total_cents,
        cost_per_serving_cents: c.cost_per_serving_cents,
        // Zit er al vlees, vis of een vleesvervanger in? Anders biedt de planner '+ vlees' aan.
        has_meat: c.lines.some((l) => l.ingredient?.category === 'Vlees, vis & vega'),
      };
    }
    const extras = extrasFor(row.id);
    if (extras.length) {
      // Vlees/vis erbij: per persoon optellen bij de voedingswaarden, kosten voor alle personen
      const n = { ...(info?.nutrition_per_serving || Object.fromEntries(NUTRIENTS.map((k) => [k, 0]))) };
      for (const x of extras) for (const k of NUTRIENTS) n[k] = Math.round(((n[k] || 0) + x.nutrition[k]) * 10) / 10;
      const extraCost = row.leftover_of ? 0 : Math.round(extras.reduce((s, x) => s + (x.cost_cents || 0), 0) * row.servings);
      info = {
        ...info,
        kcal_per_serving: n.kcal,
        nutrition_per_serving: n,
        cost_cents: (info?.cost_cents || 0) + extraCost,
        cost_per_serving_cents: (info?.cost_per_serving_cents || 0) + Math.round(extraCost / (row.servings || 1)),
      };
    }
    return { ...row, ...info, extras };
  });
  // Dagtotalen per persoon (som van per-portie waarden) en kosten
  const daysOut = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dayEntries = entries.filter((e) => e.date === date);
    const nutrition = Object.fromEntries(NUTRIENTS.map((n) => [n, 0]));
    let cost = 0;
    for (const e of dayEntries) {
      if (e.nutrition_per_serving) for (const n of NUTRIENTS) nutrition[n] += e.nutrition_per_serving[n] || 0;
      cost += e.cost_cents || 0;
    }
    for (const n of NUTRIENTS) nutrition[n] = Math.round(nutrition[n] * 10) / 10;
    daysOut.push({ date, entries: dayEntries, nutrition_per_person: nutrition, cost_cents: cost });
  }
  const total = daysOut.reduce((s, d) => s + d.cost_cents, 0);
  return { start, end, days: daysOut, total_cost_cents: total };
}

// ---------- Extra's bij een maaltijd (vlees, vis …) ----------

/** Extra's van een planningsregel, met voedingswaarden en kosten per persoon. */
export function extrasFor(entryId) {
  const db = getDb();
  const ingStmt = db.prepare('SELECT * FROM ingredients WHERE id = ?');
  return db.prepare('SELECT * FROM plan_extras WHERE plan_entry_id = ? ORDER BY position, id').all(entryId).map((x) => {
    if (x.recipe_id) {
      // Een gerecht als vlees: hoeveelheid in porties per persoon
      const r = getDb().prepare('SELECT * FROM recipes WHERE id = ?').get(x.recipe_id);
      if (!r) return null;
      const c = computeRecipe(parseRecipe(r), rowsFor(x.recipe_id));
      const portions = Number(x.quantity) || 1;
      return {
        ...x,
        name: r.title,
        image_url: r.image_url || null,
        grams_per_person: null,
        nutrition: Object.fromEntries(NUTRIENTS.map((k) => [k, (c.nutrition_per_serving[k] || 0) * portions])),
        cost_cents: c.cost_per_serving_cents * portions,
      };
    }
    const ing = x.ingredient_id ? ingStmt.get(x.ingredient_id) : null;
    const grams = effectiveAmount(x, ing).grams;
    const ppg = pricePerGram(ing);
    return {
      ...x,
      image_url: ing?.image_url || null,
      grams_per_person: Math.round(grams),
      nutrition: Object.fromEntries(NUTRIENTS.map((k) => [k, ((Number(ing?.[k]) || 0) * grams) / 100])),
      cost_cents: ppg != null ? ppg * grams : null,
    };
  }).filter(Boolean);
}

/** Standaardportie per persoon: 1 stuk als het ingrediënt een stuksgewicht heeft, anders 125 g. */
export function addPlanExtra(entryId, { ingredient_id, recipe_id, quantity, unit }) {
  const db = getDb();
  if (!getPlanEntry(entryId)) throw Object.assign(new Error('Maaltijd niet gevonden'), { status: 404 });
  const pos = db.prepare('SELECT COUNT(*) c FROM plan_extras WHERE plan_entry_id = ?').get(entryId).c;
  if (recipe_id) {
    const r = db.prepare('SELECT id, title FROM recipes WHERE id = ?').get(Number(recipe_id));
    if (!r) throw Object.assign(new Error('Recept niet gevonden'), { status: 404 });
    db.prepare("INSERT INTO plan_extras (plan_entry_id, recipe_id, name, quantity, unit, position) VALUES (?, ?, ?, ?, 'portie', ?)")
      .run(entryId, r.id, r.title, Number(quantity) > 0 ? Number(quantity) : 1, pos);
    return extrasFor(entryId);
  }
  const ing = getIngredient(Number(ingredient_id));
  if (!ing) throw Object.assign(new Error('Ingrediënt niet gevonden'), { status: 404 });
  const u = unit || (ing.unit_weight_g >= 30 ? 'stuk' : 'g');
  const q = Number(quantity) > 0 ? Number(quantity) : u === 'stuk' ? 1 : 125;
  db.prepare('INSERT INTO plan_extras (plan_entry_id, ingredient_id, name, quantity, unit, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(entryId, ing.id, ing.name, q, u, pos);
  return extrasFor(entryId);
}

export function updatePlanExtra(id, { quantity, unit }) {
  const x = getDb().prepare('SELECT * FROM plan_extras WHERE id = ?').get(id);
  if (!x) return null;
  getDb().prepare('UPDATE plan_extras SET quantity = ?, unit = ? WHERE id = ?').run(Number(quantity) > 0 ? Number(quantity) : x.quantity, unit || x.unit, id);
  return extrasFor(x.plan_entry_id);
}

export function deletePlanExtra(id) {
  getDb().prepare('DELETE FROM plan_extras WHERE id = ?').run(id);
}

function copyExtras(db, fromEntryId, toEntryId) {
  db.prepare(`INSERT INTO plan_extras (plan_entry_id, ingredient_id, recipe_id, name, quantity, unit, position)
    SELECT ?, ingredient_id, recipe_id, name, quantity, unit, position FROM plan_extras WHERE plan_entry_id = ?`).run(toEntryId, fromEntryId);
}

export function addPlanEntry({ date, meal = 'diner', recipe_id = null, title = null, servings = 2, note = '', leftover_of = null, extras = [] }) {
  const db = getDb();
  const { lastInsertRowid } = db
    .prepare('INSERT INTO meal_plan (date, meal, recipe_id, title, servings, note, leftover_of) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(date, meal, recipe_id || null, title || null, Number(servings) || 2, note || '', leftover_of || null);
  const id = Number(lastInsertRowid);
  // Restjes krijgen hetzelfde vlees als de oorspronkelijke maaltijd
  if (leftover_of) copyExtras(db, leftover_of, id);
  for (const x of extras || []) if (x?.ingredient_id || x?.recipe_id) addPlanExtra(id, x);
  return id;
}

export function updatePlanEntry(id, data) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM meal_plan WHERE id = ?').get(id);
  if (!existing) return false;
  const merged = { ...existing, ...data };
  db.prepare('UPDATE meal_plan SET date = ?, meal = ?, recipe_id = ?, title = ?, servings = ?, note = ? WHERE id = ?')
    .run(merged.date, merged.meal, merged.recipe_id || null, merged.title || null, Number(merged.servings) || 1, merged.note || '', id);
  return true;
}

export function getPlanEntry(id) {
  return getDb().prepare('SELECT * FROM meal_plan WHERE id = ?').get(id) || null;
}

export function deletePlanEntry(id) {
  getDb().prepare('DELETE FROM meal_plan WHERE id = ?').run(id);
}

export function copyWeek(fromStart, toStart) {
  return tx((db) => {
    const rows = db.prepare('SELECT * FROM meal_plan WHERE date BETWEEN ? AND ?').all(fromStart, addDays(fromStart, 6));
    const ins = db.prepare('INSERT INTO meal_plan (date, meal, recipe_id, title, servings, note, position, leftover_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const offset = Math.round((new Date(toStart) - new Date(fromStart)) / 86400000);
    for (const r of rows) {
      const { lastInsertRowid } = ins.run(addDays(r.date, offset), r.meal, r.recipe_id, r.title, r.servings, r.note, r.position, r.leftover_of ? 1 : null);
      copyExtras(db, r.id, Number(lastInsertRowid));
    }
    return rows.length;
  });
}

export function clearWeek(start) {
  getDb().prepare('DELETE FROM meal_plan WHERE date BETWEEN ? AND ?').run(start, addDays(start, 6));
}

// ---------- Boodschappen ----------

export function getShoppingList(start, days = 7) {
  const db = getDb();
  const end = addDays(start, days - 1);
  const plan = db.prepare('SELECT * FROM meal_plan WHERE date BETWEEN ? AND ? AND recipe_id IS NOT NULL AND leftover_of IS NULL').all(start, end);
  const entries = plan.map((p) => {
    const recipe = parseRecipe(db.prepare('SELECT * FROM recipes WHERE id = ?').get(p.recipe_id));
    return { servings: p.servings, recipe, rows: rowsFor(p.recipe_id) };
  });
  // Vlees/vis bij een maaltijd: hoeveelheid per persoon × aantal personen
  const ingStmt = db.prepare('SELECT * FROM ingredients WHERE id = ?');
  const withExtras = db.prepare(`SELECT p.id, p.servings, COALESCE(r.title, p.title) AS title FROM meal_plan p LEFT JOIN recipes r ON r.id = p.recipe_id
    WHERE p.date BETWEEN ? AND ? AND p.leftover_of IS NULL AND EXISTS (SELECT 1 FROM plan_extras x WHERE x.plan_entry_id = p.id)`).all(start, end);
  for (const p of withExtras) {
    const extras = db.prepare('SELECT * FROM plan_extras WHERE plan_entry_id = ?').all(p.id);
    const rows = extras.filter((x) => !x.recipe_id).map((x) => ({ ...x, ingredient: x.ingredient_id ? ingStmt.get(x.ingredient_id) || null : null }));
    if (rows.length) entries.push({ servings: p.servings, recipe: { servings: 1, title: p.title || 'maaltijd' }, rows });
    // Gerecht als vlees: de ingrediënten van dat recept voor (personen × porties p.p.)
    for (const x of extras.filter((e) => e.recipe_id)) {
      const r = db.prepare('SELECT * FROM recipes WHERE id = ?').get(x.recipe_id);
      if (r) entries.push({ servings: p.servings * (Number(x.quantity) || 1), recipe: parseRecipe(r), rows: rowsFor(x.recipe_id) });
    }
  }
  const list = buildShoppingList(entries);
  const states = new Map(db.prepare('SELECT item_key, checked, have FROM shopping_state WHERE week = ?').all(start).map((r) => [r.item_key, r]));
  for (const item of list.items) {
    item.checked = !!states.get(item.key)?.checked;
    item.have = !!states.get(item.key)?.have;
    if (item.have && item.cost_cents != null && !item.pantry) list.total_cents -= item.cost_cents;
  }
  const extras = db.prepare('SELECT * FROM shopping_extras WHERE week = ? ORDER BY id').all(start).map((e) => ({ ...e, checked: !!e.checked }));
  return { start, end, ...list, extras, meals: plan.length };
}

export function setShoppingCheck(week, key, checked) {
  getDb().prepare(`INSERT INTO shopping_state (week, item_key, checked) VALUES (?, ?, ?)
    ON CONFLICT(week, item_key) DO UPDATE SET checked = excluded.checked`).run(week, key, checked ? 1 : 0);
}

/** "Heb ik al in huis": artikel hoeft deze week niet gekocht te worden. */
export function setShoppingHave(week, key, have) {
  getDb().prepare(`INSERT INTO shopping_state (week, item_key, have) VALUES (?, ?, ?)
    ON CONFLICT(week, item_key) DO UPDATE SET have = excluded.have`).run(week, key, have ? 1 : 0);
}

// ---------- Back-up ----------

// Geheimen gaan nooit mee in een back-up en blijven bij terugzetten behouden.
const SECRET_SETTINGS = ['anthropic_api_key', 'calendar_token'];
const BACKUP_TABLES = ['ingredients', 'recipes', 'recipe_ingredients', 'meal_plan', 'plan_extras', 'shopping_state', 'shopping_extras', 'settings', 'people', 'food_log', 'weight_log'];

export function exportAll() {
  const db = getDb();
  const data = { app: 'maaltijden', version: 2, exported_at: new Date().toISOString(), tables: {} };
  for (const t of BACKUP_TABLES) {
    let rows = db.prepare(`SELECT * FROM ${t}`).all();
    if (t === 'settings') rows = rows.filter((r) => !SECRET_SETTINGS.includes(r.key));
    data.tables[t] = rows;
  }
  return data;
}

export function importAll(data) {
  if (data?.app !== 'maaltijden' || !data.tables) throw Object.assign(new Error('Dit is geen back-up van de Maaltijden-app'), { status: 400 });
  return tx((db) => {
    const secrets = db.prepare(`SELECT key, value FROM settings WHERE key IN (${SECRET_SETTINGS.map(() => '?').join(',')})`).all(...SECRET_SETTINGS);
    db.exec('PRAGMA defer_foreign_keys = ON');
    for (const t of [...BACKUP_TABLES].reverse()) db.prepare(`DELETE FROM ${t}`).run();
    const counts = {};
    for (const t of BACKUP_TABLES) {
      const rows = data.tables[t] || [];
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
      for (const row of rows) {
        if (t === 'settings' && SECRET_SETTINGS.includes(row.key)) continue;
        const keys = Object.keys(row).filter((k) => cols.includes(k));
        db.prepare(`INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => row[k]));
      }
      counts[t] = rows.length;
    }
    for (const sec of secrets) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(sec.key, sec.value);
    return counts;
  });
}

export function addShoppingExtra(week, name) {
  getDb().prepare('INSERT INTO shopping_extras (week, name) VALUES (?, ?)').run(week, name);
}

export function updateShoppingExtra(id, checked) {
  getDb().prepare('UPDATE shopping_extras SET checked = ? WHERE id = ?').run(checked ? 1 : 0, id);
}

export function deleteShoppingExtra(id) {
  getDb().prepare('DELETE FROM shopping_extras WHERE id = ?').run(id);
}
