// Browserdemo: beantwoordt de /api-verzoeken van de frontend in de browser zelf,
// met dezelfde datalaag (repo.js, calc.js, seed.js) als de echte server.
// Externe diensten (Claude, Open Food Facts, Open Prices) zijn vanuit de demo niet bereikbaar.
import * as repo from './server/repo.js';
import { getSetting, setSetting, getDb } from './server/db.js';
import { CATEGORIES, mondayOf, addDays, missingBuiltinRecipes, restoreBuiltinRecipes } from './server/seed.js';
import * as tracker from './server/tracker.js';
import { UNITS } from './server/calc.js';

const NOT_IN_DEMO = 'Dit werkt alleen als je de app op je eigen server draait (Claude, Open Food Facts en Open Prices zijn vanuit de demo niet bereikbaar).';
let changeCounter = Date.now();

const fail = (status, message) => Object.assign(new Error(message), { status });
const notFound = (what = 'Niet gevonden') => fail(404, what);
const week = (q) => (q ? mondayOf(new Date(`${q}T12:00:00`)) : mondayOf(new Date()));
const idle = () => ({ running: false, pending: 0, done: 0, updated: [], skipped: [], errors: [], started_at: null });

function prepareRows(rows = []) {
  for (const row of rows) {
    if (row.ingredient_id || !row.estimate) continue;
    const existing = repo.matchIngredient(row.name);
    row.ingredient_id = existing ? existing.id
      : repo.saveIngredient({ ...row.estimate, name: row.name.toLowerCase(), nutrition_source: 'Claude (schatting)', price_source: 'schatting' }).id;
  }
  return rows;
}

