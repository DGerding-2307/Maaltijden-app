// Koppeling met Claude (MCP): link per persoon, protocol en alle hulpmiddelen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_FILE = ':memory:';
process.env.OFF_DISABLED = '1';
const { openDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { todayISO } = await import('../server/homeassistant.js');

let server;
let base;
let mcpUrl;
before(async () => {
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const api = async (method, path, body) => (await fetch(`${base}/api${path}`, {
  method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
})).json();
let nextId = 1;
async function rpc(method, params, url = mcpUrl) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  return { status: res.status, body: res.status === 202 ? null : await res.json() };
}
async function call(name, args = {}) {
  const { body } = await rpc('tools/call', { name, arguments: args });
  assert.ok(body.result, JSON.stringify(body));
  return body.result;
}
const ok = async (name, args) => {
  const r = await call(name, args);
  assert.ok(!r.isError, `${name}: ${r.content[0].text}`);
  assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
  return r.structuredContent;
};

test('link per persoon maken, en zonder link geen toegang', async () => {
  const none = await api('GET', '/mcp');
  assert.equal(none.url, null);
  const made = await api('POST', '/mcp/new-link', {});
  assert.match(made.url, /\/mcp\/[\w-]{20,}$/);
  mcpUrl = made.url;
  assert.equal((await rpc('ping', {}, `${base}/mcp/fout`)).status, 404);
  assert.equal((await fetch(mcpUrl)).status, 405, 'alleen POST (geen sessies)');
  const backup = await (await fetch(`${base}/api/backup`)).text();
  assert.ok(!backup.includes(new URL(mcpUrl).pathname.split('/').pop()), 'geheime code niet in de back-up');
});

test('protocol: initialize, melding, tools/list, onbekende methode', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.ok(init.body.result.capabilities.tools);
  assert.equal(init.body.result.serverInfo.name, 'maaltijden');
  assert.match(init.body.result.instructions, /Nederlands/);
  const older = await rpc('initialize', { protocolVersion: '1999-01-01' });
  assert.equal(older.body.result.protocolVersion, '2025-06-18');

  const note = await fetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(note.status, 202);

  const { body } = await rpc('tools/list', {});
  const names = body.result.tools.map((t) => t.name);
  for (const n of ['planning_bekijken', 'maaltijd_plannen', 'recepten_zoeken', 'recept_opslaan', 'boodschappenlijst', 'eten_loggen', 'gewicht_loggen']) assert.ok(names.includes(n), n);
  for (const t of body.result.tools) {
    assert.match(t.name, /^[a-z_]{1,64}$/);
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.description.length > 20);
  }
  assert.equal(body.result.tools.find((t) => t.name === 'recepten_zoeken').annotations.readOnlyHint, true);
  assert.equal(body.result.tools.find((t) => t.name === 'maaltijd_verwijderen').annotations.destructiveHint, true);
  assert.equal(body.result.tools.find((t) => t.name === 'recept_verwijderen').annotations.destructiveHint, true);
  assert.equal((await rpc('bestaat/niet', {})).body.error.code, -32601);
  assert.equal((await rpc('tools/call', { name: 'bestaat_niet' })).body.error.code, -32602);
});

test('recepten zoeken, bekijken, plannen, verplaatsen en verwijderen', async () => {
  const found = await ok('recepten_zoeken', { zoekterm: 'nasi' });
  const nasi = found.recepten.find((r) => r.titel === 'Nasi goreng');
  assert.ok(nasi && nasi.kcal_pp > 0 && /€/.test(nasi.prijs_pp));
  const recipe = await ok('recept_bekijken', { id: nasi.id, personen: 2 });
  assert.equal(recipe.personen, 2);
  assert.ok(recipe.ingredienten.length > 3 && recipe.bereiding.length > 1);

  const date = '2031-03-03';
  const lunch = await ok('maaltijd_plannen', { datum: date, moment: 'lunch', recept_id: nasi.id });
  assert.equal(lunch.personen, 1, 'lunch is standaard voor 1 persoon');
  await ok('maaltijd_verwijderen', { id: lunch.id });
  const snack = await ok('maaltijd_plannen', { datum: date, moment: 'tussendoor', recept_id: nasi.id });
  assert.equal(snack.personen, 1, 'tussendoor is standaard voor 1 persoon');
  await ok('maaltijd_verwijderen', { id: snack.id });
  const planned = await ok('maaltijd_plannen', { datum: date, moment: 'diner', recept_id: nasi.id, personen: 3 });
  assert.equal(planned.titel, 'Nasi goreng');
  const out = await ok('maaltijd_plannen', { datum: date, moment: 'lunch', titel: 'Uit eten' });
  const plan = await ok('planning_bekijken', { datum: date, dagen: 1 });
  const titles = plan.dagen[0].maaltijden.map((m) => m.titel);
  assert.deepEqual(titles.sort(), ['Nasi goreng', 'Uit eten']);
  assert.equal(plan.dagen[0].dag, 'maandag');

  const moved = await ok('maaltijd_wijzigen', { id: planned.id, datum: '2031-03-04', personen: 4 });
  assert.equal(moved.maaltijd.personen, 4);
  assert.equal((await ok('planning_bekijken', { datum: '2031-03-04', dagen: 1 })).dagen[0].maaltijden[0].titel, 'Nasi goreng');

  // Op de boodschappenlijst van die week
  const shop = await ok('boodschappenlijst', { week: date });
  assert.ok(shop.nog_halen.length > 0);
  await ok('maaltijd_verwijderen', { id: out.id });
  await ok('maaltijd_verwijderen', { id: planned.id });
  assert.equal((await ok('planning_bekijken', { datum: date, dagen: 2 })).dagen.flatMap((d) => d.maaltijden).length, 0);

  // Duidelijke fouten voor Claude (geen protocolfout)
  const bad = await call('maaltijd_plannen', { datum: 'morgen', moment: 'diner', titel: 'x' });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /JJJJ-MM-DD/);
  assert.equal((await call('maaltijd_plannen', { moment: 'diner', recept_id: 99999 })).isError, true);
  assert.equal((await call('maaltijd_verwijderen', { id: 99999 })).isError, true);
});

