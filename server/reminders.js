// Herinneringen om je maaltijd te loggen, verstuurd door het maatje.
// Alleen als je voor dat moment nog niets gelogd hebt, en nooit tussen 22:00 en 7:00.
// Drie manieren: pushmeldingen in de browser/webapp (Web Push), Home Assistant (Companion-app)
// en de Android-app (lokale meldingen, die plant de app zelf in met scheduleFor()).
import crypto from 'node:crypto';
import webpush from 'web-push';
import { getDb, getSetting, setSetting } from './db.js';
import { addDays } from './seed.js';
import { buddyOf } from './buddy.js';
import { haLink, haNotify } from './homeassistant.js';

export const SLOTS = ['ontbijt', 'lunch', 'diner', 'avond'];
export const DEFAULTS = {
  enabled: false,
  ontbijt: { on: true, time: '09:00' },
  lunch: { on: true, time: '13:00' },
  diner: { on: true, time: '19:00' },
  avond: { on: false, time: '21:00' },
  ha_service: '',
};
const QUIET_FROM = '22:00';
const QUIET_UNTIL = '07:00';
const WINDOW_MINUTES = 45; // te laat aangezet of server even uit: binnen dit venster alsnog sturen

const TZ = () => process.env.APP_TZ || process.env.TZ || 'Europe/Amsterdam';
const validTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Datum en tijd in de tijdzone van het huishouden. */
export function localNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, hour: Number(parts.hour) };
}

// ---------- Instellingen per persoon ----------

export function getReminders(personId) {
  const row = getDb().prepare('SELECT reminders FROM people WHERE id = ?').get(personId);
  const saved = row?.reminders ? JSON.parse(row.reminders) : {};
  const out = { ...DEFAULTS, ...saved };
  for (const s of SLOTS) out[s] = { ...DEFAULTS[s], ...(saved[s] || {}) };
  return out;
}

export function saveReminders(personId, data) {
  const cur = getReminders(personId);
  const next = { ...cur };
  if (data.enabled !== undefined) next.enabled = !!data.enabled;
  if (data.ha_service !== undefined) next.ha_service = String(data.ha_service || '').trim().replace(/^notify\./, '').replace(/[^\w]/g, '');
  for (const s of SLOTS) {
    if (!data[s]) continue;
    const time = data[s].time ?? cur[s].time;
    if (!validTime(time)) throw Object.assign(new Error(`Ongeldige tijd voor ${s}: gebruik uu:mm, bv. 13:00`), { status: 400 });
    if (toMin(time) >= toMin(QUIET_FROM) || toMin(time) < toMin(QUIET_UNTIL)) {
      throw Object.assign(new Error(`Tussen ${QUIET_FROM} en ${QUIET_UNTIL} stuurt het maatje geen meldingen. Kies een andere tijd voor ${s}.`), { status: 400 });
    }
    next[s] = { on: data[s].on ?? cur[s].on, time };
  }
  getDb().prepare('UPDATE people SET reminders = ? WHERE id = ?').run(JSON.stringify(next), personId);
  return next;
}

// ---------- Teksten ----------

function loggedMeals(personId, date) {
  return new Set(getDb().prepare('SELECT DISTINCT meal FROM food_log WHERE person_id = ? AND date = ?').all(personId, date).map((r) => r.meal));
}

export function messageFor(slot, person, { kcal = 0, logged = 0 } = {}) {
  const name = buddyOf(person).name;
  if (slot === 'avond') {
    return logged
      ? { title: `${name} 🐶`, body: `Wat een fijne dag! Je logde vandaag ${Math.round(kcal)} kcal. Nog iets vergeten? Welterusten 💤`, meal: 'tussendoor' }
      : { title: `${name} 🐶`, body: 'Woef? Je hebt vandaag nog niets gelogd. Even samen terugkijken wat je at?', meal: 'diner' };
  }
  return { title: `${name} 🐶`, body: `Woef! Ik heb honger… wat heb jij als ${slot} gegeten? Tik om te loggen.`, meal: slot };
}

// ---------- Wat moet er nu verstuurd worden? ----------

/** Herinneringen die nu aan de beurt zijn (nog niet verstuurd, nog niets gelogd). */
export function dueReminders(now = new Date()) {
  const { date, time } = localNow(now);
  const nowMin = toMin(time);
  const db = getDb();
  const out = [];
  for (const person of db.prepare('SELECT * FROM people').all()) {
    const r = getReminders(person.id);
    if (!r.enabled) continue;
    const logged = loggedMeals(person.id, date);
    for (const slot of SLOTS) {
      const s = r[slot];
      if (!s.on || nowMin < toMin(s.time) || nowMin > toMin(s.time) + WINDOW_MINUTES) continue;
      if (slot !== 'avond' && logged.has(slot)) continue;
      if (db.prepare('SELECT 1 FROM reminder_sent WHERE person_id = ? AND date = ? AND slot = ?').get(person.id, date, slot)) continue;
      const totals = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(kcal), 0) kcal FROM food_log WHERE person_id = ? AND date = ?').get(person.id, date);
      out.push({ person, slot, date, ha_service: r.ha_service, ...messageFor(slot, person, { kcal: totals.kcal, logged: totals.n }) });
    }
  }
  return out;
}

/**
 * Herinneringen voor de komende dagen, voor de Android-app (die plant ze als lokale meldingen).
 * Momenten van vandaag die al voorbij of al gelogd zijn, vallen weg.
 */
