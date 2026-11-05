// Meerdere verpakkingen per ingrediënt: de goedkoopste combinatie op de boodschappenlijst.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cheapestPackages, packagesOfOption, packageOptions, buildShoppingList, packageLabel } from '../server/calc.js';

const opt = (grams, price_cents, key = `g${grams}`) => ({ key, grams, price_cents, label: packageLabel(grams) });
const gehakt = [opt(300, 349), opt(500, 499), opt(1000, 899)];
const text = (need, options = gehakt) => cheapestPackages(need, options).text;

test('kiest de goedkoopste verpakking die genoeg is', () => {
  assert.equal(text(250), '1× 300 g');
  assert.equal(text(400), '1× 500 g');
  assert.equal(text(750), '1× 500 g + 1× 300 g');
  assert.equal(cheapestPackages(750, gehakt).cost_cents, 848);
  assert.equal(text(900), '1× 1 kg');
  assert.equal(cheapestPackages(250, gehakt).cost_cents, 349);
  assert.equal(cheapestPackages(250, gehakt).leftover_grams, 50);
});

test('combineert verpakkingen als dat goedkoper is', () => {
  const r = cheapestPackages(800, [opt(300, 300), opt(500, 450), opt(1000, 1000)]);
  assert.equal(r.text, '1× 500 g + 1× 300 g');
  assert.equal(r.cost_cents, 750);
  assert.equal(r.leftover_grams, 0);
});

test('een grotere verpakking wint als die goedkoper is dan twee kleine', () => {
  assert.equal(text(550, [opt(300, 349), opt(1000, 599)]), '1× 1 kg');
});

test('bij gelijke prijs de minste rest, daarna de minste verpakkingen', () => {
  assert.equal(text(250, [opt(500, 300), opt(300, 300)]), '1× 300 g');
  assert.equal(text(600, [opt(300, 200), opt(600, 400)]), '1× 600 g');
});

test('een klein tekort telt niet als extra verpakking, net als voorheen', () => {
  assert.equal(text(505, [opt(500, 100)]), '1× 500 g');
  assert.equal(packagesOfOption(1500, opt(1000, 139)).packages, 2);
});

test('verpakking zonder prijs telt alleen als geen enkele een prijs heeft', () => {
  const r = cheapestPackages(100, [opt(150, null), opt(500, 499)]);
  assert.equal(r.text, '1× 500 g');
  const none = cheapestPackages(100, [opt(150, null), opt(500, null)]);
  assert.equal(none.text, '1× 150 g');
  assert.equal(none.cost_cents, null);
});

test('niets nodig of geen verpakking geeft geen keuze', () => {
  assert.equal(cheapestPackages(0, gehakt), null);
  assert.equal(cheapestPackages(100, []), null);
});

test('heel grote hoeveelheden lopen niet vast', () => {
  const r = cheapestPackages(500000, gehakt);
  assert.equal(r.picks[0].grams, 1000);
  assert.equal(r.picks[0].count, 500);
});

const ing = { id: 7, name: 'gehakt', category: 'Vlees', package_grams: 500, package_label: '500 g', price_cents: 499, kcal: 200 };
const rows = (quantity) => [{ quantity, unit: 'g', name: 'gehakt', ingredient: ing }];
const extras = () => [{ id: 1, grams: 300, price_cents: 349 }, { id: 2, grams: 1000, price_cents: 899 }];
const week = (quantity, options) => buildShoppingList([{ servings: 2, recipe: { servings: 2, title: 'Test' }, rows: rows(quantity) }], options);

test('boodschappenlijst telt de week op en kiest daarna', () => {
  const list = buildShoppingList([
    { servings: 2, recipe: { servings: 2, title: 'A' }, rows: rows(200) },
    { servings: 2, recipe: { servings: 2, title: 'B' }, rows: rows(200) },
  ], { packagesFor: extras });
  assert.equal(list.items[0].package_text, '1× 500 g');
  assert.equal(list.items[0].leftover_grams, 100);
  assert.equal(list.total_cents, 499);
});

