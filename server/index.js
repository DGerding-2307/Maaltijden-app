import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, getSetting, setSetting, lastBuiltinSync, getDb } from './db.js';
import * as repo from './repo.js';
import * as ai from './claude.js';
import { CATEGORIES, mondayOf, addDays } from './seed.js';
import { searchOff, productByBarcode, ingredientNutritionFields } from './openfoodfacts.js';
import { enqueue, queueStatus, clearQueue } from './offqueue.js';
import { priceForIngredient, ingredientPriceFields } from './openprices.js';
import { enqueuePrices, priceQueueStatus, clearPriceQueue } from './pricequeue.js';
import { lookupBarcode, applyBarcode } from './scan.js';
import * as tracker from './tracker.js';
import { buildIcs, calendarToken } from './calendar.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UNITS } from './calc.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Versie: uit het Docker-image (APP_VERSION) of anders uit package.json
export const APP_VERSION = process.env.APP_VERSION
  || JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;
const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(process.env.DB_FILE && process.env.DB_FILE !== ':memory:' ? process.env.DB_FILE : 'data/x'), 'uploads'));

// Teller die bij elke wijziging omhoog gaat; telefoons van huisgenoten verversen als hij verandert.
let changeCounter = Date.now();

/** Nieuwe of door Claude geschatte ingrediënten op de achtergrond aanvullen met Open Food Facts. */
function autoEnrich(ids) {
  if (!ids.length || process.env.OFF_DISABLED === '1') return;
  if (getSetting('off_auto', true)) enqueue(ids);
  if (getSetting('prices_auto', true)) enqueuePrices(ids);
}

/** Bij de eerste start van v2: alle ingrediënten één keer met Open Food Facts vergelijken. */
export function initialOffSync() {
  if (getSetting('off_synced', false) || process.env.OFF_DISABLED === '1') return;
  const ids = repo.listIngredients().filter((i) => !String(i.nutrition_source || '').startsWith('Open Food Facts') && i.name !== 'water' && i.name !== 'zout').map((i) => i.id);
  enqueue(ids, { onFinish: (st) => { if (st.updated.length || st.skipped.length) setSetting('off_synced', true); } });
}

