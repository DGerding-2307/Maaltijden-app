import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_FILE = ':memory:';
process.env.OFF_DISABLED = '1';
const { openDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');

let server;
let base;
before(async () => {
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

const get = (p) => fetch(base + p).then((r) => r.json());
const send = (method, p, body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

test('startrecepten hebben voedingswaarden en prijzen', async () => {
  const list = await get('/recipes');
  assert.ok(list.length >= 10);
  for (const r of list) {
    assert.ok(r.kcal_per_serving > 0, r.title);
    assert.ok(r.cost_per_serving_cents > 0, r.title);
    assert.equal(r.missing_price, 0, r.title);
  }
});

test('recept opslaan koppelt ingrediënten automatisch', async () => {
  const saved = await send('POST', '/recipes', {
    title: 'Testsoep', servings: 2, steps: ['Kook alles.'],
    ingredients: [
      { name: 'Uien', quantity: 2, unit: 'stuk' },
      { name: 'bloemkool', quantity: 1, unit: 'stuk' },
      { name: 'drakenfruit', quantity: 1, unit: 'stuk', estimate: { category: 'Overig', kcal: 50, protein: 1, carbs: 11, sugar: 8, fat: 0.4, sat_fat: 0, fiber: 3, salt: 0, unit_weight_g: 350, package_grams: 350, price_cents: 199, pantry: false } },
    ],
  });
  assert.equal(saved.ingredients[0].ingredient.name, 'ui');
  assert.equal(saved.ingredients[1].ingredient.name, 'bloemkool');
  assert.equal(saved.ingredients[2].ingredient.nutrition_source, 'Claude (schatting)');
  assert.equal(saved.missing_nutrition, 0);
});

test('planning en boodschappenlijst', async () => {
  const week = '2030-01-07';
  await send('POST', '/plan', { date: week, meal: 'diner', recipe_id: 1, servings: 8 });
  const plan = await get(`/plan?week=${week}`);
  assert.equal(plan.days[0].entries.length, 1);
  const shop = await get(`/shopping?week=${week}`);
  assert.ok(shop.items.find((i) => i.name === 'boerenkool gesneden').packages === 2);
});

test('Claude zonder sleutel geeft nette foutmelding', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const res = await send('POST', '/ai/generate', { prompt: 'stamppot' });
  assert.match(res.error, /API-sleutel/);
});
