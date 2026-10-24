// Home Assistant: overzicht van vandaag als JSON voor een REST-sensor, met een kant-en-klare Markdown-tekst voor een kaart.
// Beveiligd met een eigen geheime code in de link (los van de agenda-link), zodat het ook werkt met APP_PASSWORD.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { uploadDir, publicDir } from './paths.js';
import { getSetting, setSetting } from './db.js';
import * as repo from './repo.js';
import * as tracker from './tracker.js';
import { mondayOf, addDays } from './seed.js';

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
const eur = (c) => (c == null ? null : Math.round(c) / 100);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function entryTitle(e) {
  if (e.recipe_id) return e.recipe_title + (e.extras?.length ? ` + ${e.extras.map((x) => x.name).join(', ')}` : '');
  return e.title || (e.extras?.length ? e.extras.map((x) => x.name).join(', ') : 'Losse ingrediënten');
}

/**
 * Overzicht van vandaag (en het diner van morgen) voor Home Assistant.
 * @param baseUrl adres van de app, voor links in de kaart
 */
const FALLBACK_IMAGE = 'icons/icon-512.png';
const absoluteUrl = (u, baseUrl) => (!u ? null : /^https?:/.test(u) ? u : `${baseUrl}/${u.replace(/^\//, '')}`);

/** Foto bij een geplande maaltijd: van het recept, anders van een ingrediënt erbij of met dezelfde naam, anders het app-icoon. */
function entryImage(e) {
  return e.image_url
    || e.extras?.find((x) => x.image_url)?.image_url
    || (e.title ? repo.matchIngredient(e.title)?.image_url : null)
    || FALLBACK_IMAGE;
}

/** Foto bij een artikel op de boodschappenlijst. */
const shopImage = (name, image) => image || repo.matchIngredient(name)?.image_url || FALLBACK_IMAGE;

/** Eén geplande maaltijd voor Home Assistant (vandaag, morgen en de week). */
function itemOf(e, baseUrl) {
  return {
    titel: entryTitle(e),
    personen: e.servings,
    kcal_pp: e.kcal_per_serving != null ? Math.round(e.kcal_per_serving) : null,
    kosten: e.leftover_of || e.no_shopping ? null : euro(e.cost_cents),
    restjes: !!(e.leftover_of || e.no_shopping),
    recept_url: e.recipe_id ? `${baseUrl}/#/recept/${e.recipe_id}?personen=${e.servings}` : null,
    afbeelding: absoluteUrl(entryImage(e), baseUrl),
  };
}

export function todayOverview(baseUrl = '') {
  const today = todayISO();
  const meals = getSetting('meals', ['ontbijt', 'lunch', 'diner']);
  const plan = repo.getPlan(today, 2);
  const [day, tomorrow] = plan.days;
  const toItem = (e) => itemOf(e, baseUrl);
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
    kosten_eur: eur(day.cost_cents),
    boodschappen_kosten_eur: eur(openCost),
    morgen_diner: tomorrowDinner ? entryTitle(tomorrowDinner) : null,
    afbeelding: dinner?.afbeelding || null,
    planner_url: `${baseUrl}/#/planner`,
    markdown: lines.join('\n'),
  };
}

/** Korte naam voor een entiteit: "Anne-Marie" → "anne_marie". */
export function slug(name, id) {
  const base = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return base || `persoon_${id}`;
}

function personSlugs() {
  const used = new Set();
  return tracker.listPeople().map((p) => {
    let k = slug(p.name, p.id);
    if (used.has(k)) k = `${k}_${p.id}`;
    used.add(k);
    return { person: p, key: k };
  });
}

/** Maaltijden van één dag als korte lijst per moment (voor morgen en de week). */
function dayMeals(day, meals, baseUrl) {
  const items = (m) => day.entries.filter((e) => e.meal === m).map((e) => itemOf(e, baseUrl));
  const dinner = day.entries.find((e) => e.meal === 'diner') || day.entries[0];
  return {
    ...Object.fromEntries(meals.map((m) => [m, items(m)])),
    extra: day.entries.filter((e) => !meals.includes(e.meal)).map((e) => itemOf(e, baseUrl)),
    afbeelding: absoluteUrl(dinner ? entryImage(dinner) : FALLBACK_IMAGE, baseUrl),
    kcal_pp: Math.round(day.nutrition_per_person.kcal || 0),
    kosten: euro(day.cost_cents),
    kosten_eur: eur(day.cost_cents),
  };
}

