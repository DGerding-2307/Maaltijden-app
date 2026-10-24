// Versie 4: maatje, aanmoediging, ingrediënten aanpassen, foto → calorieën en herinneringen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Nagebootste Claude API: foto-analyse en het berichtje van het maatje
const claudeCalls = [];
const claude = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = JSON.parse(body || '{}');
    claudeCalls.push(json);
    const schema = json.output_config?.format?.schema;
    const per100 = (kcal, protein, carbs, fat, fiber = 1, sugar = 2) => ({ kcal, protein, carbs, sugar, fat, sat_fat: fat / 5, fiber, salt: 0.1 });
    let out = 'OK';
    if (schema?.properties?.is_food) {
      const prompt = JSON.stringify(json.messages);
      out = JSON.stringify(prompt.includes(Buffer.from('NIET_ETEN').toString('base64'))
        ? { is_food: false, title: '', confidence: 'laag', note: 'Geen eten te zien', items: [] }
        : {
          is_food: true, title: 'Pasta pesto met kip', confidence: 'hoog', note: '',
          items: [
            { name: 'kipfilet', grams: 100, known: true, vegetable_or_fruit: false, per100: per100(165, 31, 0, 3.6, 0, 0) },
            { name: 'groene pesto', grams: 30, known: false, vegetable_or_fruit: false, per100: per100(450, 5, 6, 45, 2, 2) },
            { name: 'cherrytomaatjes', grams: 80, known: false, vegetable_or_fruit: true, per100: per100(20, 1, 3, 0.2, 1.2, 3) },
          ],
        });
    } else if (schema?.properties?.title && schema?.properties?.text) {
      out = JSON.stringify({ title: 'Woef, lekker!', text: 'Persoonlijk berichtje van Claude 🐾' });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: json.model, content: [{ type: 'text', text: out }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
  });
});

let server;
let base;
let tracker;
let buddy;
let reminders;
let me;
const today = new Date().toISOString().slice(0, 10);
const get = (p) => fetch(base + p).then((r) => r.json());
const send = (method, p, body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, ...(await r.json()) }));

