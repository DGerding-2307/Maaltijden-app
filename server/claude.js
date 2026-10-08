// Claude AI-integratie: recepten importeren/genereren, weekmenu voorstellen, ingrediënten schatten en vragen beantwoorden.
import Anthropic from '@anthropic-ai/sdk';
import { getSetting } from './db.js';
import { CATEGORIES } from './seed.js';
import { listIngredients } from './repo.js';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
let cachedClient = null;
let cachedKey = null;

// Keuze in Instellingen. Prijzen in dollar per miljoen tokens (invoer / uitvoer).
// Een typische actie (recept importeren, weekmenu) gebruikt ± 6.000 invoer- en 3.000 uitvoertokens.
export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', input: 4, output: 20, fallback: true,
    note: 'Beste kwaliteit (standaard). Nauwkeurigst bij het omzetten van recepten en schatten van voedingswaarden.' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', input: 2, output: 10, fallback: true,
    note: 'Half zo duur, bijna even goed. Een goede keuze voor dagelijks gebruik.' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', input: 0.1, output: 0.5, fallback: false,
    note: 'Veruit het goedkoopst en snelst. Prima voor eenvoudige recepten en vragen; maakt bij lastige teksten of schattingen vaker foutjes.' },
];
export const DEFAULT_MODEL = 'claude-opus-5-5';
const TYPICAL = { input: 6000, output: 3000 };
const modelInfo = (id) => MODELS.find((m) => m.id === id);

export function getModel() {
  if (process.env.CLAUDE_MODEL) return process.env.CLAUDE_MODEL;
  const chosen = getSetting('claude_model', null);
  return modelInfo(chosen) ? chosen : DEFAULT_MODEL;
}

/** Modellen met geschatte kosten per typische actie, voor de keuzelijst in Instellingen. */
export function modelOptions() {
  return MODELS.map(({ fallback, ...m }) => ({
    ...m,
    cost_per_action_usd: Math.round(((TYPICAL.input * m.input + TYPICAL.output * m.output) / 1e6) * 1000) / 1000,
  }));
}

// Spaties, regeleinden of aanhalingstekens rond een geplakte sleutel (bv. in Portainer) weghalen
const cleanKey = (k) => String(k || '').trim().replace(/^["']+|["']+$/g, '').trim() || null;

function apiKey() {
  return cleanKey(process.env.ANTHROPIC_API_KEY) || cleanKey(getSetting('anthropic_api_key', null));
}

export function claudeStatus() {
  return {
    configured: !!apiKey(), from_env: !!cleanKey(process.env.ANTHROPIC_API_KEY), model: getModel(),
    model_from_env: !!process.env.CLAUDE_MODEL, models: modelOptions(),
  };
}

function client() {
  const key = apiKey();
  if (!key) {
    const err = new Error('Claude is nog niet ingesteld. Voeg je Anthropic API-sleutel toe bij Instellingen of via ANTHROPIC_API_KEY.');
    err.status = 400;
    throw err;
  }
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new Anthropic({ apiKey: key });
    cachedKey = key;
  }
  return cachedClient;
}

/** De foutmelding van de API zelf (zonder JSON eromheen). */
function apiMessage(err) {
  return err?.error?.error?.message || err?.message || '';
}

/** Vertaal SDK-fouten naar duidelijke Nederlandse meldingen. */
export function friendlyError(err) {
  const out = translateError(err);
  // Claude-fouten altijd loggen, zodat ze in de containerlogs (Portainer/Docker) te zien zijn
  if (err instanceof Anthropic.APIError) console.error(`Claude-fout (${err.status ?? 'geen verbinding'}): ${apiMessage(err)}`);
  return out;
}

function translateError(err) {
  const msg = apiMessage(err);
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, message: 'De Anthropic API-sleutel wordt niet geaccepteerd. Controleer of je de hele sleutel (begint met sk-ant-) hebt geplakt, en of hij niet is ingetrokken op platform.claude.com.' };
  }
  if (/credit balance|billing|purchase credits/i.test(msg)) {
    return { status: 402, message: 'Er is geen API-tegoed beschikbaar voor deze sleutel. Controleer op platform.claude.com → Billing of de organisatie tegoed heeft. Met Claude Max of Team: koppel je API-tegoed op claude.ai (Instellingen → Billing → API credits) en maak de sleutel aan in díe gekoppelde organisatie.' };
  }
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 403, message: `Deze API-sleutel heeft geen toegang tot het model ${getModel()}. ${msg}` };
  if (err instanceof Anthropic.NotFoundError) return { status: 404, message: `Het Claude-model "${getModel()}" is niet gevonden voor deze sleutel. Controleer CLAUDE_MODEL of laat het leeg.` };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: 'Claude is even te druk of je limiet is bereikt (rate limit). Probeer het zo opnieuw.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: `Claude kon het verzoek niet verwerken: ${msg}` };
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: 'Kan geen verbinding maken met Claude (api.anthropic.com). Controleer of de server/container internet heeft en geen firewall of DNS-blokkade dit tegenhoudt.' };
  }
  if (err instanceof Anthropic.APIError && (err.status === 529 || err.status >= 500)) {
    return { status: 503, message: 'Claude is tijdelijk overbelast of niet bereikbaar. Probeer het over een paar minuten opnieuw.' };
  }
  if (err instanceof Anthropic.APIError) return { status: 502, message: `Fout bij Claude: ${msg}` };
  return { status: err.status || 500, message: err.message || 'Onbekende fout' };
}