/** Bij de eerste start van v2.3: geschatte prijzen vervangen door echte prijzen uit Open Prices. */
export function initialPriceSync() {
  if (getSetting('prices_synced', false) || process.env.OFF_DISABLED === '1') return;
  const ids = repo.listIngredients().filter((i) => ['schatting', 'jumbo', null].includes(i.price_source) && i.name !== 'water').map((i) => i.id);
  enqueuePrices(ids, { onFinish: (st) => { if (st.updated.length || st.skipped.length) setSetting('prices_synced', true); } });
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));
  // De mobiele app test hiermee of het serveradres klopt (vanaf een ander adres, dus CORS toestaan).
  app.get('/health', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ ok: true, app: 'maaltijden', version: APP_VERSION, login: !!process.env.APP_PASSWORD });
  });

  // Agenda-abonnement: beveiligd met de geheime sleutel in de link (agenda-apps kunnen niet inloggen)
  app.get('/agenda/:token.ics', (req, res) => {
    if (req.params.token !== calendarToken()) return res.status(404).send('Onbekende agenda');
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Cache-Control', 'no-cache');
    res.send(buildIcs({ baseUrl: `${req.protocol}://${req.get('host')}` }));
  });

  // Optionele beveiliging voor gebruik buiten je thuisnetwerk: inlogpagina met een cookie
  // (werkt ook in de mobiele app), of HTTP Basic Auth voor scripts.
  const password = process.env.APP_PASSWORD;
  if (password) {
    const token = crypto.createHash('sha256').update(`maaltijden:${password}`).digest('hex');
    const cookieOk = (req) => (req.headers.cookie || '').split(';').some((c) => c.trim() === `maaltijden_auth=${token}`);
    const basicOk = (req) => {
      const [, b64] = (req.headers.authorization || '').split(' ');
      return Buffer.from(b64 || '', 'base64').toString().split(':').slice(1).join(':') === password;
    };
    const loginPage = (error = '') => `<!doctype html><html lang="nl"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>Inloggen – Maaltijden</title>
      <link rel="icon" href="/icon.svg"><style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f7f5f0;color:#1f2a24}
      form{background:#fff;border:1px solid #e3ded2;border-radius:16px;padding:1.6rem;width:min(340px,90vw);display:grid;gap:.8rem}
      img{width:64px;height:64px}h1{margin:0;font-size:1.3rem}input{font:inherit;padding:.65rem;border:1px solid #e3ded2;border-radius:10px}
      button{font:inherit;font-weight:600;padding:.7rem;border:0;border-radius:10px;background:#2f6b4f;color:#fff}.err{color:#c0392b;margin:0}
      @media (prefers-color-scheme:dark){body{background:#141816;color:#e9ece9}form{background:#1d2320;border-color:#323a35}input{background:#141816;color:#e9ece9;border-color:#323a35}}
      </style></head><body><form method="post" action="/login"><img src="/icon.svg" alt=""><h1>Maaltijden</h1>
      ${error ? `<p class="err">${error}</p>` : ''}<label for="pw">Wachtwoord</label>
      <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
      <button>Inloggen</button></form></body></html>`;
    app.get('/icon.svg', (req, res) => res.sendFile(path.join(here, '..', 'public', 'icon.svg')));
    app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
      if (req.body.password !== password) return res.status(401).send(loginPage('Onjuist wachtwoord'));
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.set('Set-Cookie', `maaltijden_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
      res.redirect('/');
    });
    app.use((req, res, next) => {
      if (cookieOk(req) || basicOk(req)) return next();
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Inloggen vereist' });
      res.status(401).send(loginPage());
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
  api.get('/changes', (req, res) => res.json({ version: changeCounter, app_version: APP_VERSION }));

  // ---- Meta ----
  api.get('/meta', wrap(() => ({
    categories: CATEGORIES,
    units: UNITS,
    tags: repo.listTags(),
    meals: getSetting('meals', ['ontbijt', 'lunch', 'diner']),
    default_servings: getSetting('default_servings', 4),
    off_auto: getSetting('off_auto', true),
    prices_auto: getSetting('prices_auto', true),
    household: getSetting('household', ''),
    weekly_budget_cents: getSetting('weekly_budget_cents', null),
    claude: ai.claudeStatus(),
    app_version: APP_VERSION,
    builtin_sync: lastBuiltinSync(),
  })));

  api.put('/settings', wrap((req) => {
    const allowed = ['default_servings', 'meals', 'household', 'weekly_budget_cents', 'claude_model', 'anthropic_api_key', 'off_auto', 'prices_auto'];
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
    // Een handmatig ingevoerde prijs niet overschrijven met een schatting.
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

  // ---- Open Prices ----
  api.get('/ingredients/:id/prices', wrap(async (req) => {
    const ing = repo.getIngredient(Number(req.params.id));
    if (!ing) throw notFound();
    return priceForIngredient(ing);
  }));
  api.post('/ingredients/:id/prices', wrap(async (req) => {
    const ing = repo.getIngredient(Number(req.params.id));
    if (!ing) throw notFound();
    const result = await priceForIngredient(ing);
    if (!result.count) throw notFound('Geen Nederlandse prijzen gevonden in Open Prices');
    return repo.saveIngredient(ingredientPriceFields(result), ing.id);
  }));
  api.get('/prices/queue', wrap(() => priceQueueStatus()));
  api.post('/prices/queue', wrap((req) => {
    let list = repo.listIngredients().filter((i) => i.name !== 'water');
    if (Array.isArray(req.body.ids)) list = list.filter((i) => req.body.ids.includes(i.id));
    else list = list.filter((i) => i.price_source !== 'handmatig');
    return enqueuePrices(list.map((i) => i.id), { force: !!req.body.force });
  }));
  api.delete('/prices/queue', wrap(() => { clearPriceQueue(); return priceQueueStatus(); }));

  // ---- Dagboek (calorieën) en gewicht ----
  api.get('/people', wrap(() => ({ people: tracker.listPeople(), activity: tracker.ACTIVITY, meals: tracker.MEALS })));
  api.post('/people', wrap((req) => tracker.savePerson(req.body)));
  api.put('/people/:id', wrap((req) => tracker.savePerson(req.body, Number(req.params.id)) || Promise.reject(notFound())));
  api.delete('/people/:id', wrap((req) => tracker.deletePerson(Number(req.params.id))));
  api.get('/diary', wrap((req) => tracker.getDay(Number(req.query.persoon), req.query.datum || new Date().toISOString().slice(0, 10))));
  api.post('/diary', wrap((req) => ({ id: tracker.addLogEntry(req.body) })));
  api.put('/diary/:id', wrap((req) => (tracker.updateLogEntry(Number(req.params.id), req.body) ? { ok: true } : Promise.reject(notFound()))));
  api.delete('/diary/:id', wrap((req) => tracker.deleteLogEntry(Number(req.params.id))));
  api.post('/diary/from-plan', wrap((req) => ({ added: tracker.logPlannedDay(Number(req.body.person_id), req.body.date, req.body.plan_entry_id) })));
  api.post('/diary/copy', wrap((req) => ({ copied: tracker.copyDay(Number(req.body.person_id), req.body.from, req.body.to) })));
  api.get('/diary/summary', wrap((req) => tracker.summary(Number(req.query.persoon), req.query.van, req.query.tot)));
  api.get('/foods', wrap((req) => {
    // Zoeken in recepten en ingrediënten om toe te voegen aan het dagboek
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return { recipes: [], ingredients: [] };
    return {
      recipes: repo.listRecipes({ q }).slice(0, 8).map((r) => ({ id: r.id, title: r.title, kcal_per_serving: r.kcal_per_serving })),
      ingredients: repo.listIngredients(q).slice(0, 12).map((i) => ({ id: i.id, name: i.name, kcal: i.kcal, unit_weight_g: i.unit_weight_g })),
    };
  }));
  api.get('/weight', wrap((req) => tracker.weightHistory(Number(req.query.persoon), Number(req.query.dagen) || 90)));
  api.put('/weight', wrap((req) => tracker.logWeight(req.body)));
  api.delete('/weight/:id', wrap((req) => tracker.deleteWeight(Number(req.params.id))));
  api.get('/calendar', wrap((req) => ({ url: `${req.protocol}://${req.get('host')}/agenda/${calendarToken()}.ics` })));
  api.post('/calendar/new-link', wrap((req) => ({ url: `${req.protocol}://${req.get('host')}/agenda/${calendarToken(true)}.ics` })));

  // ---- Barcode scannen ----
  api.get('/scan/:ean', wrap((req) => lookupBarcode(req.params.ean)));
  api.post('/scan/apply', wrap((req) => {
    const ing = applyBarcode(req.body);
    // Prijs via de barcode opzoeken in Open Prices (op de achtergrond)
    if (getSetting('prices_auto', true) && process.env.OFF_DISABLED !== '1' && ing.price_source !== 'handmatig') enqueuePrices([ing.id]);
    return ing;
  }));

  // ---- Planning ----
  api.get('/plan', wrap((req) => {
    const plan = repo.getPlan(week(req.query.week), 7);
    // Met ?persoon: per maaltijd of die persoon hem als gegeten heeft geregistreerd, en het dagtotaal uit het dagboek
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
  }));
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
  openDatabase(undefined, { appVersion: APP_VERSION });
  const added = lastBuiltinSync();
  if (!added?.fresh && (added?.recipes || added?.ingredients)) console.log(`Nieuw in deze versie: ${added.recipes} recepten, ${added.ingredients} ingrediënten`);
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  initialOffSync();
  initialPriceSync();
  createApp().listen(port, host, () => {
    console.log(`🍽️  Maaltijden-app draait op http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    if (!ai.claudeStatus().configured) console.log('ℹ️  Claude is nog niet ingesteld (ANTHROPIC_API_KEY of via Instellingen).');
  });
}
