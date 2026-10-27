// Koppeling met Claude (MCP, Model Context Protocol): Claude kan de planner, recepten, boodschappen, het dagboek
// en het gewicht bekijken en aanpassen. Toevoegen in claude.ai als eigen connector met de link uit Instellingen.
// - Transport: ‘Streamable HTTP’ zonder sessies: elk verzoek is één JSON-RPC-bericht, het antwoord is JSON.
// - Beveiliging: een geheime code per persoon in de link (zoals bij Home Assistant). Het dagboek en gewicht
//   gaan altijd over die persoon.
import crypto from 'node:crypto';
import { getSetting, setSetting } from './db.js';
import * as repo from './repo.js';
import * as tracker from './tracker.js';
import { mondayOf } from './seed.js';
import { todayISO } from './homeassistant.js';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MOMENTS = ['ontbijt', 'lunch', 'diner', 'tussendoor'];

// ---------- Links per persoon ----------

const tokens = () => getSetting('mcp_tokens', {});

/** Persoon bij een geheime code, of null. */
export function personForToken(token) {
  const id = tokens()[String(token || '')];
  return id ? tracker.getPerson(id) : null;
}

export function mcpToken(personId) {
  return Object.entries(tokens()).find(([, id]) => id === Number(personId))?.[0] || null;
}

/** Nieuwe link voor een persoon; een eventuele oude link stopt. */
export function newMcpToken(personId) {
  const id = Number(personId);
  if (!tracker.getPerson(id)) throw Object.assign(new Error('Persoon niet gevonden'), { status: 404 });
  const rest = Object.fromEntries(Object.entries(tokens()).filter(([, p]) => p !== id));
  const token = crypto.randomBytes(24).toString('base64url');
  setSetting('mcp_tokens', { ...rest, [token]: id });
  return token;
}

export function removeMcpToken(personId) {
  setSetting('mcp_tokens', Object.fromEntries(Object.entries(tokens()).filter(([, p]) => p !== Number(personId))));
}

// ---------- Hulpmiddelen ----------

const fail = (message) => Object.assign(new Error(message), { toolError: true });
const euro = (c) => (c == null ? null : `€ ${(c / 100).toFixed(2).replace('.', ',')}`);
const isoDate = (d, fallback = todayISO()) => {
  if (d == null || d === '') return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) throw fail(`Datum ‘${d}’ is niet geldig; gebruik JJJJ-MM-DD.`);
  return String(d);
};
const weekOf = (d) => mondayOf(new Date(`${isoDate(d)}T12:00:00`));
const moment = (m, fallback = 'diner') => {
  const v = String(m || fallback).toLowerCase();
  if (!MOMENTS.includes(v)) throw fail(`Onbekend moment ‘${m}’; kies uit ${MOMENTS.join(', ')}.`);
  return v;
};
const round = (n) => (n == null ? null : Math.round(n));

function planItem(e) {
  return {
    id: e.id,
    moment: e.meal,
    titel: e.recipe_title || e.title || (e.extras || []).map((x) => x.name).join(', ') || 'Losse ingrediënten',
    recept_id: e.recipe_id || null,
    personen: e.servings,
    extra: (e.extras || []).map((x) => x.name),
    restjes: !!e.leftover_of,
    kcal_pp: round(e.kcal_per_serving),
    kosten: e.leftover_of ? null : euro(e.cost_cents),
    notitie: e.note || undefined,
  };
}

function shoppingFind(list, name) {
  const t = repo.normalizeName(name);
  const all = [
    ...list.items.map((i) => ({ kind: 'item', key: i.key, name: i.name, checked: i.checked })),
    ...list.extras.map((x) => ({ kind: 'extra', id: x.id, name: x.name, checked: x.checked })),
  ];
  return all.find((x) => repo.normalizeName(x.name) === t)
    || all.find((x) => repo.normalizeName(x.name).includes(t) || t.includes(repo.normalizeName(x.name)));
}

const str = (description) => ({ type: 'string', description });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const num = (description) => ({ type: 'number', description });
const DATE = str('Datum als JJJJ-MM-DD. Leeg = vandaag.');
const MOMENT = { type: 'string', enum: MOMENTS, description: 'Moment van de dag' };

