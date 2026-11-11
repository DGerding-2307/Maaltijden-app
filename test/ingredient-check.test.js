// Ingrediënten controleren (v4.13): afdeling raden, dubbele vinden en samenvoegen.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

let repo; let check; let db;

before(async () => {
  process.env.SKIP_SEED = '1';
  process.env.OFF_DISABLED = '1';
  db = await import('../server/db.js');
  db.openDatabase(':memory:');
  repo = await import('../server/repo.js');
  check = await import('../server/ingredient-check.js');
});

test('afdeling raden uit de naam', () => {
  const g = check.guessCategory;
  assert.equal(g('kipfilet'), 'Vlees, vis & vega');
  assert.equal(g('kipkruiden'), 'Kruiden, specerijen & bakken');
  assert.equal(g('pindakaas'), 'Brood, ontbijt & beleg');
  assert.equal(g('olijfolie'), 'Olie, azijn & smaakmakers');
  assert.equal(g('champignons'), 'Aardappelen, groente & fruit');
  assert.equal(g('jonge kaas'), 'Zuivel, eieren & kaas');
  assert.equal(g('volkoren spaghetti'), 'Pasta, rijst & wereldkeuken');
  assert.equal(g('paprikapoeder'), 'Kruiden, specerijen & bakken');
  assert.equal(g('rode paprika'), 'Aardappelen, groente & fruit');
  assert.equal(g('tomatenpuree'), 'Conserven, soepen & sauzen');
  assert.equal(g('appelsap'), 'Dranken & overig');
  assert.equal(g('kaneelbroodje'), 'Brood, ontbijt & beleg');
  assert.equal(g('xyz'), null);
});

test('Open Food Facts: de specifiekste categorie wint', async () => {
  const { categoryFromOff } = await import('../server/openfoodfacts.js');
  const base = ['en:plant-based-foods-and-beverages', 'en:plant-based-foods', 'en:cereals-and-potatoes'];
  assert.equal(categoryFromOff([...base, 'en:cereals-and-their-products', 'en:pastas', 'en:spaghetti']), 'Pasta, rijst & wereldkeuken');
  assert.equal(categoryFromOff([...base, 'en:potatoes']), 'Aardappelen, groente & fruit');
  assert.equal(categoryFromOff([...base, 'en:cereal-grains', 'en:rices']), 'Pasta, rijst & wereldkeuken');
  assert.equal(categoryFromOff(['en:frozen-foods', 'en:frozen-vegetables', 'en:peas']), 'Diepvries');
});

test('nieuw ingrediënt zonder afdeling krijgt er één; een losse afdeling wordt de vaste', () => {
  assert.equal(repo.saveIngredient({ name: 'zalmfilet', kcal: 200 }).category, 'Vlees, vis & vega');
  assert.equal(repo.saveIngredient({ name: 'raapstelen', category: 'Groente', kcal: 20 }).category, 'Aardappelen, groente & fruit');
  const own = repo.saveIngredient({ name: 'mijn mix', category: 'Diepvries', kcal: 20 });
  assert.equal(own.category, 'Diepvries');
});

test('controle vindt verkeerde afdeling en dubbele ingrediënten', () => {
  repo.saveIngredient({ name: 'karnemelk', category: 'Dranken & overig', kcal: 40 });
  repo.saveIngredient({ name: 'courgette', category: 'Overig', kcal: 20 });
  repo.saveIngredient({ name: 'tomaat', category: 'Aardappelen, groente & fruit', kcal: 20 });
  repo.saveIngredient({ name: 'tomaten', category: 'Aardappelen, groente & fruit', kcal: 20 });
  const r = check.checkIngredients();
  const karne = r.categorie.find((c) => c.naam === 'karnemelk');
  assert.equal(karne.voorstel, 'Zuivel, eieren & kaas');
  assert.ok(!r.categorie.some((c) => c.naam === 'tomaat'));
  const dup = r.dubbel.find((g) => g.ingredienten.some((i) => i.naam === 'tomaat'));
  assert.deepEqual(dup.ingredienten.map((i) => i.naam).sort(), ['tomaat', 'tomaten']);
});

test('samenvoegen verplaatst recepten, voorraad en verpakkingen en maakt een alias', () => {
  const keep = repo.saveIngredient({ name: 'sjalot', kcal: 70, category: 'Aardappelen, groente & fruit' });
  const drop = repo.saveIngredient({ name: 'sjalotten', kcal: 72, unit_weight_g: 25, aliases: 'sjalotje' });
  const recipeId = repo.saveRecipe({ title: 'Saus', servings: 2, ingredients: [{ name: 'sjalotten', ingredient_id: drop.id, quantity: 2, unit: 'stuk' }] });
  db.getDb().prepare('INSERT INTO stock_items (ingredient_id, grams_left, grams_initial) VALUES (?, 100, 100)').run(drop.id);
  repo.savePackage(drop.id, { grams: 250, price_cents: 129 });

  const merged = check.mergeIngredients(keep.id, drop.id);
  assert.equal(repo.getIngredient(drop.id), null);
  assert.deepEqual(merged.aliases.split(',').sort(), ['sjalotje', 'sjalotten']);
  assert.equal(merged.unit_weight_g, 25, 'ontbrekend stuksgewicht overgenomen');
  assert.equal(repo.getRecipe(recipeId).ingredients[0].ingredient_id, keep.id);
  assert.equal(db.getDb().prepare('SELECT COUNT(*) AS c FROM stock_items WHERE ingredient_id = ?').get(keep.id).c, 1);
  assert.ok(repo.getPackages(keep.id).some((p) => p.grams === 250));
  assert.equal(repo.matchIngredient('sjalotje').id, keep.id);
  assert.throws(() => check.mergeIngredients(keep.id, keep.id));
});