/**
 * Alle sensoren voor Home Assistant: vandaag, morgen, de week, boodschappen en per persoon calorieën en gewicht.
 * Elke sensor: { key, entity_id, state, attributes }.
 */
export function haSensors(baseUrl = '') {
  const today = todayISO();
  const meals = getSetting('meals', ['ontbijt', 'lunch', 'diner']);
  const { state, ...vandaag } = todayOverview(baseUrl);
  const out = [];
  const add = (key, stateValue, attributes) => out.push({ key, entity_id: `sensor.maaltijden_${key}`, state: String(stateValue ?? 'onbekend').slice(0, 250), attributes });

  add('vandaag', state, {
    ...vandaag, friendly_name: 'Maaltijden vandaag', icon: 'mdi:silverware-fork-knife', entity_picture: vandaag.afbeelding || undefined,
  });

  // Morgen
  const tomorrow = repo.getPlan(addDays(today, 1), 1).days[0];
  const m = dayMeals(tomorrow, meals, baseUrl);
  add('morgen', m.diner?.[0]?.titel || (tomorrow.entries.length ? tomorrow.entries.map(entryTitle).join(', ') : 'Niets gepland'), {
    datum: tomorrow.date, dag: dayName(tomorrow.date), ...m,
    friendly_name: 'Maaltijden morgen', icon: 'mdi:calendar-arrow-right', entity_picture: m.afbeelding || undefined,
  });

  // Deze week (maandag t/m zondag)
  const monday = mondayOf(new Date(`${today}T12:00:00`));
  const week = repo.getPlan(monday, 7);
  const budget = getSetting('weekly_budget_cents', null);
  const days = week.days.map((d) => ({ datum: d.date, dag: dayName(d.date), ...dayMeals(d, meals, baseUrl) }));
  const weekLines = ['| Dag | ' + meals.map(cap).join(' | ') + ' |', '|---|' + meals.map(() => '---').join('|') + '|'];
  for (const d of days) weekLines.push(`| ${d.datum === today ? '**' : ''}${cap(d.dag.split(' ')[0])}${d.datum === today ? '**' : ''} | ${meals.map((x) => d[x].map((i) => i.titel).join(', ') || '–').join(' | ')} |`);
  weekLines.push('', `Totaal ${euro(week.total_cost_cents)}${budget ? ` van ${euro(budget)} budget` : ''}`);
  add('week', eur(week.total_cost_cents), {
    van: week.start, tot: week.end, dagen: days,
    maaltijden: week.days.reduce((n, d) => n + d.entries.length, 0),
    budget: euro(budget), budget_eur: eur(budget),
    over_budget: budget ? week.total_cost_cents > budget : false,
    markdown: weekLines.join('\n'),
    friendly_name: 'Maaltijden kosten deze week', icon: 'mdi:calendar-week', unit_of_measurement: '€', state_class: 'measurement',
    entity_picture: days.find((d) => d.datum === today)?.afbeelding || undefined,
  });

  // Komende 7 dagen (rollend: vandaag t/m over 6 dagen, ongeacht de kalenderweek)
  const next = repo.getPlan(today, 7);
  const nextDays = next.days.map((d) => ({ datum: d.date, dag: dayName(d.date), ...dayMeals(d, meals, baseUrl) }));
  const nextCost = next.days.reduce((s, d) => s + (d.cost_cents || 0), 0);
  const nextLines = ['| Dag | Diner | Personen |', '|---|---|---|'];
  for (const d of nextDays) {
    const dn = d.diner || [];
    nextLines.push(`| ${d.datum === today ? '**' : ''}${cap(d.dag.split(' ')[0])}${d.datum === today ? '**' : ''} | ${dn.map((i) => i.titel).join(', ') || '–'} | ${dn.length ? Math.max(...dn.map((i) => i.personen || 0)) : '–'} |`);
  }
  nextLines.push('', `Totaal ${euro(nextCost)}`);
  add('komende_7_dagen', eur(nextCost), {
    van: next.start, tot: next.end, dagen: nextDays,
    maaltijden: next.days.reduce((n, d) => n + d.entries.length, 0),
    budget: euro(budget), budget_eur: eur(budget),
    markdown: nextLines.join('\n'),
    friendly_name: 'Maaltijden komende 7 dagen', icon: 'mdi:calendar-range', unit_of_measurement: '€', state_class: 'measurement',
    entity_picture: nextDays[0]?.afbeelding || undefined,
  });

  // Boodschappen
  const shop = repo.getShoppingList(monday, 7);
  const open = shop.items.filter((i) => !i.checked && !i.have && !i.pantry);
  const openExtras = shop.extras.filter((x) => !x.checked);
  const perCat = {};
  for (const i of open) (perCat[i.category] ||= []).push(i.name);
  if (openExtras.length) perCat['Eigen artikelen'] = openExtras.map((x) => x.name);
  const amount = (i) => (i.packages && i.package_label ? `${i.packages}× ${i.package_label}`
    : i.unit === 'g' || !i.quantity ? `${Math.round(i.grams)} g` : `${i.quantity} ${i.unit}`);
  const artikelen = [
    ...open.map((i) => ({ naam: i.name, categorie: i.category, hoeveelheid: amount(i), kosten: euro(i.cost_cents), afbeelding: absoluteUrl(shopImage(i.name, i.image_url), baseUrl) })),
    ...openExtras.map((x) => ({ naam: x.name, categorie: 'Eigen artikelen', hoeveelheid: null, kosten: null, afbeelding: absoluteUrl(shopImage(x.name), baseUrl) })),
  ].slice(0, 60);
  add('boodschappen_open', open.length + openExtras.length, {
    boodschappen: vandaag.boodschappen, per_categorie: perCat, artikelen,
    kosten: vandaag.boodschappen_kosten, kosten_eur: vandaag.boodschappen_kosten_eur,
    afgevinkt: shop.items.filter((i) => i.checked).length + shop.extras.filter((x) => x.checked).length,
    totaal: shop.items.length + shop.extras.length,
    friendly_name: 'Maaltijden boodschappen open', icon: 'mdi:cart-outline', unit_of_measurement: 'artikelen',
  });

  // Per persoon: gegeten vandaag (dagboek) en gewicht
  for (const { person, key } of personSlugs()) {
    const d = tracker.getDay(person.id, today);
    const t = d.totals;
    add(`${key}_kcal`, Math.round(t.kcal || 0), {
      naam: person.name, doel: d.targets.kcal, over: Math.max(0, d.targets.kcal - Math.round(t.kcal || 0)),
      procent: d.targets.kcal ? Math.round(((t.kcal || 0) / d.targets.kcal) * 100) : null,
      eiwit: t.protein, koolhydraten: t.carbs, vet: t.fat, vezels: t.fiber, suiker: t.sugar, zout: t.salt,
      doel_eiwit: d.targets.protein,
      per_maaltijd: Object.fromEntries(d.meals.map((x) => [x.meal, Math.round(x.totals.kcal || 0)])),
      gegeten: d.meals.flatMap((x) => x.entries.map((e) => e.name)).filter(Boolean),
      friendly_name: `${person.name} kcal vandaag`, icon: 'mdi:fire', unit_of_measurement: 'kcal', state_class: 'measurement',
    });
    const w = tracker.weightHistory(person.id, 90);
    const last = w.entries.at(-1);
    add(`${key}_gewicht`, last ? last.weight_kg : (person.current_weight_kg ?? 'onbekend'), {
      naam: person.name, datum: last?.date || null, trend: last?.trend_kg ?? null,
      doel: person.target_weight_kg ?? null, nog_te_gaan: w.to_goal_kg, per_week: w.per_week_kg, bmi: person.bmi,
      friendly_name: `${person.name} gewicht`, icon: 'mdi:scale-bathroom', unit_of_measurement: 'kg', device_class: 'weight', state_class: 'measurement',
    });
  }
  return out;
}