// Terugvallen op een ander model bij een weigering is een bèta-functie (niet bij Haiku). Wordt die (nog)
// niet geaccepteerd voor dit account of model, dan gaat het verder zonder, in plaats van dat alles faalt.
const fallbackRejected = new Set();
async function withFallback(run) {
  const model = getModel();
  if (fallbackRejected.has(model) || modelInfo(model)?.fallback === false) return run({});
  try {
    return await run({ betas: [FALLBACK_BETA], fallbacks: 'default' });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && /fallback|beta|anthropic-beta/i.test(apiMessage(err))) {
      console.warn(`Claude: terugvalfunctie niet beschikbaar (${apiMessage(err)}); verder zonder.`);
      fallbackRejected.add(model);
      return run({});
    }
    throw err;
  }
}

/** Kleine testaanvraag om de sleutel, het tegoed en de verbinding te controleren. */
export async function testConnection() {
  const t0 = Date.now();
  const response = await withFallback((extra) => client().beta.messages.create({
    model: getModel(),
    max_tokens: 2000,
    ...extra,
    messages: [{ role: 'user', content: 'Antwoord alleen met het woord: OK' }],
    output_config: { effort: 'low' },
  }));
  return { ok: true, model: response.model, ms: Date.now() - t0 };
}

const SYSTEM = `Je bent de kookassistent van een Nederlandse maaltijdplanner en receptenboek-app.
Je schrijft altijd in het Nederlands, met Nederlandse ingrediëntnamen en eenheden (g, kg, ml, l, el, tl, stuk, teen, snufje, blik, pak, zakje, bos, plak).
Gebruik ingrediënten die gewoon te koop zijn bij een Nederlandse supermarkt zoals de Jumbo.
Bereidingsstappen zijn kort, concreet en in de gebiedende wijs ("Snijd de ui fijn.").`;

const nullableNumber = { type: ['number', 'null'] };

const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'kcal', 'protein', 'carbs', 'sugar', 'fat', 'sat_fat', 'fiber', 'salt', 'unit_weight_g', 'package_grams', 'price_cents', 'pantry'],
  properties: {
    category: { type: 'string', enum: CATEGORIES },
    kcal: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, sugar: { type: 'number' },
    fat: { type: 'number' }, sat_fat: { type: 'number' }, fiber: { type: 'number' }, salt: { type: 'number' },
    unit_weight_g: nullableNumber,
    package_grams: { type: 'number' },
    price_cents: { type: 'integer' },
    pantry: { type: 'boolean' },
  },
};

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'servings', 'prep_minutes', 'cook_minutes', 'category', 'cuisine', 'tags', 'steps', 'ingredients'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    servings: { type: 'integer' },
    prep_minutes: { type: ['integer', 'null'] },
    cook_minutes: { type: ['integer', 'null'] },
    category: { type: 'string', enum: ['Ontbijt', 'Lunch', 'Hoofdgerecht', 'Soep', 'Bijgerecht', 'Salade', 'Nagerecht', 'Snack', 'Bakken'] },
    cuisine: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    steps: { type: 'array', items: { type: 'string' } },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'quantity', 'unit', 'grams', 'note', 'optional', 'known', 'estimate'],
        properties: {
          name: { type: 'string' },
          quantity: nullableNumber,
          unit: { type: 'string' },
          grams: nullableNumber,
          note: { type: 'string' },
          optional: { type: 'boolean' },
          known: { type: 'boolean' },
          estimate: { anyOf: [ESTIMATE_SCHEMA, { type: 'null' }] },
        },
      },
    },
  },
};

