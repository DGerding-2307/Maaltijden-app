// Tests voor de Open Food Facts-koppeling tegen een nagebootste OFF-server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = [];
const product = (code, name, kcal, extra = {}) => ({
  code, product_name: name, brands: 'Merk', quantity: '500 g', product_quantity: '500', nutriscore_grade: 'a',
  countries_tags: ['en:netherlands'],
  nutriments: { 'energy-kcal_100g': kcal, proteins_100g: 3, carbohydrates_100g: 4, sugars_100g: 1, fat_100g: 0.5, 'saturated-fat_100g': 0.1, fiber_100g: 3, salt_100g: 0.05, ...extra },
});
const SEARCH = {
  boerenkool: [
    product('1', 'Boerenkool gesneden', 30),
    product('2', 'Verse boerenkool', 34),
    product('3', 'Boerenkool stamppot', 95), // samengesteld product, wordt meegeteld maar mediaan is robuust
    product('4', 'Andijvie', 15),
    { code: '5', product_name: 'Boerenkool zonder data', nutriments: {} },
  ],
  ui: [
    product('10', 'Uienringen', 300),
    product('11', 'Gebakken uitjes', 590),
    product('12', 'Rode ui', 35),
    product('13', 'Gele ui', 31),
  ],
};
let server;

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    requests.push({ path: url.pathname, ua: req.headers['user-agent'], params: Object.fromEntries(url.searchParams) });
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/cgi/search.pl') {
      return res.end(JSON.stringify({ count: 5, products: SEARCH[url.searchParams.get('search_terms')] || [] }));
    }
    const m = url.pathname.match(/^\/api\/v2\/product\/(\d+)\.json$/);
    if (m) {
      if (m[1] === '8710400000000') return res.end(JSON.stringify({ status: 1, product: product(m[1], 'Halfvolle melk', 46, { 'energy-kcal_100g': undefined, energy_100g: 192.5, salt_100g: undefined, sodium_100g: 0.04 }) }));
      return res.end(JSON.stringify({ status: 0 }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise((r) => server.listen(0, r));
  process.env.OFF_BASE = `http://localhost:${server.address().port}`;
  process.env.OFF_MIN_GAP_MS = '0';
  process.env.SKIP_SEED = '1';
  const { openDatabase } = await import('../server/db.js');
  openDatabase(':memory:');
});
after(() => server.close());

test('zoeken: Nederlandse producten, eigen User-Agent, voedingswaarden genormaliseerd', async () => {
  const { searchOff } = await import('../server/openfoodfacts.js');
  const r = await searchOff('Boerenkool');
  const req = requests.at(-1);
  assert.match(req.ua, /Maaltijden-app/);
  assert.equal(req.params.tag_0, 'netherlands');
  assert.equal(r.products.length, 5);
  assert.equal(r.products[0].nutrition.kcal, 30);
  assert.equal(r.products[4].nutrition, null);
  assert.equal(r.median.count, 4);
  assert.equal(r.median.nutrition.kcal, 32); // mediaan van 15, 30, 34, 95
});

test('zoekresultaten worden gecachet', async () => {
  const { searchOff } = await import('../server/openfoodfacts.js');
  const before = requests.length;
  const r = await searchOff('boerenkool');
  assert.equal(r.cached, true);
  assert.equal(requests.length, before);
});

test('barcode: kJ → kcal en natrium → zout', async () => {
  const { productByBarcode } = await import('../server/openfoodfacts.js');
  const p = await productByBarcode('8710400000000');
  assert.equal(p.nutrition.kcal, 46);
  assert.equal(p.nutrition.salt, 0.1);
  await assert.rejects(productByBarcode('12345678'), /niet gevonden/);
});

test('automatisch aanvullen gebruikt alleen producten met het ingrediënt als los woord', async () => {
  const { autoNutrition } = await import('../server/openfoodfacts.js');
  const r = await autoNutrition('ui');
  assert.deepEqual(r.matched.sort(), ['Gele ui', 'Rode ui']);
  assert.equal(r.fields.kcal, 33);
  assert.match(r.fields.nutrition_source, /Open Food Facts: mediaan van 2/);
});

test('wachtrij werkt ingrediënten bij en slaat sterk afwijkende waarden over', async () => {
  const repo = await import('../server/repo.js');
  const { enqueue, queueStatus } = await import('../server/offqueue.js');
  const ok = repo.saveIngredient({ name: 'ui', kcal: 32, protein: 1, carbs: 6, fat: 0.1 });
  const off = repo.saveIngredient({ name: 'boerenkool', kcal: 90, protein: 1, carbs: 1, fat: 0.1 });
  await new Promise((resolve) => enqueue([ok.id, off.id], { onFinish: resolve }));
  const st = queueStatus();
  assert.equal(st.updated.length, 1);
  assert.equal(repo.getIngredient(ok.id).kcal, 33);
  assert.equal(repo.getIngredient(ok.id).nutriscore, null);
  assert.equal(st.skipped[0].name, 'boerenkool');
  assert.match(st.skipped[0].reason, /wijkt sterk af/);
});
