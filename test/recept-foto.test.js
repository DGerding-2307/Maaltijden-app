// Receptfoto's via de koppeling met Claude: instellen (link of base64), verkleinen, verwijderen en de beveiliging bij het ophalen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DB_FILE = ':memory:';
process.env.OFF_DISABLED = '1';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'maaltijden-foto-'));
const { default: sharp } = await import('sharp');
const { openDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const photos = await import('../server/recipe-photos.js');
const { todayISO } = await import('../server/homeassistant.js');

const jpeg = (width, height = Math.round(width * 0.6)) => sharp({ create: { width, height, channels: 3, background: '#e07a5f' } }).jpeg().toBuffer();
const png = (width) => sharp({ create: { width, height: width, channels: 4, background: '#81b29a' } }).png().toBuffer();

let server;
let base;
let mcpUrl;
let images; // testserver voor afbeeldingen (http op localhost; alleen bereikbaar met de testopties)
let imgBase;
before(async () => {
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
  mcpUrl = (await (await fetch(`${base}/api/mcp/new-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).url;

  const big = await jpeg(1600);
  images = http.createServer((req, res) => {
    const m = req.url.match(/^\/redirect\/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      res.writeHead(302, { Location: n > 0 ? `/redirect/${n - 1}` : '/foto.jpg' });
      return res.end();
    }
    if (req.url === '/foto.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(big); }
    if (req.url === '/pagina') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<html></html>'); }
    if (req.url === '/gif') { res.writeHead(200, { 'Content-Type': 'image/gif' }); return res.end('GIF89a'); }
    if (req.url === '/nep.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end('dit is geen foto'); }
    if (req.url === '/groot') { // zonder Content-Length, meer dan 5 MB
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      const chunk = Buffer.alloc(1024 * 1024);
      for (let i = 0; i < 6; i++) res.write(chunk);
      return res.end();
    }
    if (req.url === '/traag') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); res.write(Buffer.alloc(10)); return; }
    res.writeHead(404); res.end();
  });
  images.listen(0);
  await new Promise((r) => images.once('listening', r));
  imgBase = `http://127.0.0.1:${images.address().port}`;
});
after(() => {
  server.close();
  images.closeAllConnections();
  images.close();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});

let nextId = 1;
async function call(name, args = {}) {
  const res = await fetch(mcpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }),
  });
  return (await res.json()).result;
}
const ok = async (name, args) => {
  const r = await call(name, args);
  assert.ok(!r.isError, `${name}: ${r.content[0].text}`);
  return r.structuredContent;
};
const err = async (name, args) => {
  const r = await call(name, args);
  assert.equal(r.isError, true, `${name} had een fout moeten geven: ${r.content[0].text}`);
  return r.content[0].text;
};
const newRecipe = async (titel = 'Fotorecept') => (await ok('recept_opslaan', {
  titel, personen: 2, ingredienten: [{ naam: 'ui', hoeveelheid: 1, eenheid: 'stuks' }], bereiding: ['Bakken'],
})).id;
const fileOf = (url) => path.join(process.env.UPLOAD_DIR, url.replace('/uploads/', ''));

test('nieuwe hulpmiddelen staan in de lijst en in de instructies', async () => {
  const res = await fetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  const tools = (await res.json()).result.tools;
  const set = tools.find((t) => t.name === 'recept_foto_instellen');
  assert.ok(set);
  assert.deepEqual(set.inputSchema.required, ['id']);
  assert.ok(set.inputSchema.properties.foto_url && set.inputSchema.properties.foto_base64);
  assert.equal(tools.find((t) => t.name === 'recept_foto_verwijderen').annotations.destructiveHint, true);
  assert.ok(tools.find((t) => t.name === 'recept_opslaan').inputSchema.properties.foto_url);
  const init = await fetch(mcpUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} }) });
  assert.match((await init.json()).result.instructions, /recept_foto_instellen/);
});