// [methode, pad, handler(req)]
const ROUTES = [
  ['GET', '/meta', () => ({
    categories: CATEGORIES,
    units: UNITS,
    tags: repo.listTags(),
    meals: getSetting('meals', ['ontbijt', 'lunch', 'diner']),
    default_servings: getSetting('default_servings', 4),
    off_auto: getSetting('off_auto', true),
    prices_auto: getSetting('prices_auto', true),
    household: getSetting('household', ''),
    weekly_budget_cents: getSetting('weekly_budget_cents', null),
    builtin_missing: missingBuiltinRecipes(getDb()),
    claude: { configured: false, from_env: false, model: 'niet beschikbaar in de demo', demo: true },
    demo: true,
  })],
  ['PUT', '/settings', (req) => {
    const allowed = ['default_servings', 'meals', 'household', 'weekly_budget_cents', 'off_auto', 'prices_auto'];
    for (const key of allowed) if (key in req.body) setSetting(key, req.body[key]);
    return { ok: true };
  }],
  ['GET', '/changes', () => ({ version: changeCounter })],

  ['GET', '/recipes', (req) => repo.listRecipes({
    q: req.query.q || '', tag: req.query.tag || '', category: req.query.category || '',
    favorite: req.query.favorite === '1', maxMinutes: Number(req.query.maxMinutes) || 0, sort: req.query.sort || 'title',
    maxPrice: Number(req.query.maxPrice) || 0,
    have: String(req.query.have || '').split(',').map((s) => s.trim()).filter(Boolean),
  })],
  ['GET', '/recipes/:id', (req) => repo.getRecipe(Number(req.params.id)) || Promise.reject(notFound('Recept niet gevonden'))],
  ['POST', '/recipes', (req) => repo.getRecipe(repo.saveRecipe({ ...req.body, ingredients: prepareRows(req.body.ingredients) }))],
  ['PUT', '/recipes/:id', (req) => {
    const id = repo.saveRecipe({ ...req.body, ingredients: prepareRows(req.body.ingredients) }, Number(req.params.id));
    if (!id) throw notFound('Recept niet gevonden');
    return repo.getRecipe(id);
  }],
  ['PATCH', '/recipes/:id', (req) => {
    const id = Number(req.params.id);
    if ('favorite' in req.body) repo.setFavorite(id, req.body.favorite);
    if ('rating' in req.body) repo.setRating(id, req.body.rating);
    return repo.getRecipe(id);
  }],
  ['DELETE', '/recipes/:id', (req) => repo.deleteRecipe(Number(req.params.id))],
  ['PUT', '/recipes/:id/ingredients/:rowId/link', (req) => {
    if (!repo.linkRecipeIngredient(Number(req.params.id), Number(req.params.rowId), req.body.ingredient_id)) throw notFound();
    return repo.getRecipe(Number(req.params.id));
  }],
  ['POST', '/ingredients/:id/alias', (req) => repo.addIngredientAlias(Number(req.params.id), req.body.name) || Promise.reject(notFound())],
  ['POST', '/recipes/delete', (req) => ({ deleted: repo.deleteRecipes(req.body.ids) })],
  ['POST', '/builtins/restore', () => ({ restored: restoreBuiltinRecipes(getDb()) })],
  ['POST', '/recipes/:id/duplicate', (req) => {
    const r = repo.getRecipe(Number(req.params.id));
    if (!r) throw notFound();
    return repo.getRecipe(repo.saveRecipe({ ...r, title: `${r.title} (kopie)`, favorite: false }));
  }],

  ['GET', '/ingredients', (req) => repo.listIngredients(req.query.q || '')],
  ['GET', '/ingredients/match', (req) => ({ match: repo.matchIngredient(req.query.name || '') })],
  ['POST', '/ingredients', (req) => repo.saveIngredient(req.body)],
  ['PUT', '/ingredients/:id', (req) => repo.saveIngredient(req.body, Number(req.params.id)) || Promise.reject(notFound())],
  ['DELETE', '/ingredients/:id', (req) => repo.deleteIngredient(Number(req.params.id))],

  ['GET', '/plan', (req) => {
    const plan = repo.getPlan(week(req.query.week), 7);
    const personId = Number(req.query.persoon);
    if (personId && tracker.getPerson(personId)) {
      const s = tracker.summary(personId, plan.start, plan.end);
      const eaten = new Set(getDb().prepare('SELECT plan_entry_id FROM food_log WHERE person_id = ? AND date BETWEEN ? AND ? AND plan_entry_id IS NOT NULL')
        .all(personId, plan.start, plan.end).map((r) => r.plan_entry_id));
      for (const [i, d] of plan.days.entries()) {
        d.diary = { ...s.days[i], target_kcal: s.target_kcal };
        for (const e of d.entries) e.eaten = eaten.has(e.id);
      }
    }
    return plan;
  }],
  ['POST', '/plan', (req) => ({ id: repo.addPlanEntry(req.body) })],
  ['PUT', '/plan/:id', (req) => (repo.updatePlanEntry(Number(req.params.id), req.body) ? { ok: true } : Promise.reject(notFound()))],
  ['DELETE', '/plan/:id', (req) => repo.deletePlanEntry(Number(req.params.id))],
  ['POST', '/plan/:id/leftovers', (req) => {
    const src = repo.getPlanEntry(Number(req.params.id));
    if (!src?.recipe_id) throw notFound('Maaltijd niet gevonden');
    return { id: repo.addPlanEntry({ date: req.body.date, meal: req.body.meal || 'lunch', recipe_id: src.recipe_id, servings: Number(req.body.servings) || 1, leftover_of: src.id, note: 'restjes' }) };
  }],
  ['POST', '/plan/copy-week', (req) => ({ copied: repo.copyWeek(week(req.body.from), week(req.body.to)) })],
  ['POST', '/plan/clear-week', (req) => repo.clearWeek(week(req.body.week))],

  ['GET', '/shopping', (req) => repo.getShoppingList(week(req.query.week), 7)],
  ['PUT', '/shopping/check', (req) => repo.setShoppingCheck(week(req.body.week), req.body.key, req.body.checked)],
  ['PUT', '/shopping/have', (req) => repo.setShoppingHave(week(req.body.week), req.body.key, req.body.have)],
  ['POST', '/shopping/extras', (req) => repo.addShoppingExtra(week(req.body.week), String(req.body.name || '').trim())],
  ['PUT', '/shopping/extras/:id', (req) => repo.updateShoppingExtra(Number(req.params.id), req.body.checked)],
  ['DELETE', '/shopping/extras/:id', (req) => repo.deleteShoppingExtra(Number(req.params.id))],

  // Dagboek en gewicht (de agenda-koppeling werkt alleen op een eigen server)
  ['GET', '/people', () => ({ people: tracker.listPeople(), activity: tracker.ACTIVITY, meals: tracker.MEALS })],
  ['POST', '/people', (req) => tracker.savePerson(req.body)],
  ['PUT', '/people/:id', (req) => tracker.savePerson(req.body, Number(req.params.id)) || Promise.reject(notFound())],
  ['DELETE', '/people/:id', (req) => tracker.deletePerson(Number(req.params.id))],
  ['GET', '/diary', (req) => tracker.getDay(Number(req.query.persoon), req.query.datum)],
  ['POST', '/diary', (req) => ({ id: tracker.addLogEntry(req.body) })],
  ['PUT', '/diary/:id', (req) => (tracker.updateLogEntry(Number(req.params.id), req.body) ? { ok: true } : Promise.reject(notFound()))],
  ['DELETE', '/diary/:id', (req) => tracker.deleteLogEntry(Number(req.params.id))],
  ['POST', '/diary/from-plan', (req) => ({ added: tracker.logPlannedDay(Number(req.body.person_id), req.body.date, req.body.plan_entry_id) })],
  ['POST', '/diary/copy', (req) => ({ copied: tracker.copyDay(Number(req.body.person_id), req.body.from, req.body.to) })],
  ['GET', '/diary/summary', (req) => tracker.summary(Number(req.query.persoon), req.query.van, req.query.tot)],
  ['GET', '/foods', (req) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return { recipes: [], ingredients: [] };
    return {
      recipes: repo.listRecipes({ q }).slice(0, 8).map((r) => ({ id: r.id, title: r.title, kcal_per_serving: r.kcal_per_serving })),
      ingredients: repo.listIngredients(q).slice(0, 12).map((i) => ({ id: i.id, name: i.name, kcal: i.kcal, unit_weight_g: i.unit_weight_g })),
    };
  }],
  ['GET', '/weight', (req) => tracker.weightHistory(Number(req.query.persoon), Number(req.query.dagen) || 90)],
  ['PUT', '/weight', (req) => tracker.logWeight(req.body)],
  ['DELETE', '/weight/:id', (req) => tracker.deleteWeight(Number(req.params.id))],

  ['GET', '/backup', () => repo.exportAll()],
  ['POST', '/restore', (req) => ({ restored: repo.importAll(req.body) })],
  // Foto's: in de demo als data-URL bewaard
  ['POST', '/uploads', (req) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(req.body.media_type || '')) throw fail(400, 'Alleen JPG, PNG, WebP of GIF');
    if (String(req.body.data || '').length > 3_000_000) throw fail(400, 'Foto is te groot voor de demo');
    return { url: `data:${req.body.media_type};base64,${req.body.data}` };
  }],

  // Achtergrondtaken: in de demo altijd stil
  ['GET', '/off/queue', idle],
  ['GET', '/prices/queue', idle],
];

