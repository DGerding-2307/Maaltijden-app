// Inloggen met APP_PASSWORD: inlogpagina met cookie (ook voor de mobiele app) en Basic Auth.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_FILE = ':memory:';
process.env.OFF_DISABLED = '1';
process.env.APP_PASSWORD = 'geheim wachtwoord';
const { openDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
let server;
let base;
before(async () => {
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

test('zonder inloggen: inlogpagina en 401 op de API; /health blijft open', async () => {
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 401);
  assert.match(await page.text(), /Wachtwoord/);
  const apiRes = await fetch(`${base}/api/recipes`);
  assert.equal(apiRes.status, 401);
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('access-control-allow-origin'), '*');
  assert.equal((await health.json()).login, true);
});

test('fout wachtwoord geeft melding, goed wachtwoord geeft cookie', async () => {
  const wrong = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ password: 'fout' }), redirect: 'manual' });
  assert.equal(wrong.status, 401);
  assert.match(await wrong.text(), /Onjuist wachtwoord/);
  const ok = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ password: 'geheim wachtwoord' }), redirect: 'manual' });
  assert.equal(ok.status, 302);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  const res = await fetch(`${base}/api/recipes`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).length, 50);
});

test('Basic Auth werkt nog voor scripts', async () => {
  const auth = `Basic ${Buffer.from('x:geheim wachtwoord').toString('base64')}`;
  assert.equal((await fetch(`${base}/api/meta`, { headers: { authorization: auth } })).status, 200);
});
