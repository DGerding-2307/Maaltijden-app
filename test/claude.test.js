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
    // Opzoeken bij Jumbo: eerst een gepauzeerde zoekbeurt (server tools), daarna de tool jumbo_product
    if (json.tools?.some((t) => t.name === 'jumbo_product')) {
      const resumed = json.messages.length > 1;
      const query = JSON.stringify(json.messages[0].content).match(/ingrediënt \\"([^\\]+)\\"/)?.[1] || '';
      const notFound = query.includes('onvindbaar');
      const reply = !resumed
        ? { content: [{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: `jumbo ${query}` } }], stop_reason: 'pause_turn' }
        : { content: [{ type: 'tool_use', id: 'toolu_1', name: 'jumbo_product', input: {
          found: !notFound, name: query.includes('tempeh') ? 'tempeh' : 'kokosmelk', product_name: query.includes('tempeh') ? 'Jumbo Tempeh 200 g' : 'Jumbo Kokosmelk 400 ml', brand: 'Jumbo',
          category: json.tools.find((t) => t.name === 'jumbo_product').input_schema.properties.category.enum[0],
          kcal: 180, protein: 1.5, carbs: 3, sugar: 2, fat: 18, sat_fat: 16, fiber: 0, salt: 0.05,
          package_grams: 400, package_label: '400 ml', price_cents: 149, unit_weight_g: null, pantry: true, ean: null,
          image_url: 'https://static.jumbo.com/product/kokosmelk.png', product_url: 'https://www.jumbo.com/producten/jumbo-kokosmelk-400ml-123',
        } }], stop_reason: 'tool_use' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ id: 'msg_j', type: 'message', role: 'assistant', model: json.model, ...reply, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 1 } }));
    }
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

test('model kiezen: Haiku zonder terugvalfunctie, Sonnet met; onbekend model valt terug op Opus', async () => {
  mode = 'ok';
  const status = await fetch(`${base}/ai/status`).then((r) => r.json());
  assert.deepEqual(status.models.map((x) => x.id), ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
  const [opus, sonnet, haiku] = status.models;
  assert.ok(haiku.cost_per_action_usd < sonnet.cost_per_action_usd && sonnet.cost_per_action_usd < opus.cost_per_action_usd);

  await put('/settings', { claude_model: 'claude-haiku-5-5' });
  let r = await post('/ai/test');
  assert.equal(r.model, 'claude-haiku-5-5');
  assert.equal(seen.at(-1).body.fallbacks, undefined);
  assert.doesNotMatch(seen.at(-1).headers['anthropic-beta'] || '', /fallback/);

  await put('/settings', { claude_model: 'claude-sonnet-5-5' });
  r = await post('/ai/test');
  assert.equal(r.model, 'claude-sonnet-5-5');
  assert.equal(seen.at(-1).body.fallbacks, 'default');

  await put('/settings', { claude_model: 'gpt-iets' });
  r = await post('/ai/test');
  assert.equal(r.model, 'claude-opus-5-5');
  await put('/settings', { claude_model: null });
});

test('ingrediënt opzoeken bij Jumbo: alleen jumbo.com, strikte tool, pauze hervatten, toevoegen en hergebruiken', async () => {
  mode = 'ok';
  const before = seen.length;
  const d = await post('/ingredients/from-jumbo', { name: 'kokosmelk light' });
  assert.equal(d.name, 'kokosmelk', JSON.stringify(d));
  assert.equal(d.price_cents, 149);
  assert.equal(d.shop_url, 'https://www.jumbo.com/producten/jumbo-kokosmelk-400ml-123');
  assert.equal(d.shop_host, 'jumbo.com');
  assert.match(d.nutrition_source, /^Jumbo: /);
  // Twee aanvragen: de gepauzeerde zoekbeurt werd hervat met de assistent-beurt erbij
  const reqs = seen.slice(before);
  assert.equal(reqs.length, 2);
  const body = reqs[0].body;
  const search = body.tools.find((t) => t.name === 'web_search');
  const fetchTool = body.tools.find((t) => t.name === 'web_fetch');
  assert.equal(search.type, 'web_search_20260209');
  assert.equal(fetchTool.type, 'web_fetch_20260209');
  assert.deepEqual(search.allowed_domains, ['jumbo.com']);
  assert.deepEqual(fetchTool.allowed_domains, ['jumbo.com']);
  const tool = body.tools.find((t) => t.name === 'jumbo_product');
  assert.equal(tool.strict, true);
  assert.equal(tool.input_schema.additionalProperties, false);
  assert.equal(body.tool_choice.type, 'auto');
  assert.equal(body.output_config.format, undefined, 'geen structured outputs naast web search');
  assert.equal(reqs[1].body.messages.length, 2);
  assert.equal(reqs[1].body.messages[1].role, 'assistant');

  // Toevoegen: nieuw ingrediënt met winkelprijs, foto, link en de receptnaam als andere naam
  const add = await post('/ingredients/add-from-jumbo', { name: 'tempeh naturel' });
  assert.equal(add.created, true, JSON.stringify(add));
  assert.equal(add.ingredient.name, 'tempeh');
  assert.equal(add.ingredient.price_cents, 149);
  assert.equal(add.ingredient.price_source, 'handmatig');
  assert.equal(add.ingredient.image_url, 'https://static.jumbo.com/product/kokosmelk.png');
  assert.match(add.ingredient.aliases, /tempeh naturel/);
  // Nog een keer: hetzelfde ingrediënt hergebruikt, geen dubbele
  const again = await post('/ingredients/add-from-jumbo', { name: 'tempeh blokjes' });
  assert.equal(again.created, false);
  assert.equal(again.ingredient.id, add.ingredient.id);
  // Bestaand standaardingrediënt met een geschatte prijs krijgt de Jumbo-prijs en -link, voedingswaarden blijven
  const kokos = await post('/ingredients/add-from-jumbo', { name: 'kokosmelk light' });
  assert.equal(kokos.created, false);
  assert.equal(kokos.ingredient.price_cents, 149);
  assert.equal(kokos.ingredient.price_source, 'handmatig');
  assert.equal(kokos.ingredient.shop_url, 'https://www.jumbo.com/producten/jumbo-kokosmelk-400ml-123');
  assert.equal(kokos.ingredient.kcal, 190, 'voedingswaarden van het bestaande ingrediënt blijven');

  // Niets gevonden en lege naam
  const none = await post('/ingredients/from-jumbo', { name: 'onvindbaar product' });
  assert.equal(none.status, 404);
  assert.match(none.error, /Geen passend product/);
  assert.equal((await post('/ingredients/from-jumbo', { name: ' ' })).status, 400);

  // Haiku: de basisversies van de webtools, zonder terugvalfunctie
  await put('/settings', { claude_model: 'claude-haiku-5-5' });
  await post('/ingredients/from-jumbo', { name: 'kokosmelk' });
  const hb = seen.at(-1).body;
  assert.equal(hb.tools.find((t) => t.name === 'web_search').type, 'web_search_20250305');
  assert.equal(hb.tools.find((t) => t.name === 'web_fetch').type, 'web_fetch_20250910');
  await put('/settings', { claude_model: null });
});
