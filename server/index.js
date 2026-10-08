import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, getSetting, setSetting } from './db.js';
import * as repo from './repo.js';
import * as ai from './claude.js';
import { searchJumbo, ingredientPriceFields, refreshIngredientPrice } from './jumbo.js';
import { CATEGORIES, mondayOf, addDays } from './seed.js';
import { searchOff, productByBarcode, ingredientNutritionFields } from './openfoodfacts.js';
import { enqueue, queueStatus, clearQueue } from './offqueue.js';
import { lookupBarcode, applyBarcode } from './scan.js';
import { jumboAccountStatus, loginJumbo, loginJumboWithToken, logoutJumbo, addToJumboList } from './jumboaccount.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UNITS } from './calc.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(process.env.DB_FILE && process.env.DB_FILE !== ':memory:' ? process.env.DB_FILE : 'data/x'), 'uploads'));

// Teller die bij elke wijziging omhoog gaat; telefoons van huisgenoten verversen als hij verandert.
let changeCounter = Date.now();

/** Nieuwe of door Claude geschatte ingrediënten op de achtergrond aanvullen met Open Food Facts. */
function autoEnrich(ids) {
  if (ids.length && getSetting('off_auto', true) && process.env.OFF_DISABLED !== '1') enqueue(ids);
}

