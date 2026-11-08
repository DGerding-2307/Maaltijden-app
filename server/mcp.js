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
import * as photos from './recipe-photos.js';

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
const TASTE_OUT = { 1: 'lekker', '-1': 'niet lekker' };
const tasteOut = (t) => TASTE_OUT[t] || 'nog niet beoordeeld';
const notesOut = (n) => (n && n !== 'Toegevoegd door Claude' ? n : undefined);
const packageOut = (o) => ({ gram: o.grams, naam: o.label, prijs: euro(o.price_cents), hoofdverpakking: o.key === 'main' });

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

/** Foto ophalen of uitpakken, verkleinen, bewaren en aan het recept koppelen. De vorige eigen foto wordt opgeruimd. */
async function setPhoto(id, { foto_url: url, foto_base64: b64, mime_type: mime }) {
  const hasUrl = url != null && String(url).trim() !== '';
  const hasB64 = b64 != null && String(b64).trim() !== '';
  if (!hasUrl && !hasB64) throw fail('Geef een foto_url (https-link naar een afbeelding) of foto_base64.');
  if (hasUrl && hasB64) throw fail('Geef óf foto_url óf foto_base64, niet allebei.');
  const { buffer } = hasUrl ? await photos.fetchImage(url) : photos.decodeBase64(b64, mime);
  const stored = await photos.storeImage(buffer);
  const previous = repo.setRecipePhoto(id, stored);
  if (previous === undefined) {
    photos.removeFiles(stored.image_url, repo.recipePhotoInUse);
    throw fail(`Recept ${id} bestaat niet.`);
  }
  if (previous && previous !== stored.image_url) photos.removeFiles(previous, repo.recipePhotoInUse);
  return {
    foto: stored.image_url, foto_klein: stored.image_thumb,
    breedte: stored.breedte, hoogte: stored.hoogte, kb: Math.round(stored.bytes / 1024),
    klein: { breedte: stored.klein.breedte, hoogte: stored.klein.hoogte, kb: Math.round(stored.klein.bytes / 1024) },
    origineel: { formaat: stored.origineel.formaat, breedte: stored.origineel.breedte, hoogte: stored.origineel.hoogte, kb: Math.round(stored.origineel.bytes / 1024) },
  };
}

