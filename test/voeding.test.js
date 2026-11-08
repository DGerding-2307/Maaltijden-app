// Voedingsberekening: stuks-omrekening, vloeibare bouillon vs. blokjes (zout), aliassen en dekking (v4.9).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_FILE = ':memory:';
process.env.OFF_DISABLED = '1';
const { openDatabase, getDb, setSetting } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const repo = await import('../server/repo.js');

let server;
let base;
let mcpUrl;
before(async () => {
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
  mcpUrl = (await (await fetch(`${base}/api/mcp/new-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).url;
});
after(() => server.close());

let nextId = 1;
async function call(name, args = {}) {
  const res = await fetch(mcpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }),
  });
  return (await res.json()).result;
}
const ok = async (name, args) => {
  const r = await call(name, args);
  assert.ok(!r.isError, `${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
};
const recipe = (titel, personen, ingredienten) => ok('recept_opslaan', { titel, personen, ingredienten, bereiding: ['Koken.'] });
const line = (id, name) => repo.getRecipe(id).ingredients.find((l) => l.name === name);

test('aliassen: samenstellingen alleen op het laatste deel', () => {
  const m = (n, u) => repo.matchIngredient(n, u)?.name ?? null;
  assert.equal(m('sjalot'), 'sjalot');
  assert.equal(m('sjalotten'), 'sjalot');
  assert.equal(m('citroengras'), 'citroengras', 'niet citroen');
  assert.equal(m('appelciderazijn'), 'appelciderazijn', 'niet appel');
  assert.equal(m('varkensschouder'), 'varkensschouder');
  assert.equal(m('varkensvlees'), 'varkensschouder');
  assert.equal(m('gepelde tomaten'), 'tomatenblokjes');
  assert.equal(m('kurkumapoeder'), 'kurkuma');
  assert.equal(m('vingerchilipepers'), 'rawit');
  assert.equal(m('kippenbouillon'), 'bouillon');
  assert.equal(m('runderbouillon', 'ml'), 'bouillon');
  assert.equal(m('runderbouillon', 'blokje'), 'bouillonblokje', 'een blokje is poeder');
  assert.equal(m('bouillonblokje'), 'bouillonblokje');
  assert.equal(m('ui'), 'ui');
  assert.equal(m('rode ui'), 'rode ui');
  assert.equal(m('drakenfruitpoeder'), null);
  // Suggesties bij niet gevonden
  assert.ok(repo.suggestIngredients('varkensribbetjes', 5).some((i) => i.name === 'varkensschouder'));
});

test('stuks: realistisch gewicht per stuk, en melden als het onbekend is', async () => {
  const r = await recipe('Stukstest', 2, [
    { naam: 'sjalot', hoeveelheid: 10, eenheid: 'stuks' },
    { naam: 'citroengras', hoeveelheid: 8, eenheid: 'stuks' },
    { naam: 'knoflook', hoeveelheid: 2, eenheid: 'teen' },
    { naam: 'bleekselderij', hoeveelheid: 1, eenheid: 'stuks' },
    { naam: 'rozemarijn', hoeveelheid: 1, eenheid: 'takje' },
    { naam: 'italiaanse kruiden', hoeveelheid: 2, eenheid: 'stuks' }, // gedroogd: geen stuksgewicht
  ]);
  assert.equal(line(r.id, 'sjalot').computed_grams, 300);
  assert.equal(line(r.id, 'citroengras').computed_grams, 80);
  assert.equal(line(r.id, 'knoflook').computed_grams, 10);
  assert.equal(line(r.id, 'bleekselderij').computed_grams, 50);
  assert.equal(line(r.id, 'rozemarijn').computed_grams, 1.5);
  assert.equal(line(r.id, 'italiaanse kruiden').computed_grams, 0, 'niet gokken');
  assert.deepEqual(r.dekking.gewicht_onbekend, ['italiaanse kruiden']);
  assert.equal(r.dekking.betrouwbaar, false);
});

test('bouillon in ml is vloeibare bouillon: zout per portie blijft realistisch', async () => {
  // Zoals recept 75: 6 porties, 1 el zout, 125 ml sojasaus, 700 ml kippenbouillon
  const r = await recipe('Zouttest 75', 6, [
    { naam: 'varkensschouder', hoeveelheid: 1500, eenheid: 'g' },
    { naam: 'zout', hoeveelheid: 1, eenheid: 'el' },
    { naam: 'sojasaus', hoeveelheid: 125, eenheid: 'ml' },
    { naam: 'kippenbouillon', hoeveelheid: 700, eenheid: 'ml' },
  ]);
  assert.equal(line(r.id, 'kippenbouillon').ingredient.name, 'bouillon');
  assert.ok(r.zout_pp > 3 && r.zout_pp < 8, `zout ${r.zout_pp} g p.p.`);
  // Zoals recept 76: geen zout, 250 ml runderbouillon, 400 g gepelde tomaten → ruim onder 1 g
  const r2 = await recipe('Zouttest 76', 4, [
    { naam: 'runderriblappen', hoeveelheid: 1000, eenheid: 'g' },
    { naam: 'runderbouillon', hoeveelheid: 250, eenheid: 'ml' },
    { naam: 'tomaten', hoeveelheid: 400, eenheid: 'g', notitie: 'gepeld, uit blik' },
  ]);
  assert.ok(r2.zout_pp < 1.5, `zout ${r2.zout_pp} g p.p.`);
  // Een bouillonblokje blijft wel zout: 1 blokje (10 g) = 4,5 g zout
  const r3 = await recipe('Blokjestest', 1, [{ naam: 'runderbouillon', hoeveelheid: 1, eenheid: 'blokje' }]);
  assert.equal(r3.zout_pp, 4.5);
});

test('eenmalig herstel: verkeerde koppelingen gaan over naar het juiste ingrediënt', () => {
  const db = getDb();
  const cube = db.prepare("SELECT id FROM ingredients WHERE name = 'bouillonblokje'").get().id;
  const ui = db.prepare("SELECT id FROM ingredients WHERE name = 'ui'").get().id;
  const id = repo.saveRecipe({ title: 'Oude koppelingen', servings: 2, ingredients: [
    { name: 'kippenbouillon', quantity: 500, unit: 'ml', ingredient_id: cube },
    { name: 'sjalotten', quantity: 4, unit: 'stuks', ingredient_id: ui },
    { name: 'ui', quantity: 1, unit: 'stuks', ingredient_id: ui },
    { name: 'bouillonblokje', quantity: 1, unit: 'stuk', ingredient_id: cube },
    { name: 'pancetta', quantity: 100, unit: 'g', auto_match: false },
  ] });
  // Oude aliassen terugzetten zoals in een database van vóór v4.8
  db.prepare("UPDATE ingredients SET aliases = 'uien,sjalot,sjalotten' WHERE id = ?").run(ui);
  setSetting('fix_links_v49', false);
  const res = repo.fixIngredientLinksV49();
  assert.equal(res.relinked, 2);
  assert.ok(res.linked >= 1);
  const names = Object.fromEntries(repo.getRecipe(id).ingredients.map((l) => [l.name, l.ingredient?.name]));
  assert.deepEqual(names, { kippenbouillon: 'bouillon', sjalotten: 'sjalot', ui: 'ui', bouillonblokje: 'bouillonblokje', pancetta: 'pancetta' });
  assert.ok(!repo.getIngredient(ui).aliases.includes('sjalot'));
  assert.deepEqual(repo.fixIngredientLinksV49(), { relinked: 0, linked: 0 }, 'maar één keer');
});

test('MCP: ingredient_zoeken en ingredient_toevoegen koppelen ontbrekende regels', async () => {
  const r = await recipe('Hertenstoof', 2, [
    { naam: 'hertenpoulet', hoeveelheid: 600, eenheid: 'g' },
    { naam: 'ui', hoeveelheid: 100, eenheid: 'g' },
  ]);
  assert.equal(r.dekking.procent, 14);
  assert.equal(r.dekking.niet_gekoppeld[0].naam, 'hertenpoulet');
  assert.equal(r.dekking.betrouwbaar, false);

  const zoek = await ok('ingredient_zoeken', { naam: 'hertenpoulet' });
  assert.equal(zoek.gevonden, null);
  assert.match(zoek.melding, /niet gevonden/);
  assert.equal((await ok('ingredient_zoeken', { naam: 'sjalotten' })).gevonden.gram_per_stuk, 30);

  const added = await ok('ingredient_toevoegen', {
    naam: 'Hert', kcal: 120, eiwit: 23, koolhydraten: 0, vet: 2.5, verzadigd_vet: 1, suiker: 0, vezels: 0, zout: 0.15,
    gram_per_el: 15, aliassen: ['hertenpoulet', 'hertenvlees'], afdeling: 'Vlees, vis & vega',
  });
  assert.equal(added.toegevoegd, true);
  assert.equal(added.ingredient.naam, 'hert');
  assert.ok(added.nieuw_gekoppelde_receptregels >= 1);
  const after = await ok('recept_bekijken', { id: r.id });
  assert.equal(after.dekking.procent, 100);
  assert.equal(after.dekking.betrouwbaar, true);
  assert.ok(after.per_portie.eiwit > 35);

  // Dubbel toevoegen weigert; bijwerken mag
  assert.equal((await call('ingredient_toevoegen', { naam: 'hertenvlees', kcal: 1 })).isError, true);
  const upd = await ok('ingredient_toevoegen', { naam: 'hert', gram_per_stuk: 150, bijwerken: true });
  assert.equal(upd.bijgewerkt, true);
  assert.equal(upd.ingredient.gram_per_stuk, 150);
  assert.equal(upd.ingredient.per_100g.kcal, 120, 'andere waarden blijven staan');
  // Onzinnige waarden weigeren
  assert.equal((await call('ingredient_toevoegen', { naam: 'zoutje', kcal: 0, zout: 250 })).isError, true);
  assert.equal((await call('ingredient_toevoegen', { naam: 'leeg' })).isError, true);
});
