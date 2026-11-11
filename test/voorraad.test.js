// Voorraad (v4.12): inboeken, FIFO afboeken, koken, afvinken = in voorraad, meerdere barcodes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let repo; let stock; let scan;
let rijst; let ui; let recipeId; let monday;

before(async () => {
  process.env.SKIP_SEED = '1';
  process.env.OFF_DISABLED = '1';
  const db = await import('../server/db.js');
  db.openDatabase(':memory:');
  repo = await import('../server/repo.js');
  stock = await import('../server/stock.js');
  scan = await import('../server/scan.js');
  rijst = repo.saveIngredient({ name: 'witte rijst', category: 'Overig', kcal: 350, package_grams: 1000, price_cents: 199 });
  ui = repo.saveIngredient({ name: 'ui', category: 'Groente', kcal: 40, unit_weight_g: 100 });
  recipeId = repo.saveRecipe({ title: 'Rijst met ui', servings: 2, ingredients: [
    { name: 'witte rijst', ingredient_id: rijst.id, quantity: 300, unit: 'g' },
    { name: 'ui', ingredient_id: ui.id, quantity: 2, unit: 'stuk' },
  ] });
  const { mondayOf } = await import('../server/seed.js');
  monday = mondayOf(new Date());
});

const left = (id) => stock.stockByIngredient().get(id) || 0;

test('inboeken en afboeken: oudste THT eerst', () => {
  stock.addStock({ ingredient_id: rijst.id, grams: 1000, best_before: '2030-05-01' });
  stock.addStock({ ingredient_id: rijst.id, grams: 500, best_before: '2030-01-01' });
  assert.equal(left(rijst.id), 1500);
  const res = stock.consumeIngredient(rijst.id, 600);
  assert.equal(res.used, 600);
  const items = stock.listStock().ingredients.find((g) => g.ingredient_id === rijst.id).items;
  // het pak van januari (500 g) is op, van mei is 100 g gebruikt
  assert.equal(items.length, 1);
  assert.equal(items[0].best_before, '2030-05-01');
  assert.equal(items[0].grams_left, 900);
});

test('uitscannen zonder gewicht: het hele oudste pak', () => {
  stock.addStock({ ingredient_id: ui.id, grams: 1000, best_before: '2030-02-01' });
  stock.addStock({ ingredient_id: ui.id, grams: 500 });
  const res = stock.consumeIngredient(ui.id);
  assert.equal(res.used, 1000);
  assert.equal(left(ui.id), 500);
});

test('Gekookt boekt het recept af en kan ongedaan worden gemaakt', () => {
  assert.ok(recipeId, 'recept aangemaakt');
  const before = left(rijst.id);
  const res = stock.cookRecipe({ recipe_id: recipeId, servings: 2 });
  assert.equal(left(rijst.id), before - 300);
  assert.equal(left(ui.id), 300);
  stock.undoCook(res.id);
  assert.equal(left(rijst.id), before);
  assert.equal(left(ui.id), 500);
});

test('meer koken dan er is: alles op, tekort gemeld', () => {
  const r = stock.consume(ui.id, 800);
  assert.equal(r.used, 500);
  assert.equal(r.short, 300);
  assert.equal(left(ui.id), 0);
});

test('boodschap afvinken zet de pakken in de voorraad, vinkje weg haalt ze eruit', () => {
  const plan = repo.addPlanEntry({ date: monday, meal: 'diner', recipe_id: recipeId, servings: 2 });
  assert.ok(plan);
  const list = repo.getShoppingList(monday);
  const item = list.items.find((i) => i.ingredient_id === rijst.id);
  const before = left(rijst.id);
  const res = stock.checkShoppingItem(monday, item.key, true);
  assert.equal(res.checked, true);
  assert.equal(left(rijst.id), before + 1000);
  stock.checkShoppingItem(monday, item.key, false);
  assert.equal(left(rijst.id), before);
});

test('zonder pakgewicht vraagt afvinken om het gewicht', () => {
  const list = repo.getShoppingList(monday);
  const item = list.items.find((i) => i.ingredient_id === ui.id);
  const res = stock.checkShoppingItem(monday, item.key, true);
  if (res.needs_grams) {
    const again = stock.checkShoppingItem(monday, item.key, true, { grams: 250, best_before: '2030-03-03' });
    assert.equal(again.checked, true);
  }
  assert.ok(left(ui.id) > 0);
});

