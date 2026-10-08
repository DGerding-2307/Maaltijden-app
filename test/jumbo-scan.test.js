// Tests voor barcode scannen en de boodschappenlijst naar de Jumbo-app, tegen nagebootste Jumbo- en OFF-servers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const calls = [];
let basket = { id: 'b1', products: [{ sku: '111PAK', unit: 'pieces', quantity: 2 }], vagueTerms: [] };
let server;

before(async () => {
  server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, 'http://x');
    calls.push({ method: req.method, path: url.pathname, token: req.headers['x-jumbo-token'], body });
    res.setHeader('Content-Type', 'application/json');
    // --- Jumbo ---
    if (url.pathname === '/v17/users/login') {
      let parsed = JSON.parse(body);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      const { username, password } = parsed;
      if (password !== 'geheim') { res.statusCode = 401; return res.end('{}'); }
      res.setHeader('x-jumbo-token', `token-for-${username}`);
      return res.end('{}');
    }
    if (url.pathname === '/v17/basket') {
      if (req.headers['x-jumbo-token'] !== 'token-for-ik@example.nl') { res.statusCode = 401; return res.end('{}'); }
      if (req.method === 'PUT') {
        const put = JSON.parse(body);
        basket = { ...basket, products: put.items };
        return res.end(JSON.stringify({ id: 'b1', items: put.items, vagueTerms: [] }));
      }
      return res.end(JSON.stringify(basket));
    }
    if (url.pathname === '/v17/search') {
      if (url.searchParams.get('q') === '8710400000001') {
        return res.end(JSON.stringify({ products: { data: [{ id: '67649PAK', title: 'Jumbo Halfvolle Melk 1L', quantity: '1 l', prices: { price: { amount: 115 }, unitPrice: { unit: 'l', price: { amount: 115 } } } }] } }));
      }
      return res.end(JSON.stringify({ products: { data: [] } }));
    }
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
  process.env.JUMBO_API_BASE = `${base}/v17`;
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

test('barcode scannen: OFF + Jumbo, en koppeling aan bestaand ingrediënt', async () => {
  const { lookupBarcode, applyBarcode } = await import('../server/scan.js');
  const info = await lookupBarcode('8710400000001');
  assert.equal(info.product.nutrition.kcal, 47);
  assert.equal(info.product.category, 'Zuivel, eieren & kaas');
  assert.equal(info.jumbo.id, '67649PAK');
  assert.equal(info.match.name, 'halfvolle melk');
  const ing = applyBarcode({ ean: info.ean, product: info.product, jumbo: info.jumbo, ingredient_id: info.match.id });
  assert.equal(ing.id, info.match.id);
  assert.equal(ing.kcal, 47);
  assert.equal(ing.off_code, '8710400000001');
  assert.equal(ing.nutriscore, 'a');
  assert.equal(ing.jumbo_id, '67649PAK');
  // Tweede scan herkent het product direct
  const again = await lookupBarcode('8710400000001');
  assert.equal(again.ingredient.id, ing.id);
});

test('barcode scannen: nieuw ingrediënt met juiste afdeling', async () => {
  const { lookupBarcode, applyBarcode } = await import('../server/scan.js');
  const info = await lookupBarcode('8712345678906');
  assert.equal(info.jumbo, null);
  const ing = applyBarcode({ ean: info.ean, product: info.product, jumbo: null, name: info.suggested_name });
  assert.equal(ing.name, 'kikkererwten hummus');
  assert.equal(ing.category, 'Brood, ontbijt & beleg');
  assert.equal(ing.package_grams, 200);
  assert.match(ing.nutrition_source, /Open Food Facts/);
});

test('Jumbo: verkeerd wachtwoord geeft nette melding', async () => {
  const { loginJumbo } = await import('../server/jumboaccount.js');
  await assert.rejects(loginJumbo('ik@example.nl', 'fout'), /Inloggen bij Jumbo is mislukt/);
});

test('Jumbo: inloggen bewaart alleen token en lijst wordt samengevoegd', async () => {
  const { loginJumbo, addToJumboList } = await import('../server/jumboaccount.js');
  const { getSetting } = await import('../server/db.js');
  const st = await loginJumbo('ik@example.nl', 'geheim');
  assert.equal(st.connected, true);
  assert.equal(getSetting('jumbo_token'), 'token-for-ik@example.nl');
  assert.ok(!JSON.stringify(getSetting('jumbo_email')).includes('geheim'));
  const res = await addToJumboList([{ sku: '111PAK', quantity: 1 }, { sku: '67649PAK', quantity: 2 }]);
  assert.equal(res.total_products, 2);
  assert.deepEqual(basket.products.find((p) => p.sku === '111PAK').quantity, 3); // 2 bestaand + 1
  assert.equal(basket.products.find((p) => p.sku === '67649PAK').quantity, 2);
});

test('Jumbo: verlopen sessie logt uit', async () => {
  const { addToJumboList, jumboAccountStatus } = await import('../server/jumboaccount.js');
  const { setSetting } = await import('../server/db.js');
  setSetting('jumbo_token', 'verlopen');
  await assert.rejects(addToJumboList([{ sku: '1', quantity: 1 }]), /sessie is verlopen/);
  assert.equal(jumboAccountStatus().connected, false);
});

test('back-up bevat geen Jumbo-token', async () => {
  const { setSetting } = await import('../server/db.js');
  const repo = await import('../server/repo.js');
  setSetting('jumbo_token', 'abc');
  const dump = JSON.stringify(repo.exportAll());
  assert.ok(!dump.includes('jumbo_token'));
});