test('boodschappenlijst zonder extra verpakkingen rekent als voorheen', () => {
  const item = week(1200).items[0];
  assert.equal(item.packages, 3);
  assert.equal(item.cost_cents, 3 * 499);
  assert.equal(item.package_text, '3× 500 g');
  assert.equal(item.package_label, '500 g');
});

test('zelf gekozen verpakking gaat voor; een verdwenen keuze valt terug op automatisch', () => {
  const key = `i${ing.id}`;
  const forced = week(250, { packagesFor: extras, choices: new Map([[key, 'p2']]) });
  assert.equal(forced.items[0].package_text, '1× 1 kg');
  assert.equal(forced.items[0].package_choice, 'p2');
  assert.equal(forced.total_cents, 899);
  const gone = week(250, { packagesFor: extras, choices: new Map([[key, 'p99']]) });
  assert.equal(gone.items[0].package_text, '1× 300 g');
  assert.equal(gone.items[0].package_choice, null);
});

test('hoofdverpakking staat vooraan in de opties', () => {
  assert.deepEqual(packageOptions(ing, extras()).map((o) => o.key), ['main', 'p1', 'p2']);
});

// ---------- Opslaan in de database ----------

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verpakkingen-'));
let repo;
let id;

before(async () => {
  process.env.DB_FILE = path.join(dir, 'test.db');
  repo = await import('../server/repo.js');
  id = repo.saveIngredient({ name: 'testgehakt', category: 'Vlees, vis & vega', kcal: 200, package_grams: 500, package_label: '500 g', price_cents: 499 }).id;
});

after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('verpakkingen toevoegen, bijwerken en verwijderen', () => {
  let list = repo.savePackage(id, { grams: 300, price_cents: 349 });
  assert.deepEqual(list.map((o) => [o.grams, o.price_cents]), [[500, 499], [300, 349]]);
  list = repo.savePackage(id, { grams: 300, price_cents: 329 });
  assert.equal(list.length, 2, 'zelfde gewicht wordt bijgewerkt, niet dubbel');
  assert.equal(list[1].price_cents, 329);
  list = repo.savePackage(id, { grams: 300 });
  assert.equal(list[1].price_cents, 329, 'zonder prijs blijft de prijs staan');
  list = repo.savePackage(id, { grams: 500, price_cents: 479 });
  assert.equal(repo.getIngredient(id).price_cents, 479, 'gewicht van de hoofdverpakking werkt die bij');
  assert.equal(list.length, 2);
  assert.throws(() => repo.savePackage(id, { grams: 0 }), /gewicht/);
  assert.throws(() => repo.savePackage(99999, { grams: 100 }), /niet gevonden/);
});

test('verwijderde hoofdverpakking laat de volgende doorschuiven', () => {
  const list = repo.deletePackage(id, 'main');
  assert.equal(list.length, 1);
  assert.equal(list[0].key, 'main');
  assert.equal(list[0].grams, 300);
  assert.equal(repo.getIngredient(id).price_cents, 329);
  assert.deepEqual(repo.deletePackage(id, 'main'), []);
  assert.equal(repo.getIngredient(id).package_grams, null);
  repo.savePackage(id, { grams: 250, price_cents: 200 });
  assert.equal(repo.getIngredient(id).package_grams, 250, 'eerste verpakking wordt de hoofdverpakking');
});

test('back-up neemt verpakkingen mee en verwijderen ruimt op', () => {
  repo.savePackage(id, { grams: 750, price_cents: 500 });
  const backup = repo.exportAll();
  assert.equal(backup.tables.ingredient_packages.length, 1);
  repo.importAll(backup);
  assert.equal(repo.getPackages(id).length, 2);
  repo.deleteIngredient(id);
  assert.equal(repo.exportAll().tables.ingredient_packages.length, 0);
});

// ---------- Bonnetje (voorbeeld: digitale Jumbo-bon) ----------