function knownIngredientList() {
  // Stabiele volgorde zodat de systeemprompt cachebaar blijft.
  return listIngredients().map((i) => i.name).sort((a, b) => a.localeCompare(b, 'nl')).join(', ');
}

function recipeInstructions() {
  return `Regels voor het recept-JSON:
- Zet het recept om naar Nederlands als het in een andere taal is; reken Amerikaanse maten (cups, oz, lb, °F) om naar metrisch.
- "name" is de korte ingrediëntnaam zonder hoeveelheid of bereiding (bereiding gaat in "note", bv. "fijngesneden").
- Gebruik waar het past exact een naam uit de lijst bekende ingrediënten en zet dan "known": true en "estimate": null.
- Staat een ingrediënt niet in de lijst, zet dan "known": false en vul "estimate" met een realistische schatting per 100 g
  (NEVO-achtige voedingswaarden), het gewicht van 1 stuk indien van toepassing, een gangbare Jumbo-verpakking (package_grams)
  met prijs in centen, en pantry=true voor voorraadkast-artikelen zoals specerijen, olie en sauzen.
- "grams" is het geschatte totaalgewicht in gram van de regel als de eenheid geen g/kg/ml/l is (bv. 1 stuk ui → 100); anders null.
- "servings" is het aantal personen; standaard 4 als het onbekend is.
- Tags zijn korte kenmerken in kleine letters (bv. "vegetarisch", "snel", "stamppot", "kinderen", "glutenvrij").

Bekende ingrediënten: ${knownIngredientList()}`;
}

async function structuredCall({ system, content, schema, effort = 'medium', maxTokens = 16000 }) {
  const response = await withFallback((extra) => client().beta.messages.create({
    model: getModel(),
    max_tokens: maxTokens,
    ...extra,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  }));
  if (response.stop_reason === 'refusal') {
    const e = new Error('Claude heeft dit verzoek geweigerd.');
    e.status = 422;
    throw e;
  }
  if (response.stop_reason === 'max_tokens') {
    const e = new Error('Het antwoord van Claude was te lang en is afgebroken. Probeer een kortere tekst.');
    e.status = 422;
    throw e;
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return JSON.parse(text);
  } catch {
    const e = new Error('Claude gaf geen geldig JSON-antwoord terug.');
    e.status = 502;
    throw e;
  }
}

// ---------- Recept van webpagina ----------

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Haal schema.org Recipe JSON-LD uit HTML (de meeste receptensites leveren dit). */
export function extractJsonLdRecipe(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const isRecipe = (o) => o && (o['@type'] === 'Recipe' || (Array.isArray(o['@type']) && o['@type'].includes('Recipe')));
  for (const [, raw] of blocks) {
    try {
      const json = JSON.parse(raw.trim());
      const candidates = [json, ...(Array.isArray(json) ? json : []), ...(json['@graph'] || [])];
      const found = candidates.find(isRecipe);
      if (found) return found;
    } catch {
      /* ongeldige JSON-LD negeren */
    }
  }
  return null;
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export async function fetchRecipePage(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw Object.assign(new Error('Ongeldige URL'), { status: 400 });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw Object.assign(new Error('Alleen http(s)-links'), { status: 400 });
  const res = await fetch(parsed, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Maaltijden-app recept-import)', 'Accept-Language': 'nl-NL,nl;q=0.9' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw Object.assign(new Error(`Pagina ophalen mislukt (status ${res.status})`), { status: 502 });
  const html = await res.text();
  const jsonLd = extractJsonLdRecipe(html);
  const image = jsonLd ? [].concat(jsonLd.image || []).map((i) => (typeof i === 'string' ? i : i?.url)).find(Boolean) : null;
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] || null;
  return { jsonLd, text: htmlToText(html), image: image || ogImage };
}

