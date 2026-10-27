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
  assert.deepEqual(saved.niet_gekoppeld, ['drakenfruitpoeder']);
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

test('nieuwe link: oude stopt; uitzetten', async () => {
  const old = mcpUrl;
  const fresh = await api('POST', '/mcp/new-link', {});
  assert.notEqual(fresh.url, old);
  assert.equal((await rpc('ping', {}, old)).status, 404);
  assert.equal((await rpc('ping', {}, fresh.url)).status, 200);
  assert.equal((await api('POST', '/mcp/disconnect', {})).url, null);
  assert.equal((await rpc('ping', {}, fresh.url)).status, 404);
});