/** Alle sensoren als JSON voor de YAML-route (één link, één sensor per onderdeel). */
export function haSensorsJson(baseUrl) {
  return Object.fromEntries(haSensors(baseUrl).map((x) => [x.key, { state: x.state, ...x.attributes }]));
}

const HA_META = new Set(['friendly_name', 'icon', 'unit_of_measurement', 'device_class', 'state_class', 'entity_picture']);
const yamlList = (items, indent) => items.map((i) => `${' '.repeat(indent)}- ${i}`).join('\n');

/** Voorbeelden om zelf een kaart (of automatisering) te maken. */
function haExamples(sensors) {
  const people = sensors.filter((x) => x.key.endsWith('_kcal'));
  const first = people[0];
  const p = first ? first.key.replace(/_kcal$/, '') : 'ik';
  const doel = first?.attributes.doel || 2000;
  const ex = [
    { title: 'Overzicht van vandaag', yaml: `type: markdown
title: Maaltijden
content: "{{ state_attr('sensor.maaltijden_vandaag', 'markdown') }}"` },
    { title: 'Eigen kaart: kies zelf wat je ziet', description: 'Haal regels weg of zet ze in een andere volgorde. Alle attributen staan hieronder bij de sensoren.', yaml: `type: markdown
title: Eten
content: |
  {% set v = states.sensor.maaltijden_vandaag.attributes %}
  {% set m = states.sensor.maaltijden_morgen.attributes %}
  **Vandaag:** {{ states('sensor.maaltijden_vandaag') }}
  {% for x in v.lunch %}Lunch: {{ x.titel }}{% if x.kcal_pp %} ({{ x.kcal_pp }} kcal){% endif %}
  {% endfor %}
  {{ v.kcal_pp }} kcal p.p. · {{ v.kosten or '–' }}

  **Morgen:** {{ states('sensor.maaltijden_morgen') }}

  🛒 {{ states('sensor.maaltijden_boodschappen_open') }} boodschappen te halen
  ({{ state_attr('sensor.maaltijden_boodschappen_open', 'kosten') or '–' }})` },
    { title: 'De hele week', yaml: `type: markdown
title: Deze week
content: "{{ state_attr('sensor.maaltijden_week', 'markdown') }}"` },
    { title: 'Week zelf opmaken (alleen het diner)', yaml: `type: markdown
title: Diners deze week
content: |
  {% for d in state_attr('sensor.maaltijden_week', 'dagen') %}
  **{{ d.dag.split(' ')[0] | capitalize }}:** {{ d.diner | map(attribute='titel') | join(', ') or '–' }}
  {% endfor %}` },
    { title: 'Vandaag met foto’s', yaml: `type: markdown
title: Vandaag
content: |
  {% set v = states.sensor.maaltijden_vandaag.attributes %}
  {% for moment in ['ontbijt', 'lunch', 'diner'] %}
  **{{ moment | capitalize }}**
  {% for x in v.get(moment) or [] %}
  <img src="{{ x.afbeelding }}" width="72"> {{ x.titel }}{% if x.kcal_pp %} · {{ x.kcal_pp }} kcal{% endif %}
  {% else %}–
  {% endfor %}
  {% endfor %}` },
    { title: 'Week met foto’s (diner)', yaml: `type: markdown
title: Deze week
content: |
  <table>
  {% for d in state_attr('sensor.maaltijden_week', 'dagen') %}
  <tr><td><img src="{{ d.afbeelding }}" width="56"></td>
  <td><b>{{ d.dag.split(' ')[0] | capitalize }}</b><br>{{ d.diner | map(attribute='titel') | join(', ') or '–' }}</td></tr>
  {% endfor %}
  </table>` },
    { title: 'Morgen met foto', yaml: `type: picture-entity
entity: sensor.maaltijden_morgen
name: Morgen
show_state: true` },
    { title: 'Foto van het diner', yaml: `type: picture-entity
entity: sensor.maaltijden_vandaag
show_name: false
show_state: true` },
    { title: 'Boodschappenlijst per afdeling', yaml: `type: markdown
title: Boodschappen
content: |
  {% set c = state_attr('sensor.maaltijden_boodschappen_open', 'per_categorie') %}
  {% if not c %}Alles is gehaald 🎉{% endif %}
  {% for cat, items in (c or {}).items() %}
  **{{ cat }}**: {{ items | join(', ') }}
  {% endfor %}` },
    { title: 'Boodschappen met foto’s', yaml: `type: markdown
title: Boodschappen
content: |
  {% for x in state_attr('sensor.maaltijden_boodschappen_open', 'artikelen') or [] %}
  <img src="{{ x.afbeelding }}" width="40"> {{ x.naam }}{% if x.hoeveelheid %} – {{ x.hoeveelheid }}{% endif %}
  {% else %}Alles is gehaald 🎉
  {% endfor %}` },
    { title: `Calorieën vandaag (${first?.attributes.naam || 'persoon'})`, yaml: `type: gauge
entity: sensor.maaltijden_${p}_kcal
name: Gegeten vandaag
min: 0
max: ${doel}
needle: true
segments:
  - from: 0
    color: "#43a047"
  - from: ${Math.round(doel * 0.9)}
    color: "#ffa600"
  - from: ${Math.round(doel * 1.05)}
    color: "#db4437"` },
    { title: 'Gewicht over tijd', yaml: `type: history-graph
title: Gewicht
hours_to_show: 720
entities:
${yamlList(sensors.filter((x) => x.key.endsWith('_gewicht')).map((x) => `entity: ${x.entity_id}`), 2) || '  - entity: sensor.maaltijden_ik_gewicht'}` },
    { title: 'Alles op een rij', yaml: `type: entities
title: Maaltijden
entities:
${yamlList(sensors.map((x) => x.entity_id), 2)}` },
    { title: 'Automatisering: om 16:30 een melding met het diner', description: 'Instellingen → Automatiseringen → Nieuw → ⋮ → Bewerken in YAML. Vervang notify.notify door je telefoon (bv. notify.mobile_app_…).', yaml: `alias: Wat eten we vandaag?
triggers:
  - trigger: time
    at: "16:30:00"
conditions:
  - condition: not
    conditions:
      - condition: state
        entity_id: sensor.maaltijden_vandaag
        state: Niets gepland
actions:
  - action: notify.notify
    data:
      title: Vanavond eten we
      message: >-
        {{ states('sensor.maaltijden_vandaag') }}
        ({{ state_attr('sensor.maaltijden_boodschappen_open', 'boodschappen') | count }} boodschappen nog te halen)` },
  ];
  return ex;
}