test('foto via base64: verkleind, kleine variant, zichtbaar in lijst en planner; blijft staan bij recept_wijzigen', async () => {
  const id = await newRecipe();
  const data = `data:image/png;base64,${(await png(2000)).toString('base64')}`;
  const out = await ok('recept_foto_instellen', { id, foto_base64: data });
  assert.equal(out.gelukt, true);
  assert.equal(out.breedte, 1200);
  assert.equal(out.klein.breedte, 400);
  assert.equal(out.origineel.formaat, 'image/png');
  assert.ok(out.kb > 0);
  assert.match(out.foto, /^\/uploads\/recept-[a-f0-9]{24}\.jpg$/);
  const meta = await sharp(fs.readFileSync(fileOf(out.foto))).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 1200);
  assert.equal((await sharp(fs.readFileSync(fileOf(out.foto_klein))).metadata()).width, 400);

  // Via de website op te halen
  const served = await fetch(`${base}${out.foto}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/jpeg');

  // Receptpagina, lijst en planner
  const r = await (await fetch(`${base}/api/recipes/${id}`)).json();
  assert.equal(r.image_url, out.foto);
  const list = await (await fetch(`${base}/api/recipes`)).json();
  assert.equal(list.find((x) => x.id === id).image_thumb, out.foto_klein);
  const today = todayISO();
  await ok('maaltijd_plannen', { datum: today, moment: 'diner', recept_id: id, personen: 2 });
  const plan = await (await fetch(`${base}/api/plan?week=${today}`)).json();
  const entry = plan.days.flatMap((d) => d.entries).find((e) => e.recipe_id === id);
  assert.equal(entry.image_url, out.foto);
  assert.equal(entry.image_thumb, out.foto_klein);

  // Wijzigen via Claude en via de app: foto blijft
  await ok('recept_wijzigen', { id, titel: 'Fotorecept nieuw', ingredienten: [{ naam: 'ui', hoeveelheid: 2, eenheid: 'stuks' }] });
  const full = await (await fetch(`${base}/api/recipes/${id}`)).json();
  assert.equal(full.image_url, out.foto);
  assert.equal(full.image_thumb, out.foto_klein);
  await fetch(`${base}/api/recipes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...full, title: 'Via de app' }) });
  const afterApp = await (await fetch(`${base}/api/recipes/${id}`)).json();
  assert.equal(afterApp.image_thumb, out.foto_klein);
  assert.equal((await ok('recept_bekijken', { id })).foto, out.foto);

  // Verwijderen: weg uit het recept en van schijf
  assert.equal((await ok('recept_foto_verwijderen', { id })).verwijderd, true);
  assert.equal((await (await fetch(`${base}/api/recipes/${id}`)).json()).image_url, null);
  assert.equal(fs.existsSync(fileOf(out.foto)), false);
  assert.equal(fs.existsSync(fileOf(out.foto_klein)), false);
  assert.equal((await ok('recept_foto_verwijderen', { id })).verwijderd, false);
});

test('base64 met los mime-type, kleine foto wordt niet vergroot; vervangen ruimt de oude op', async () => {
  const id = await newRecipe('Klein');
  const first = await ok('recept_foto_instellen', { id, foto_base64: (await jpeg(300)).toString('base64'), mime_type: 'image/jpeg' });
  assert.equal(first.breedte, 300);
  assert.equal(first.klein.breedte, 300);
  const second = await ok('recept_foto_instellen', { id, foto_base64: (await jpeg(500)).toString('base64') });
  assert.notEqual(second.foto, first.foto);
  assert.equal(fs.existsSync(fileOf(first.foto)), false);
  assert.equal(fs.existsSync(fileOf(second.foto)), true);
});

