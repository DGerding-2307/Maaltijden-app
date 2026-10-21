// Home Assistant: overzicht van vandaag als JSON voor een REST-sensor, met een kant-en-klare Markdown-tekst voor een kaart.
// Beveiligd met een eigen geheime code in de link (los van de agenda-link), zodat het ook werkt met APP_PASSWORD.
import crypto from 'node:crypto';
import { getSetting, setSetting } from './db.js';
import * as repo from './repo.js';
import { mondayOf } from './seed.js';

export function haToken(regenerate = false) {
  let token = getSetting('ha_token', null);
  if (!token || regenerate) {
    token = crypto.randomBytes(18).toString('base64url');
    setSetting('ha_token', token);
  }
  return token;
}

const TZ = () => process.env.APP_TZ || process.env.TZ || 'Europe/Amsterdam';

/** Datum van vandaag (JJJJ-MM-DD) in de tijdzone van het huishouden – een container draait vaak in UTC. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const euro = (c) => (c == null ? null : `€ ${(c / 100).toFixed(2).replace('.', ',')}`);
const kcal = (n) => (n == null ? null : `${Math.round(n).toLocaleString('nl-NL')} kcal`);
const dayName = (iso) => new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function entryTitle(e) {
  if (e.recipe_id) return e.recipe_title + (e.extras?.length ? ` + ${e.extras.map((x) => x.name).join(', ')}` : '');
  return e.title || (e.extras?.length ? e.extras.map((x) => x.name).join(', ') : 'Losse ingrediënten');
}

/**
 * Overzicht van vandaag (en het diner van morgen) voor Home Assistant.
 * @param baseUrl adres van de app, voor links in de kaart
 */
export function todayOverview(baseUrl = '') {
  const today = todayISO();
  const meals = getSetting('meals', ['ontbijt', 'lunch', 'diner']);
  const plan = repo.getPlan(today, 2);
  const [day, tomorrow] = plan.days;
  const absolute = (u) => (!u ? null : /^https?:/.test(u) ? u : `${baseUrl}/${u.replace(/^\//, '')}`);

  const toItem = (e) => ({
    titel: entryTitle(e),
    personen: e.servings,
    kcal_pp: e.kcal_per_serving != null ? Math.round(e.kcal_per_serving) : null,
    kosten: e.leftover_of ? null : euro(e.cost_cents),
    restjes: !!e.leftover_of,
    recept_url: e.recipe_id ? `${baseUrl}/#/recept/${e.recipe_id}?personen=${e.servings}` : null,
    afbeelding: e.recipe_id ? absolute(e.image_url || null) : null,
  });
  const byMeal = Object.fromEntries(meals.map((m) => [m, day.entries.filter((e) => e.meal === m).map(toItem)]));
  const extra = day.entries.filter((e) => !meals.includes(e.meal)).map(toItem);

  // Boodschappen van deze week die nog gehaald moeten worden (zonder voorraadkast en ‘al in huis’)
  const shop = repo.getShoppingList(mondayOf(new Date(`${today}T12:00:00`)), 7);
  const open = shop.items.filter((i) => !i.checked && !i.have && !i.pantry);
  const openExtras = shop.extras.filter((x) => !x.checked);
  const openCost = open.reduce((s, i) => s + (i.cost_cents || 0), 0);

  const dinner = byMeal.diner?.[0] || null;
  const tomorrowDinner = tomorrow?.entries.find((e) => e.meal === 'diner');
  const nothing = !day.entries.length;

  const lines = [`### 🍽️ ${cap(dayName(today))}`, ''];
  for (const m of meals) {
    const items = byMeal[m];
    const text = items.length
      ? items.map((it) => `${it.recept_url ? `[${it.titel}](${it.recept_url})` : it.titel}${it.restjes ? ' ♻️' : ''}${it.kcal_pp != null ? ` · ${kcal(it.kcal_pp)}` : ''}`).join('<br>')
      : '–';
    lines.push(`**${cap(m)}**  \n${text}`, '');
  }
  if (extra.length) lines.push(`**Extra**  \n${extra.map((it) => it.titel).join('<br>')}`, '');
  if (!nothing) lines.push(`Totaal ${kcal(day.nutrition_per_person.kcal)} p.p. · ${euro(day.cost_cents)}`, '');
  lines.push(open.length || openExtras.length
    ? `🛒 Nog ${open.length + openExtras.length} boodschappen te halen${openCost ? ` (± ${euro(openCost)})` : ''}`
    : '🛒 Boodschappenlijst is klaar');
  if (tomorrowDinner) lines.push('', `Morgen: ${entryTitle(tomorrowDinner)}`);
  lines.push('', `[Open de planner](${baseUrl}/#/planner)`);

  return {
    datum: today,
    dag: dayName(today),
    // Hoofdwaarde van de sensor (max. 255 tekens): het diner van vandaag
    state: (dinner?.titel || (nothing ? 'Niets gepland' : day.entries.map(entryTitle).join(', '))).slice(0, 250),
    ...byMeal,
    extra,
    kcal_pp: Math.round(day.nutrition_per_person.kcal || 0),
    kosten: euro(day.cost_cents),
    boodschappen_open: open.length + openExtras.length,
    boodschappen_kosten: euro(openCost),
    boodschappen: [...open.map((i) => i.name), ...openExtras.map((x) => x.name)].slice(0, 60),
    morgen_diner: tomorrowDinner ? entryTitle(tomorrowDinner) : null,
    afbeelding: dinner?.afbeelding || null,
    planner_url: `${baseUrl}/#/planner`,
    markdown: lines.join('\n'),
  };
}

/** Kant-en-klare YAML voor configuration.yaml en de dashboardkaart. */
export function haConfig(baseUrl) {
  const url = `${baseUrl}/ha/${haToken()}/vandaag.json`;
  const sensor = `# In configuration.yaml (daarna Home Assistant herstarten)
rest:
  - resource: ${url}
    scan_interval: 300
    sensor:
      - name: "Maaltijden vandaag"
        unique_id: maaltijden_vandaag
        icon: mdi:silverware-fork-knife
        value_template: "{{ value_json.state }}"
        json_attributes:
          - datum
          - dag
          - ontbijt
          - lunch
          - diner
          - extra
          - kcal_pp
          - kosten
          - boodschappen_open
          - boodschappen_kosten
          - boodschappen
          - morgen_diner
          - afbeelding
          - planner_url
          - markdown
      - name: "Maaltijden boodschappen open"
        unique_id: maaltijden_boodschappen_open
        icon: mdi:cart-outline
        unit_of_measurement: "artikelen"
        value_template: "{{ value_json.boodschappen_open }}"`;
  const card = `type: markdown
title: Maaltijden
content: "{{ state_attr('sensor.maaltijden_vandaag', 'markdown') }}"`;
  return { url, sensor, card };
}