/** Kant-en-klare YAML voor configuration.yaml, de sensoren en voorbeelden voor kaarten. */
export function haConfig(baseUrl) {
  const url = `${baseUrl}/ha/${haToken()}/sensoren.json`;
  const sensors = haSensors(baseUrl);
  const restSensors = sensors.map((x) => {
    const attrs = Object.keys(x.attributes).filter((k) => !HA_META.has(k) && x.attributes[k] !== undefined);
    const a = x.attributes;
    return [`      - name: "${a.friendly_name}"`,
      `        unique_id: maaltijden_${x.key}`,
      `        icon: ${a.icon}`,
      ...(a.unit_of_measurement ? [`        unit_of_measurement: "${a.unit_of_measurement}"`] : []),
      ...(a.device_class ? [`        device_class: ${a.device_class}`] : []),
      ...(a.state_class ? [`        state_class: ${a.state_class}`] : []),
      `        value_template: "{{ value_json.${x.key}.state }}"`,
      `        json_attributes_path: "$.${x.key}"`,
      '        json_attributes:',
      yamlList(attrs, 10)].join('\n');
  });
  const sensor = `# In configuration.yaml (daarna Home Assistant herstarten)
rest:
  - resource: ${url}
    scan_interval: 300
    sensor:
${restSensors.join('\n')}`;
  const examples = haExamples(sensors);
  return {
    url, sensor, card: examples[0].yaml, examples,
    sensors: sensors.map((x) => ({
      entity_id: x.entity_id, name: x.attributes.friendly_name, state: x.state, unit: x.attributes.unit_of_measurement || null,
      attributes: Object.keys(x.attributes).filter((k) => !HA_META.has(k) && x.attributes[k] !== undefined),
    })),
  };
}