test('nette foutmeldingen', async () => {
  const id = await newRecipe('Fouten');
  assert.match(await err('recept_foto_instellen', { id: 999999, foto_base64: (await jpeg(100)).toString('base64') }), /Recept 999999 bestaat niet/);
  assert.match(await err('recept_foto_instellen', { id }), /foto_url .* of foto_base64/);
  assert.match(await err('recept_foto_instellen', { id, foto_url: 'https://example.com/a.jpg', foto_base64: 'abc' }), /niet allebei/);
  assert.match(await err('recept_foto_instellen', { id, foto_url: 'http://example.com/a.jpg' }), /Alleen https/);
  assert.match(await err('recept_foto_instellen', { id, foto_url: 'geen link' }), /geen geldige link/);
  for (const u of ['https://localhost/a.jpg', 'https://127.0.0.1/a.jpg', 'https://10.1.2.3/a.jpg', 'https://192.168.1.10/a.jpg',
    'https://172.20.0.1/a.jpg', 'https://169.254.169.254/latest', 'https://[::1]/a.jpg', 'https://[::ffff:127.0.0.1]/a.jpg', 'https://2130706433/a.jpg',
    'https://foo.localhost/a.jpg']) {
    assert.match(await err('recept_foto_instellen', { id, foto_url: u }), /intern of lokaal adres/, u);
  }
  assert.match(await err('recept_foto_instellen', { id, foto_base64: 'data:image/gif;base64,R0lGODlh' }), /alleen JPEG, PNG of WebP/);
  assert.match(await err('recept_foto_instellen', { id, foto_base64: Buffer.from('geen foto').toString('base64') }), /geen leesbare afbeelding/);
  assert.match(await err('recept_foto_instellen', { id, foto_base64: Buffer.alloc(6 * 1024 * 1024).toString('base64') }), /groter dan 5 MB/);
  const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).gif().toBuffer();
  assert.match(await err('recept_foto_instellen', { id, foto_base64: gif.toString('base64') }), /alleen JPEG, PNG of WebP/);
  assert.equal((await (await fetch(`${base}/api/recipes/${id}`)).json()).image_url, null, 'bij een fout geen foto');
});

test('recept_opslaan met foto_url: recept blijft bewaard als de foto niet lukt', async () => {
  const out = await ok('recept_opslaan', {
    titel: 'Met foto', ingredienten: [{ naam: 'ui', hoeveelheid: 1 }], bereiding: ['Klaar'], foto_url: 'https://127.0.0.1/thumb.jpg',
  });
  assert.equal(out.opgeslagen, true);
  assert.equal(out.foto_opgeslagen, false);
  assert.match(out.foto_fout, /intern of lokaal adres.*wel opgeslagen/);
  assert.ok((await (await fetch(`${base}/api/recipes/${out.id}`)).json()).title);
});

test('isPrivateAddress', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.1.1', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', '::ffff:7f00:1']) {
    assert.equal(photos.isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '142.250.1.1', '2a00:1450:4001::1']) assert.equal(photos.isPrivateAddress(ip), false, ip);
});

test('ophalen: redirects, type, grootte en tijd (testserver)', async () => {
  const t = { allowHttp: true, allowPrivate: true };
  const got = await photos.fetchImage(`${imgBase}/redirect/2`, t);
  assert.equal(got.type, 'image/jpeg');
  assert.ok(got.buffer.length > 1000);
  await assert.rejects(photos.fetchImage(`${imgBase}/redirect/3`, t), /te vaak door/);
  await assert.rejects(photos.fetchImage(`${imgBase}/pagina`, t), /webpagina, geen afbeelding/);
  await assert.rejects(photos.fetchImage(`${imgBase}/gif`, t), /image\/gif.*niet ondersteund/);
  await assert.rejects(photos.fetchImage(`${imgBase}/groot`, t), /groter dan 5 MB/);
  await assert.rejects(photos.fetchImage(`${imgBase}/niks`, t), /404/);
  await assert.rejects(photos.fetchImage(`${imgBase}/traag`, { ...t, timeoutMs: 300 }), /langer dan 10 seconden/);
  const fake = await photos.fetchImage(`${imgBase}/nep.jpg`, t);
  await assert.rejects(photos.storeImage(fake.buffer), /geen leesbare afbeelding/);
  // Zonder testopties: http geweigerd, en een https-link naar een interne naam ook
  await assert.rejects(photos.fetchImage(`${imgBase}/foto.jpg`), /Alleen https/);
  // Een redirect naar een intern adres wordt ook geweigerd
  await assert.rejects(photos.fetchImage(`${imgBase}/foto.jpg`, { allowHttp: true }), /intern of lokaal adres/);
});

test('DNS die naar een intern adres wijst wordt geweigerd', { skip: !process.env.NET_TESTS && 'alleen met NET_TESTS=1 (heeft internet nodig)' }, async () => {
  // localtest.me wijst naar 127.0.0.1
  await assert.rejects(photos.fetchImage('https://localtest.me/a.jpg'), /intern of lokaal adres/);
  // En een echte YouTube-thumbnail lukt wel
  const yt = await photos.fetchImage('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(yt.type, 'image/jpeg');
  assert.ok((await photos.storeImage(yt.buffer)).breedte > 0);
});
