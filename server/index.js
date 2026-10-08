import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, getSetting, setSetting } from './db.js';
import * as repo from './repo.js';
import * as ai from './claude.js';
import { searchJumbo, ingredientPriceFields, refreshIngredientPrice } from './jumbo.js';
import { CATEGORIES, mondayOf, addDays } from './seed.js';
import { UNITS } from './calc.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  app.get('/health', (req, res) => res.json({ ok: true }));

  // Optionele eenvoudige beveiliging voor gebruik buiten je thuisnetwerk.
  const password = process.env.APP_PASSWORD;
  if (password) {
    app.use((req, res, next) => {
      const header = req.headers.authorization || '';
      const [, b64] = header.split(' ');
      const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
      if (pass === password) return next();
      res.set('WWW-Authenticate', 'Basic realm="Maaltijden"').status(401).send('Inloggen vereist');
    });
  }

  app.use(express.static(path.join(here, '..', 'public')));

  const api = express.Router();
  const wrap = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) {
      const { status, message } = ai.friendlyError(err);
      if (status >= 500) console.error(err);
      if (!res.headersSent) res.status(status).json({ error: message });
    }
  };
  const notFound = (what = 'Niet gevonden') => Object.assign(new Error(what), { status: 404 });
  const week = (q) => (q ? mondayOf(new Date(q + 'T12:00:00')) : mondayOf(new Date()));

  // ---- Meta ----
  api.get('/meta', wrap(() => ({
    categories: CATEGORIES,
    units: UNITS,
    tags: repo.listTags(),
    meals: getSetting('meals', ['ontbijt', 'lunch', 'diner']),
    default_servings: getSetting('default_servings', 4),
    household: getSetting('household', ''),
    weekly_budget_cents: getSetting('weekly_budget_cents', null),
    claude: ai.claudeStatus(),
  })));

  api.put('/settings', wrap((req) => {
    const allowed = ['default_servings', 'meals', 'household', 'weekly_budget_cents', 'claude_model', 'anthropic_api_key'];
    for (const key of allowed) if (key in req.body) setSetting(key, req.body[key]);
    return { ok: true, claude: ai.claudeStatus() };
  }));

  // ---- Recepten ----
  api.get('/recipes', wrap((req) => repo.listRecipes({
    q: req.query.q || '', tag: req.query.tag || '', category: req.query.category || '',
    favorite: req.query.favorite === '1', maxMinutes: Number(req.query.maxMinutes) || 0, sort: req.query.sort || 'title',
  })));
  api.get('/recipes/:id', wrap((req) => repo.getRecipe(Number(req.params.id)) || Promise.reject(notFound('Recept niet gevonden'))));

  async function prepareRows(rows = []) {
    // Ingrediënten die Claude schatte en nog niet bestaan, aanmaken in de database.
    for (const row of rows) {
      if (row.ingredient_id || !row.estimate) continue;
      const existing = repo.matchIngredient(row.name);
      if (existing) {
        row.ingredient_id = existing.id;
        continue;
      }
      const created = repo.saveIngredient({ ...row.estimate, name: row.name.toLowerCase(), nutrition_source: 'Claude (schatting)', price_source: 'schatting' });
      row.ingredient_id = created.id;
    }
    return rows;
  }

  api.post('/recipes', wrap(async (req) => {
    await prepareRows(req.body.ingredients);
    return repo.getRecipe(repo.saveRecipe(req.body));
  }));
  api.put('/recipes/:id', wrap(async (req) => {
    await prepareRows(req.body.ingredients);
    const id = repo.saveRecipe(req.body, Number(req.params.id));
    if (!id) throw notFound('Recept niet gevonden');
    return repo.getRecipe(id);
  }));
  api.patch('/recipes/:id', wrap((req) => {
    const id = Number(req.params.id);
    if ('favorite' in req.body) repo.setFavorite(id, req.body.favorite);
    if ('rating' in req.body) repo.setRating(id, req.body.rating);
    return repo.getRecipe(id);
  }));
  api.delete('/recipes/:id', wrap((req) => repo.deleteRecipe(Number(req.params.id))));
  api.post('/recipes/:id/duplicate', wrap((req) => {
    const r = repo.getRecipe(Number(req.params.id));
    if (!r) throw notFound();
    return repo.getRecipe(repo.saveRecipe({ ...r, title: `${r.title} (kopie)`, favorite: false }));
  }));

  // ---- Ingrediënten ----
  api.get('/ingredients', wrap((req) => repo.listIngredients(req.query.q || '')));
  api.get('/ingredients/match', wrap((req) => ({ match: repo.matchIngredient(req.query.name || '') })));
  api.post('/ingredients', wrap((req) => repo.saveIngredient(req.body)));
  api.put('/ingredients/:id', wrap((req) => repo.saveIngredient(req.body, Number(req.params.id)) || Promise.reject(notFound())));
  api.delete('/ingredients/:id', wrap((req) => repo.deleteIngredient(Number(req.params.id))));
  api.post('/ingredients/:id/estimate', wrap(async (req) => {
    const ing = repo.getIngredient(Number(req.params.id));
    if (!ing) throw notFound();
    const est = await ai.estimateIngredient(ing.name);
    const update = { ...est, nutrition_source: 'Claude (schatting)' };
    // Bestaande Jumbo-prijs niet overschrijven met een schatting.
    if (ing.price_source !== 'schatting') { delete update.price_cents; delete update.package_grams; }
    return repo.saveIngredient(update, ing.id);
  }));
  api.post('/ingredients/estimate', wrap((req) => ai.estimateIngredient(String(req.body.name || ''))));

  // ---- Jumbo ----
  api.get('/jumbo/search', wrap((req) => searchJumbo(String(req.query.q || ''), 12)));
  api.post('/ingredients/:id/jumbo', wrap((req) => {
    const ing = repo.getIngredient(Number(req.params.id));
    if (!ing) throw notFound();
    return repo.saveIngredient(ingredientPriceFields(req.body.product, req.body.query || ing.name), ing.id);
  }));
  api.post('/ingredients/:id/refresh-price', wrap(async (req) => {
    const ing = repo.getIngredient(Number(req.params.id));
    if (!ing) throw notFound();
    const fields = await refreshIngredientPrice(ing);
    if (!fields) throw notFound('Geen product gevonden bij Jumbo');
    return repo.saveIngredient(fields, ing.id);
  }));
  api.post('/jumbo/refresh-all', wrap(async () => {
    // Alleen ingrediënten die aan een Jumbo-product gekoppeld zijn verversen; rustig aan om de API niet te belasten.
    const linked = repo.listIngredients().filter((i) => i.jumbo_id);
    let updated = 0;
    const errors = [];
    for (const ing of linked) {
      try {
        const fields = await refreshIngredientPrice(ing);
        if (fields) { repo.saveIngredient(fields, ing.id); updated++; }
      } catch (err) {
        errors.push(`${ing.name}: ${err.message}`);
        if (errors.length >= 3 && updated === 0) break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return { updated, total: linked.length, errors };
  }));

  // ---- Planning ----
  api.get('/plan', wrap((req) => repo.getPlan(week(req.query.week), 7)));
  api.post('/plan', wrap((req) => ({ id: repo.addPlanEntry(req.body) })));
  api.put('/plan/:id', wrap((req) => (repo.updatePlanEntry(Number(req.params.id), req.body) ? { ok: true } : Promise.reject(notFound()))));
  api.delete('/plan/:id', wrap((req) => repo.deletePlanEntry(Number(req.params.id))));
  api.post('/plan/copy-week', wrap((req) => ({ copied: repo.copyWeek(week(req.body.from), week(req.body.to)) })));
  api.post('/plan/clear-week', wrap((req) => repo.clearWeek(week(req.body.week))));

  // ---- Boodschappen ----
  api.get('/shopping', wrap((req) => repo.getShoppingList(week(req.query.week), 7)));
  api.put('/shopping/check', wrap((req) => repo.setShoppingCheck(week(req.body.week), req.body.key, req.body.checked)));
  api.post('/shopping/extras', wrap((req) => repo.addShoppingExtra(week(req.body.week), String(req.body.name || '').trim())));
  api.put('/shopping/extras/:id', wrap((req) => repo.updateShoppingExtra(Number(req.params.id), req.body.checked)));
  api.delete('/shopping/extras/:id', wrap((req) => repo.deleteShoppingExtra(Number(req.params.id))));

  // ---- Claude ----
  api.get('/ai/status', wrap(() => ai.claudeStatus()));
  api.post('/ai/import', wrap((req) => ai.importRecipe(req.body)));
  api.post('/ai/generate', wrap((req) => ai.generateRecipe(req.body)));
  api.post('/ai/week-menu', wrap(async (req) => {
    const start = week(req.body.week);
    const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const plan = repo.getPlan(start, 7);
    const existing = plan.days.flatMap((d) => d.entries.map((e) => ({ date: e.date, meal: e.meal, title: e.recipe_title || e.title })));
    return ai.suggestWeekMenu({
      dates,
      meals: req.body.meals?.length ? req.body.meals : ['diner'],
      recipes: repo.listRecipes(),
      preferences: req.body.preferences || '',
      budgetCents: Number(req.body.budget_cents) || getSetting('weekly_budget_cents', null),
      servings: Number(req.body.servings) || getSetting('default_servings', 4),
      existing,
    });
  }));
  api.post('/ai/ask', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const recipe = req.body.recipe_id ? repo.getRecipe(Number(req.body.recipe_id)) : null;
      await ai.askStream({ recipe, question: String(req.body.question || ''), history: req.body.history || [] }, (t) => send('text', t));
      send('done', {});
    } catch (err) {
      send('error', ai.friendlyError(err).message);
    }
    res.end();
  });

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Onbekende API-route' }));
  // SPA: alle overige routes naar index.html
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(here, '..', 'public', 'index.html')));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  openDatabase();
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  createApp().listen(port, host, () => {
    console.log(`🍽️  Maaltijden-app draait op http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (!ai.claudeStatus().configured) console.log('ℹ️  Claude is nog niet ingesteld (ANTHROPIC_API_KEY of via Instellingen).');
  });
}