test('een ingrediënt kan meerdere barcodes hebben', () => {
  scan.linkBarcode(rijst.id, '8710000000011', { grams: 1000 });
  scan.linkBarcode(rijst.id, '8710000000028', { grams: 500 });
  assert.equal(scan.listBarcodes(rijst.id).length, 2);
  assert.equal(stock.barcodeInfo('8710000000028').ingredient_id, rijst.id);
  assert.equal(stock.barcodeInfo('8710000000028').grams, 500);
  scan.unlinkBarcode(rijst.id, '8710000000011');
  assert.equal(scan.listBarcodes(rijst.id).length, 1);
});

test('ingrediënten per stuk (eieren) krijgen hun stuksgewicht mee voor weergave in stuks', () => {
  const ei = repo.saveIngredient({ name: 'eieren', category: 'Zuivel', kcal: 140, unit_weight_g: 60, package_grams: 600 });
  stock.addStock({ ingredient_id: ei.id, grams: 600 });
  const group = stock.listStock().ingredients.find((g) => g.ingredient_id === ei.id);
  assert.equal(group.unit_weight_g, 60);
  assert.equal(group.items[0].unit_weight_g, 60);
  assert.equal(stock.toPieces(group.grams, group), 10);
  stock.consumeIngredient(ei.id, 2 * 60);
  assert.equal(stock.toPieces(left(ei.id), ei), 8);
  // lichte stuksgewichten (bv. een teentje knoflook) blijven in gram
  assert.equal(stock.pieceWeight({ unit_weight_g: 5 }), null);
  assert.equal(stock.toPieces(500, rijst), null);
});

test('extra gekookt voor restjes: bij gekookt gaan de restjes automatisch de voorraad in', () => {
  const day = monday;
  const dinner = repo.addPlanEntry({ date: day, meal: 'diner', recipe_id: recipeId, servings: 4 });
  const rest = repo.addPlanEntry({ date: day, meal: 'lunch', recipe_id: recipeId, servings: 2, leftover_of: dinner, note: 'restjes' });
  const cooked = stock.cookRecipe({ plan_entry_id: dinner });
  assert.equal(cooked.leftovers.portions_left, 2);
  assert.equal(cooked.leftovers.source, 'restjes');
  assert.equal(cooked.leftovers.location, 'koelkast');
  assert.ok(cooked.leftovers.best_before > day.slice(0, 4));
  assert.equal(stock.listMeals().length, 1);

  // De restjes opeten haalt de porties eraf (en kan ongedaan worden gemaakt)
  const eaten = stock.cookRecipe({ plan_entry_id: rest });
  assert.equal(eaten.meal_used, 2);
  assert.equal(stock.listMeals().length, 0);
  stock.undoCook(eaten.id);
  assert.equal(stock.listMeals()[0].portions_left, 2);
  stock.cookRecipe({ plan_entry_id: rest });

  // 'Gekookt' ongedaan maken haalt de restjes ook weer weg
  stock.undoCook(cooked.id);
  assert.equal(stock.listMeals().length, 0);
  for (const id of [rest, dinner]) repo.deletePlanEntry(id);
});

test('maaltijd zelf in de voorraad (vriezer), inplannen en opeten', () => {
  const meal = stock.addMeal({ title: 'zelfgemaakte soep', portions: 3, location: 'vriezer' });
  assert.equal(meal.recipe_id, null);
  assert.equal(meal.location, 'vriezer');
  assert.ok(meal.days_left >= 80);
  assert.equal(stock.eatMeal(meal.id, 1).portions_left, 2);

  const { id } = stock.planMeal(meal.id, { date: monday, meal: 'diner', servings: 2 });
  const entry = repo.getPlanEntry(id);
  assert.equal(entry.no_shopping, 1);
  assert.equal(entry.stock_meal_id, meal.id);
  assert.equal(entry.title, 'zelfgemaakte soep');
  // geplande maaltijd uit de voorraad komt niet op de boodschappenlijst
  assert.ok(!repo.getShoppingList(monday).items.some((i) => /soep/.test(i.name)));
  const res = stock.cookRecipe({ plan_entry_id: id });
  assert.equal(res.meal_used, 2);
  assert.equal(stock.getMeal(meal.id), null);
  repo.deletePlanEntry(id);

  assert.throws(() => stock.addMeal({ portions: 2 }), /Welke maaltijd/);
  const r = stock.addMeal({ recipe_id: recipeId, portions: 1, best_before: '2030-01-01' });
  assert.equal(r.title, 'Rijst met ui');
  assert.equal(stock.updateMeal(r.id, { portions_left: 0 }), null);
});
