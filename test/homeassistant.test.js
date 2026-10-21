// Home Assistant koppelen: de app maakt sensoren aan (REST) en past geen dashboards aan.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_FILE = ':memory:';
process.env.OFF_DISABLED = '1';
const { openDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { TOKEN, ha, resetHa, haServer, startHaMock } = await import('./ha-mock.js');

let server;
let base;
let haUrl;
const post = async (path, body) => {
  const res = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return { status: res.status, body: await res.json() };
};
before(async () => {
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
  haUrl = await startHaMock();
});
after(() => { server.close(); haServer.close(); });

test('koppelen: sensoren aangemaakt, dashboards niet aangeraakt', async () => {
  resetHa('storage');
  // Diner vandaag met een ingebouwde foto (http-adres van de app)
  const { todayISO } = await import('../server/homeassistant.js');
  const recipe = (await (await fetch(`${base}/api/recipes`)).json()).find((x) => x.image_url);
  const { id } = await post('/plan', { date: todayISO(), meal: 'diner', recipe_id: recipe.id, servings: 2 }).then((x) => x.body);
  const r = await post('/homeassistant/connect', { url: `${haUrl}/`, token: ` ${TOKEN} ` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.url, haUrl);
  assert.ok(ha.states['sensor.maaltijden_vandaag'].attributes.markdown);
  assert.equal(ha.states['sensor.maaltijden_vandaag'].attributes.friendly_name, 'Maaltijden vandaag');
  assert.ok('sensor.maaltijden_boodschappen_open' in ha.states);
  for (const id of ['sensor.maaltijden_morgen', 'sensor.maaltijden_week', 'sensor.maaltijden_ik_kcal', 'sensor.maaltijden_ik_gewicht']) assert.ok(id in ha.states, id);
  assert.equal(ha.states['sensor.maaltijden_week'].attributes.dagen.length, 7);
  assert.equal(ha.states['sensor.maaltijden_ik_kcal'].attributes.unit_of_measurement, 'kcal');
  assert.match(ha.states['sensor.maaltijden_week'].attributes.markdown, /\| Dag \|/);

  // Foto's via Home Assistant (https), niet via het http-adres van de app
  const v = ha.states['sensor.maaltijden_vandaag'].attributes;
  assert.match(v.entity_picture, /^\/api\/image\/serve\/img\d+\/512x512$/);
  assert.equal(v.afbeelding, v.entity_picture);
  assert.ok(v.diner.every((x) => !x.afbeelding || x.afbeelding.startsWith('/api/image/serve/')), JSON.stringify(v.diner));
  const uploads = ha.uploads.length;
  assert.ok(uploads > 0);
  assert.ok(!ha.calls.some((c) => c.startsWith('WS ')), `geen dashboard-commando's: ${ha.calls}`);
  assert.equal(ha.configs.main.views[0].cards.length, 1);
  assert.equal(ha.dashboards.length, 0);
  assert.equal((await post('/homeassistant/card')).status, 404, 'geen route meer om de kaart te plaatsen');

  // Status in Instellingen met de kaart om zelf te plakken, token niet zichtbaar
  const s = await (await fetch(`${base}/api/homeassistant`)).json();
  assert.equal(s.link.url, haUrl);
  assert.match(s.card, /sensor\.maaltijden_vandaag/);
  assert.ok(s.examples.length >= 8);
  assert.ok(s.examples.some((x) => /sensor\.maaltijden_ik_kcal/.test(x.yaml)), 'voorbeeld met de calorieën van een persoon');
  assert.deepEqual(s.sensors.map((x) => x.entity_id).sort(), Object.keys(ha.states).sort());
  assert.ok(!JSON.stringify(s).includes(TOKEN));

  // Token staat niet in een back-up
  const backup = await (await fetch(`${base}/api/backup`)).text();
  assert.ok(!backup.includes(TOKEN));

  // Bijwerken en ontkoppelen
  ha.states = {};
  assert.equal((await post('/homeassistant/sync')).body.ok, true);
  assert.ok(ha.states['sensor.maaltijden_vandaag']);
  assert.equal(ha.uploads.length, uploads, 'dezelfde foto niet opnieuw uploaden');
  await post('/homeassistant/disconnect');
  await fetch(`${base}/api/plan/${id}`, { method: 'DELETE' });
  assert.equal((await (await fetch(`${base}/api/homeassistant`)).json()).link, null);
});

test('foute token of adres: duidelijke melding en niets opgeslagen', async () => {
  resetHa('storage');
  const bad = await post('/homeassistant/connect', { url: haUrl, token: 'fout' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /token/);
  const down = await post('/homeassistant/connect', { url: 'http://localhost:1', token: TOKEN });
  assert.equal(down.status, 502);
  assert.match(down.body.error, /niet bereikbaar/);
  const empty = await post('/homeassistant/connect', { url: '', token: TOKEN });
  assert.equal(empty.status, 400);
  assert.equal((await (await fetch(`${base}/api/homeassistant`)).json()).link, null);
});