const MAX_SOURCE_CHARS = 150000;

export async function importRecipe({ url, text, image }) {
  const content = [];
  let source = { image_url: null, source_url: url || null };
  let truncated = false;
  if (url) {
    const page = await fetchRecipePage(url);
    source.image_url = page.image;
    let body = page.jsonLd ? JSON.stringify(page.jsonLd) : page.text;
    if (body.length > MAX_SOURCE_CHARS) {
      body = body.slice(0, MAX_SOURCE_CHARS);
      truncated = true;
    }
    content.push({ type: 'text', text: `Recept van ${url} (${page.jsonLd ? 'schema.org JSON-LD' : 'paginatekst'}):\n\n${body}` });
  }
  if (image?.data) {
    const isPdf = image.media_type === 'application/pdf';
    content.push(isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: image.data } }
      : { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  }
  if (text) content.push({ type: 'text', text: `Recepttekst:\n\n${text}` });
  if (!content.length) throw Object.assign(new Error('Geef een URL, tekst of foto op'), { status: 400 });
  content.push({ type: 'text', text: 'Zet dit recept om naar het gevraagde JSON-formaat. Als er geen recept in staat, maak dan een zo goed mogelijke reconstructie en vermeld dat in de beschrijving.' });
  const recipe = await structuredCall({ system: `${SYSTEM}\n\n${recipeInstructions()}`, content, schema: RECIPE_SCHEMA });
  return { ...recipe, ...source, truncated };
}

export async function generateRecipe({ prompt, servings, image }) {
  const content = [];
  if (image?.data && /^image\//.test(image.media_type)) {
    // Foto van koelkast/voorraadkast: Claude bedenkt iets met wat er te zien is.
    content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
    content.push({ type: 'text', text: 'Op deze foto staat wat ik in huis heb. Gebruik zoveel mogelijk van deze ingrediënten; basisvoorraad (olie, zout, peper, kruiden) mag je aannemen.' });
  }
  content.push({
    type: 'text',
    text: `Bedenk een recept op basis van deze wens: "${prompt || 'iets lekkers met wat ik in huis heb'}".
Aantal personen: ${servings || 4}.${getSetting('household', '') ? `\nHuishouden/voorkeuren: ${getSetting('household', '')}` : ''}
Maak het praktisch, betaalbaar en lekker, passend bij de Nederlandse keuken of wat Nederlanders graag eten.`,
  });
  return structuredCall({ system: `${SYSTEM}\n\n${recipeInstructions()}`, content, schema: RECIPE_SCHEMA });
}

export async function estimateIngredient(name) {
  const result = await structuredCall({
    system: SYSTEM,
    content: [{ type: 'text', text: `Geef voor het ingrediënt "${name}" de voedingswaarden per 100 g (NEVO-achtig), de afdeling, het gewicht van 1 stuk (of null), een gangbare Jumbo-verpakking in gram met een realistische prijs in centen, en of het een voorraadkast-artikel is.` }],
    schema: ESTIMATE_SCHEMA,
    effort: 'low',
    maxTokens: 4000,
  });
  return result;
}

// ---------- Ingrediënt uit een webwinkel ----------