/** Bij de eerste start van v2: alle ingrediënten één keer met Open Food Facts vergelijken. */
export function initialOffSync() {
  if (getSetting('off_synced', false) || process.env.OFF_DISABLED === '1') return;
  const ids = repo.listIngredients().filter((i) => !String(i.nutrition_source || '').startsWith('Open Food Facts') && i.name !== 'water' && i.name !== 'zout').map((i) => i.id);
  enqueue(ids, { onFinish: (st) => { if (st.updated.length || st.skipped.length) setSetting('off_synced', true); } });
}

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
  app.use('/uploads', express.static(uploadDir(), { maxAge: '30d', immutable: true }));
  // Barcodescanner voor browsers zonder ingebouwde BarcodeDetector (iPhone, Firefox)
  app.use('/vendor/zxing', express.static(path.join(here, '..', 'node_modules', '@zxing', 'library', 'umd'), { maxAge: '7d' }));

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
  api.use((req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) changeCounter++; });
    next();
  });
  api.get('/changes', (req, res) => res.json({ version: changeCounter }));

  // ---- Meta ----
  api.get('/meta', wrap(() => ({
    categories: CATEGORIES,
    units: UNITS,
    tags: repo.listTags(),
    meals: getSetting('meals', ['ontbijt', 'lunch', 'diner']),
    default_servings: getSetting('default_servings', 4),
    off_auto: getSetting('off_auto', true),
    jumbo_account: jumboAccountStatus(),
    household: getSetting('household', ''),
    weekly_budget_cents: getSetting('weekly_budget_cents', null),
    claude: ai.claudeStatus(),
  })));

  api.put('/settings', wrap((req) => {
    const allowed = ['default_servings', 'meals', 'household', 'weekly_budget_cents', 'claude_model', 'anthropic_api_key', 'off_auto'];
    for (const key of allowed) if (key in req.body) setSetting(key, req.body[key]);
    return { ok: true, claude: ai.claudeStatus() };
  }));

  // ---- Recepten ----
  api.get('/recipes', wrap((req) => repo.listRecipes({
    q: req.query.q || '', tag: req.query.tag || '', category: req.query.category || '',
    favorite: req.query.favorite === '1', maxMinutes: Number(req.query.maxMinutes) || 0, sort: req.query.sort || 'title',
    maxPrice: Number(req.query.maxPrice) || 0,
    have: String(req.query.have || '').split(',').map((s) => s.trim()).filter(Boolean),
  })));
  api.get('/recipes/:id', wrap((req) => repo.getRecipe(Number(req.params.id)) || Promise.reject(notFound('Recept niet gevonden'))));

  async function prepareRows(rows = []) {
    // Ingrediënten die Claude schatte en nog niet bestaan, aanmaken in de database
    // en daarna op de achtergrond aanvullen met Open Food Facts.
    const created = [];
    for (const row of rows) {
      if (row.ingredient_id || !row.estimate) continue;
      const existing = repo.matchIngredient(row.name);
      if (existing) {
        row.ingredient_id = existing.id;
        continue;
      }
      const newIng = repo.saveIngredient({ ...row.estimate, name: row.name.toLowerCase(), nutrition_source: 'Claude (schatting)', price_source: 'schatting' });
      row.ingredient_id = newIng.id;
      created.push(newIng.id);
    }
    autoEnrich(created);
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
  api.post('/ingredients', wrap((req) => {
    const ing = repo.saveIngredient(req.body);
    if (ing.kcal == null) autoEnrich([ing.id]);
    return ing;
  }));
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

  // ---- Open Food Facts ----
  api.get('/off/search', wrap((req) => searchOff(String(req.query.q || ''), { pageSize: 24 })));
  api.get('/off/product/:code', wrap((req) => productByBarcode(req.params.code)));
  api.post('/ingredients/:id/off', wrap((req) => {
    const ing = repo.getIngredient(Number(req.params.id));
    if (!ing) throw notFound();
    const { product, median, query } = req.body;
    if (product?.nutrition) return repo.saveIngredient(ingredientNutritionFields({ nutrition: product.nutrition, product }), ing.id);
    if (median?.nutrition) return repo.saveIngredient(ingredientNutritionFields({ nutrition: median.nutrition, count: median.count, query }), ing.id);
    throw Object.assign(new Error('Geen voedingswaarden om op te slaan'), { status: 400 });
  }));
  api.get('/off/queue', wrap(() => queueStatus()));
  api.post('/off/queue', wrap((req) => {
    const scope = req.body.scope || 'estimates';
    let list = repo.listIngredients().filter((i) => i.name !== 'water');
    if (Array.isArray(req.body.ids)) list = list.filter((i) => req.body.ids.includes(i.id));
    else if (scope === 'estimates') list = list.filter((i) => !String(i.nutrition_source || '').startsWith('Open Food Facts'));
    return enqueue(list.map((i) => i.id), { force: !!req.body.force });
  }));
  api.delete('/off/queue', wrap(() => { clearQueue(); return queueStatus(); }));

  // ---- Barcode scannen ----
  api.get('/scan/:ean', wrap((req) => lookupBarcode(req.params.ean)));
  api.post('/scan/apply', wrap((req) => applyBarcode(req.body)));

  // ---- Jumbo-account: boodschappenlijst naar de Jumbo-app ----
  api.get('/jumbo/account', wrap(() => jumboAccountStatus()));
  api.post('/jumbo/account', wrap((req) => (req.body.token
    ? loginJumboWithToken(req.body.token, req.body.email)
    : loginJumbo(req.body.email, req.body.password))));
  api.delete('/jumbo/account', wrap(() => logoutJumbo()));
  api.post('/jumbo/cart/preview', wrap(async (req) => {
    // Welke artikelen van de lijst kunnen naar Jumbo? Optioneel ontbrekende koppelingen automatisch zoeken.
    const list = repo.getShoppingList(week(req.body.week), 7);
    const wanted = list.items.filter((i) => !i.checked && !i.have && (req.body.include_pantry || !i.pantry));
    const linked = [];
    const unlinked = [];
    for (const item of wanted) {
      let ing = item.ingredient_id ? repo.getIngredient(item.ingredient_id) : null;
      if (ing && !ing.jumbo_id && req.body.autolink) {
        try {
          const fields = await refreshIngredientPrice(ing);
          if (fields) ing = repo.saveIngredient(fields, ing.id);
        } catch { /* blijft ongekoppeld */ }
      }
      if (ing?.jumbo_id) {
        linked.push({ key: item.key, name: item.name, sku: ing.jumbo_id, title: ing.jumbo_name, quantity: item.packages || 1, price_cents: ing.price_cents, image: ing.jumbo_image });
      } else unlinked.push({ key: item.key, name: item.name, ingredient_id: item.ingredient_id, jumbo_url: item.jumbo_url });
    }
    for (const x of list.extras.filter((e) => !e.checked)) unlinked.push({ key: `x${x.id}`, name: x.name, jumbo_url: `https://www.jumbo.com/zoeken/?searchTerms=${encodeURIComponent(x.name)}` });
    return { linked, unlinked, account: jumboAccountStatus() };
  }));
  api.post('/jumbo/cart', wrap(async (req) => {
    const items = (req.body.items || []).filter((i) => i.sku).map((i) => ({ sku: String(i.sku), quantity: Number(i.quantity) || 1 }));
    if (!items.length) throw Object.assign(new Error('Geen producten geselecteerd'), { status: 400 });
    return addToJumboList(items);
  }));

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
  api.post('/plan/:id/leftovers', wrap((req) => {
    // Restjes inplannen: zelfde recept, geen extra boodschappen of kosten
    const src = repo.getPlanEntry(Number(req.params.id));
    if (!src?.recipe_id) throw notFound('Maaltijd niet gevonden');
    return { id: repo.addPlanEntry({ date: req.body.date, meal: req.body.meal || 'lunch', recipe_id: src.recipe_id, servings: Number(req.body.servings) || 1, leftover_of: src.id, note: 'restjes' }) };
  }));
  api.post('/plan/copy-week', wrap((req) => ({ copied: repo.copyWeek(week(req.body.from), week(req.body.to)) })));
  api.post('/plan/clear-week', wrap((req) => repo.clearWeek(week(req.body.week))));

  // ---- Boodschappen ----
  api.get('/shopping', wrap((req) => repo.getShoppingList(week(req.query.week), 7)));
  api.put('/shopping/check', wrap((req) => repo.setShoppingCheck(week(req.body.week), req.body.key, req.body.checked)));
  api.put('/shopping/have', wrap((req) => repo.setShoppingHave(week(req.body.week), req.body.key, req.body.have)));
  api.post('/shopping/extras', wrap((req) => repo.addShoppingExtra(week(req.body.week), String(req.body.name || '').trim())));
  api.put('/shopping/extras/:id', wrap((req) => repo.updateShoppingExtra(Number(req.params.id), req.body.checked)));
  api.delete('/shopping/extras/:id', wrap((req) => repo.deleteShoppingExtra(Number(req.params.id))));

  // ---- Back-up ----
  api.get('/backup', (req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="maaltijden-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(repo.exportAll());
  });
  api.post('/restore', wrap((req) => ({ restored: repo.importAll(req.body) })));

  // ---- Foto's ----
  api.post('/uploads', wrap((req) => {
    const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const ext = types[req.body.media_type];
    if (!ext) throw Object.assign(new Error('Alleen JPG, PNG, WebP of GIF'), { status: 400 });
    const buf = Buffer.from(String(req.body.data || ''), 'base64');
    if (!buf.length || buf.length > 10 * 1024 * 1024) throw Object.assign(new Error('Foto is leeg of groter dan 10 MB'), { status: 400 });
    const name = `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24)}.${ext}`;
    fs.mkdirSync(uploadDir(), { recursive: true });
    fs.writeFileSync(path.join(uploadDir(), name), buf);
    return { url: `/uploads/${name}` };
  }));

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
  initialOffSync();
  createApp().listen(port, host, () => {
    console.log(`🍽️  Maaltijden-app draait op http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (!ai.claudeStatus().configured) console.log('ℹ️  Claude is nog niet ingesteld (ANTHROPIC_API_KEY of via Instellingen).');
  });
}
