// Direct updaten: nieuwste versie opvragen (GitHub) en de updater (Watchtower HTTP API) aansturen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const calls = [];
let updaterStatus = 202;
const mock = http.createServer((req, res) => {
  calls.push(`${req.method} ${req.url} ${req.headers.authorization || ''}`);
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/repos/o/r') return res.end(JSON.stringify({ default_branch: 'main' }));
  if (req.url.startsWith('/repos/o/r/actions/workflows/docker.yml/runs')) {
    return res.end(JSON.stringify({ workflow_runs: [{ head_sha: 'abcdef1234567890', updated_at: '2026-10-12T10:00:00Z' }] }));
  }
  if (req.url === '/raw/o/r/abcdef1234567890/package.json') return res.end(JSON.stringify({ version: '9.9.9' }));
  if (req.url === '/v1/update?async=true' && req.method === 'POST') {
    if (req.headers.authorization !== 'Bearer geheim') { res.statusCode = 401; return res.end('{}'); }
    res.statusCode = updaterStatus;
    return res.end('{}');
  }
  res.statusCode = 404;
  res.end('{}');
});

let up;
before(async () => {
  await new Promise((r) => mock.listen(0, r));
  const base = `http://localhost:${mock.address().port}`;
  Object.assign(process.env, { UPDATE_REPO: 'o/r', UPDATE_GITHUB_API: base, UPDATE_GITHUB_RAW: `${base}/raw` });
  up = await import('../server/updater.js');
});
after(() => mock.close());

test('nieuwste versie en of er een update is', async () => {
  delete process.env.UPDATER_URL;
  const s = await up.updateStatus('3.2.3+fe4de15', { refresh: true });
  assert.equal(s.latest, '9.9.9+abcdef1');
  assert.equal(s.update_available, true);
  assert.equal(s.can_update, false);
  assert.equal((await up.updateStatus('9.9.9+abcdef1')).update_available, false);
  // Een ontwikkelversie zonder commit: geen melding
  assert.equal((await up.updateStatus('3.3.0')).update_available, false);
});

test('updaten zonder updater geeft uitleg', async () => {
  await assert.rejects(up.triggerUpdate(), /nog niet ingesteld/);
});

test('updaten met de updater: token, al bezig, verkeerde token, onbereikbaar', async () => {
  process.env.UPDATER_URL = `http://localhost:${mock.address().port}/`;
  process.env.UPDATER_TOKEN = 'geheim';
  assert.deepEqual(await up.triggerUpdate(), { started: true });
  assert.ok(calls.includes('POST /v1/update?async=true Bearer geheim'));
  updaterStatus = 429;
  assert.deepEqual(await up.triggerUpdate(), { started: true, already_running: true });
  process.env.UPDATER_TOKEN = 'fout';
  await assert.rejects(up.triggerUpdate(), /UPDATER_TOKEN/);
  process.env.UPDATER_URL = 'http://localhost:1';
  await assert.rejects(up.triggerUpdate(), /niet bereikbaar/);
  delete process.env.UPDATER_URL;
  delete process.env.UPDATER_TOKEN;
});

test('GitHub niet bereikbaar: geen versie, wel bruikbare status', async () => {
  process.env.UPDATE_GITHUB_API = 'http://localhost:1';
  up._resetCache();
  const s = await up.updateStatus('3.2.3+fe4de15', { refresh: true });
  assert.equal(s.latest, null);
  assert.equal(s.update_available, false);
});