const FOTO_URL = str('Https-link naar een afbeelding (JPEG, PNG of WebP, max. 5 MB), bv. de thumbnail van een YouTube- of Instagram-video. '
  + 'De server haalt de foto meteen op en bewaart hem zelf, dus een link die later verloopt is geen probleem. Geen link naar een webpagina.');

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
      // Ontbijt, lunch en tussendoor zijn standaard voor 1 persoon
      const servings = Number(personen) || (['ontbijt', 'lunch', 'tussendoor'].includes(moment(m)) ? 1 : getSetting('default_servings', 2));
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
    description: 'Zoek in het receptenboek op naam, ingrediënt of label. Geeft id, titel, categorie, tijd, kcal, prijs per portie, '
      + 'of het lekker gevonden is (oordeel), sterren en notities. Houd rekening met ‘niet lekker’ en notities bij het voorstellen of plannen.',
    input: {
      zoekterm: str('Bv. ‘kip’, ‘stamppot’ of ‘vegetarisch’. Leeg = alles.'),
      categorie: str('Bv. Hoofdgerecht, Ontbijt, Lunch, Soep, Bijgerecht, Nagerecht'),
      max_minuten: int('Maximale bereidingstijd in minuten'),
      alleen_favorieten: { type: 'boolean', description: 'Alleen favorieten' },
      oordeel: { type: 'string', enum: ['lekker', 'niet_lekker', 'onbeoordeeld'], description: 'Alleen recepten die lekker of niet lekker gevonden zijn, of nog niet beoordeeld' },
      limiet: int('Maximaal aantal resultaten (standaard 20)', { minimum: 1, maximum: 100 }),
    },
    run: ({ zoekterm, categorie, max_minuten: max, alleen_favorieten: fav, oordeel, limiet }) => {
      const list = repo.listRecipes({ q: zoekterm || '', category: categorie || '', maxMinutes: Number(max) || 0, favorite: !!fav, taste: oordeel || '' });
      return {
        aantal: list.length,
        recepten: list.slice(0, Number(limiet) || 20).map((r) => ({
          id: r.id, titel: r.title, categorie: r.category, minuten: r.total_minutes || null,
          kcal_pp: round(r.kcal_per_serving), prijs_pp: euro(r.cost_per_serving_cents), favoriet: !!r.favorite,
          oordeel: tasteOut(r.taste), sterren: r.rating || undefined, notities: notesOut(r.notes),
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
        per_portie: { kcal: round(n.kcal), eiwit: n.protein, koolhydraten: n.carbs, vet: n.fat, verzadigd_vet: n.sat_fat, suiker: n.sugar, vezels: n.fiber, zout: n.salt },
        prijs_totaal: euro(r.cost_total_cents), prijs_pp: euro(r.cost_per_serving_cents),
        oordeel: tasteOut(r.taste), sterren: r.rating || null, favoriet: !!r.favorite,
        notities: r.notes || undefined,
        foto: r.image_url || null,
        dekking: coverageOut(r),
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
      foto_url: FOTO_URL,
    },
    required: ['titel', 'ingredienten', 'bereiding'],
    changes: true,
    run: async (a) => {
      if (!String(a.titel || '').trim()) throw fail('Geef het recept een titel.');
      if (!Array.isArray(a.ingredienten) || !a.ingredienten.length) throw fail('Een recept heeft ingrediënten nodig.');
      const id = repo.saveRecipe({
        title: a.titel, servings: Number(a.personen) || 4, category: a.categorie || 'Hoofdgerecht', description: a.beschrijving || '',
        prep_minutes: a.voorbereiden_min ?? null, cook_minutes: a.koken_min ?? null, tags: a.labels || [],
        steps: a.bereiding || [], notes: 'Toegevoegd door Claude',
        ingredients: a.ingredienten.map((i) => ({ name: String(i.naam || ''), quantity: i.hoeveelheid ?? null, unit: i.eenheid || '', note: i.notitie || '' })),
      });
      if (a.foto_url == null || String(a.foto_url).trim() === '') return { opgeslagen: true, ...recipeOut(id) };
      // Het recept is al opgeslagen; lukt de foto niet, dan melden we dat zonder het recept te verliezen
      try {
        return { opgeslagen: true, ...recipeOut(id), foto: await setPhoto(id, { foto_url: a.foto_url }) };
      } catch (err) {
        if (!err.toolError) console.warn(`MCP recept_opslaan foto: ${err.stack || err.message}`);
        return { opgeslagen: true, ...recipeOut(id), foto_opgeslagen: false, foto_fout: `${err.message} Het recept is wel opgeslagen; probeer de foto opnieuw met recept_foto_instellen.` };
      }
    },
  },
  recept_wijzigen: {
    description: 'Wijzig een bestaand recept (id uit recepten_zoeken). Alleen wat je meegeeft verandert; een nieuwe lijst ingrediënten '
      + 'of stappen vervangt de oude helemaal. Foto, beoordeling (lekker/sterren), notities en koppelingen blijven staan; gebruik recept_beoordelen voor oordeel en notities en recept_foto_instellen voor de foto.',
    input: {
      id: int('Id van het recept'),
      titel: str('Nieuwe naam'),
      personen: int('Voor hoeveel personen', { minimum: 1 }),
      ingredienten: {
        type: 'array',
        description: 'De complete nieuwe lijst ingrediënten',
        items: { type: 'object', properties: { naam: str('bv. ‘ui’'), hoeveelheid: num('bv. 2'), eenheid: str('bv. g, ml, el, tl, stuks'), notitie: str('bv. ‘gesnipperd’') }, required: ['naam'] },
      },
      bereiding: { type: 'array', items: { type: 'string' }, description: 'De complete nieuwe stappen' },
      categorie: str('Hoofdgerecht, Ontbijt, Lunch, Soep, Bijgerecht, Nagerecht, Snack of Bakken'),
      beschrijving: str('Korte beschrijving'),
      voorbereiden_min: int('Voorbereidingstijd in minuten'),
      koken_min: int('Kooktijd in minuten'),
      labels: { type: 'array', items: { type: 'string' }, description: 'De complete nieuwe labels' },
      favoriet: { type: 'boolean', description: 'Favoriet aan of uit' },
    },
    required: ['id'],
    changes: true,
    run: (a) => {
      const r = repo.getRecipe(Number(a.id));
      if (!r) throw fail(`Recept ${a.id} bestaat niet.`);
      if (a.titel !== undefined && !String(a.titel).trim()) throw fail('Geef het recept een titel.');
      if (a.ingredienten !== undefined && (!Array.isArray(a.ingredienten) || !a.ingredienten.length)) throw fail('Een recept heeft ingrediënten nodig.');
      const ingredients = a.ingredienten
        ? a.ingredienten.map((i) => ({ name: String(i.naam || ''), quantity: i.hoeveelheid ?? null, unit: i.eenheid || '', note: i.notitie || '' }))
        : r.ingredients.map((l) => ({
          ingredient_id: l.ingredient_id, name: l.name, quantity: l.quantity, unit: l.unit, grams: l.grams, note: l.note, optional: l.optional,
          section: l.section, amount_rule: l.amount_rule, min_quantity: l.min_quantity, auto_match: !!l.ingredient_id,
        }));
      repo.saveRecipe({
        ...r,
        title: a.titel ?? r.title, servings: Number(a.personen) || r.servings, category: a.categorie ?? r.category, description: a.beschrijving ?? r.description,
        prep_minutes: a.voorbereiden_min ?? r.prep_minutes, cook_minutes: a.koken_min ?? r.cook_minutes, tags: a.labels ?? r.tags,
        steps: a.bereiding ?? r.steps, favorite: a.favoriet ?? r.favorite, ingredients,
      }, r.id);
      return { gewijzigd: true, ...recipeOut(r.id) };
    },
  },
  recept_foto_instellen: {
    description: 'Zet of vervang de foto van een recept (id uit recepten_zoeken), bv. de thumbnail van de YouTube- of Instagram-video waar het recept vandaan komt. '
      + 'Geef foto_url (https-link naar de afbeelding zelf) of foto_base64. De foto wordt verkleind tot max. 1200 px breed (plus een kleine versie van 400 px voor lijsten) '
      + 'en in de app zelf bewaard. YouTube-thumbnail: https://i.ytimg.com/vi/<video-id>/hqdefault.jpg (of maxresdefault.jpg).',
    input: {
      id: int('Id van het recept'),
      foto_url: FOTO_URL,
      foto_base64: str('De afbeelding zelf als base64, het liefst als data-URL met mime-type: ‘data:image/jpeg;base64,…’ (JPEG, PNG of WebP, max. 5 MB)'),
      mime_type: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp'], description: 'Mime-type bij foto_base64 zonder data-URL' },
    },
    required: ['id'],
    changes: true,
    run: async (a) => {
      const id = Number(a.id);
      const r = Number.isInteger(id) ? repo.getRecipe(id) : null;
      if (!r) throw fail(`Recept ${a.id} bestaat niet.`);
      return { gelukt: true, id, titel: r.title, ...(await setPhoto(id, a)) };
    },
  },
  recept_foto_verwijderen: {
    description: 'Haal de foto van een recept weg (id uit recepten_zoeken).',
    input: { id: int('Id van het recept') },
    required: ['id'],
    changes: true,
    run: ({ id }) => {
      const r = repo.getRecipe(Number(id));
      if (!r) throw fail(`Recept ${id} bestaat niet.`);
      if (!r.image_url) return { verwijderd: false, id: r.id, titel: r.title, melding: 'Dit recept had geen foto.' };
      const previous = repo.setRecipePhoto(r.id, {});
      photos.removeFiles(previous, repo.recipePhotoInUse);
      return { verwijderd: true, id: r.id, titel: r.title };
    },
  },
  recept_beoordelen: {
    description: 'Geef aan of een recept lekker is of niet, geef sterren (1–5) en/of pas de notities aan (id uit recepten_zoeken). '
      + 'Alleen wat je meegeeft verandert. Met notitie_toevoegen komt er een regel bij; met notities vervang je alles.',
    input: {
      id: int('Id van het recept'),
      oordeel: { type: 'string', enum: ['lekker', 'niet_lekker', 'geen'], description: '‘geen’ wist het oordeel' },
      sterren: int('1–5 sterren, 0 wist de sterren', { minimum: 0, maximum: 5 }),
      notities: str('Vervangt alle notities (leeg = notities wissen)'),
      notitie_toevoegen: str('Voegt een regel toe aan de bestaande notities'),
    },
    required: ['id'],
    changes: true,
    run: ({ id, oordeel, sterren, notities, notitie_toevoegen: extra }) => {
      const r = repo.getRecipe(Number(id));
      if (!r) throw fail(`Recept ${id} bestaat niet.`);
      if (oordeel == null && sterren == null && notities == null && !String(extra || '').trim()) throw fail('Geef een oordeel, sterren of notities.');
      if (oordeel != null) {
        if (!['lekker', 'niet_lekker', 'geen'].includes(oordeel)) throw fail('Oordeel is lekker, niet_lekker of geen.');
        repo.setTaste(r.id, oordeel);
      }
      if (sterren != null) {
        const n = Number(sterren);
        if (!Number.isInteger(n) || n < 0 || n > 5) throw fail('Sterren zijn 0 t/m 5.');
        repo.setRating(r.id, n || null);
      }
      let notes = notities != null ? String(notities) : notesOut(r.notes) || '';
      if (String(extra || '').trim()) notes = [notes.trim(), String(extra).trim()].filter(Boolean).join(String.fromCharCode(10));
      if (notities != null || String(extra || '').trim()) repo.setNotes(r.id, notes);
      const u = repo.getRecipe(r.id);
      return { opgeslagen: true, id: u.id, titel: u.title, oordeel: tasteOut(u.taste), sterren: u.rating || null, notities: u.notes || '' };
    },
  },
  recept_verwijderen: {
    description: 'Verwijder een recept uit het receptenboek (id uit recepten_zoeken). Staat het nog gepland vanaf vandaag, dan weigert '
      + 'dit, tenzij ook_uit_planning aan staat. Wat in het dagboek staat, blijft bewaard.',
    input: {
      id: int('Id van het recept'),
      ook_uit_planning: { type: 'boolean', description: 'Ook weghalen uit de planning (standaard niet)' },
    },
    required: ['id'],
    changes: true,
    run: ({ id, ook_uit_planning }) => {
      const r = repo.getRecipe(Number(id));
      if (!r) throw fail(`Recept ${id} bestaat niet.`);
      const planned = repo.plannedDates(r.id, todayISO());
      if (planned.length && !ook_uit_planning) throw fail(`‘${r.title}’ staat nog gepland op ${planned.join(', ')}. Haal het daar eerst weg of zet ook_uit_planning aan.`);
      repo.deleteRecipe(r.id);
      return { verwijderd: true, id: r.id, titel: r.title, uit_planning: planned };
    },
  },
  ingredient_zoeken: {
    description: 'Zoek ingrediënten in de database op naam of alias. Geeft voedingswaarden per 100 g, gram per stuk en gram per el/tl. '
      + 'Gebruik dit vóór ingredient_toevoegen, zodat je geen dubbele ingrediënten maakt.',
    input: { naam: str('Bv. ‘sjalot’ of ‘varkensschouder’'), limiet: int('Maximaal aantal resultaten (standaard 5)', { minimum: 1, maximum: 25 }) },
    required: ['naam'],
    run: ({ naam, limiet }) => {
      const max = Number(limiet) || 5;
      const hit = repo.matchIngredient(naam);
      const rest = repo.suggestIngredients(naam, max + 1).filter((i) => i.id !== hit?.id).slice(0, hit ? max - 1 : max);
      return {
        gevonden: hit ? ingredientOut(hit) : null,
        melding: hit ? undefined : `‘${naam}’ niet gevonden${rest.length ? `, bedoel je: ${rest.map((i) => i.name).join(', ')}?` : '.'}`,
        andere: rest.map(ingredientOut),
      };
    },
  },
  ingredient_toevoegen: {
    description: 'Voeg een ingrediënt toe aan de database (waarden per 100 g; zout in gram, niet natrium), of werk een bestaand ingrediënt bij '
      + 'met bijwerken: true. Receptregels met deze naam of een alias die nog niet gekoppeld waren, worden daarna automatisch gekoppeld. '
      + 'Gebruik echte waarden (NEVO of het etiket). Vul gram_per_stuk alleen in als het realistische gewicht bekend is.',
    input: {
      naam: str('Naam in het Nederlands, enkelvoud, bv. ‘varkensschouder’'),
      kcal: num('kcal per 100 g'), eiwit: num('Eiwit in g per 100 g'), koolhydraten: num('Koolhydraten in g per 100 g'), vet: num('Vet in g per 100 g'),
      verzadigd_vet: num('Verzadigd vet in g per 100 g'), suiker: num('Suikers in g per 100 g'), vezels: num('Vezels in g per 100 g'),
      zout: num('Zout in g per 100 g (natrium × 2,5)'),
      gram_per_stuk: num('Gewicht van 1 stuk/stengel/teen/takje in gram'),
      gram_per_el: num('Gewicht van 1 eetlepel in gram (water ≈ 15)'),
      gram_per_tl: num('Gewicht van 1 theelepel in gram (water ≈ 5); alleen nodig zonder gram_per_el'),
      aliassen: { type: 'array', items: { type: 'string' }, description: 'Andere namen, bv. [‘sjalotten’, ‘sjalotje’]' },
      afdeling: str('Afdeling in de winkel, bv. ‘Vlees, vis & vega’ of ‘Kruiden, specerijen & bakken’'),
      voorraadkast: { type: 'boolean', description: 'Staat meestal in huis (zout, olie, kruiden): niet standaard op de boodschappenlijst' },
      bijwerken: { type: 'boolean', description: 'Een bestaand ingrediënt met deze naam of alias bijwerken in plaats van een fout geven' },
    },
    required: ['naam'],
    changes: true,
    run: (a) => {
      const name = String(a.naam || '').trim().toLowerCase();
      if (!name) throw fail('Geef een naam.');
      const found = repo.matchIngredient(name);
      const exact = found && aliasesOf(found).includes(name) ? found : null;
      if (exact && !a.bijwerken) throw fail(`‘${name}’ bestaat al als ‘${exact.name}’ (id ${exact.id}). Gebruik bijwerken: true om de waarden aan te passen.`);
      for (const k of ['kcal', 'eiwit', 'koolhydraten', 'vet', 'verzadigd_vet', 'suiker', 'vezels', 'zout', 'gram_per_stuk', 'gram_per_el', 'gram_per_tl']) {
        if (a[k] != null && !(Number(a[k]) >= 0)) throw fail(`${k} moet een getal van 0 of meer zijn.`);
      }
      for (const k of ['eiwit', 'koolhydraten', 'vet', 'verzadigd_vet', 'suiker', 'vezels', 'zout']) {
        if (a[k] != null && Number(a[k]) > 100) throw fail(`${k} is in gram per 100 g en kan niet boven 100 liggen.`);
      }
      if (!exact && a.kcal == null) throw fail('Geef voor een nieuw ingrediënt minstens kcal (en liefst alle voedingswaarden) per 100 g.');
      const density = a.gram_per_el != null ? Number(a.gram_per_el) / 15 : a.gram_per_tl != null ? Number(a.gram_per_tl) / 5 : undefined;
      const data = Object.fromEntries(Object.entries({
        name: exact ? undefined : name, category: a.afdeling, kcal: a.kcal, protein: a.eiwit, carbs: a.koolhydraten, fat: a.vet,
        sat_fat: a.verzadigd_vet, sugar: a.suiker, fiber: a.vezels, salt: a.zout, unit_weight_g: a.gram_per_stuk, density,
        pantry: a.voorraadkast, nutrition_source: a.kcal != null ? 'Claude (via MCP)' : undefined,
      }).filter(([, v]) => v !== undefined));
      let ing = exact ? repo.saveIngredient(data, exact.id) : repo.saveIngredient({ category: 'Overig', ...data });
      for (const alias of a.aliassen || []) ing = repo.addIngredientAlias(ing.id, alias);
      const linked = repo.relinkUnlinked();
      return { [exact ? 'bijgewerkt' : 'toegevoegd']: true, ingredient: ingredientOut(ing), nieuw_gekoppelde_receptregels: linked };
    },
  },
  verpakkingen_bekijken: {
    description: 'De verpakkingen van een ingrediënt met gewicht en prijs. De boodschappenlijst kiest hieruit de goedkoopste combinatie.',
    input: { ingredient: str('Naam van het ingrediënt') },
    required: ['ingredient'],
    run: ({ ingredient }) => {
      const ing = repo.matchIngredient(ingredient);
      if (!ing) throw fail(`Ingrediënt ‘${ingredient}’ niet gevonden.`);
      return { ingredient: ing.name, verpakkingen: repo.getPackages(ing.id).map(packageOut) };
    },
  },
  verpakking_opslaan: {
    description: 'Voeg een verpakkingsgrootte toe aan een ingrediënt, of werk de prijs bij als dit gewicht al bestaat. Alleen doen met een echte prijs, niet met een schatting.',
    input: { ingredient: str('Naam van het ingrediënt'), gram: num('Gewicht of inhoud van de verpakking in gram'), prijs: num('Prijs in euro, bv. 3.49'), label: str('Naam van de verpakking, bv. ‘6 stuks’. Leeg = het gewicht.') },
    required: ['ingredient', 'gram'],
    changes: true,
    run: ({ ingredient, gram, prijs, label }) => {
      const ing = repo.matchIngredient(ingredient);
      if (!ing) throw fail(`Ingrediënt ‘${ingredient}’ niet gevonden.`);
      if (!(Number(gram) > 0)) throw fail('Geef het gewicht van de verpakking op.');
      const list = repo.savePackage(ing.id, { grams: Number(gram), label: label || null, price_cents: prijs == null ? null : Math.round(Number(prijs) * 100), price_note: 'Via Claude' });
      return { opgeslagen: true, ingredient: ing.name, verpakkingen: list.map(packageOut) };
    },
  },
  verpakking_verwijderen: {
    description: 'Haal een verpakkingsgrootte weg bij een ingrediënt. Gaat de hoofdverpakking weg, dan schuift de volgende door.',
    input: { ingredient: str('Naam van het ingrediënt'), gram: num('Gewicht van de verpakking in gram') },
    required: ['ingredient', 'gram'],
    changes: true,
    run: ({ ingredient, gram }) => {
      const ing = repo.matchIngredient(ingredient);
      if (!ing) throw fail(`Ingrediënt ‘${ingredient}’ niet gevonden.`);
      const option = repo.getPackages(ing.id).find((o) => o.grams === Number(gram));
      if (!option) throw fail(`${ing.name} heeft geen verpakking van ${gram} g.`);
      return { verwijderd: true, ingredient: ing.name, verpakkingen: repo.deletePackage(ing.id, option.key).map(packageOut) };
    },
  },
  boodschappenlijst: {
    description: 'De boodschappenlijst van een week (maandag t/m zondag) volgens de planner: wat nog gehaald moet worden, '
      + 'wat al is afgevinkt of in huis is, en eigen artikelen.',
    input: { week: str('Een datum in de week (JJJJ-MM-DD). Leeg = deze week.') },
    run: ({ week }) => {
      const list = repo.getShoppingList(weekOf(week), 7);
      const label = (i) => (i.package_text ? i.package_text : i.grams ? `${Math.round(i.grams)} g` : null);
      const open = list.items.filter((i) => !i.checked && !i.have && !i.pantry);
      return {
        week: `${list.start} t/m ${list.end}`,
        gekozen_dagen: list.days.filter((d) => d.selected).map((d) => d.date),
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
        totaal: { kcal: round(t.kcal), eiwit: t.protein, koolhydraten: t.carbs, vet: t.fat, verzadigd_vet: t.sat_fat, vezels: t.fiber, suiker: t.sugar, zout: t.salt },
        doel: targetsOut(d.targets),
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
  doelen_bekijken: {
    description: 'Je dagdoelen (kcal, eiwit, koolhydraten, vet, verzadigd vet, suiker, vezels, zout) en doelgewicht, met wat de app automatisch zou berekenen en welke doelen je zelf hebt ingesteld.',
    input: {},
    run: (_, { person }) => goalsOut(person),
  },
  doelen_aanpassen: {
    description: 'Pas je dagdoelen of doelgewicht aan. Alleen wat je meegeeft verandert. Geef 0 om een doel terug te zetten op automatisch berekenen (of bij doelgewicht: geen doel).',
    input: {
      kcal: num('Kilocalorieën per dag'),
      eiwit: num('Eiwit in gram per dag'),
      koolhydraten: num('Koolhydraten in gram per dag'),
      vet: num('Vet in gram per dag'),
      verzadigd_vet: num('Verzadigd vet in gram per dag'),
      suiker: num('Suikers in gram per dag'),
      vezels: num('Vezels in gram per dag'),
      zout: num('Zout in gram per dag'),
      doelgewicht_kg: num('Doelgewicht in kilo'),
    },
    changes: true,
    run: (a, { person }) => {
      const value = (v) => (Number(v) === 0 ? null : v);
      const nutrients = Object.fromEntries(Object.entries(TARGET_NAMES).filter(([naam]) => a[naam] !== undefined).map(([naam, key]) => [key, value(a[naam])]));
      const changes = { nutrients };
      if (a.kcal !== undefined) changes.kcal = value(a.kcal);
      if (a.doelgewicht_kg !== undefined) changes.weight = value(a.doelgewicht_kg);
      if (!Object.keys(nutrients).length && !('kcal' in changes) && !('weight' in changes)) throw fail('Geef minstens één doel mee.');
      try {
        return { aangepast: true, ...goalsOut(tracker.updateTargets(person.id, changes)) };
      } catch (err) { throw fail(err.message); }
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

const TARGET_NAMES = {
  eiwit: 'protein', koolhydraten: 'carbs', vet: 'fat', verzadigd_vet: 'sat_fat', suiker: 'sugar', vezels: 'fiber', zout: 'salt',
};

/** Alle dagdoelen in de woorden van de koppeling. */
function targetsOut(t) {
  return {
    kcal: t.kcal, eiwit: t.protein, koolhydraten: t.carbs, vet: t.fat, verzadigd_vet: t.sat_fat, suiker: t.sugar, vezels: t.fiber, zout: t.salt,
  };
}

function goalsOut(person) {
  return {
    persoon: person.name,
    doelen: targetsOut(person.targets),
    automatisch: targetsOut({ ...person.targets_auto, kcal: null }),
    eigen_doelen: [
      ...(person.kcal_target_override ? ['kcal'] : []),
      ...Object.entries(TARGET_NAMES).filter(([, key]) => person.target_overrides?.[key] != null).map(([naam]) => naam),
    ],
    doel_kg: person.target_weight_kg ?? null,
  };
}

/** Hoe betrouwbaar zijn de voedingswaarden? Deel van het gewicht dat gekoppeld is, plus wat ontbreekt (met suggesties). */
function coverageOut(r) {
  const c = r.coverage || { percent: 100, linked_grams: 0, unlinked_grams: 0, unlinked: [], unknown_weight: [] };
  const niet = c.unlinked.map((name) => {
    const s = repo.suggestIngredients(name).map((i) => i.name);
    return { naam: name, ...(s.length ? { bedoel_je: s } : {}) };
  });
  const tips = [];
  if (niet.length) tips.push('Voeg ontbrekende ingrediënten toe met ingredient_toevoegen; de receptregels koppelen daarna vanzelf.');
  if (c.unknown_weight.length) tips.push('Van gewicht_onbekend is het gewicht per stuk niet bekend: geef de hoeveelheid in gram, of vul gram_per_stuk in met ingredient_toevoegen (bijwerken: true).');
  return {
    procent: c.percent,
    gekoppeld_gram: c.linked_grams,
    niet_gekoppeld_gram: c.unlinked_grams,
    niet_gekoppeld: niet.length ? niet : undefined,
    gewicht_onbekend: c.unknown_weight.length ? c.unknown_weight : undefined,
    betrouwbaar: c.percent >= 90 && !c.unknown_weight.length,
    tip: tips.length ? tips.join(' ') : undefined,
  };
}

function recipeOut(id) {
  const r = repo.getRecipe(id);
  const n = r.nutrition_per_serving;
  return {
    id, titel: r.title, kcal_pp: round(n.kcal), eiwit_pp: n.protein, zout_pp: n.salt, prijs_pp: euro(r.cost_per_serving_cents),
    dekking: coverageOut(r),
  };
}

const ingredientOut = (i) => ({
  id: i.id, naam: i.name, aliassen: String(i.aliases || '').split(',').map((a) => a.trim()).filter(Boolean), afdeling: i.category,
  per_100g: { kcal: i.kcal, eiwit: i.protein, koolhydraten: i.carbs, suiker: i.sugar, vet: i.fat, verzadigd_vet: i.sat_fat, vezels: i.fiber, zout: i.salt },
  gram_per_stuk: i.unit_weight_g ?? null,
  gram_per_el: i.density ? Math.round(i.density * 15 * 10) / 10 : null,
  gram_per_tl: i.density ? Math.round(i.density * 5 * 10) / 10 : null,
  voorraadkast: !!i.pantry, bron: i.nutrition_source || undefined,
});

const aliasesOf = (i) => [i.name, ...String(i.aliases || '').split(',')].map((x) => x.trim().toLowerCase()).filter(Boolean);

const INSTRUCTIONS = 'Maaltijden is de maaltijdplanner van het huishouden: weekplanner, receptenboek, boodschappenlijst en een '
  + 'calorieëndagboek met gewicht. Antwoord in het Nederlands. Datums zijn JJJJ-MM-DD; momenten zijn ontbijt, lunch, diner en tussendoor. '
  + 'Zoek eerst een recept met recepten_zoeken voordat je het plant. Recepten hebben een oordeel (lekker/niet lekker) en notities: stel geen ‘niet lekker’-recepten voor zonder dat te zeggen, houd rekening met notities, en leg een oordeel of notitie vast met recept_beoordelen. Het dagboek en gewicht zijn van de persoon van deze koppeling. '
  + 'Kijk bij recepten naar dekking: ontbreken ingrediënten, zoek ze met ingredient_zoeken en voeg ze toe met ingredient_toevoegen. '
  + 'Recepten kunnen een foto hebben: komt een recept uit een YouTube- of Instagram-video, zet dan de thumbnail als foto met foto_url bij recept_opslaan '
  + 'of later met recept_foto_instellen (https-link naar de afbeelding zelf; de app bewaart de foto zelf). Haal een foto weg met recept_foto_verwijderen.';

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
