// Home Assistant koppelen: sensoren aanmaken (REST) en de kaart op het dashboard zetten (WebSocket).
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

test('koppelen: sensoren aangemaakt en kaart bovenaan het hoofddashboard', async () => {
  resetHa('storage');
  const r = await post('/homeassistant/connect', { url: `${haUrl}/`, token: ` ${TOKEN} ` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added, true);
  assert.equal(r.body.dashboard, 'Overzicht');
  assert.ok(ha.states['sensor.maaltijden_vandaag'].attributes.markdown);
  assert.equal(ha.states['sensor.maaltijden_vandaag'].attributes.friendly_name, 'Maaltijden vandaag');
  assert.ok('sensor.maaltijden_boodschappen_open' in ha.states);
  const cards = ha.configs.main.views[0].cards;
  assert.equal(cards.length, 2);
  assert.match(cards[0].content, /sensor\.maaltijden_vandaag/);

  // Status in Instellingen, token niet zichtbaar
  const s = await (await fetch(`${base}/api/homeassistant`)).json();
  assert.equal(s.link.url, haUrl);
  assert.ok(!JSON.stringify(s).includes(TOKEN));

  // Nog eens plaatsen: geen dubbele kaart
  const again = await post('/homeassistant/card');
  assert.equal(again.body.added, false);
  assert.equal(ha.configs.main.views[0].cards.length, 2);

  // Token staat niet in een back-up
  const backup = await (await fetch(`${base}/api/backup`)).text();
  assert.ok(!backup.includes(TOKEN));

  // Bijwerken en ontkoppelen
  ha.states = {};
  assert.equal((await post('/homeassistant/sync')).body.ok, true);
  assert.ok(ha.states['sensor.maaltijden_vandaag']);
  await post('/homeassistant/disconnect');
  assert.equal((await (await fetch(`${base}/api/homeassistant`)).json()).link, null);
});

test('automatisch hoofdscherm: eigen dashboard ‘Maaltijden’, sectie-weergave krijgt een sectie', async () => {
  for (const mode of ['auto', 'strategy']) {
    resetHa(mode);
    const r = await post('/homeassistant/connect', { url: haUrl, token: TOKEN });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.reason, 'auto');
    assert.equal(r.body.dashboard, 'Maaltijden');
    assert.deepEqual(ha.dashboards.map((d) => d.url_path), ['maaltijden']);
    assert.match(JSON.stringify(ha.configs.maaltijden), /sensor\.maaltijden_vandaag/);
    assert.equal(ha.configs.main.views[0].cards.length, 1, 'hoofddashboard niet aangeraakt');
    // Tweede keer: dashboard bestaat al, geen nieuwe
    const again = await post('/homeassistant/card');
    assert.equal(again.body.added, false);
    assert.equal(ha.dashboards.length, 1);
  }
  resetHa('storage');
  ha.configs.main = { views: [{ type: 'sections', sections: [{ type: 'grid', cards: [{ type: 'tile' }] }] }] };
  await post('/homeassistant/connect', { url: haUrl, token: TOKEN });
  const secs = ha.configs.main.views[0].sections;
  assert.equal(secs.length, 2);
  assert.match(JSON.stringify(secs[0]), /sensor\.maaltijden_vandaag/);
  await post('/homeassistant/disconnect');
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
