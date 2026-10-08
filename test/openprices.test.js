// Tests voor Open Prices, tegen een nagebootste server met het antwoordformaat van prices.openfoodfacts.org.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = [];
const loc = (country, brand) => ({ osm_address_country_code: country, osm_brand: brand, osm_name: brand, osm_address_city: 'Utrecht' });
const recent = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
const old = '2019-01-01';

const DATA = {
  // Losse wortels per kg (categorie) – één Duitse prijs en één oude prijs die genegeerd moeten worden
  'category_tag=en:carrots': [
    { id: 1, type: 'CATEGORY', category_tag: 'en:carrots', price: '1.20', price_per: 'KILOGRAM', currency: 'EUR', date: recent, location: loc('NL', 'Albert Heijn') },
    { id: 2, type: 'CATEGORY', category_tag: 'en:carrots', price: '1.40', price_per: 'KILOGRAM', currency: 'EUR', date: recent, location: loc('NL', 'Jumbo') },
    { id: 3, type: 'CATEGORY', category_tag: 'en:carrots', price: '0.50', price_per: 'KILOGRAM', currency: 'EUR', date: recent, location: loc('DE', 'Aldi') },
    { id: 4, type: 'CATEGORY', category_tag: 'en:carrots', price: '9.99', price_per: 'KILOGRAM', currency: 'EUR', date: old, location: loc('NL', 'Plus') },
  ],
  // Verpakte wortels (zak van 500 g) in dezelfde categorie, met actieprijs
  'product__categories_tags__contains=en:carrots': [
    { id: 5, type: 'PRODUCT', product_code: '871', price: '0.50', price_is_discounted: true, price_without_discount: '0.80', currency: 'EUR', date: recent, location: loc('NL', 'Lidl'), product: { product_name: 'Waspeen', product_quantity: 500, product_quantity_unit: 'g' } },
  ],
  // Komkommer per stuk
  'category_tag=en:cucumbers': [
    { id: 6, type: 'CATEGORY', category_tag: 'en:cucumbers', price: '0.70', price_per: 'UNIT', currency: 'EUR', date: recent, location: loc('NL', 'Dirk') },
  ],
  // Melk via barcode (1 liter)
  'product_code=8710400000001': [
    { id: 7, type: 'PRODUCT', product_code: '8710400000001', price: '1.19', currency: 'EUR', date: recent, location: loc('NL', 'Jumbo'), product: { product_name: 'Halfvolle melk', product_quantity: 1, product_quantity_unit: 'l' } },
  ],
};

let server;
before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    requests.push({ path: url.pathname, ua: req.headers['user-agent'], params: Object.fromEntries(url.searchParams) });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname !== '/api/v1/prices') { res.statusCode = 404; return res.end('{}'); }
    const p = url.searchParams;
    const key = ['product_code', 'category_tag', 'product__categories_tags__contains', 'product_code__in'].map((k) => (p.get(k) ? `${k}=${p.get(k)}` : null)).find(Boolean);
    const items = DATA[key] || [];
    res.end(JSON.stringify({ items, page: 1, pages: 1, size: 100, total: items.length }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.OPEN_PRICES_BASE = `http://127.0.0.1:${server.address().port}`;
  process.env.OFF_BASE = `http://127.0.0.1:${server.address().port}`;
  process.env.OPEN_PRICES_MIN_GAP_MS = '0';
  process.env.OFF_MIN_GAP_MS = '0';
  const { openDatabase } = await import('../server/db.js');
  openDatabase(':memory:');
});
after(() => server.close());

test('prijs per kg: per kg, per stuk, verpakking en actieprijs', async () => {
  const { pricePerKg } = await import('../server/openprices.js');
  assert.equal(pricePerKg({ type: 'CATEGORY', price: '2', price_per: 'KILOGRAM' }), 2);
  assert.equal(pricePerKg({ type: 'CATEGORY', price: '0.70', price_per: 'UNIT' }, { unit_weight_g: 350 }), 2);
  assert.equal(pricePerKg({ type: 'CATEGORY', price: '0.70', price_per: 'UNIT' }, {}), null);
  assert.equal(pricePerKg({ type: 'PRODUCT', product_code: '1', price: '1.19', product: { product_quantity: 1, product_quantity_unit: 'l' } }, { density: 1 }), 1.19);
  assert.equal(pricePerKg({ type: 'PRODUCT', product_code: '1', price: '0.50', price_is_discounted: true, price_without_discount: '0.80', product: { product_quantity: 500, product_quantity_unit: 'g' } }), 1.6);
});

test('wortel: alleen recente Nederlandse prijzen, mediaan per kg, eigen User-Agent', async () => {
  const repo = await import('../server/repo.js');
  const { priceForIngredient } = await import('../server/openprices.js');
  const wortel = repo.listIngredients().find((i) => i.name === 'wortel');
  assert.equal(wortel.off_category, 'en:carrots');
  const r = await priceForIngredient(wortel);
  assert.equal(r.count, 3); // AH 1.20, Jumbo 1.40, Lidl 1.60 (normale prijs) – geen DE en geen oude prijs
  assert.equal(r.per_kg, 1.4);
  assert.equal(r.price_cents, 140); // zak van 1 kg
  assert.deepEqual(r.stores.sort(), ['Albert Heijn', 'Jumbo', 'Lidl']);
  assert.match(requests.at(-1).ua, /Maaltijden-app/);
  assert.equal(requests.at(-1).params.currency, 'EUR');
});

test('komkommer per stuk wordt omgerekend met het stuksgewicht', async () => {
  const repo = await import('../server/repo.js');
  const { priceForIngredient } = await import('../server/openprices.js');
  const r = await priceForIngredient(repo.listIngredients().find((i) => i.name === 'komkommer'));
  assert.equal(r.per_kg, 2); // € 0,70 / 350 g
  assert.equal(r.price_cents, 70);
});

test('barcode gaat voor op de categorie', async () => {
  const repo = await import('../server/repo.js');
  const { priceForIngredient } = await import('../server/openprices.js');
  const melk = repo.listIngredients().find((i) => i.name === 'halfvolle melk');
  repo.saveIngredient({ off_code: '8710400000001' }, melk.id);
  const r = await priceForIngredient(repo.getIngredient(melk.id));
  assert.equal(r.count, 1);
  assert.equal(r.route, 'barcode');
  assert.equal(r.price_cents, 119); // € 1,19 per liter; verpakking 1030 g (1 l × dichtheid 1,03)
});

test('wachtrij: werkt bij, slaat handmatige prijzen en ontbrekende data over', async () => {
  const repo = await import('../server/repo.js');
  const { enqueuePrices, priceQueueStatus } = await import('../server/pricequeue.js');
  const by = (n) => repo.listIngredients().find((i) => i.name === n);
  repo.saveIngredient({ price_source: 'handmatig', price_cents: 99 }, by('komkommer').id);
  const ids = [by('wortel').id, by('komkommer').id, by('rookworst').id];
  await new Promise((resolve) => enqueuePrices(ids, { onFinish: resolve }));
  const st = priceQueueStatus();
  assert.deepEqual(st.updated.map((u) => u.name), ['wortel']);
  const w = by('wortel');
  assert.equal(w.price_source, 'open prices');
  assert.equal(w.price_count, 3);
  assert.match(w.price_note, /Mediaan van 3 prijzen/);
  assert.equal(by('komkommer').price_cents, 99);
  assert.match(st.skipped.find((s) => s.name === 'komkommer').reason, /handmatig/);
  assert.match(st.skipped.find((s) => s.name === 'rookworst').reason, /geen Nederlandse prijzen/);
});