// ---------- Automatisch koppelen: de app stuurt zelf gegevens naar Home Assistant ----------
// Met het adres van Home Assistant en een ‘langlevend toegangstoken’ (profiel → Beveiliging in Home Assistant):
// sensoren via de REST API (POST /api/states/…), zonder configuration.yaml of herstart.
// Dashboards past de app niet aan.

export function haLink() {
  const url = getSetting('homeassistant_url', null);
  const token = getSetting('homeassistant_token', null);
  return url && token ? { url, token, app_url: getSetting('homeassistant_app_url', '') } : null;
}

function cleanHaUrl(input) {
  let u = String(input || '').trim().replace(/\/+$/, '');
  if (!u) throw Object.assign(new Error('Vul het adres van Home Assistant in, bv. http://192.168.1.10:8123'), { status: 400 });
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  let p;
  try { p = new URL(u); } catch { throw Object.assign(new Error('Dit is geen geldig adres'), { status: 400 }); }
  // Lokaal adres zonder poort (IP, homeassistant.local, naam zonder punt): standaardpoort 8123
  const local = /^\d+\.\d+\.\d+\.\d+$/.test(p.hostname) || p.hostname.endsWith('.local') || !p.hostname.includes('.');
  if (!p.port && p.protocol === 'http:' && local) p.port = '8123';
  return p.origin;
}