test('recept opslaan met ingrediënten uit de database', async () => {
  const saved = await ok('recept_opslaan', {
    titel: 'Snelle tomatensoep', personen: 2, categorie: 'Soep',
    ingredienten: [{ naam: 'ui', hoeveelheid: 1, eenheid: 'stuks' }, { naam: 'passata', hoeveelheid: 500, eenheid: 'g' }, { naam: 'drakenfruitpoeder', hoeveelheid: 1, eenheid: 'tl' }],
    bereiding: ['Fruit de ui.', 'Voeg de passata toe en laat 10 minuten koken.'],
  });
  assert.ok(saved.id && saved.kcal_pp > 0);
  assert.deepEqual(saved.dekking.niet_gekoppeld.map((x) => x.naam), ['drakenfruitpoeder']);
  assert.ok(saved.dekking.procent > 90 && saved.dekking.procent < 100);
  const r = await api('GET', `/recipes/${saved.id}`);
  assert.equal(r.title, 'Snelle tomatensoep');
  assert.equal(r.steps.length, 2);
  assert.equal((await call('recept_opslaan', { titel: 'Leeg', ingredienten: [], bereiding: [] })).isError, true);
});

test('boodschappen toevoegen en afvinken', async () => {
  await ok('boodschap_toevoegen', { naam: 'Wc-papier' });
  let list = await ok('boodschappenlijst', {});
  assert.ok(list.nog_halen.some((x) => x.naam === 'Wc-papier'));
  await ok('boodschap_afvinken', { naam: 'wc-papier' });
  list = await ok('boodschappenlijst', {});
  assert.ok(list.afgevinkt.includes('Wc-papier'));
  assert.ok(!list.nog_halen.some((x) => x.naam === 'Wc-papier'));
  await ok('boodschap_afvinken', { naam: 'Wc-papier', afgevinkt: false });
  assert.ok((await ok('boodschappenlijst', {})).nog_halen.some((x) => x.naam === 'Wc-papier'));
  assert.equal((await call('boodschap_afvinken', { naam: 'kaviaar van de maan' })).isError, true);
});

test('dagboek en gewicht van de persoon van de link', async () => {
  const before = await ok('dagboek_bekijken', {});
  assert.equal(before.datum, todayISO());
  const free = await ok('eten_loggen', { moment: 'tussendoor', omschrijving: 'Appel', kcal: 80, koolhydraten: 19, vezels: 3 });
  assert.equal(free.kcal, 80);
  const nasi = (await ok('recepten_zoeken', { zoekterm: 'nasi' })).recepten[0];
  const rec = await ok('eten_loggen', { moment: 'diner', recept_id: nasi.id, porties: 1.5 });
  assert.ok(rec.kcal > 100);
  const day = await ok('dagboek_bekijken', {});
  assert.equal(day.totaal.kcal, before.totaal.kcal + free.kcal + rec.kcal);
  assert.ok(day.momenten.find((m) => m.moment === 'tussendoor').gegeten.some((e) => e.naam === 'Appel'));
  // Ook in de app te zien
  const people = await api('GET', '/people');
  const diary = await api('GET', `/diary?persoon=${people.people[0].id}`);
  assert.ok(diary.meals.flatMap((m) => m.entries).some((e) => e.name === 'Appel'));
  await ok('dagboek_verwijderen', { id: free.id });
  assert.equal((await ok('dagboek_bekijken', {})).totaal.kcal, before.totaal.kcal + rec.kcal);
  assert.equal((await call('eten_loggen', { moment: 'lunch', omschrijving: 'iets' })).isError, true, 'kcal nodig');

  const w = await ok('gewicht_loggen', { kg: 81.4 });
  assert.equal(w.kg, 81.4);
  assert.equal((await ok('gewicht_bekijken', {})).metingen.at(-1).kg, 81.4);
  assert.equal((await call('gewicht_loggen', { kg: 5 })).isError, true);
});

