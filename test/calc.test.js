import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gramsFor, computeRecipe, buildShoppingList, normalizeUnit } from '../server/calc.js';
import { parseQuantity, normalizeProduct } from '../server/jumbo.js';
import { extractJsonLdRecipe } from '../server/claude.js';

const ui = { id: 1, name: 'ui', category: 'Groente', kcal: 32, protein: 1.2, carbs: 5.9, sugar: 4, fat: 0.1, sat_fat: 0, fiber: 1.7, salt: 0, unit_weight_g: 100, price_cents: 139, package_grams: 1000 };
const melk = { id: 2, name: 'melk', category: 'Zuivel', kcal: 46, protein: 3.5, carbs: 4.7, sugar: 4.7, fat: 1.5, sat_fat: 1, fiber: 0, salt: 0.1, density: 1.03, price_cents: 109, package_grams: 1030 };

test('eenheden omrekenen naar gram', () => {
  assert.equal(gramsFor({ quantity: 2, unit: 'stuk' }, ui), 200);
  assert.equal(gramsFor({ quantity: 1.5, unit: 'kg' }, ui), 1500);
  assert.equal(gramsFor({ quantity: 2, unit: 'el' }, null), 30);
  assert.equal(gramsFor({ quantity: 100, unit: 'ml' }, melk), 103);
  assert.equal(gramsFor({ quantity: 1, unit: 'stuk', grams: 250 }, ui), 250);
  assert.equal(normalizeUnit('Teentjes'), 'teen');
});

test('voedingswaarden en prijs per persoon', () => {
  const r = computeRecipe({ servings: 2 }, [
    { quantity: 2, unit: 'stuk', name: 'ui', ingredient: ui },
    { quantity: 500, unit: 'ml', name: 'melk', ingredient: melk },
  ]);
  // 200 g ui = 64 kcal, 515 g melk = 236.9 kcal → 300.9 / 2
  assert.equal(r.nutrition_per_serving.kcal, 150);
  assert.equal(r.cost_total_cents, Math.round(27.8 + 54.5));
  assert.equal(r.cost_per_serving_cents, 41);
  assert.equal(r.missing_price, 0);
});

test('boodschappenlijst schaalt naar personen en rondt verpakkingen af', () => {
  const recipe = { servings: 2, title: 'Test' };
  const rows = [{ quantity: 3, unit: 'stuk', name: 'ui', ingredient: ui }];
  const list = buildShoppingList([{ servings: 8, recipe, rows }, { servings: 2, recipe, rows }]);
  const item = list.items[0];
  assert.equal(item.grams, 1500); // 1200 + 300
  assert.equal(item.packages, 2);
  assert.equal(list.total_cents, 278);
});

test('Jumbo-product normaliseren', () => {
  assert.equal(parseQuantity('6 x 0,33 l'), 1980);
  assert.equal(parseQuantity('500 g'), 500);
  const p = normalizeProduct({
    id: '123ABC', title: 'Jumbo Kipfilet 500g', quantity: '500 g',
    prices: { price: { currency: 'EUR', amount: 599 }, unitPrice: { unit: 'kg', price: { amount: 1198 } } },
  });
  assert.equal(p.price_cents, 599);
  assert.equal(p.package_grams, 500);
  assert.match(p.url, /jumbo-kipfilet-500g-123ABC$/);
});

test('JSON-LD recept uit HTML halen', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Hutspot"}]}</script>`;
  assert.equal(extractJsonLdRecipe(html).name, 'Hutspot');
});
