import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Nagebootste Claude API: de echte is vanuit de tests niet bereikbaar.
let mode = 'ok';
const seen = [];
const SHOP_HTML = `<html><head><title>Griekse yoghurt 0% | Testwinkel</title>
<meta property="og:image" content="/img/yoghurt.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Griekse yoghurt 0%","brand":{"name":"Testmerk"},"gtin13":"8710000000001",
"offers":{"price":"2.19","priceCurrency":"EUR"}}</script></head><body><h1>Griekse yoghurt 0%</h1><p>Per 100 g: energie 57 kcal, eiwit 10 g</p></body></html>`;

const mock = http.createServer((req, res) => {
  if (req.url === '/shop/yoghurt') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(SHOP_HTML); }
  if (req.url === '/shop/geblokkeerd') { res.writeHead(403); return res.end('nee'); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = JSON.parse(body || '{}');
    seen.push({ headers: req.headers, body: json });
    const error = (status, type, message) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'error', error: { type, message } }));
    };
    if (mode === 'auth') return error(401, 'authentication_error', 'invalid x-api-key');
    if (mode === 'credit') return error(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.');
    if (mode === 'no-fallback' && json.fallbacks) return error(400, 'invalid_request_error', 'fallbacks: Extra inputs are not permitted');
    const schema = json.output_config?.format?.schema;
    const prompt = JSON.stringify(json.messages);
    const text = schema?.properties?.found
      ? JSON.stringify({
        found: true, name: 'griekse yoghurt', product_name: 'Griekse yoghurt 0%', brand: 'Testmerk', category: schema.properties.category.enum[0],
        kcal: prompt.includes('57 kcal') ? 57 : null, protein: 10, carbs: 4, sugar: 4, fat: 0.2, sat_fat: 0.1, fiber: 0, salt: 0.1,
        package_grams: 500, package_label: '500 g', price_cents: 219, unit_weight_g: null, pantry: false, ean: '8710000000001', image_url: null,
      })
      : schema ? JSON.stringify({ summary: 'Lekker menu', entries: [] }) : 'OK';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: json.model,
      content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 1 },
    }));
  });
});

let server;
let base;
before(async () => {
  await new Promise((r) => mock.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${mock.address().port}`;
  process.env.DB_FILE = ':memory:';
  process.env.OFF_DISABLED = '1';
  delete process.env.ANTHROPIC_API_KEY;
  const { openDatabase } = await import('../server/db.js');
  const { createApp } = await import('../server/index.js');
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => { server.close(); mock.close(); });

const post = (p, body = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, ...(await r.json()) }));
const put = (p, body) => fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
// Stille console tijdens verwachte fouten
const quiet = async (fn) => {
  const [e, w] = [console.error, console.warn];
  console.error = () => {};
  console.warn = () => {};
  try { return await fn(); } finally { console.error = e; console.warn = w; }
};

test('zonder sleutel een duidelijke melding', async () => {
  const r = await post('/ai/test');
  assert.equal(r.status, 400);
  assert.match(r.error, /nog niet ingesteld/);
});

test('sleutel met spaties/aanhalingstekens werkt; test en weekmenu sturen het juiste verzoek', async () => {
  const s = await put('/settings', { anthropic_api_key: '  "sk-ant-test-123"\n' });
  assert.equal(s.claude.configured, true);
  mode = 'ok';
  const r = await post('/ai/test');
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.model, 'claude-opus-5-5');
  const req = seen.at(-1);
  assert.equal(req.headers['x-api-key'], 'sk-ant-test-123');
  assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(req.body.fallbacks, 'default');

  const week = await post('/ai/week-menu', { week: '2026-10-05', meals: ['diner'], servings: 2 });
  assert.equal(week.summary, 'Lekker menu', JSON.stringify(week));
  assert.equal(seen.at(-1).body.output_config.format.type, 'json_schema');
});

test('ongeldige sleutel en geen tegoed geven begrijpelijke meldingen', async () => {
  mode = 'auth';
  let r = await quiet(() => post('/ai/test'));
  assert.equal(r.status, 401);
  assert.match(r.error, /niet geaccepteerd/);
  mode = 'credit';
  r = await quiet(() => post('/ai/test'));
  assert.equal(r.status, 402);
  assert.match(r.error, /geen API-tegoed/);
});

test('als de terugvalfunctie niet wordt geaccepteerd, gaat het verder zonder', async () => {
  mode = 'no-fallback';
  const r = await quiet(() => post('/ai/test'));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(seen.at(-1).body.fallbacks, undefined);
  mode = 'ok';
});

test('ingrediëntgegevens uit een webwinkel-link', async () => {
  mode = 'ok';
  const shop = `${process.env.ANTHROPIC_BASE_URL}/shop/yoghurt`;
  const d = await post('/ingredients/from-url', { url: shop });
  assert.equal(d.name, 'griekse yoghurt', JSON.stringify(d));
  assert.equal(d.kcal, 57);
  assert.equal(d.price_cents, 219);
  assert.equal(d.package_grams, 500);
  // Foto uit og:image, absoluut gemaakt
  assert.equal(d.image_url, `${process.env.ANTHROPIC_BASE_URL}/img/yoghurt.jpg`);
  assert.equal(d.shop_host, 'localhost');
  assert.match(d.nutrition_source, /Webwinkel localhost/);
  // De pagina-inhoud (JSON-LD en tekst) gaat mee naar Claude
  assert.match(JSON.stringify(seen.at(-1).body.messages), /8710000000001/);

  const blocked = await post('/ingredients/from-url', { url: `${process.env.ANTHROPIC_BASE_URL}/shop/geblokkeerd` });
  assert.equal(blocked.status, 502);
  assert.match(blocked.error, /status 403/);
  assert.equal((await post('/ingredients/from-url', { url: 'geen link' })).status, 400);
});
