// Accounts: zonder accounts open; eerste account wordt beheerder; daarna inloggen en alleen je eigen gegevens.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_FILE = ':memory:';
process.env.OFF_DISABLED = '1';
process.env.REMINDERS_DISABLED = '1';
const { openDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');

let server;
let base;
before(async () => {
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

// Klein ‘apparaat’ met een eigen cookie
function device() {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const data = await res.json();
    return Array.isArray(data) ? data : { status: res.status, ...data };
  };
  return { get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p), get cookie() { return cookie; } };
}
const today = new Date().toISOString().slice(0, 10);

test('zonder accounts werkt alles zonder inloggen', async () => {
  const anon = device();
  const me = await anon.get('/auth/me');
  assert.equal(me.accounts_enabled, false);
  assert.equal(me.user, null);
  assert.ok((await anon.get('/people')).people.length >= 1);
});

test('eerste account: beheerder, gekoppeld aan de bestaande persoon, meteen ingelogd', async () => {
  const phone = device();
  const ik = (await phone.get('/people')).people[0];
  await phone.post('/diary', { person_id: ik.id, date: today, meal: 'lunch', type: 'free', name: 'Brood', values: { kcal: 300 } });
  assert.equal((await phone.post('/auth/accounts', { name: 'Dennis', username: 'D', password: 'kort' })).status, 400, 'te kort wachtwoord');
  const r = await phone.post('/auth/accounts', { name: 'Dennis', username: 'Dennis', password: 'geheim123', person_id: ik.id });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.first, true);
  assert.equal(r.user.is_admin, true);
  assert.equal(r.user.username, 'dennis', 'gebruikersnaam in kleine letters');
  assert.match(phone.cookie, /^maaltijden_sessie=/);
  const me = await phone.get('/auth/me');
  assert.equal(me.accounts_enabled, true);
  assert.equal(me.user.name, 'Dennis');
  const day = await phone.get(`/diary?persoon=${ik.id}&datum=${today}`);
  assert.equal(day.totals.kcal, 300, 'dagboek van de persoon is behouden');
});

test('met accounts: zonder inloggen geen toegang; verkeerd wachtwoord geweigerd', async () => {
  const stranger = device();
  const r = await stranger.get('/recipes');
  assert.equal(r.status, 401);
  assert.equal(r.login, true);
  assert.equal((await stranger.post('/auth/accounts', { name: 'Hacker', username: 'hacker', password: 'geheim123' })).status, 403, 'niet zomaar een account maken');
  assert.equal((await stranger.post('/auth/login', { username: 'dennis', password: 'fout-fout' })).status, 401);
  assert.equal((await stranger.post('/auth/login', { username: 'niemand', password: 'geheim123' })).status, 401);
  const ok = await stranger.post('/auth/login', { username: 'DENNIS ', password: 'geheim123' });
  assert.equal(ok.user.name, 'Dennis');
  assert.ok(Array.isArray(await stranger.get('/recipes')));
  await stranger.post('/auth/logout');
  assert.equal((await stranger.get('/recipes')).status, 401, 'na uitloggen weer dicht');
});

test('beheerder voegt een huisgenoot toe; die ziet alleen zijn eigen dagboek', async () => {
  const admin = device();
  await admin.post('/auth/login', { username: 'dennis', password: 'geheim123' });
  const added = await admin.post('/auth/accounts', { name: 'Sanne', username: 'sanne', password: 'wachtwoord1' });
  assert.equal(added.user.is_admin, false);
  assert.equal((await admin.post('/auth/accounts', { name: 'Nog een Sanne', username: 'sanne', password: 'wachtwoord1' })).status, 409);
  const list = await admin.get('/auth/accounts');
  assert.equal(list.filter((a) => a.has_account).length, 2);

  const sanne = device();
  const login = await sanne.post('/auth/login', { username: 'sanne', password: 'wachtwoord1' });
  const dennisId = list.find((a) => a.username === 'dennis').id;
  // Vraagt om het dagboek van Dennis, krijgt zijn eigen
  const day = await sanne.get(`/diary?persoon=${dennisId}&datum=${today}`);
  assert.equal(day.person.id, login.user.id);
  assert.equal(day.totals.kcal, 0);
  // Loggen voor een ander kan niet: het komt in je eigen dagboek
  const { id } = await sanne.post('/diary', { person_id: dennisId, date: today, meal: 'lunch', type: 'free', name: 'Salade', values: { kcal: 200 } });
  assert.equal((await sanne.get(`/diary/${id}`)).person_id, login.user.id);
  // Regels van Dennis bekijken of verwijderen mag niet
  const dennisEntry = (await admin.get(`/diary?persoon=${dennisId}&datum=${today}`)).meals.flatMap((m) => m.entries)[0];
  assert.equal((await sanne.get(`/diary/${dennisEntry.id}`)).status, 403);
  assert.equal((await sanne.del(`/diary/${dennisEntry.id}`)).status, 403);
  assert.equal((await sanne.get('/auth/accounts')).status, 403, 'geen beheerder');
  // Maatje en herinneringen zijn ook van jezelf
  await sanne.put('/buddy', { person_id: dennisId, name: 'Pip' });
  assert.equal((await admin.get(`/buddy?persoon=${dennisId}`)).name, 'Bolletje');
  assert.equal((await sanne.get(`/buddy?persoon=${login.user.id}`)).name, 'Pip');
  // Gedeeld: recepten en planner
  assert.ok((await sanne.get('/recipes')).length > 5);
});

test('wachtwoord wijzigen en beheer: resetten, opheffen, altijd één beheerder', async () => {
  const sanne = device();
  const { user } = await sanne.post('/auth/login', { username: 'sanne', password: 'wachtwoord1' });
  assert.equal((await sanne.put('/auth/password', { current: 'fout', password: 'nieuwwachtwoord' })).status, 401);
  assert.equal((await sanne.put('/auth/password', { current: 'wachtwoord1', password: 'nieuwwachtwoord' })).ok, true);
  assert.equal((await device().post('/auth/login', { username: 'sanne', password: 'nieuwwachtwoord' })).user.id, user.id);

  const admin = device();
  const me = (await admin.post('/auth/login', { username: 'dennis', password: 'geheim123' })).user;
  assert.equal((await admin.put(`/auth/accounts/${me.id}`, { remove: true })).status, 400, 'laatste beheerder blijft');
  await admin.put(`/auth/accounts/${user.id}`, { password: 'reset-door-beheerder' });
  assert.equal((await sanne.get('/recipes')).status, 401, 'oude sessies vervallen na reset');
  assert.ok((await device().post('/auth/login', { username: 'sanne', password: 'reset-door-beheerder' })).user);
  assert.equal((await admin.put(`/auth/accounts/${user.id}`, { remove: true })).removed, true);
  assert.equal((await device().post('/auth/login', { username: 'sanne', password: 'reset-door-beheerder' })).status, 401);
  const people = (await admin.get('/people')).people;
  assert.ok(people.some((p) => p.id === user.id), 'de persoon en het dagboek blijven bestaan');
  assert.ok(!('password_hash' in people[0]), 'nooit het wachtwoord meesturen');
});