const jumboBon = {
  readable: true, store: 'Jumbo', date: '2026-11-01',
  items: [{ receipt_text: 'Croissant Hamkaas', ingredient: 'testcroissant', count: 2, unit_price_cents: 99, grams_per_package: null, discount: false, is_food: true }],
};

test('bonnetje: gewicht komt van het ingrediënt en er wordt niets opgeslagen voor de controle', () => {
  const c = repo.saveIngredient({ name: 'testcroissant', category: 'Brood, ontbijt & beleg', package_grams: 90, package_label: '1 stuk', price_cents: 89, price_source: 'schatting' });
  const r = repo.prepareReceipt(jumboBon);
  const line = r.lines[0];
  assert.equal(line.ingredient_id, c.id);
  assert.equal(line.grams, 90);
  assert.equal(line.grams_on_receipt, false);
  assert.equal(line.price_cents, 99);
  assert.equal(line.old_price_cents, 89);
  assert.equal(line.count, 2);
  assert.equal(line.selected, true);
  assert.equal(repo.getIngredient(c.id).price_cents, 89, 'nog niet opgeslagen');
  assert.deepEqual(repo.applyReceipt({ store: r.store, date: r.date, lines: [{ ingredient_id: c.id, grams: 90, price_cents: 99 }] }), { updated: 1, created: 0 });
  const saved = repo.getIngredient(c.id);
  assert.equal(saved.price_cents, 99);
  assert.equal(saved.price_source, 'handmatig');
  assert.equal(saved.price_note, 'Bonnetje Jumbo 2026-11-01');
  assert.equal(repo.getPackages(c.id).length, 1, 'geen dubbele verpakking');
});

test('bonnetje: nieuw gewicht op de bon wordt een extra verpakking', () => {
  const c = repo.saveIngredient({ name: 'testmelk', category: 'Zuivel, eieren & kaas', package_grams: 1000, price_cents: 119 });
  const r = repo.prepareReceipt({ readable: true, store: 'Jumbo', date: '', items: [{ receipt_text: 'Melk 500 ml', ingredient: 'testmelk', count: 1, unit_price_cents: 79, grams_per_package: 500, discount: true, is_food: true }] });
  assert.equal(r.lines[0].grams_on_receipt, true);
  assert.equal(r.lines[0].old_price_cents, null);
  assert.equal(r.lines[0].discount, true);
  repo.applyReceipt({ store: 'Jumbo', lines: [{ ingredient_id: c.id, grams: 500, price_cents: 79 }] });
  assert.deepEqual(repo.getPackages(c.id).map((o) => [o.grams, o.price_cents]), [[1000, 119], [500, 79]]);
});

test('bonnetje: geen eten of geen match staat niet aangevinkt', () => {
  const r = repo.prepareReceipt({ readable: true, store: '', date: '', items: [
    { receipt_text: 'Wc-papier', ingredient: '', count: 1, unit_price_cents: 399, grams_per_package: null, discount: false, is_food: false },
    { receipt_text: 'Xyzqwv', ingredient: '', count: 1, unit_price_cents: 100, grams_per_package: null, discount: false, is_food: true },
  ] });
  assert.deepEqual(r.lines.map((l) => [l.selected, l.ingredient_id]), [[false, null], [false, null]]);
});

test('bonnetje: foute regels worden geweigerd zonder iets op te slaan', () => {
  assert.throws(() => repo.applyReceipt({ lines: [] }), /aangevinkt/);
  assert.throws(() => repo.applyReceipt({ lines: [{ ingredient_id: 99999, grams: 1, price_cents: 1 }] }), /niet gevonden/);
  const c = repo.matchIngredient('testmelk');
  assert.throws(() => repo.applyReceipt({ lines: [{ ingredient_id: c.id, grams: 250, price_cents: 50 }, { ingredient_id: c.id, grams: 0, price_cents: 1 }] }), /gewicht/);
  assert.equal(repo.getPackages(c.id).some((o) => o.grams === 250), false);
});