export function scheduleFor(personId, { days = 7, now = new Date() } = {}) {
  const person = getDb().prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person) return [];
  const r = getReminders(personId);
  if (!r.enabled) return [];
  const { date: today, time } = localNow(now);
  const logged = loggedMeals(personId, today);
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    for (const [n, slot] of SLOTS.entries()) {
      const s = r[slot];
      if (!s.on) continue;
      if (i === 0 && (toMin(s.time) <= toMin(time) || (slot !== 'avond' && logged.has(slot)))) continue;
      const msg = messageFor(slot, person, { logged: 1, kcal: 0 });
      if (slot === 'avond') msg.body = 'Hoe was je dag? Kijk even of je alles gelogd hebt 🐾';
      // Uniek getal per persoon/dag/moment (Android wil een geheel getal)
      const id = Number(`${personId % 1000}${date.replaceAll('-', '').slice(2)}${n}`) % 2147483647;
      out.push({ id, date, time: s.time, slot, title: msg.title, body: msg.body, url: `/#/vandaag?log=${msg.meal}&persoon=${personId}` });
    }
  }
  return out;
}

/** Geheime code voor de link waarmee de Android-app het rooster ophaalt (werkt ook met APP_PASSWORD). */
export function reminderToken(regenerate = false) {
  let token = getSetting('reminder_token', null);
  if (!token || regenerate) {
    token = crypto.randomBytes(18).toString('base64url');
    setSetting('reminder_token', token);
  }
  return token;
}

// ---------- Web Push ----------

export function vapidKeys() {
  let keys = getSetting('vapid_keys', null);
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    setSetting('vapid_keys', keys);
  }
  return keys;
}

export function saveSubscription(personId, sub) {
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw Object.assign(new Error('Ongeldig push-abonnement'), { status: 400 });
  }
  getDb().prepare(`INSERT INTO push_subscriptions (person_id, endpoint, keys) VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET person_id = excluded.person_id, keys = excluded.keys`)
    .run(personId, sub.endpoint, JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth }));
}

export function removeSubscription(endpoint) {
  getDb().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(endpoint || ''));
}

export function subscriptionCount(personId) {
  return getDb().prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE person_id = ?').get(personId).c;
}

async function sendWebPush(personId, payload) {
  const subs = getDb().prepare('SELECT * FROM push_subscriptions WHERE person_id = ?').all(personId);
  if (!subs.length) return 0;
  const keys = vapidKeys();
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, JSON.stringify(payload), {
        vapidDetails: { subject: 'https://github.com/DGerding-2307/Maaltijden-app', publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60,
      });
      sent++;
    } catch (err) {
      // Abonnement verlopen of ingetrokken: opruimen
      if (err.statusCode === 404 || err.statusCode === 410) removeSubscription(s.endpoint);
      else console.warn(`Push mislukt: ${err.message}`);
    }
  }
  return sent;
}

/** Eén herinnering versturen via alle ingestelde kanalen. */
export async function sendReminder(rem, { push = sendWebPush, ha = haNotify, link = haLink() } = {}) {
  const url = `/#/vandaag?log=${rem.meal}&persoon=${rem.person.id}`;
  const payload = { title: rem.title, body: rem.body, url, tag: `maaltijden-${rem.slot}` };
  let channels = 0;
  channels += (await push(rem.person.id, payload)) ? 1 : 0;
  if (rem.ha_service && link) {
    try {
      await ha(link, rem.ha_service, { title: rem.title, message: rem.body, data: { url: `${link.app_url}${url}`, clickAction: `${link.app_url}${url}`, tag: payload.tag } });
      channels++;
    } catch (err) { console.warn(`Home Assistant-melding mislukt: ${err.message}`); }
  }
  return channels;
}

/** Elke minuut: herinneringen die aan de beurt zijn versturen en onthouden. */
export async function tick(now = new Date(), senders = {}) {
  const due = dueReminders(now);
  for (const rem of due) {
    getDb().prepare('INSERT OR IGNORE INTO reminder_sent (person_id, date, slot) VALUES (?, ?, ?)').run(rem.person.id, rem.date, rem.slot);
    await sendReminder(rem, senders).catch((err) => console.warn(`Herinnering mislukt: ${err.message}`));
  }
  // Oude registraties opruimen
  getDb().prepare('DELETE FROM reminder_sent WHERE date < ?').run(addDays(localNow(now).date, -7));
  return due.length;
}

let timer = null;
export function startReminders() {
  if (timer || process.env.REMINDERS_DISABLED === '1') return;
  timer = setInterval(() => tick().catch((err) => console.warn(`Herinneringen: ${err.message}`)), 60 * 1000);
  timer.unref?.();
}

/** Testmelding naar alle kanalen van een persoon. */
export async function testReminder(personId) {
  const person = getDb().prepare('SELECT * FROM people WHERE id = ?').get(personId);
  if (!person) throw Object.assign(new Error('Persoon niet gevonden'), { status: 404 });
  const r = getReminders(personId);
  const name = buddyOf(person).name;
  const sent = await sendReminder({ person, slot: 'test', meal: 'lunch', ha_service: r.ha_service, title: `${name} 🐶`, body: 'Woef! Zo zien mijn herinneringen eruit. Tot straks!' });
  return { sent, push_devices: subscriptionCount(personId), home_assistant: !!(r.ha_service && haLink()) };
}
