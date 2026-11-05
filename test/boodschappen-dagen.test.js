// Kiezen voor welke dagen je boodschappen doet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boodschappen-dagen-'));
let repo;
let a;
let b;
let ia;
let ib;
// Een week ver weg: de nieuwe database zet in de huidige week voorbeeldmaaltijden
const week = '2030-01-07';

before(async () => {
  process.env.DB_FILE = path.join(dir, 'test.db');
  repo = await import('../server/repo.js');
  ia = repo.saveIngredient({ name: 'testprei', category: 'Overig', package_grams: 100, price_cents: 100 }).id;
  ib = repo.saveIngredient({ name: 'testkool', category: 'Overig', package_grams: 100, price_cents: 200 }).id;
  a = repo.saveRecipe({ title: 'Recept A', servings: 2, ingredients: [{ ingredient_id: ia, name: 'testprei', quantity: 100, unit: 'g', auto_match: false }] });
  b = repo.saveRecipe({ title: 'Recept B', servings: 2, ingredients: [{ ingredient_id: ib, name: 'testkool', quantity: 100, unit: 'g', auto_match: false }] });
  repo.addPlanEntry({ date: '2030-01-07', recipe_id: a, servings: 2 });
  repo.addPlanEntry({ date: '2030-01-10', recipe_id: b, servings: 2 });
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

const names = (l) => l.items.map((i) => i.name).sort();

test('zonder keuze telt de hele week', () => {
  const l = repo.getShoppingList(week);
  assert.deepEqual(names(l), ['testkool', 'testprei']);
  assert.equal(l.total_cents, 300);
  assert.equal(l.meals, 2);
  assert.equal(l.days.length, 7);
  assert.ok(l.days.every((d) => d.selected));
  assert.equal(l.days[0].meals, 1);
});

test('alleen gekozen dagen tellen mee in lijst, kosten en maaltijden', () => {
  assert.deepEqual(repo.setShoppingDays(week, ['2030-01-10']), ['2030-01-10']);
  const l = repo.getShoppingList(week);
  assert.deepEqual(names(l), ['testkool']);
  assert.equal(l.total_cents, 200);
  assert.equal(l.meals, 1);
  assert.equal(l.days.find((d) => d.date === '2030-01-07').selected, false);
  assert.equal(l.days.find((d) => d.date === '2030-01-07').meals, 1, 'de dag laat nog wel zien wat er gepland staat');
});

test('geen enkele dag gekozen geeft een lege lijst, maar eigen artikelen blijven staan', () => {
  repo.setShoppingDays(week, []);
  repo.addShoppingExtra(week, 'wc-papier');
  const l = repo.getShoppingList(week);
  assert.deepEqual(l.items, []);
  assert.equal(l.total_cents, 0);
  assert.equal(l.extras.length, 1);
});

test('dagen buiten de week tellen niet, en de hele week kiezen haalt de keuze weg', () => {
  assert.deepEqual(repo.setShoppingDays(week, ['2030-01-10', '2030-01-25']), ['2030-01-10']);
  const all = Array.from({ length: 7 }, (_, i) => `2030-01-${String(i + 7).padStart(2, '0')}`);
  assert.equal(repo.setShoppingDays(week, all), null);
  assert.equal(repo.getShoppingDays(week), null);
  repo.setShoppingDays(week, ['2030-01-10']);
  assert.equal(repo.setShoppingDays(week, null), null);
  assert.equal(repo.getShoppingList(week).meals, 2);
});

test('de keuze geldt per week en oude weken worden opgeruimd', () => {
  repo.setShoppingDays('2029-10-01', ['2029-10-01']);
  repo.setShoppingDays('2030-01-14', ['2030-01-14']);
  assert.equal(repo.getShoppingDays(week), null);
  assert.deepEqual(repo.getShoppingDays('2030-01-14'), ['2030-01-14']);
  assert.equal(repo.getShoppingDays('2029-10-01'), null);
});