test('doelen bekijken en aanpassen', async () => {
  const before = await ok('doelen_bekijken', {});
  assert.deepEqual(before.eigen_doelen, []);
  const autoCarbs = before.automatisch.koolhydraten;
  assert.ok(before.doelen.verzadigd_vet > 0 && before.doelen.zout === 6);

  const changed = await ok('doelen_aanpassen', { kcal: 2000, koolhydraten: 215, vezels: 35, doelgewicht_kg: 100 });
  assert.equal(changed.doelen.kcal, 2000);
  assert.equal(changed.doelen.koolhydraten, 215);
  assert.equal(changed.doelen.vezels, 35);
  assert.equal(changed.doel_kg, 100);
  assert.deepEqual(changed.eigen_doelen.sort(), ['kcal', 'koolhydraten', 'vezels']);

  // Andere doelen en het dagboek gaan mee
  const partial = await ok('doelen_aanpassen', { zout: 5 });
  assert.equal(partial.doelen.koolhydraten, 215);
  assert.equal(partial.doelen.zout, 5);
  const day = await ok('dagboek_bekijken', {});
  assert.equal(day.doel.koolhydraten, 215);
  assert.equal(day.doel.zout, 5);
  assert.ok('verzadigd_vet' in day.doel && 'verzadigd_vet' in day.totaal);

  // 0 = terug naar automatisch; onzin wordt geweigerd en verandert niets
  const reset = await ok('doelen_aanpassen', { koolhydraten: 0, zout: 0 });
  assert.equal(reset.doelen.zout, 6);
  assert.ok(!reset.eigen_doelen.includes('koolhydraten'));
  assert.equal((await call('doelen_aanpassen', { vezels: 9999 })).isError, true);
  assert.equal((await call('doelen_aanpassen', { kcal: 10 })).isError, true);
  assert.equal((await call('doelen_aanpassen', {})).isError, true);
  assert.equal((await ok('doelen_bekijken', {})).doelen.vezels, 35);
  assert.ok(autoCarbs > 0);
});

test('instellingenscherm: eigen doelen opslaan en weer leegmaken', async () => {
  const { people } = await api('GET', '/people');
  const id = people[0].id;
  const saved = await api('PUT', `/people/${id}`, { target_overrides: { carbs: '200', fiber: '' } });
  assert.equal(saved.targets.carbs, 200);
  assert.equal(saved.target_overrides.carbs, 200);
  assert.equal(saved.target_overrides.fiber, undefined);
  assert.equal(saved.targets_auto.fiber, 30);
  const cleared = await api('PUT', `/people/${id}`, { target_overrides: {} });
  assert.deepEqual(cleared.target_overrides, {});
});

test('recept wijzigen en verwijderen', async () => {
  const made = await ok('recept_opslaan', {
    titel: 'Testvis', personen: 2, bereiding: ['Bak'], labels: ['vis'],
    ingredienten: [{ naam: 'ui', hoeveelheid: 100, eenheid: 'g', notitie: 'gesnipperd' }, { naam: 'wortel', hoeveelheid: 80, eenheid: 'g' }],
  });
  await api('PATCH', `/recipes/${made.id}`, { rating: 4 });

  // Alleen de titel: de rest blijft staan, ook ingrediënten en beoordeling
  const renamed = await ok('recept_wijzigen', { id: made.id, titel: 'Testvis nieuw', favoriet: true });
  assert.equal(renamed.titel, 'Testvis nieuw');
  const r = await api('GET', `/recipes/${made.id}`);
  assert.equal(r.title, 'Testvis nieuw');
  assert.ok(r.favorite);
  assert.equal(r.rating, 4);
  assert.equal(r.servings, 2);
  assert.deepEqual(r.steps, ['Bak']);
  assert.equal(r.ingredients.length, 2);
  assert.equal(r.ingredients[0].quantity, 100);
  assert.equal(r.ingredients[0].note, 'gesnipperd');
  assert.ok(r.ingredients[0].ingredient_id);

  // Nieuwe ingrediëntenlijst vervangt de oude
  await ok('recept_wijzigen', { id: made.id, ingredienten: [{ naam: 'ui', hoeveelheid: 50, eenheid: 'g' }] });
  assert.equal((await api('GET', `/recipes/${made.id}`)).ingredients.length, 1);
  assert.equal((await call('recept_wijzigen', { id: made.id, ingredienten: [] })).isError, true);
  assert.equal((await call('recept_wijzigen', { id: 999999, titel: 'x' })).isError, true);

  // Gepland recept wordt niet zomaar verwijderd
  await ok('maaltijd_plannen', { moment: 'diner', recept_id: made.id, personen: 1 });
  const refused = await call('recept_verwijderen', { id: made.id });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /gepland/);
  assert.ok(await api('GET', `/recipes/${made.id}`));
  const gone = await ok('recept_verwijderen', { id: made.id, ook_uit_planning: true });
  assert.equal(gone.verwijderd, true);
  assert.equal(gone.uit_planning.length, 1);
  assert.equal((await ok('recepten_zoeken', { zoekterm: 'Testvis' })).aantal, 0);
  assert.equal((await call('recept_verwijderen', { id: made.id })).isError, true);
  const plan = await ok('planning_bekijken', { dagen: 1 });
  assert.ok(!plan.dagen[0].maaltijden.some((m) => m.recept_id === made.id));
});