/** Alle hulpmiddelen: naam → { beschrijving, invoer, uitvoeren(args, ctx), wijzigt }. */
const TOOLS = {
  planning_bekijken: {
    description: 'Laat de geplande maaltijden zien per dag (moment, titel, recept, personen, kcal per persoon, kosten). '
      + 'Standaard vandaag en de 6 dagen erna.',
    input: { datum: str('Eerste dag (JJJJ-MM-DD). Leeg = vandaag.'), dagen: int('Aantal dagen (1–14)', { minimum: 1, maximum: 14 }) },
    run: ({ datum, dagen }) => {
      const plan = repo.getPlan(isoDate(datum), Math.min(14, Math.max(1, Number(dagen) || 7)));
      return {
        vandaag: todayISO(),
        dagen: plan.days.map((d) => ({
          datum: d.date,
          dag: new Intl.DateTimeFormat('nl-NL', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d.date}T12:00:00Z`)),
          maaltijden: d.entries.map(planItem),
          kcal_pp: round(d.nutrition_per_person.kcal),
          kosten: euro(d.cost_cents),
        })),
        totale_kosten: euro(plan.total_cost_cents),
      };
    },
  },
  maaltijd_plannen: {
    description: 'Zet een maaltijd in de planner: een recept (recept_id, zoek het eerst met recepten_zoeken) of een gerecht '
      + 'zonder recept (titel, bv. ‘Uit eten’ of ‘Pizza’). Recepten komen vanzelf op de boodschappenlijst.',
    input: { datum: DATE, moment: MOMENT, recept_id: int('Id van een recept'), titel: str('Naam als er geen recept is'), personen: int('Aantal personen', { minimum: 1 }) },
    required: ['moment'],
    changes: true,
    run: ({ datum, moment: m, recept_id: rid, titel, personen }) => {
      if (!rid && !String(titel || '').trim()) throw fail('Geef een recept_id of een titel.');
      const recipe = rid ? repo.getRecipe(Number(rid)) : null;
      if (rid && !recipe) throw fail(`Recept ${rid} bestaat niet. Zoek het id met recepten_zoeken.`);
      const servings = Number(personen) || getSetting('default_servings', 2);
      const id = repo.addPlanEntry({ date: isoDate(datum), meal: moment(m), recipe_id: recipe?.id || null, title: recipe ? null : String(titel).trim(), servings });
      return { gepland: true, id, datum: isoDate(datum), moment: moment(m), titel: recipe?.title || String(titel).trim(), personen: servings };
    },
  },
  maaltijd_wijzigen: {
    description: 'Verplaats of wijzig een geplande maaltijd (id uit planning_bekijken): andere dag, ander moment, aantal personen, '
      + 'ander recept of een notitie.',
    input: { id: int('Id van de geplande maaltijd'), datum: DATE, moment: MOMENT, personen: int('Aantal personen', { minimum: 1 }), recept_id: int('Ander recept'), titel: str('Andere naam (zonder recept)'), notitie: str('Notitie') },
    required: ['id'],
    changes: true,
    run: ({ id, datum, moment: m, personen, recept_id: rid, titel, notitie }) => {
      const data = {};
      if (datum) data.date = isoDate(datum);
      if (m) data.meal = moment(m);
      if (personen) data.servings = Number(personen);
      if (rid) {
        if (!repo.getRecipe(Number(rid))) throw fail(`Recept ${rid} bestaat niet.`);
        Object.assign(data, { recipe_id: Number(rid), title: null });
      } else if (titel) Object.assign(data, { recipe_id: null, title: String(titel) });
      if (notitie != null) data.note = String(notitie);
      if (!repo.updatePlanEntry(Number(id), data)) throw fail(`Geplande maaltijd ${id} bestaat niet.`);
      const date = repo.getPlanEntry(Number(id)).date;
      return { gewijzigd: true, maaltijd: planItem(repo.getPlan(date, 1).days[0].entries.find((e) => e.id === Number(id))) };
    },
  },
  maaltijd_verwijderen: {
    description: 'Haal een geplande maaltijd uit de planner (id uit planning_bekijken).',
    input: { id: int('Id van de geplande maaltijd') },
    required: ['id'],
    changes: true,
    run: ({ id }) => {
      if (!repo.getPlanEntry(Number(id))) throw fail(`Geplande maaltijd ${id} bestaat niet.`);
      repo.deletePlanEntry(Number(id));
      return { verwijderd: true, id: Number(id) };
    },
  },
  recepten_zoeken: {
    description: 'Zoek in het receptenboek op naam, ingrediënt of label. Geeft id, titel, categorie, tijd, kcal en prijs per portie.',
    input: {
      zoekterm: str('Bv. ‘kip’, ‘stamppot’ of ‘vegetarisch’. Leeg = alles.'),
      categorie: str('Bv. Hoofdgerecht, Ontbijt, Lunch, Soep, Bijgerecht, Nagerecht'),
      max_minuten: int('Maximale bereidingstijd in minuten'),
      alleen_favorieten: { type: 'boolean', description: 'Alleen favorieten' },
      limiet: int('Maximaal aantal resultaten (standaard 20)', { minimum: 1, maximum: 100 }),
    },
    run: ({ zoekterm, categorie, max_minuten: max, alleen_favorieten: fav, limiet }) => {
      const list = repo.listRecipes({ q: zoekterm || '', category: categorie || '', maxMinutes: Number(max) || 0, favorite: !!fav });
      return {
        aantal: list.length,
        recepten: list.slice(0, Number(limiet) || 20).map((r) => ({
          id: r.id, titel: r.title, categorie: r.category, minuten: r.total_minutes || null,
          kcal_pp: round(r.kcal_per_serving), prijs_pp: euro(r.cost_per_serving_cents), favoriet: !!r.favorite,
        })),
      };
    },
  },
  recept_bekijken: {
    description: 'Het hele recept: ingrediënten met hoeveelheden, bereiding, voedingswaarden en prijs, eventueel omgerekend naar een aantal personen.',
    input: { id: int('Id van het recept'), personen: int('Omrekenen naar dit aantal personen', { minimum: 1 }) },
    required: ['id'],
    run: ({ id, personen }) => {
      const r = repo.getRecipe(Number(id), Number(personen) || null);
      if (!r) throw fail(`Recept ${id} bestaat niet.`);
      const n = r.nutrition_per_serving || {};
      return {
        id: r.id, titel: r.title, beschrijving: r.description || undefined, categorie: r.category, personen: r.persons,
        voorbereiden_min: r.prep_minutes, koken_min: r.cook_minutes, labels: r.tags,
        ingredienten: r.ingredients.map((l) => ({
          naam: l.name, hoeveelheid: l.scaled_quantity ?? l.quantity, eenheid: l.unit || undefined,
          gram: l.computed_grams || undefined, notitie: l.note || undefined, optioneel: l.optional ? true : undefined,
        })),
        bereiding: r.steps,
        per_portie: { kcal: round(n.kcal), eiwit: n.protein, koolhydraten: n.carbs, vet: n.fat, vezels: n.fiber, zout: n.salt },
        prijs_totaal: euro(r.cost_total_cents), prijs_pp: euro(r.cost_per_serving_cents),
        notities: r.notes || undefined,
      };
    },
  },
  recept_opslaan: {
    description: 'Sla een nieuw recept op in het receptenboek. Ingrediënten worden gekoppeld aan de database (voor kcal en prijs); '
      + 'gebruik Nederlandse namen en metrische eenheden (g, ml, el, tl, stuks).',
    input: {
      titel: str('Naam van het recept'),
      personen: int('Voor hoeveel personen', { minimum: 1 }),
      ingredienten: {
        type: 'array',
        description: 'Ingrediënten',
        items: { type: 'object', properties: { naam: str('bv. ‘ui’'), hoeveelheid: num('bv. 2'), eenheid: str('bv. g, ml, el, tl, stuks'), notitie: str('bv. ‘gesnipperd’') }, required: ['naam'] },
      },
      bereiding: { type: 'array', items: { type: 'string' }, description: 'Stappen, één per regel' },
      categorie: str('Hoofdgerecht, Ontbijt, Lunch, Soep, Bijgerecht, Nagerecht, Snack of Bakken'),
      beschrijving: str('Korte beschrijving'),
      voorbereiden_min: int('Voorbereidingstijd in minuten'),
      koken_min: int('Kooktijd in minuten'),
      labels: { type: 'array', items: { type: 'string' }, description: 'Labels, bv. vegetarisch, snel' },
    },
    required: ['titel', 'ingredienten', 'bereiding'],
    changes: true,
    run: (a) => {
      if (!String(a.titel || '').trim()) throw fail('Geef het recept een titel.');
      if (!Array.isArray(a.ingredienten) || !a.ingredienten.length) throw fail('Een recept heeft ingrediënten nodig.');
      const id = repo.saveRecipe({
        title: a.titel, servings: Number(a.personen) || 4, category: a.categorie || 'Hoofdgerecht', description: a.beschrijving || '',
        prep_minutes: a.voorbereiden_min ?? null, cook_minutes: a.koken_min ?? null, tags: a.labels || [],
        steps: a.bereiding || [], notes: 'Toegevoegd door Claude',
        ingredients: a.ingredienten.map((i) => ({ name: String(i.naam || ''), quantity: i.hoeveelheid ?? null, unit: i.eenheid || '', note: i.notitie || '' })),
      });
      const r = repo.getRecipe(id);
      const missing = r.ingredients.filter((l) => !l.ingredient_id).map((l) => l.name);
      return {
        opgeslagen: true, id, titel: r.title, kcal_pp: round(r.nutrition_per_serving.kcal), prijs_pp: euro(r.cost_per_serving_cents),
        niet_gekoppeld: missing.length ? missing : undefined,
        tip: missing.length ? 'Deze ingrediënten staan nog niet in de database; voeg ze toe in de app voor kcal en prijs.' : undefined,
      };
    },
  },
  boodschappenlijst: {
    description: 'De boodschappenlijst van een week (maandag t/m zondag) volgens de planner: wat nog gehaald moet worden, '
      + 'wat al is afgevinkt of in huis is, en eigen artikelen.',
    input: { week: str('Een datum in de week (JJJJ-MM-DD). Leeg = deze week.') },
    run: ({ week }) => {
      const list = repo.getShoppingList(weekOf(week), 7);
      const label = (i) => (i.packages && i.package_label ? `${i.packages}× ${i.package_label}` : i.grams ? `${Math.round(i.grams)} g` : null);
      const open = list.items.filter((i) => !i.checked && !i.have && !i.pantry);
      return {
        week: `${list.start} t/m ${list.end}`,
        nog_halen: [
          ...open.map((i) => ({ naam: i.name, afdeling: i.category, hoeveelheid: label(i), prijs: euro(i.cost_cents) })),
          ...list.extras.filter((x) => !x.checked).map((x) => ({ naam: x.name, afdeling: 'Eigen artikelen' })),
        ],
        afgevinkt: [...list.items.filter((i) => i.checked).map((i) => i.name), ...list.extras.filter((x) => x.checked).map((x) => x.name)],
        al_in_huis: list.items.filter((i) => i.have).map((i) => i.name),
        voorraadkast: list.items.filter((i) => i.pantry && !i.checked && !i.have).map((i) => i.name),
        geschatte_kosten: euro(open.reduce((s, i) => s + (i.cost_cents || 0), 0)),
      };
    },
  },
  boodschap_toevoegen: {
    description: 'Zet een eigen artikel op de boodschappenlijst (bv. ‘wc-papier’ of ‘melk’).',
    input: { naam: str('Wat er op de lijst moet'), week: str('Een datum in de week. Leeg = deze week.') },
    required: ['naam'],
    changes: true,
    run: ({ naam, week }) => {
      const name = String(naam || '').trim();
      if (!name) throw fail('Wat moet er op de lijst?');
      repo.addShoppingExtra(weekOf(week), name);
      return { toegevoegd: true, naam: name };
    },
  },
  boodschap_afvinken: {
    description: 'Vink een artikel op de boodschappenlijst af (of weer aan met afgevinkt=false). Zoekt op naam.',
    input: { naam: str('Naam van het artikel'), afgevinkt: { type: 'boolean', description: 'true = afvinken (standaard), false = weer open' }, week: str('Een datum in de week. Leeg = deze week.') },
    required: ['naam'],
    changes: true,
    run: ({ naam, afgevinkt = true, week }) => {
      const start = weekOf(week);
      const hit = shoppingFind(repo.getShoppingList(start, 7), naam);
      if (!hit) throw fail(`‘${naam}’ staat niet op de boodschappenlijst van deze week.`);
      if (hit.kind === 'item') repo.setShoppingCheck(start, hit.key, !!afgevinkt);
      else repo.updateShoppingExtra(hit.id, !!afgevinkt);
      return { naam: hit.name, afgevinkt: !!afgevinkt };
    },
  },
  dagboek_bekijken: {
    description: 'Wat je op een dag hebt gegeten volgens het dagboek, per moment, met de totalen en je doelen (kcal, eiwit enz.).',
    input: { datum: DATE },
    run: ({ datum }, { person }) => {
      const d = tracker.getDay(person.id, isoDate(datum));
      const t = d.totals;
      return {
        persoon: person.name, datum: d.date,
        totaal: { kcal: round(t.kcal), eiwit: t.protein, koolhydraten: t.carbs, vet: t.fat, vezels: t.fiber, suiker: t.sugar, zout: t.salt },
        doel: { kcal: d.targets.kcal, eiwit: d.targets.protein, koolhydraten: d.targets.carbs, vet: d.targets.fat, vezels: d.targets.fiber },
        nog_over_kcal: Math.max(0, d.targets.kcal - round(t.kcal || 0)),
        momenten: d.meals.filter((m) => m.entries.length).map((m) => ({
          moment: m.meal, kcal: round(m.totals.kcal),
          gegeten: m.entries.map((e) => ({ id: e.id, naam: e.name, kcal: round(e.kcal), porties: e.servings || undefined })),
        })),
        gepland_niet_gelogd: d.planned.filter((p) => !p.logged).map((p) => ({ moment: p.meal, titel: p.title, kcal_pp: round(p.kcal_per_serving) })),
        gewicht: d.weight?.weight_kg ?? undefined,
      };
    },
  },
  eten_loggen: {
    description: 'Zet iets in het dagboek. Een recept uit het receptenboek (recept_id + porties) of vrije invoer met een omschrijving en '
      + 'een schatting van de voedingswaarden (minstens kcal).',
    input: {
      moment: MOMENT, datum: DATE,
      recept_id: int('Id van een recept (dan worden de voedingswaarden berekend)'), porties: num('Aantal porties van het recept (standaard 1)'),
      omschrijving: str('Wat je at, bv. ‘appel’ of ‘broodje kroket’ (bij vrije invoer)'),
      kcal: num('Kilocalorieën (bij vrije invoer)'), eiwit: num('Eiwit in gram'), koolhydraten: num('Koolhydraten in gram'),
      vet: num('Vet in gram'), vezels: num('Vezels in gram'), suiker: num('Suikers in gram'), zout: num('Zout in gram'),
    },
    required: ['moment'],
    changes: true,
    run: (a, { person }) => {
      const base = { person_id: person.id, date: isoDate(a.datum), meal: moment(a.moment, 'tussendoor') };
      let id;
      if (a.recept_id) {
        if (!repo.getRecipe(Number(a.recept_id))) throw fail(`Recept ${a.recept_id} bestaat niet.`);
        id = tracker.addLogEntry({ ...base, type: 'recipe', recipe_id: Number(a.recept_id), servings: Number(a.porties) || 1 });
      } else {
        if (!String(a.omschrijving || '').trim()) throw fail('Geef een omschrijving (of een recept_id).');
        if (!(Number(a.kcal) > 0)) throw fail('Geef een schatting van het aantal kcal.');
        id = tracker.addLogEntry({
          ...base, type: 'free', name: String(a.omschrijving).trim(),
          values: { kcal: a.kcal, protein: a.eiwit, carbs: a.koolhydraten, fat: a.vet, fiber: a.vezels, sugar: a.suiker, salt: a.zout },
        });
      }
      const d = tracker.getDay(person.id, base.date);
      const entry = d.meals.flatMap((m) => m.entries).find((e) => e.id === id);
      return {
        gelogd: true, id, persoon: person.name, naam: entry?.name, kcal: round(entry?.kcal),
        totaal_vandaag_kcal: round(d.totals.kcal), doel_kcal: d.targets.kcal,
      };
    },
  },
  dagboek_verwijderen: {
    description: 'Haal iets uit het dagboek (id uit dagboek_bekijken).',
    input: { id: int('Id van de regel in het dagboek') },
    required: ['id'],
    changes: true,
    run: ({ id }, { person }) => {
      const entry = tracker.getLogEntry(Number(id));
      if (!entry || entry.person_id !== person.id) throw fail(`Regel ${id} staat niet in jouw dagboek.`);
      tracker.deleteLogEntry(Number(id));
      return { verwijderd: true, id: Number(id), naam: entry.name };
    },
  },
  gewicht_loggen: {
    description: 'Noteer je gewicht in kilo (één meting per dag; een tweede meting op dezelfde dag vervangt de eerste).',
    input: { kg: num('Gewicht in kilo, bv. 78.4'), datum: DATE },
    required: ['kg'],
    changes: true,
    run: ({ kg, datum }, { person }) => {
      try {
        tracker.logWeight({ person_id: person.id, date: isoDate(datum), weight_kg: kg });
      } catch (err) { throw fail(err.message); }
      const w = tracker.weightHistory(person.id, 90);
      return { genoteerd: true, persoon: person.name, kg: Number(kg), trend_kg: w.entries.at(-1)?.trend_kg, nog_tot_doel_kg: w.to_goal_kg, per_week_kg: w.per_week_kg };
    },
  },
  gewicht_bekijken: {
    description: 'Je gewichtsmetingen met trend (gemiddelde van 7 dagen), verandering per week en hoeveel je nog van je doel af bent.',
    input: { dagen: int('Hoeveel dagen terug (standaard 90)', { minimum: 7, maximum: 730 }) },
    run: ({ dagen }, { person }) => {
      const w = tracker.weightHistory(person.id, Number(dagen) || 90);
      return {
        persoon: person.name, doel_kg: person.target_weight_kg ?? null, bmi: person.bmi,
        metingen: w.entries.map((e) => ({ datum: e.date, kg: e.weight_kg, trend_kg: e.trend_kg })),
        verandering_kg: w.change_kg, per_week_kg: w.per_week_kg, nog_tot_doel_kg: w.to_goal_kg,
      };
    },
  },
};

function toolList() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: { type: 'object', properties: t.input, ...(t.required ? { required: t.required } : {}) },
    annotations: { readOnlyHint: !t.changes, destructiveHint: /verwijderen/.test(name), openWorldHint: false },
  }));
}

const INSTRUCTIONS = 'Maaltijden is de maaltijdplanner van het huishouden: weekplanner, receptenboek, boodschappenlijst en een '
  + 'calorieëndagboek met gewicht. Antwoord in het Nederlands. Datums zijn JJJJ-MM-DD; momenten zijn ontbijt, lunch, diner en tussendoor. '
  + 'Zoek eerst een recept met recepten_zoeken voordat je het plant. Het dagboek en gewicht zijn van de persoon van deze koppeling.';

/** Eén JSON-RPC-bericht afhandelen. Geeft het antwoord, of null voor een melding (notification). */
export async function handleRpc(msg, ctx) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const error = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(-32600, 'Ongeldig verzoek');
  if (msg.id === undefined) return null; // melding, bv. notifications/initialized
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'maaltijden', title: 'Maaltijden', version: ctx.version || '0' },
        instructions: `${INSTRUCTIONS} Deze koppeling is van ${ctx.person.name}.`,
      });
    }
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: toolList() });
    case 'tools/call': {
      const name = msg.params?.name;
      const tool = TOOLS[name];
      if (!tool) return error(-32602, `Onbekend hulpmiddel: ${name}`);
      try {
        const out = await tool.run(msg.params?.arguments || {}, ctx);
        if (tool.changes) ctx.onChange?.();
        return reply({ content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out });
      } catch (err) {
        if (!err.toolError && !err.status) console.warn(`MCP ${name}: ${err.stack || err.message}`);
        return reply({ content: [{ type: 'text', text: err.message }], isError: true });
      }
    }
    case 'resources/list': return reply({ resources: [] });
    case 'prompts/list': return reply({ prompts: [] });
    default: return error(-32601, `Onbekende methode: ${msg.method}`);
  }
}

/** Express-route voor POST/GET /mcp/:token. */
export function mcpRoute({ version, onChange }) {
  return async (req, res) => {
    const person = personForToken(req.params.token);
    if (!person) return res.status(404).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Onbekende link. Maak een nieuwe in Maaltijden → Instellingen → Claude.' } });
    res.set('Cache-Control', 'no-store');
    // Zonder sessies is er geen stroom van berichten van de server
    if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Gebruik POST' } });
    const ctx = { person, version, onChange };
    const body = req.body;
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handleRpc(m, ctx)))).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handleRpc(body, ctx);
    return out ? res.json(out) : res.status(202).end();
  };
}

export const _tools = TOOLS;