const SHOP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'name', 'product_name', 'brand', 'category', 'kcal', 'protein', 'carbs', 'sugar', 'fat', 'sat_fat', 'fiber', 'salt',
    'package_grams', 'package_label', 'price_cents', 'unit_weight_g', 'pantry', 'ean', 'image_url'],
  properties: {
    found: { type: 'boolean' },
    name: { type: 'string' },
    product_name: { type: 'string' },
    brand: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES },
    kcal: nullableNumber, protein: nullableNumber, carbs: nullableNumber, sugar: nullableNumber,
    fat: nullableNumber, sat_fat: nullableNumber, fiber: nullableNumber, salt: nullableNumber,
    package_grams: nullableNumber,
    package_label: { type: 'string' },
    price_cents: { type: ['integer', 'null'] },
    unit_weight_g: nullableNumber,
    pantry: { type: 'boolean' },
    ean: { type: ['string', 'null'] },
    image_url: { type: ['string', 'null'] },
  },
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Productpagina van een webwinkel ophalen: JSON-LD Product, meta-tags en paginatekst. */
export async function fetchShopPage(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw Object.assign(new Error('Dit is geen geldige link'), { status: 400 }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw Object.assign(new Error('Alleen http(s)-links'), { status: 400 });
  let res;
  try {
    res = await fetch(parsed, {
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'nl-NL,nl;q=0.9', Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Object.assign(new Error('De winkelpagina kon niet worden opgehaald (geen verbinding of time-out).'), { status: 502 });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`De winkel geeft de pagina niet vrij (status ${res.status}). Sommige webwinkels blokkeren automatisch ophalen; vul de gegevens dan zelf in of scan de barcode.`), { status: 502 });
  }
  const html = await res.text();
  const products = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(([, raw]) => {
    try {
      const json = JSON.parse(raw.trim());
      const all = [json, ...(Array.isArray(json) ? json : []), ...(json['@graph'] || [])];
      return all.filter((o) => o && [].concat(o['@type'] || []).includes('Product'));
    } catch { return []; }
  });
  const meta = (prop) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, 'i'))?.[1] || null;
  const abs = (u) => { try { return u ? new URL(u, parsed).href : null; } catch { return null; } };
  const ldImage = products.map((p) => [].concat(p.image || [])[0]).map((i) => (typeof i === 'string' ? i : i?.url)).find(Boolean);
  return {
    url: parsed.href,
    host: parsed.hostname.replace(/^www\./, ''),
    products,
    title: meta('og:title') || html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() || '',
    image: abs(ldImage || meta('og:image')),
    text: htmlToText(html).slice(0, 60000),
  };
}

/** Productinformatie uit een webwinkel-link halen en omzetten naar ingrediëntvelden. */
export async function ingredientFromShop(url) {
  const page = await fetchShopPage(url);
  const content = [{
    type: 'text',
    text: `Productpagina van ${page.host} (${page.url})
Titel: ${page.title}
Afbeelding: ${page.image || 'onbekend'}
${page.products.length ? `schema.org Product (JSON-LD):\n${JSON.stringify(page.products).slice(0, 20000)}\n` : ''}
Paginatekst:
${page.text}

Haal hieruit de gegevens voor een ingrediënt in de maaltijdplanner:
- "name": korte, algemene Nederlandse ingrediëntnaam in kleine letters zonder merk of verpakking (bv. "griekse yoghurt", "kipfilet", "patak's butter chicken saus" als het een specifiek product is dat zo in recepten staat).
- "product_name" en "brand": zoals op de pagina.
- Voedingswaarden per 100 g (of 100 ml) precies zoals op de pagina; staan ze er niet, zet ze op null en "found" alleen op false als het geen productpagina is.
- "package_grams": inhoud van de verpakking in gram (ml telt als gram); "package_label" zoals op de verpakking (bv. "500 g", "6 stuks").
- "price_cents": de huidige prijs van de verpakking in centen (geen kiloprijs); null als onbekend.
- "unit_weight_g": gewicht van 1 stuk als het product per stuk gebruikt wordt (bv. 1 ei, 1 paprika), anders null.
- "pantry": true voor voorraadkast-artikelen (kruiden, olie, sauzen, bloem).
- "ean": de barcode (EAN/GTIN) als die op de pagina staat, anders null.
- "image_url": de productfoto (absolute URL), bij voorkeur ${page.image || 'de hoofdafbeelding'}; null als er geen is.`,
  }];
  const data = await structuredCall({ system: SYSTEM, content, schema: SHOP_SCHEMA, effort: 'low', maxTokens: 6000 });
  if (!data.found) throw Object.assign(new Error('Op deze pagina is geen product gevonden.'), { status: 422 });
  const hasNutrition = data.kcal != null;
  return {
    ...data,
    image_url: data.image_url || page.image,
    shop_url: page.url,
    shop_host: page.host,
    nutrition_source: hasNutrition ? `Webwinkel ${page.host}: ${data.product_name}`.slice(0, 200) : null,
  };
}