test('nieuwe link: oude stopt; uitzetten', async () => {
  const old = mcpUrl;
  const fresh = await api('POST', '/mcp/new-link', {});
  assert.notEqual(fresh.url, old);
  assert.equal((await rpc('ping', {}, old)).status, 404);
  assert.equal((await rpc('ping', {}, fresh.url)).status, 200);
  assert.equal((await api('POST', '/mcp/disconnect', {})).url, null);
  assert.equal((await rpc('ping', {}, fresh.url)).status, 404);
});

test('recept beoordelen: lekker of niet, sterren en notities', async () => {
  mcpUrl = (await api('POST', '/mcp/new-link', {})).url; // een eerdere test trekt de link in
  const made = await ok('recept_opslaan', {
    titel: 'Proefsoep', personen: 2, bereiding: ['Kook'], ingredienten: [{ naam: 'ui', hoeveelheid: 100, eenheid: 'g' }],
  });
  const first = await ok('recept_beoordelen', { id: made.id, oordeel: 'lekker', sterren: 4, notitie_toevoegen: 'Minder zout' });
  assert.equal(first.oordeel, 'lekker');
  assert.equal(first.sterren, 4);
  assert.equal(first.notities, 'Minder zout', 'de standaardtekst ‘Toegevoegd door Claude’ valt weg');
  const more = await ok('recept_beoordelen', { id: made.id, notitie_toevoegen: 'Lekker met rijst' });
  assert.equal(more.notities, 'Minder zout\nLekker met rijst');
  assert.equal(more.oordeel, 'lekker', 'oordeel blijft staan');

  const seen = await ok('recept_bekijken', { id: made.id });
  assert.equal(seen.oordeel, 'lekker');
  assert.equal(seen.sterren, 4);
  assert.equal(seen.notities, 'Minder zout\nLekker met rijst');

  // Zoeken op oordeel
  const lekker = await ok('recepten_zoeken', { zoekterm: 'Proefsoep', oordeel: 'lekker' });
  assert.equal(lekker.aantal, 1);
  assert.equal(lekker.recepten[0].oordeel, 'lekker');
  assert.equal((await ok('recepten_zoeken', { zoekterm: 'Proefsoep', oordeel: 'niet_lekker' })).aantal, 0);

  // Recept wijzigen laat oordeel en notities staan
  await ok('recept_wijzigen', { id: made.id, titel: 'Proefsoep 2' });
  const after1 = await api('GET', `/recipes/${made.id}`);
  assert.equal(after1.taste, 1);
  assert.equal(after1.notes, 'Minder zout\nLekker met rijst');

  const changed = await ok('recept_beoordelen', { id: made.id, oordeel: 'niet_lekker', sterren: 0, notities: 'Te flauw' });
  assert.equal(changed.oordeel, 'niet lekker');
  assert.equal(changed.sterren, null);
  assert.equal(changed.notities, 'Te flauw');
  assert.equal((await ok('recepten_zoeken', { zoekterm: 'Proefsoep', oordeel: 'niet_lekker' })).aantal, 1);
  assert.equal((await ok('recept_beoordelen', { id: made.id, oordeel: 'geen' })).oordeel, 'nog niet beoordeeld');

  assert.equal((await call('recept_beoordelen', { id: made.id })).isError, true, 'niets meegegeven');
  assert.equal((await call('recept_beoordelen', { id: 999999, oordeel: 'lekker' })).isError, true);
});