test('bonnetje: een product met een ingrediënt in de naam wordt niet aan dat ingrediënt gekoppeld', () => {
  repo.saveIngredient({ name: 'testkaneel', category: 'Kruiden, specerijen & bakken', package_grams: 30, price_cents: 129 });
  const r = repo.prepareReceipt({ readable: true, store: 'Jumbo', date: '2026-10-31', items: [
    { receipt_text: 'Testkaneel Deense Knoop', ingredient: '', count: 1, unit_price_cents: 200, grams_per_package: null, discount: false, is_food: true },
    { receipt_text: 'Jumbo Testkaneel', ingredient: 'Testkaneel', count: 1, unit_price_cents: 135, grams_per_package: null, discount: false, is_food: true },
    { receipt_text: 'Drink Framboos 1.5l', ingredient: 'bestaat niet', count: 1, unit_price_cents: 279, grams_per_package: 1500, discount: false, is_food: true },
  ] });
  assert.deepEqual(r.lines.map((l) => [l.ingredient_name, l.selected]), [['', false], ['testkaneel', true], ['', false]]);
});

test('bonnetje: onbekend product wordt alleen na aanvinken een nieuw ingrediënt', () => {
  const per100 = { kcal: 180, protein: 20, carbs: 1, sugar: 1, fat: 11, sat_fat: 2, fiber: 0, salt: 3 };
  const r = repo.prepareReceipt({ readable: true, store: 'Jumbo', date: '2026-10-31', items: [
    { receipt_text: 'Gerookte Zalm 90g', ingredient: '', count: 1, unit_price_cents: 399, grams_per_package: 90, discount: false, is_food: true, new_name: 'Testzalm Gerookt', category: 'Vlees, vis & vega', estimated_grams: 100, per100 },
    { receipt_text: 'Doppinda', ingredient: '', count: 1, unit_price_cents: 189, grams_per_package: null, discount: false, is_food: true, new_name: 'testdoppinda', category: 'Overig', estimated_grams: 200, per100 },
    { receipt_text: 'Wc-papier', ingredient: '', count: 1, unit_price_cents: 399, grams_per_package: null, discount: false, is_food: false, new_name: '', category: 'Overig', estimated_grams: null, per100 },
  ] });
  const [zalm, pinda, wc] = r.lines;
  assert.equal(zalm.selected, false);
  assert.equal(zalm.ingredient_name, 'testzalm gerookt');
  assert.equal(zalm.grams, 90, 'gewicht van de bon gaat voor op de schatting');
  assert.equal(pinda.grams, 200);
  assert.equal(pinda.grams_on_receipt, false);
  assert.equal(wc.new_ingredient, null);
  assert.equal(repo.matchIngredient('testzalm gerookt'), null, 'nog niets opgeslagen');
  const res = repo.applyReceipt({ store: 'Jumbo', date: '2026-10-31', lines: [
    { new_ingredient: { ...zalm.new_ingredient, name: zalm.ingredient_name }, grams: 90, price_cents: 399 },
    { new_ingredient: { ...zalm.new_ingredient, name: 'TESTZALM GEROOKT' }, grams: 200, price_cents: 699 },
  ] });
  assert.deepEqual(res, { updated: 1, created: 1 });
  const ing = repo.matchIngredient('testzalm gerookt');
  assert.equal(ing.kcal, 180);
  assert.equal(ing.category, 'Vlees, vis & vega');
  assert.equal(ing.package_grams, 90);
  assert.equal(ing.unit_weight_g, 90);
  assert.equal(ing.price_cents, 399);
  assert.match(ing.nutrition_source, /schatting/);
  assert.deepEqual(repo.getPackages(ing.id).map((o) => o.grams), [90, 200]);
  assert.throws(() => repo.applyReceipt({ lines: [{ new_ingredient: { name: ' ' }, grams: 1, price_cents: 1 }] }), /naam/);
});
