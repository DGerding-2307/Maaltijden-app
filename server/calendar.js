// Agenda-abonnement (iCalendar/ICS) voor Google Agenda, Apple Agenda, Outlook enz.
// Bevat de geplande maaltijden, per persoon het dagtotaal uit het dagboek en de gewichtsmetingen.
// De link bevat een geheime sleutel, zodat agenda-apps hem zonder inloggen kunnen ophalen.
import crypto from 'node:crypto';
import { getSetting, setSetting, getDb } from './db.js';
import * as repo from './repo.js';
import * as tracker from './tracker.js';
import { addDays, mondayOf } from './seed.js';

// Tijden in de agenda per maaltijdmoment (lokale tijd)
const MEAL_TIMES = { ontbijt: ['0800', 30], lunch: ['1230', 30], diner: ['1800', 60], tussendoor: ['1530', 15] };

export function calendarToken(regenerate = false) {
  let token = getSetting('calendar_token', null);
  if (!token || regenerate) {
    token = crypto.randomBytes(18).toString('base64url');
    setSetting('calendar_token', token);
  }
  return token;
}

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (iso) => iso.replaceAll('-', '');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/** Regels van max. 75 tekens, zoals de ICS-standaard voorschrijft. */
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

function event({ uid, date, time, minutes, summary, description }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}@maaltijden`, `DTSTAMP:${stamp()}`];
  if (time) {
    const start = `${ymd(date)}T${time}00`;
    const endMin = Number(time.slice(0, 2)) * 60 + Number(time.slice(2)) + minutes;
    const end = `${ymd(date)}T${String(Math.floor(endMin / 60)).padStart(2, '0')}${String(endMin % 60).padStart(2, '0')}00`;
    lines.push(`DTSTART:${start}`, `DTEND:${end}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(addDays(date, 1))}`, 'TRANSP:TRANSPARENT');
  }
  lines.push(`SUMMARY:${esc(summary)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

/**
 * @param baseUrl adres van de app, voor links in de omschrijving
 * @param pastDays / futureDays periode rond vandaag
 */
export function buildIcs({ baseUrl = '', pastDays = 60, futureDays = 28 } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -pastDays);
  const to = addDays(today, futureDays);
  const events = [];

  // Geplande maaltijden
  for (let week = mondayOf(new Date(`${from}T12:00:00`)); week <= to; week = addDays(week, 7)) {
    for (const day of repo.getPlan(week, 7).days) {
      if (day.date < from || day.date > to) continue;
      for (const e of day.entries) {
        const [time, minutes] = MEAL_TIMES[e.meal] || MEAL_TIMES.tussendoor;
        const title = `${e.recipe_id ? e.recipe_title : e.title}${e.extras?.length ? ` + ${e.extras.map((x) => x.name).join(', ')}` : ''}`;
        const extra = e.leftover_of ? ' (restjes)' : '';
        const desc = [
          `${e.meal} · ${e.servings} ${e.servings === 1 ? 'persoon' : 'personen'}`,
          e.kcal_per_serving ? `${Math.round(e.kcal_per_serving)} kcal per persoon` : null,
          e.note || null,
          e.recipe_id && baseUrl ? `Recept: ${baseUrl}/#/recept/${e.recipe_id}` : null,
        ].filter(Boolean).join('\n');
        events.push(event({ uid: `plan-${e.id}`, date: day.date, time, minutes, summary: `🍽️ ${title}${extra}`, description: desc }));
      }
    }
  }

  // Dagboek en gewicht per persoon
  const people = tracker.listPeople();
  const multi = people.length > 1;
  for (const p of people) {
    const s = tracker.summary(p.id, from, today);
    const who = multi ? `${p.name}: ` : '';
    for (const d of s.days) {
      if (d.entries) {
        const entries = getDb().prepare('SELECT meal, name, kcal FROM food_log WHERE person_id = ? AND date = ? ORDER BY id').all(p.id, d.date);
        events.push(event({
          uid: `log-${p.id}-${d.date}`,
          date: d.date,
          summary: `🔥 ${who}${d.kcal} / ${s.target_kcal} kcal`,
          description: [`Eiwit ${d.protein} g · koolhydraten ${d.carbs} g · vet ${d.fat} g`, '',
            ...entries.map((x) => `${x.meal}: ${x.name} (${Math.round(x.kcal)} kcal)`),
            baseUrl ? `\nDagboek: ${baseUrl}/#/dagboek?datum=${d.date}&persoon=${p.id}` : ''].join('\n'),
        }));
      }
      if (d.weight_kg) {
        events.push(event({ uid: `weight-${p.id}-${d.date}`, date: d.date, summary: `⚖️ ${who}${String(d.weight_kg).replace('.', ',')} kg` }));
      }
    }
  }

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Maaltijden//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Maaltijden', 'X-WR-TIMEZONE:Europe/Amsterdam', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