before(async () => {
  await new Promise((r) => claude.listen(0, r));
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${claude.address().port}`;
  process.env.DB_FILE = ':memory:';
  process.env.OFF_DISABLED = '1';
  process.env.REMINDERS_DISABLED = '1';
  delete process.env.ANTHROPIC_API_KEY;
  const { openDatabase } = await import('../server/db.js');
  const { createApp } = await import('../server/index.js');
  tracker = await import('../server/tracker.js');
  buddy = await import('../server/buddy.js');
  reminders = await import('../server/reminders.js');
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
  me = (await get('/people')).people[0];
});
after(() => { server.close(); claude.close(); });

// ---------- Functie 2 en 3: maatje en aanmoediging ----------

test('gezondheidsscore: groente en eiwit hoog, suiker en vet laag', () => {
  const salad = buddy.healthScore({ kcal: 450, protein: 35, carbs: 30, sugar: 6, fat: 18, sat_fat: 3, fiber: 12, salt: 1 }, { meal: 'lunch', vegGrams: 250 });
  const candy = buddy.healthScore({ kcal: 600, protein: 4, carbs: 80, sugar: 60, fat: 30, sat_fat: 18, fiber: 1, salt: 0.6 }, { meal: 'tussendoor' });
  const apple = buddy.healthScore({ kcal: 80, protein: 0.4, carbs: 18, sugar: 15, fat: 0.2, sat_fat: 0, fiber: 3.5, salt: 0 }, { meal: 'tussendoor', vegGrams: 150 });
  assert.ok(salad >= 75, `salade ${salad}`);
  assert.ok(candy < 35, `snoep ${candy}`);
  assert.ok(apple >= 55, `appel ${apple} (fruitsuiker telt half)`);
  assert.equal(buddy.levelFor(salad).mood, 'blij');
  assert.equal(buddy.levelFor(candy).mood, 'bezorgd');
  assert.equal(buddy.healthScore({ kcal: 2 }), 70, 'zwarte koffie is prima');
});

test('maatje: standaardnaam Bolletje, naam kiezen en kennismaking afronden', async () => {
  let b = await get(`/buddy?persoon=${me.id}`);
  assert.equal(b.name, 'Bolletje');
  assert.equal(b.onboarded, false);
  assert.ok(b.suggestions.includes('Koekje'));
  assert.ok(['rust', 'hongerig', 'slaperig'].includes(b.mood));
  const saved = await send('PUT', '/buddy', { person_id: me.id, name: '  Pip  ', onboarded: true });
  assert.equal(saved.name, 'Pip');
  b = await get(`/buddy?persoon=${me.id}`);
  assert.equal(b.onboarded, true);
  await send('PUT', '/buddy', { person_id: me.id, name: '' });
  assert.equal((await get(`/buddy?persoon=${me.id}`)).name, 'Bolletje', 'lege naam → standaard');
  assert.equal((await send('PUT', '/buddy', { person_id: 9999, name: 'X' })).status, 404);
});

test('loggen geeft een reactie van het maatje passend bij hoe gezond het is', async () => {
  const broccoli = (await get('/foods?q=broccoli')).ingredients[0];
  const r1 = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'lunch', type: 'ingredient', ingredient_id: broccoli.id, grams: 300 });
  assert.ok(r1.id);
  assert.ok(['super', 'goed'].includes(r1.reaction.level), JSON.stringify(r1.reaction));
  assert.ok(['blij', 'trots'].includes(r1.reaction.mood));
  assert.ok(r1.reaction.title && r1.reaction.text);
  assert.equal(typeof r1.reaction.kcal_left, 'number');

  const r2 = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'tussendoor', type: 'free', name: 'Zak chips en cola', values: { kcal: 900, carbs: 110, sugar: 70, fat: 45, sat_fat: 20, salt: 3, protein: 6 } });
  assert.equal(r2.reaction.level, 'letop');
  assert.equal(r2.reaction.mood, 'bezorgd');
  assert.doesNotMatch(`${r2.reaction.title} ${r2.reaction.text}`, /slecht|fout|stout|foei/i, 'nooit streng');

  const day = await get(`/diary?persoon=${me.id}&datum=${today}`);
  const entries = day.meals.flatMap((m) => m.entries);
  assert.ok(entries.every((e) => typeof e.score === 'number' && e.level && e.mood), 'elke regel heeft een score');
  const state = await get(`/buddy?persoon=${me.id}&datum=${today}`);
  assert.ok(state.hearts >= 1 && state.hearts <= 5);
  assert.equal(state.streak, 1);
  for (const e of entries) await send('DELETE', `/diary/${e.id}`);
});

test('reeks: 7 dagen op rij loggen maakt het maatje trots', async () => {
  const { addDays } = await import('../server/seed.js');
  for (let i = 6; i >= 1; i--) await send('POST', '/diary', { person_id: me.id, date: addDays(today, -i), meal: 'lunch', type: 'free', name: 'Brood', values: { kcal: 300, protein: 12, fiber: 6 } });
  assert.equal(buddy.streakOf(me.id, today), 6, 'vandaag nog leeg: reeks t/m gisteren');
  const r = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'ontbijt', type: 'free', name: 'Yoghurt', values: { kcal: 200, protein: 15 } });
  assert.equal(r.reaction.mood, 'trots');
  assert.match(r.reaction.title, /7 dagen/);
  for (let i = 0; i <= 6; i++) for (const m of (await get(`/diary?persoon=${me.id}&datum=${addDays(today, -i)}`)).meals) for (const e of m.entries) await send('DELETE', `/diary/${e.id}`);
});

test('persoonlijk berichtje met Claude (optioneel); zonder sleutel de ingebouwde zinnen', async () => {
  await send('PUT', '/settings', { buddy_ai: true });
  let r = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'lunch', type: 'free', name: 'Salade', values: { kcal: 300, protein: 20, fiber: 8 } });
  assert.notEqual(r.reaction.text, 'Persoonlijk berichtje van Claude 🐾', 'zonder sleutel geen Claude');
  await send('PUT', '/settings', { anthropic_api_key: 'sk-ant-test' });
  r = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'lunch', type: 'free', name: 'Salade 2', values: { kcal: 300, protein: 20, fiber: 8 } });
  assert.equal(r.reaction.text, 'Persoonlijk berichtje van Claude 🐾');
  assert.equal(r.reaction.ai, true);
  assert.ok(r.reaction.mood, 'stemming blijft van de app zelf');
  await send('PUT', '/settings', { buddy_ai: false });
  for (const m of (await get(`/diary?persoon=${me.id}&datum=${today}`)).meals) for (const e of m.entries) await send('DELETE', `/diary/${e.id}`);
});

// ---------- Functie 5: ingrediënten aanpassen ----------

test('recept loggen bewaart de ingrediënten; aanpassen rekent kcal en score opnieuw uit', async () => {
  const recipe = (await get('/foods?q=kip kerrie')).recipes[0] || (await get('/recipes'))[0];
  const full = await get(`/recipes/${recipe.id}`);
  const { id } = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'diner', type: 'recipe', recipe_id: recipe.id, servings: 1 });
  let entry = await get(`/diary/${id}`);
  assert.ok(entry.items.length >= 3, 'ingrediënten van het recept');
  const sum = entry.items.reduce((s, x) => s + (x.per100.kcal * x.grams) / 100, 0);
  assert.ok(Math.abs(sum - full.nutrition_per_serving.kcal) < full.nutrition_per_serving.kcal * 0.03, `som ${sum} ≈ ${full.nutrition_per_serving.kcal}`);

  // Grootste ingrediënt halveren, eentje weglaten, groente toevoegen
  const items = entry.items.map((x) => ({ ...x }));
  const biggest = items.reduce((a, b) => (a.grams * a.per100.kcal > b.grams * b.per100.kcal ? a : b));
  biggest.grams = Math.round(biggest.grams / 2);
  items.splice(items.length - 1, 1);
  const spinazie = (await get('/foods?q=spinazie')).ingredients.find((x) => /^(verse )?spinazie/.test(x.name));
  items.push({ ingredient_id: spinazie.id, name: spinazie.name, grams: 150 });

  const preview = await send('POST', '/diary/preview', { person_id: me.id, meal: 'diner', items });
  assert.ok(preview.nutrition.kcal < entry.kcal, 'preview: minder kcal');
  assert.ok(typeof preview.score === 'number' && preview.mood);

  const r = await send('PUT', `/diary/${id}`, { items, name: `${recipe.title} (aangepast)` });
  assert.equal(r.ok, true);
  assert.ok(r.reaction, 'maatje reageert op de aanpassing');
  entry = await get(`/diary/${id}`);
  assert.equal(entry.name, `${recipe.title} (aangepast)`);
  assert.equal(entry.items.at(-1).name, spinazie.name);
  assert.equal(entry.items.at(-1).veg, true, 'spinazie telt als groente');
  assert.equal(Math.round(entry.kcal), preview.nutrition.kcal);

  // Porties verdubbelen schaalt de ingrediënten mee
  await send('PUT', `/diary/${id}`, { servings: 2 });
  const doubled = await get(`/diary/${id}`);
  assert.equal(doubled.items[0].grams, Math.round(entry.items[0].grams * 2));
  assert.ok(Math.abs(doubled.kcal - entry.kcal * 2) < 2);
  await send('DELETE', `/diary/${id}`);
});

test('oude logs (vóór v4) krijgen hun ingrediënten uit het recept', async () => {
  const recipe = (await get('/recipes'))[0];
  const { getDb } = await import('../server/db.js');
  const { lastInsertRowid } = getDb().prepare("INSERT INTO food_log (person_id, date, meal, type, recipe_id, servings, name, kcal) VALUES (?, ?, 'diner', 'recipe', ?, 1, ?, 500)")
    .run(me.id, today, recipe.id, recipe.title);
  const entry = await get(`/diary/${lastInsertRowid}`);
  assert.ok(entry.items.length > 0);
  const day = await get(`/diary?persoon=${me.id}&datum=${today}`);
  assert.equal(typeof day.meals.find((m) => m.meal === 'diner').entries[0].score, 'number', 'score ook voor oude logs');
  await send('DELETE', `/diary/${lastInsertRowid}`);
});

// ---------- Functie 6: foto → AI → calorieën ----------

test('foto van je eten: Claude herkent het gerecht, koppelt ingrediënten en rekent kcal uit', async () => {
  await send('PUT', '/settings', { anthropic_api_key: 'sk-ant-test' });
  const image = { media_type: 'image/jpeg', data: Buffer.from('nep-foto').toString('base64') };
  const r = await send('POST', '/ai/photo', { image, meal: 'diner', person_id: me.id });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.title, 'Pasta pesto met kip');
  assert.equal(r.confidence, 'hoog');
  const req = claudeCalls.at(-1);
  assert.equal(req.messages[0].content[0].type, 'image', 'foto gaat mee naar Claude');
  assert.match(JSON.stringify(req.system), /kipfilet/, 'bekende ingrediënten in de prompt');
  const kip = r.items.find((x) => x.name === 'kipfilet');
  assert.ok(kip.ingredient_id, 'bekend ingrediënt gekoppeld aan de eigen lijst');
  const pesto = r.items.find((x) => x.name === 'groene pesto');
  assert.equal(pesto.ingredient_id, null);
  assert.equal(pesto.estimated, true);
  assert.equal(r.items.find((x) => x.name === 'cherrytomaatjes').veg, true);
  const expected = r.items.reduce((s, x) => s + (x.per100.kcal * x.grams) / 100, 0);
  assert.equal(r.preview.nutrition.kcal, Math.round(expected));

  // Foto opslaan en loggen met (aangepaste) ingrediënten
  const up = await send('POST', '/uploads', image);
  const items = r.items.map((x) => (x.name === 'kipfilet' ? { ...x, grams: 150 } : x));
  const logged = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'diner', type: 'free', name: r.title, items, photo: up.url });
  const entry = await get(`/diary/${logged.id}`);
  assert.equal(entry.photo, up.url);
  assert.ok(entry.kcal > expected, 'meer kip = meer kcal');
  assert.ok(logged.reaction.title);
  await send('DELETE', `/diary/${logged.id}`);

  const bad = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'diner', type: 'free', name: 'x', values: { kcal: 10 }, photo: '../../etc/passwd' });
  assert.equal((await get(`/diary/${bad.id}`)).photo, null, 'alleen eigen uploads als foto');
  await send('DELETE', `/diary/${bad.id}`);
});

test('foto zonder eten of zonder geldige afbeelding', async () => {
  const r = await send('POST', '/ai/photo', { image: { media_type: 'image/png', data: Buffer.from('NIET_ETEN').toString('base64') }, person_id: me.id });
  assert.equal(r.is_food, false);
  assert.deepEqual(r.items, []);
  const bad = await send('POST', '/ai/photo', { image: { media_type: 'application/pdf', data: 'x' } });
  assert.equal(bad.status, 400);
});

// ---------- Functie 4: herinneringen ----------

// Vaste momenten in Amsterdamse tijd (CET, UTC+1 in januari)
const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+01:00`);

test('herinneringen instellen: standaard uit, tijden controleren, stille uren', async () => {
  let r = await get(`/reminders?persoon=${me.id}`);
  assert.equal(r.settings.enabled, false);
  assert.equal(r.settings.lunch.time, '13:00');
  assert.ok(r.push_public_key.length > 40, 'VAPID-sleutel');
  assert.match(r.schedule_url, /\/meldingen\/[\w-]+\/\d+\.json$/);
  const saved = await send('PUT', '/reminders', { person_id: me.id, enabled: true, lunch: { time: '12:30' }, ha_service: 'notify.mobile_app_telefoon' });
  assert.equal(saved.enabled, true);
  assert.equal(saved.lunch.time, '12:30');
  assert.equal(saved.lunch.on, true);
  assert.equal(saved.ha_service, 'mobile_app_telefoon');
  assert.equal((await send('PUT', '/reminders', { person_id: me.id, diner: { time: '23:15' } })).status, 400, 'niet in de nacht');
  assert.equal((await send('PUT', '/reminders', { person_id: me.id, diner: { time: '7 uur' } })).status, 400);
  r = await get(`/reminders?persoon=${me.id}`);
  assert.equal(r.settings.diner.time, '19:00');
});

test('herinnering alleen als je nog niets gelogd hebt, en maar één keer', async () => {
  const date = '2031-01-15';
  await send('PUT', '/reminders', { person_id: me.id, enabled: true, lunch: { on: true, time: '12:30' }, avond: { on: true, time: '21:00' } });
  assert.equal(reminders.dueReminders(at(date, '12:00')).length, 0, 'te vroeg');
  const due = reminders.dueReminders(at(date, '12:40'));
  assert.equal(due.length, 1);
  assert.equal(due[0].slot, 'lunch');
  assert.match(due[0].title, /Bolletje/);
  assert.match(due[0].body, /lunch/);
  assert.equal(reminders.dueReminders(at(date, '13:30')).length, 0, 'na het venster niet meer');

  // Versturen via (nagebootste) kanalen; daarna niet nog een keer
  const pushed = [];
  const n = await reminders.tick(at(date, '12:41'), { push: async (pid, payload) => { pushed.push(payload); return 1; }, link: null });
  assert.equal(n, 1);
  assert.match(pushed[0].url, /#\/vandaag\?log=lunch/, 'tik opent loggen voor de lunch');
  assert.equal(reminders.dueReminders(at(date, '12:45')).length, 0, 'al verstuurd');

  // Ander dag: lunch al gelogd → geen herinnering
  const next = '2031-01-16';
  const { id } = await send('POST', '/diary', { person_id: me.id, date: next, meal: 'lunch', type: 'free', name: 'Boterham', values: { kcal: 250 } });
  assert.equal(reminders.dueReminders(at(next, '12:40')).length, 0, 'al gelogd');
  const evening = reminders.dueReminders(at(next, '21:05'));
  assert.equal(evening[0].slot, 'avond');
  assert.match(evening[0].body, /250 kcal/);
  await send('DELETE', `/diary/${id}`);
});

test('Home Assistant: herinnering naar de Companion-app', async () => {
  const { startHaMock, haServer, ha, TOKEN, resetHa } = await import('./ha-mock.js');
  resetHa('storage');
  const url = await startHaMock();
  const rem = reminders.dueReminders(at('2031-01-17', '12:35'))[0];
  const sent = await reminders.sendReminder(rem, { push: async () => 0, link: { url, token: TOKEN, app_url: 'http://maaltijden.thuis' } });
  assert.equal(sent, 1);
  const note = ha.notifications.at(-1);
  assert.equal(note.service, 'mobile_app_telefoon');
  assert.match(note.message, /lunch/);
  assert.equal(note.data.clickAction, 'http://maaltijden.thuis/#/vandaag?log=lunch&persoon=' + me.id);
  haServer.close();
});

test('Android-app: rooster via geheime link, zonder al gelogde of voorbije momenten', async () => {
  const r = await get(`/reminders?persoon=${me.id}`);
  const link = r.schedule_url.replace(/^https?:\/\/[^/]+/, base.replace(/\/api$/, ''));
  const res = await fetch(link);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  const body = await res.json();
  assert.ok(body.reminders.length > 0);
  const s = reminders.scheduleFor(me.id, { days: 2, now: at('2031-01-20', '12:45') });
  assert.ok(!s.some((x) => x.date === '2031-01-20' && x.slot === 'lunch'), 'lunch vandaag is al voorbij');
  assert.ok(s.some((x) => x.date === '2031-01-21' && x.slot === 'lunch' && x.time === '12:30'));
  assert.equal(new Set(s.map((x) => x.id)).size, s.length, 'unieke id per melding');
  assert.equal((await fetch(link.replace(/meldingen\/[^/]+/, 'meldingen/fout'))).status, 404);
});

test('push-abonnement opslaan en opruimen', async () => {
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'BOr' + 'x'.repeat(80), auth: 'y'.repeat(22) } };
  assert.equal((await send('POST', '/push/subscribe', { person_id: me.id, subscription: sub })).ok, true);
  assert.equal((await get(`/reminders?persoon=${me.id}`)).push_devices, 1);
  assert.equal((await send('POST', '/push/subscribe', { person_id: me.id, subscription: { endpoint: 'http://onveilig' } })).status, 400);
  await send('POST', '/push/unsubscribe', { endpoint: sub.endpoint });
  assert.equal((await get(`/reminders?persoon=${me.id}`)).push_devices, 0);
});