// ---------- Weekmenu ----------

const WEEK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'entries'],
  properties: {
    summary: { type: 'string' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'meal', 'recipe_id', 'new_recipe_idea', 'reason'],
        properties: {
          date: { type: 'string' },
          meal: { type: 'string' },
          recipe_id: { type: ['integer', 'null'] },
          new_recipe_idea: { type: ['string', 'null'] },
          reason: { type: 'string' },
        },
      },
    },
  },
};

export async function suggestWeekMenu({ dates, meals, recipes, preferences, budgetCents, servings, existing }) {
  const recipeList = recipes.map((r) => ({
    id: r.id, titel: r.title, categorie: r.category, tags: r.tags, minuten: r.total_minutes,
    kcal_pp: r.kcal_per_serving, eiwit_pp: r.protein_per_serving, prijs_pp_euro: (r.cost_per_serving_cents / 100).toFixed(2), favoriet: r.favorite,
  }));
  const text = `Stel een weekmenu samen.
Datums: ${dates.join(', ')}
Maaltijdmomenten om te vullen: ${meals.join(', ')}
Aantal personen: ${servings}
${budgetCents ? `Budget voor de hele week: €${(budgetCents / 100).toFixed(2)}` : ''}
Wensen: ${preferences || 'geen bijzondere wensen; zorg voor afwisseling en een gezonde balans'}
${getSetting('household', '') ? `Huishouden/voorkeuren: ${getSetting('household', '')}` : ''}
Al ingepland (niet overschrijven): ${existing.length ? existing.map((e) => `${e.date} ${e.meal}: ${e.title}`).join('; ') : 'niets'}

Beschikbare recepten (JSON):
${JSON.stringify(recipeList)}

Regels:
- Kies bij voorkeur bestaande recepten (recipe_id). Herhaal een recept niet binnen de week, tenzij expliciet gevraagd (restjes mogen wel).
- Als er te weinig passende recepten zijn, zet recipe_id op null en geef een concreet idee in new_recipe_idea (titel in het Nederlands).
- Sla momenten over die al ingepland zijn.
- Houd rekening met kooktijd: doordeweeks liever snel, in het weekend mag het uitgebreider.
- Geef per invulling een korte reden en in "summary" een korte toelichting (2–3 zinnen) op het menu.`;
  const result = await structuredCall({ system: SYSTEM, content: [{ type: 'text', text }], schema: WEEK_SCHEMA });
  const ids = new Set(recipes.map((r) => r.id));
  result.entries = result.entries.filter((e) => dates.includes(e.date) && (e.recipe_id == null || ids.has(e.recipe_id)));
  return result;
}

// ---------- Vragen over een recept (streaming) ----------

export async function askStream({ recipe, question, history = [] }, onText) {
  const context = recipe
    ? `Het gaat over dit recept (JSON):\n${JSON.stringify({
      titel: recipe.title, personen: recipe.servings, ingredienten: recipe.ingredients.map((i) => `${i.quantity ?? ''} ${i.unit} ${i.name} ${i.note}`.trim()),
      stappen: recipe.steps, voeding_pp: recipe.nutrition_per_serving, prijs_pp_cent: recipe.cost_per_serving_cents,
    })}`
    : 'Er is geen specifiek recept geselecteerd.';
  const messages = [
    ...history.slice(-10).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
    { role: 'user', content: question },
  ];
  const final = await withFallback(async (extra) => {
    const stream = client().beta.messages.stream({
      model: getModel(),
      max_tokens: 8000,
      ...extra,
      system: [
        { type: 'text', text: `${SYSTEM}\nBeantwoord vragen kort en praktisch (vervangers, bewaren, variaties, dieetwensen, kooktips). Gebruik eenvoudige opmaak met korte alinea's of lijstjes.` },
        { type: 'text', text: context },
      ],
      messages,
      output_config: { effort: 'low' },
    });
    stream.on('text', (delta) => onText(delta));
    return stream.finalMessage();
  });
  if (final.stop_reason === 'refusal') onText('\n\n_(Claude heeft deze vraag niet beantwoord.)_');
  return final;
}