function matchRoute(method, path) {
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const pp = pattern.split('/');
    const ap = path.split('/');
    if (pp.length !== ap.length) continue;
    const params = {};
    if (pp.every((seg, i) => (seg.startsWith(':') ? (params[seg.slice(1)] = decodeURIComponent(ap[i]), true) : seg === ap[i]))) {
      return { handler, params };
    }
  }
  return null;
}

const json = (status, body) => new Response(JSON.stringify(body ?? { ok: true }), { status, headers: { 'Content-Type': 'application/json' } });

export async function handle(method, url, bodyText, persist) {
  const path = url.pathname.replace(/^.*?\/api(?=\/)/, '');
  const route = matchRoute(method, path);
  if (!route) return json(503, { error: NOT_IN_DEMO });
  try {
    const req = { params: route.params, query: Object.fromEntries(url.searchParams), body: bodyText ? JSON.parse(bodyText) : {} };
    const out = await route.handler(req);
    if (method !== 'GET') {
      changeCounter++;
      persist();
    }
    return json(200, out);
  } catch (err) {
    console.error(err);
    return json(err.status || 500, { error: err.message || 'Onbekende fout' });
  }
}

/** Voorbeeldgegevens voor een nieuwe demo: een profiel, zes weken gewicht en een paar dagen dagboek. */
export function seedDemoTracker() {
  const [me] = tracker.listPeople();
  if (getDb().prepare('SELECT COUNT(*) c FROM weight_log').get().c) return;
  tracker.savePerson({ name: 'Ik', sex: 'm', birth_year: 1985, height_cm: 180, activity: 1.375, goal: 'afvallen', start_weight_kg: 88, target_weight_kg: 80 }, me.id);
  const today = new Date().toISOString().slice(0, 10);
  let w = 88.4;
  for (let n = 42; n >= 0; n--) {
    w += -0.07 + Math.sin(n * 2.3) * 0.3;
    if (n % 4 !== 2) tracker.logWeight({ person_id: me.id, date: addDays(today, -n), weight_kg: Math.round(w * 10) / 10 });
  }
  const find = (q) => repo.listIngredients(q)[0];
  const [yoghurt, banaan] = [find('yoghurt'), find('banaan')];
  for (let n = 3; n >= 1; n--) {
    const date = addDays(today, -n);
    if (yoghurt) tracker.addLogEntry({ person_id: me.id, date, meal: 'ontbijt', type: 'ingredient', ingredient_id: yoghurt.id, grams: 200 });
    if (banaan) tracker.addLogEntry({ person_id: me.id, date, meal: 'ontbijt', type: 'ingredient', ingredient_id: banaan.id, grams: 120 });
    tracker.addLogEntry({ person_id: me.id, date, meal: 'lunch', type: 'free', name: 'Twee broodjes kaas', values: { kcal: 430, protein: 22, carbs: 46, fat: 16 } });
    tracker.logPlannedDay(me.id, date);
  }
}
