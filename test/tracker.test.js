import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_FILE = ':memory:';
process.env.OFF_DISABLED = '1';
const { openDatabase } = await import('../server/db.js');
const { createApp } = await import('../server/index.js');
const { withTargets } = await import('../server/tracker.js');
const { mondayOf } = await import('../server/seed.js');

let server;
let root;
let base;
before(async () => {
  openDatabase(':memory:');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  root = `http://localhost:${server.address().port}`;
  base = `${root}/api`;
});
after(() => server.close());

const get = (p) => fetch(base + p).then((r) => r.json());
const send = (method, p, body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const today = new Date().toISOString().slice(0, 10);

test('dagdoel volgens Mifflin-St Jeor, met ondergrens en handmatige waarde', () => {
  const year = new Date().getFullYear();
  const p = withTargets({ id: -1, sex: 'm', birth_year: year - 40, height_cm: 180, start_weight_kg: 80, activity: 1.55, goal: 'onderhoud' });
  // 10*80 + 6.25*180 - 5*40 + 5 = 1730 → × 1,55 = 2681,5
  assert.equal(p.bmr, 1730);
  assert.equal(p.targets.kcal, 2680);
  assert.equal(p.target_source, 'berekend');
  assert.equal(p.bmi, 24.7);
  assert.equal(p.targets.protein, 101); // 15% van 2680 kcal > 1,2 g/kg
  const small = withTargets({ id: -1, sex: 'v', birth_year: year - 70, height_cm: 150, start_weight_kg: 45, activity: 1.2, goal: 'afvallen' });
  assert.equal(small.targets.kcal, 1200);
  assert.equal(withTargets({ id: -1, kcal_target_override: 1850 }).targets.kcal, 1850);
  assert.equal(withTargets({ id: -1 }).targets.kcal, 2000);
});

test('personen beheren; er blijft er altijd één', async () => {
  const { people } = await get('/people');
  assert.equal(people.length, 1);
  assert.equal(people[0].name, 'Ik');
  const anna = await send('POST', '/people', { name: 'Anna', sex: 'v', birth_year: 1990, height_cm: 168, start_weight_kg: 64, goal: 'afvallen' });
  assert.equal(anna.target_source, 'berekend');
  const upd = await send('PUT', `/people/${anna.id}`, { kcal_target_override: 1700 });
  assert.equal(upd.targets.kcal, 1700);
  assert.equal(upd.name, 'Anna');
  assert.equal((await send('DELETE', `/people/${anna.id}`)).status, 200);
  assert.equal((await send('DELETE', `/people/${people[0].id}`)).status, 400);
});

test('dagboek: recept, ingrediënt en vrije invoer; porties schalen mee', async () => {
  const me = (await get('/people')).people[0];
  const foods = await get('/foods?q=butter');
  const recipe = foods.recipes.find((r) => /butter chicken/i.test(r.title));
  assert.ok(recipe, 'butter chicken vindbaar');
  const full = await get(`/recipes/${recipe.id}`);

  const r1 = await send('POST', '/diary', { person_id: me.id, date: today, meal: 'diner', type: 'recipe', recipe_id: recipe.id, servings: 1 });
  const ing = (await get('/foods?q=banaan')).ingredients[0];
  await send('POST', '/diary', { person_id: me.id, date: today, meal: 'ontbijt', type: 'ingredient', ingredient_id: ing.id, grams: 120 });
  await send('POST', '/diary', { person_id: me.id, date: today, meal: 'tussendoor', type: 'free', name: 'Stroopwafel', values: { kcal: 130, carbs: 20 } });
  assert.equal((await send('POST', '/diary', { person_id: me.id, date: today, type: 'free', name: 'Leeg', values: {} })).status, 400);

  let day = await get(`/diary?persoon=${me.id}&datum=${today}`);
  const recipeKcal = Math.round(full.nutrition_per_serving.kcal);
  const bananaKcal = Math.round((ing.kcal * 120) / 100);
  assert.ok(Math.abs(day.totals.kcal - (recipeKcal + bananaKcal + 130)) <= 1, `totaal ${day.totals.kcal}`);
  assert.equal(day.meals.find((m) => m.meal === 'tussendoor').entries[0].name, 'Stroopwafel');

  await send('PUT', `/diary/${r1.id}`, { servings: 2 });
  day = await get(`/diary?persoon=${me.id}&datum=${today}`);
  const diner = day.meals.find((m) => m.meal === 'diner');
  assert.ok(Math.abs(diner.totals.kcal - 2 * full.nutrition_per_serving.kcal) <= 1);

  // Kopie naar morgen, daarna weer opruimen
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  assert.equal((await send('POST', '/diary/copy', { person_id: me.id, from: today, to: tomorrow })).copied, 3);
  const sum = await get(`/diary/summary?persoon=${me.id}&van=${today}&tot=${tomorrow}`);
  assert.equal(sum.days.length, 2);
  assert.equal(sum.days[0].kcal, sum.days[1].kcal);
  assert.equal(sum.logged_days, 2);
  for (const m of (await get(`/diary?persoon=${me.id}&datum=${tomorrow}`)).meals) for (const e of m.entries) await send('DELETE', `/diary/${e.id}`);
});

test('geplande maaltijd als gegeten registreren; zichtbaar in de planner', async () => {
  const me = (await get('/people')).people[0];
  const recipe = (await get('/recipes'))[0];
  const date = new Date(Date.parse(today) + 2 * 86400000).toISOString().slice(0, 10);
  const plan = await send('POST', '/plan', { date, meal: 'lunch', recipe_id: recipe.id, servings: 2 });
  let day = await get(`/diary?persoon=${me.id}&datum=${date}`);
  const mine = () => day.planned.find((x) => x.id === plan.id);
  assert.equal(mine().logged, false);
  assert.equal((await send('POST', '/diary/from-plan', { person_id: me.id, date, plan_entry_id: plan.id })).added, 1);
  // Nog een keer doet niets dubbel
  assert.equal((await send('POST', '/diary/from-plan', { person_id: me.id, date, plan_entry_id: plan.id })).added, 0);
  day = await get(`/diary?persoon=${me.id}&datum=${date}`);
  assert.equal(mine().logged, true);
  assert.equal(day.meals.find((m) => m.meal === 'lunch').entries.find((e) => e.plan_entry_id === plan.id).servings, 1);

  const week = await get(`/plan?week=${mondayOf(new Date(`${date}T12:00:00`))}&persoon=${me.id}`);
  const d = week.days.find((x) => x.date === date);
  assert.equal(d.entries.find((e) => e.id === plan.id).eaten, true);
  assert.ok(d.diary.kcal > 0);
  assert.ok(d.diary.target_kcal > 0);
  // Zonder persoon geen dagboekvelden
  assert.equal((await get(`/plan?week=${week.start}`)).days[0].diary, undefined);
});

test('gewicht loggen met trend, verandering en afstand tot doel', async () => {
  const p = await send('POST', '/people', { name: 'Weger', sex: 'm', birth_year: 1985, height_cm: 182, start_weight_kg: 92, target_weight_kg: 85 });
  const day = (n) => new Date(Date.parse(today) - n * 86400000).toISOString().slice(0, 10);
  for (const [n, w] of [[21, '92,0'], [14, 91.2], [7, 90.6], [0, 90.0]]) {
    const r = await send('PUT', '/weight', { person_id: p.id, date: day(n), weight_kg: w });
    assert.equal(r.status, 200);
  }
  await send('PUT', '/weight', { person_id: p.id, date: day(0), weight_kg: 89.8 }); // zelfde dag = overschrijven
  assert.equal((await send('PUT', '/weight', { person_id: p.id, date: today, weight_kg: 'abc' })).status, 400);
  const h = await get(`/weight?persoon=${p.id}`);
  assert.equal(h.entries.length, 4);
  assert.equal(h.entries.at(-1).weight_kg, 89.8);
  assert.equal(h.change_kg, -2.2);
  assert.equal(h.to_goal_kg, 4.8);
  assert.ok(h.per_week_kg < 0 && h.per_week_kg > -1, String(h.per_week_kg));
  assert.equal(h.person.current_weight_kg, 89.8);
  await send('DELETE', `/people/${p.id}`);
});

test('agenda-abonnement (ICS) met maaltijden, dagtotaal en gewicht', async () => {
  const me = (await get('/people')).people[0];
  await send('PUT', '/weight', { person_id: me.id, date: today, weight_kg: 77.5 });
  await send('POST', '/diary', { person_id: me.id, date: today, meal: 'lunch', type: 'free', name: 'Broodje kaas; met tomaat, sla', values: { kcal: 420 } });
  const { url } = await get('/calendar');
  assert.match(url, /\/agenda\/[\w-]+\.ics$/);
  const res = await fetch(url.replace(/^http:\/\/[^/]+/, root));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  const ics = await res.text();
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.match(ics, /SUMMARY:🍽️ /);
  assert.match(ics, /SUMMARY:🔥 \d+ \/ \d+ kcal/);
  assert.match(ics, /SUMMARY:⚖️ 77\\,5 kg/);
  assert.match(ics.replace(/\r\n /g, ''), /Broodje kaas\\; met tomaat\\, sla/);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);

  // Nieuwe link: de oude werkt niet meer
  const { url: url2 } = await send('POST', '/calendar/new-link');
  assert.notEqual(url2, url);
  assert.equal((await fetch(url.replace(/^http:\/\/[^/]+/, root))).status, 404);
  assert.equal((await fetch(url2.replace(/^http:\/\/[^/]+/, root))).status, 200);
  // De sleutel zit niet in de back-up
  const backup = await get('/backup');
  assert.ok(!JSON.stringify(backup.settings || {}).includes('calendar_token'));
  assert.ok(backup.people?.length >= 1 || backup.tables?.people?.length >= 1 || JSON.stringify(backup).includes('weight_log'));
});