async function haFetch({ url, token }, path, options = {}) {
  let res;
  try {
    res = await fetch(`${url}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Object.assign(new Error(`Home Assistant is niet bereikbaar op ${url}. Klopt het adres (meestal met poort 8123) en kan de server erbij?`), { status: 502 });
  }
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Home Assistant weigert het token. Maak een nieuw langlevend toegangstoken en plak het hele token.'), { status: 400 });
  if (!res.ok) throw Object.assign(new Error(`Home Assistant gaf een fout (${res.status}).`), { status: 502 });
  return res.json().catch(() => ({}));
}

// ---------- Foto's via Home Assistant ----------
// Home Assistant via https (bv. Nabu Casa) kan geen foto's van http://… tonen. Daarom zetten we de foto in Home Assistant
// zelf (dezelfde upload als voor profielfoto's) en verwijzen we naar /api/image/serve/…: zo komt hij via het adres
// van Home Assistant, met https, en zonder inloggen. Foto's die al https zijn, blijven zoals ze zijn.

/** Foto lezen: eigen uploads en ingebouwde foto's van schijf, andere http-links ophalen. */
async function readImage(src, appUrl) {
  let rel = src;
  if (appUrl && src.startsWith(appUrl)) rel = src.slice(appUrl.length);
  if (!/^https?:/i.test(rel)) {
    const clean = decodeURIComponent(rel.split('?')[0]).replace(/^\/+/, '');
    const file = clean.startsWith('uploads/') ? path.join(uploadDir(), clean.slice(8)) : path.join(publicDir, clean);
    const root = clean.startsWith('uploads/') ? uploadDir() : publicDir;
    if (!path.resolve(file).startsWith(path.resolve(root) + path.sep)) return null;
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    return stat ? { buf: fs.readFileSync(file), key: `${clean}:${stat.size}:${stat.mtimeMs}`, name: path.basename(file) } : null;
  }
  const res = await fetch(rel, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  return { buf: Buffer.from(await res.arrayBuffer()), key: rel, name: path.basename(new URL(rel).pathname) || 'foto.jpg' };
}

const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

/** Adres van de foto zoals Home Assistant hem kan tonen, of het oorspronkelijke adres als dat niet lukt. */
async function haImage(link, src) {
  if (!src || /^https:/i.test(src)) return src;
  try {
    const img = await readImage(src, link.app_url);
    if (!img) return src;
    const cache = getSetting('homeassistant_images', {});
    if (cache[img.key]) return cache[img.key];
    const form = new FormData();
    const type = IMAGE_TYPES[path.extname(img.name).toLowerCase()] || 'image/jpeg';
    form.append('file', new Blob([img.buf], { type }), img.name);
    const res = await fetch(`${link.url}/api/image/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${link.token}` }, body: form, signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return src;
    const { id } = await res.json();
    if (!id) return src;
    const url = `/api/image/serve/${id}/512x512`;
    // Oudste vergeten als het er veel worden (de foto's blijven in Home Assistant staan)
    // Opnieuw lezen: er lopen een paar uploads tegelijk
    const entries = Object.entries({ ...getSetting('homeassistant_images', {}), [img.key]: url }).slice(-2000);
    setSetting('homeassistant_images', Object.fromEntries(entries));
    return url;
  } catch {
    return src;
  }
}

/** Alle foto's (attribuut ‘afbeelding’, op elke diepte, en entity_picture) vervangen door adressen die Home Assistant kan tonen. */
async function withHaImages(link, sensors) {
  const spots = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if ((k === 'afbeelding' || k === 'entity_picture') && typeof v === 'string') spots.push([o, k, v]);
        else walk(v);
      }
    }
  };
  sensors.forEach((x) => walk(x.attributes));
  // Elke foto één keer, met een paar tegelijk
  const unique = [...new Set(spots.map(([, , v]) => v))];
  const done = new Map();
  const queue = [...unique];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const src = queue.shift();
      done.set(src, await haImage(link, src));
    }
  }));
  for (const [o, k, v] of spots) o[k] = done.get(v) ?? v;
  return sensors;
}

/** Melding naar een telefoon via de Home Assistant Companion-app (service notify.<naam>). */
export async function haNotify(link, service, { title, message, data = {} }) {
  const name = String(service || '').replace(/^notify\./, '');
  if (!/^\w+$/.test(name)) throw Object.assign(new Error('Vul de naam van de meldingsdienst in, bv. mobile_app_pixel_8'), { status: 400 });
  return haFetch(link, `/api/services/notify/${name}`, { method: 'POST', body: JSON.stringify({ title, message, data }) });
}

/** Sensoren bijwerken (maakt ze aan als ze nog niet bestaan). */
export async function pushStates(link = haLink()) {
  if (!link) return false;
  const sensors = await withHaImages(link, haSensors(link.app_url));
  for (const x of sensors) {
    await haFetch(link, `/api/states/${x.entity_id}`, { method: 'POST', body: JSON.stringify({ state: x.state, attributes: x.attributes }) });
  }
  return true;
}

/**
 * Koppelen vanuit Instellingen: verbinding testen en de sensoren aanmaken. De app past bewust geen dashboards aan;
 * de kaart zet je zelf (of met Claude via de Home Assistant-connector) op het dashboard.
 */
export async function connectHomeAssistant({ url, token }, appUrl) {
  const link = { url: cleanHaUrl(url), token: String(token || '').trim(), app_url: appUrl };
  if (!link.token) throw Object.assign(new Error('Plak het langlevende toegangstoken uit Home Assistant'), { status: 400 });
  await haFetch(link, '/api/');
  await pushStates(link);
  setSetting('homeassistant_url', link.url);
  setSetting('homeassistant_token', link.token);
  setSetting('homeassistant_app_url', appUrl);
  return { url: link.url };
}

export function disconnectHomeAssistant() {
  for (const k of ['homeassistant_url', 'homeassistant_token', 'homeassistant_app_url', 'homeassistant_images']) setSetting(k, null);
}

// Na een wijziging (planning, boodschappen, dagboek) even wachten en dan bijwerken; daarnaast elke 5 minuten
let pushTimer = null;
let lastError = null;
export function schedulePush(delay = 4000) {
  if (!haLink()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try { await pushStates(); lastError = null; } catch (err) {
      if (lastError !== err.message) console.warn(`Home Assistant bijwerken mislukt: ${err.message}`);
      lastError = err.message;
    }
  }, delay);
  pushTimer.unref?.();
}
export const lastPushError = () => lastError;
