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

test('meerdere recepten verwijderen en standaardrecepten terugzetten', async () => {
  const list = await get('/recipes');
  const builtin = list.filter((r) => r.builtin_key).slice(0, 3);
  assert.equal(builtin.length, 3);
  const before = (await get('/meta')).builtin_missing;
  const { deleted } = await send('POST', '/recipes/delete', { ids: builtin.map((r) => r.id) });
  assert.equal(deleted, 3);
  assert.equal((await get('/recipes')).length, list.length - 3);
  assert.equal((await get('/meta')).builtin_missing, before + 3);
  const { restored } = await send('POST', '/builtins/restore');
  assert.equal(restored, before + 3);
  assert.equal((await get('/meta')).builtin_missing, 0);
  const titles = (await get('/recipes')).map((r) => r.title);
  for (const r of builtin) assert.ok(titles.includes(r.title), r.title);
});

test('standaardrecepten hebben een foto met bronvermelding; een eigen foto vervangt die', async () => {
  const list = await get('/recipes');
  const nasi = list.find((r) => r.title === 'Nasi goreng');
  assert.equal(nasi.image_url, 'img/recipes/nasi-goreng.jpg');
  const full = await get(`/recipes/${nasi.id}`);
  const credit = JSON.parse(full.image_credit);
  assert.ok(credit.author && credit.license && credit.page, JSON.stringify(credit));
  const res = await fetch(base.replace('/api', '/') + nasi.image_url);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /image\/jpeg/);
  // Eigen foto: bronvermelding vervalt
  await send('PUT', `/recipes/${nasi.id}`, { ...full, image_url: '/uploads/eigen.jpg' });
  const after = await get(`/recipes/${nasi.id}`);
  assert.equal(after.image_url, '/uploads/eigen.jpg');
  assert.equal(after.image_credit, null);
});

test('vlees of vis bij een geplande maaltijd: boodschappen, kosten, voeding, kopiëren en restjes', async () => {
  const recipes = await get('/recipes');
  const pannenkoek = recipes.find((r) => r.title === 'Hollandse pannenkoeken');
  const slavink = (await get('/ingredients?q=slavink')).find((i) => i.name === 'slavink');
  assert.ok(slavink, 'slavink is een standaardingrediënt');
  const date = '2031-03-03'; // een maandag zonder andere planning
  const { id } = await send('POST', '/plan', { date, meal: 'diner', recipe_id: pannenkoek.id, servings: 3 });
  let plan = await get(`/plan?week=${date}`);
  let entry = plan.days[0].entries.find((e) => e.id === id);
  assert.equal(entry.has_meat, false);
  const before = { kcal: entry.kcal_per_serving, cost: entry.cost_cents };

  const extras = await send('POST', `/plan/${id}/extras`, { ingredient_id: slavink.id });
  assert.equal(extras[0].quantity, 1);
  assert.equal(extras[0].unit, 'stuk');
  plan = await get(`/plan?week=${date}`);
  entry = plan.days[0].entries.find((e) => e.id === id);
  assert.equal(entry.extras.length, 1);
  assert.ok(entry.kcal_per_serving > before.kcal + 200, `${before.kcal} → ${entry.kcal_per_serving}`);
  assert.ok(entry.cost_cents > before.cost, `${before.cost} → ${entry.cost_cents}`);

  // Boodschappenlijst: 3 personen × 1 slavink
  const shop = await get(`/shopping?week=${date}`);
  const item = shop.items.find((i) => i.name === 'slavink');
  assert.equal(item.quantity, 3);
  assert.equal(item.grams, 300);

  // Hoeveelheid aanpassen
  await send('PUT', `/plan/extras/${extras[0].id}`, { quantity: 2, unit: 'stuk' });
  assert.equal((await get(`/shopping?week=${date}`)).items.find((i) => i.name === 'slavink').quantity, 6);

  // Restjes nemen het vlees mee, maar komen niet op de boodschappenlijst
  const { id: leftId } = await send('POST', `/plan/${id}/leftovers`, { date: '2031-03-04', meal: 'lunch', servings: 1 });
  plan = await get(`/plan?week=${date}`);
  const left = plan.days[1].entries.find((e) => e.id === leftId);
  assert.equal(left.extras[0].name, 'slavink');
  assert.equal(left.cost_cents, 0);
  assert.equal((await get(`/shopping?week=${date}`)).items.find((i) => i.name === 'slavink').quantity, 6);

  // Week kopiëren neemt het vlees mee
  await send('POST', '/plan/copy-week', { from: date, to: '2031-03-10' });
  const next = await get('/plan?week=2031-03-10');
  assert.equal(next.days[0].entries[0].extras[0].name, 'slavink');

  // Verwijderen
  await send('DELETE', `/plan/extras/${extras[0].id}`);
  plan = await get(`/plan?week=${date}`);
  assert.equal(plan.days[0].entries.find((e) => e.id === id).extras.length, 0);
});

test('een gerecht als vlees bij een ander gerecht', async () => {
  const recipes = await get('/recipes');
  const hachee = recipes.find((r) => r.title === 'Hachee met rode kool');
  const stamppot = recipes.find((r) => r.title === 'Andijviestamppot met spekjes');
  const full = await get(`/recipes/${hachee.id}`);
  await send('PUT', `/recipes/${hachee.id}`, { ...full, is_side: true });
  assert.equal((await get(`/recipes/${hachee.id}`)).is_side, 1);

  const date = '2031-05-05';
  const { id } = await send('POST', '/plan', { date, meal: 'diner', recipe_id: stamppot.id, servings: 2, extras: [{ recipe_id: hachee.id, quantity: 1 }] });
  const entry = (await get(`/plan?week=${date}`)).days[0].entries.find((e) => e.id === id);
  assert.equal(entry.extras[0].name, 'Hachee met rode kool');
  assert.equal(entry.extras[0].unit, 'portie');
  const hacheeFull = await get(`/recipes/${hachee.id}`);
  assert.ok(Math.abs(entry.extras[0].nutrition.kcal - hacheeFull.nutrition_per_serving.kcal) < 1);
  // Boodschappen: hachee-ingrediënten voor 2 porties (recept is voor 4 → helft)
  const shop = await get(`/shopping?week=${date}`);
  const row = hacheeFull.ingredients.find((x) => x.ingredient && x.unit === 'g');
  const item = shop.items.find((i) => i.ingredient_id === row.ingredient_id);
  assert.ok(item && item.grams >= Math.round(row.computed_grams * 2 / hachee.servings) - 1, `${item?.grams} voor ${row.name}`);
  // Het gerecht zelf verwijderen haalt het ook bij de maaltijd weg
  await send('DELETE', `/recipes/${hachee.id}`);
  assert.equal((await get(`/plan?week=${date}`)).days[0].entries.find((e) => e.id === id).extras.length, 0);
});
