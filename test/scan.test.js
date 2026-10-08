// Tests voor barcode scannen, tegen een nagebootste Open Food Facts-server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server;

before(async () => {
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    // --- Open Food Facts ---
    if (url.pathname === '/api/v2/product/8710400000001.json') {
      return res.end(JSON.stringify({ status: 1, product: { product_name: 'Jumbo Halfvolle Melk 1L', brands: 'Jumbo', quantity: '1 l', product_quantity: 1000, nutriscore_grade: 'a', categories_tags: ['en:dairies', 'en:milks'], nutriments: { 'energy-kcal_100g': 47, proteins_100g: 3.6, carbohydrates_100g: 4.8, sugars_100g: 4.8, fat_100g: 1.5, 'saturated-fat_100g': 1, salt_100g: 0.1 } } }));
    }
    if (url.pathname === '/api/v2/product/8712345678906.json') {
      return res.end(JSON.stringify({ status: 1, product: { product_name: 'Bio Kikkererwten Hummus 200g', brands: 'Merk', quantity: '200 g', product_quantity: 200, categories_tags: ['en:spreads'], nutriments: { 'energy-kcal_100g': 280, proteins_100g: 7, carbohydrates_100g: 12, fat_100g: 22 } } }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ status: 0 }));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.OFF_BASE = base;
  process.env.OFF_MIN_GAP_MS = '0';
  process.env.NO_PROXY = '127.0.0.1,localhost';
  process.env.no_proxy = '127.0.0.1,localhost';
  const { openDatabase } = await import('../server/db.js');
  openDatabase(':memory:');
});
after(() => server.close());

test('productnaam wordt een algemene ingrediëntnaam', async () => {
  const { genericName } = await import('../server/scan.js');
  assert.equal(genericName('Jumbo Halfvolle Melk 1L', 'Jumbo'), 'halfvolle melk');
  assert.equal(genericName('Bio Kikkererwten Hummus 200g', 'Merk'), 'kikkererwten hummus');
});

test('barcode scannen: Open Food Facts en koppeling aan bestaand ingrediënt', async () => {
  const { lookupBarcode, applyBarcode } = await import('../server/scan.js');
  const info = await lookupBarcode('8710400000001');
  assert.equal(info.product.nutrition.kcal, 47);
  assert.equal(info.product.category, 'Zuivel, eieren & kaas');
  assert.equal(info.match.name, 'halfvolle melk');
  assert.equal(info.jumbo, undefined);
  const ing = applyBarcode({ ean: info.ean, product: info.product, ingredient_id: info.match.id });
  assert.equal(ing.id, info.match.id);
  assert.equal(ing.kcal, 47);
  assert.equal(ing.off_code, '8710400000001');
  assert.equal(ing.nutriscore, 'a');
  // Tweede scan herkent het product direct
  const again = await lookupBarcode('8710400000001');
  assert.equal(again.ingredient.id, ing.id);
});

test('barcode scannen: nieuw ingrediënt met juiste afdeling', async () => {
  const { lookupBarcode, applyBarcode } = await import('../server/scan.js');
  const info = await lookupBarcode('8712345678906');
  const ing = applyBarcode({ ean: info.ean, product: info.product, name: info.suggested_name });
  assert.equal(ing.name, 'kikkererwten hummus');
  assert.equal(ing.category, 'Brood, ontbijt & beleg');
  assert.equal(ing.package_grams, 200);
  assert.match(ing.nutrition_source, /Open Food Facts/);
});

test('back-up bevat geen API-sleutel', async () => {
  const { setSetting } = await import('../server/db.js');
  const repo = await import('../server/repo.js');
  setSetting('anthropic_api_key', 'sk-ant-geheim');
  const dump = JSON.stringify(repo.exportAll());
  assert.ok(!dump.includes('sk-ant-geheim'));
});

test('oude Jumbo-sessie wordt bij opstarten opgeruimd', async () => {
  const { openDatabase, setSetting, getSetting } = await import('../server/db.js');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(os.tmpdir(), `maaltijden-test-${process.pid}.db`);
  openDatabase(file);
  setSetting('jumbo_token', 'oud');
  openDatabase(file);
  assert.equal(getSetting('jumbo_token', null), null);
  (await import('node:fs')).rmSync(file, { force: true });
});
