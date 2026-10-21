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


// ---------- Automatisch koppelen: de app stuurt zelf gegevens naar Home Assistant ----------
// Met het adres van Home Assistant en een ‘langlevend toegangstoken’ (profiel → Beveiliging in Home Assistant):
// - sensoren via de REST API (POST /api/states/…), zonder configuration.yaml of herstart;
// - de kaart op het dashboard via de WebSocket API (lovelace/config en lovelace/config/save).

export const CARD = {
  type: 'markdown',
  title: 'Maaltijden',
  content: "{{ state_attr('sensor.maaltijden_vandaag', 'markdown') }}",
};

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

/** Sensoren bijwerken (maakt ze aan als ze nog niet bestaan). */
export async function pushStates(link = haLink()) {
  if (!link) return false;
  const { state, ...attributes } = todayOverview(link.app_url);
  await haFetch(link, '/api/states/sensor.maaltijden_vandaag', {
    method: 'POST',
    body: JSON.stringify({ state, attributes: { ...attributes, friendly_name: 'Maaltijden vandaag', icon: 'mdi:silverware-fork-knife', entity_picture: attributes.afbeelding || undefined } }),
  });
  await haFetch(link, '/api/states/sensor.maaltijden_boodschappen_open', {
    method: 'POST',
    body: JSON.stringify({ state: String(attributes.boodschappen_open), attributes: { friendly_name: 'Maaltijden boodschappen open', icon: 'mdi:cart-outline', unit_of_measurement: 'artikelen', boodschappen: attributes.boodschappen } }),
  });
  return true;
}

/** Kleine WebSocket-sessie met Home Assistant: inloggen en commando's één voor één uitvoeren. */
async function haSocket({ url, token }, run) {
  const wsUrl = `${url.replace(/^http/i, 'ws')}/api/websocket`;
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  let authed;
  const ready = new Promise((resolve, reject) => {
    authed = { resolve, reject };
    setTimeout(() => reject(Object.assign(new Error('Home Assistant reageert niet (WebSocket).'), { status: 502 })), 10000).unref?.();
  });
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: token }));
    else if (msg.type === 'auth_ok') authed.resolve();
    else if (msg.type === 'auth_invalid') authed.reject(Object.assign(new Error('Home Assistant weigert het token.'), { status: 400 }));
    else if (msg.type === 'result' && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  });
  ws.addEventListener('error', () => authed.reject(Object.assign(new Error(`Home Assistant is niet bereikbaar op ${url}.`), { status: 502 })));
  const call = (payload) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, ...payload }));
    setTimeout(() => { if (pending.delete(id)) reject(Object.assign(new Error('Home Assistant reageert niet.'), { status: 502 })); }, 15000).unref?.();
  });
  try {
    await ready;
    return await run(call);
  } finally {
    try { ws.close(); } catch { /* al dicht */ }
  }
}

const hasOurCard = (config) => JSON.stringify(config || {}).includes('sensor.maaltijden_vandaag');

/** De kaart bovenaan het eerste tabblad zetten (zowel ‘secties’ als klassieke weergave). */
function withCard(config) {
  const cfg = structuredClone(config);
  cfg.views = cfg.views?.length ? cfg.views : [{ title: 'Overzicht', cards: [] }];
  const view = cfg.views[0];
  if (view.type === 'sections' || view.sections) {
    view.sections = [{ type: 'grid', cards: [CARD] }, ...(view.sections || [])];
  } else {
    view.cards = [CARD, ...(view.cards || [])];
  }
  return cfg;
}

/**
 * Kaart op het hoofddashboard zetten. Wordt het hoofddashboard automatisch door Home Assistant gemaakt
 * (of via YAML beheerd), dan nemen we het niet over maar maken we een eigen dashboard ‘Maaltijden’ in de zijbalk.
 */
export async function addDashboardCard(link = haLink()) {
  return haSocket(link, async (call) => {
    const main = await call({ type: 'lovelace/config', url_path: null });
    if (main.success && main.result && typeof main.result === 'object' && !main.result.strategy) {
      if (hasOurCard(main.result)) return { dashboard: 'Overzicht', added: false, path: '/lovelace' };
      const saved = await call({ type: 'lovelace/config/save', url_path: null, config: withCard(main.result) });
      if (saved.success) return { dashboard: 'Overzicht', added: true, path: '/lovelace' };
    }
    // Eigen dashboard
    const list = await call({ type: 'lovelace/dashboards/list' });
    if (!(list.result || []).some((d) => d.url_path === 'maaltijden')) {
      const created = await call({ type: 'lovelace/dashboards/create', url_path: 'maaltijden', title: 'Maaltijden', icon: 'mdi:silverware-fork-knife', show_in_sidebar: true, require_admin: false, mode: 'storage' });
      if (!created.success) {
        throw Object.assign(new Error(`Kon geen dashboard aanmaken in Home Assistant${created.error?.message ? `: ${created.error.message}` : ''}. Is het token van een beheerder?`), { status: 502 });
      }
    }
    const own = await call({ type: 'lovelace/config', url_path: 'maaltijden' });
    if (own.success && hasOurCard(own.result)) return { dashboard: 'Maaltijden', added: false, path: '/maaltijden', reason: 'auto' };
    const saved = await call({ type: 'lovelace/config/save', url_path: 'maaltijden', config: { title: 'Maaltijden', views: [{ title: 'Vandaag', path: 'vandaag', cards: [CARD] }] } });
    if (!saved.success) throw Object.assign(new Error('Kon de kaart niet opslaan in Home Assistant. Is het token van een beheerder?'), { status: 502 });
    return { dashboard: 'Maaltijden', added: true, path: '/maaltijden', reason: 'auto' };
  });
}

/** Koppelen vanuit Instellingen: verbinding testen, sensoren aanmaken en de kaart plaatsen. */
export async function connectHomeAssistant({ url, token }, appUrl) {
  const link = { url: cleanHaUrl(url), token: String(token || '').trim(), app_url: appUrl };
  if (!link.token) throw Object.assign(new Error('Plak het langlevende toegangstoken uit Home Assistant'), { status: 400 });
  await haFetch(link, '/api/');
  await pushStates(link);
  const card = await addDashboardCard(link);
  setSetting('homeassistant_url', link.url);
  setSetting('homeassistant_token', link.token);
  setSetting('homeassistant_app_url', appUrl);
  return { url: link.url, ...card };
}

export function disconnectHomeAssistant() {
  for (const k of ['homeassistant_url', 'homeassistant_token', 'homeassistant_app_url']) setSetting(k, null);
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
