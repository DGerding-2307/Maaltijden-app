// Open Food Facts: open voedingsmiddelendatabase (ODbL-licentie, https://openfoodfacts.org).
// Regels van Open Food Facts die we volgen:
// - altijd een eigen User-Agent meesturen;
// - max. 10 zoekopdrachten en 15 productopvragingen per minuut → we wachten zelf tussen aanroepen
//   en bewaren resultaten in een cache-tabel, zodat dezelfde vraag niet opnieuw naar OFF gaat;
// - geen "zoeken tijdens typen".
import { getDb } from './db.js';

const BASE = process.env.OFF_BASE || 'https://world.openfoodfacts.org';
const USER_AGENT = process.env.OFF_USER_AGENT || 'Maaltijden-app/2.0 (zelfgehoste maaltijdplanner)';
const CACHE_DAYS = 30;

export const OFF_FIELDS = [
  'code', 'product_name', 'product_name_nl', 'generic_name_nl', 'brands', 'quantity', 'product_quantity',
  'nutriments', 'nutriscore_grade', 'nova_group', 'image_front_small_url', 'allergens_tags', 'countries_tags', 'categories_tags',
].join(',');

// ---------- Throttling ----------
const lastCall = { search: 0, product: 0 };
const MIN_GAP = process.env.OFF_MIN_GAP_MS != null
  ? { search: Number(process.env.OFF_MIN_GAP_MS), product: Number(process.env.OFF_MIN_GAP_MS) }
  : { search: 6500, product: 4100 }; // ruim binnen 10/min en 15/min

async function throttle(kind) {
  const next = Math.max(Date.now(), lastCall[kind] + MIN_GAP[kind]);
  lastCall[kind] = next;
  const wait = next - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

// ---------- Cache ----------
function cacheGet(key) {
  const row = getDb().prepare('SELECT value, fetched_at FROM off_cache WHERE key = ?').get(key);
  if (!row) return null;
  if (Date.now() - Date.parse(row.fetched_at) > CACHE_DAYS * 86400000) return null;
  return JSON.parse(row.value);
}

function cacheSet(key, value) {
  getDb().prepare(`INSERT INTO off_cache (key, value, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`)
    .run(key, JSON.stringify(value), new Date().toISOString());
}

async function offFetch(kind, path) {
  await throttle(kind);
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw Object.assign(new Error(`Open Food Facts is niet bereikbaar (${err.name === 'TimeoutError' ? 'timeout' : err.message})`), { status: 502 });
  }
  if (res.status === 429 || res.status === 503) {
    throw Object.assign(new Error('Open Food Facts is even druk of beperkt het aantal verzoeken. Probeer het over een minuut opnieuw.'), { status: 503 });
  }
  if (!res.ok) throw Object.assign(new Error(`Open Food Facts gaf status ${res.status}`), { status: 502 });
  return res.json();
}

// ---------- Normaliseren ----------
const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Voedingswaarden per 100 g in ons formaat, of null als de kern (kcal/eiwit/kh/vet) ontbreekt. */
export function nutritionFromOff(nutriments = {}) {
  let kcal = num(nutriments['energy-kcal_100g']);
  if (kcal == null && num(nutriments.energy_100g) != null) {
    // energy_100g is in kJ
    kcal = num(nutriments.energy_100g) / 4.184;
  }
  let salt = num(nutriments.salt_100g);
  if (salt == null && num(nutriments.sodium_100g) != null) salt = num(nutriments.sodium_100g) * 2.5;
  const out = {
    kcal,
    protein: num(nutriments.proteins_100g),
    carbs: num(nutriments.carbohydrates_100g),
    sugar: num(nutriments.sugars_100g),
    fat: num(nutriments.fat_100g),
    sat_fat: num(nutriments['saturated-fat_100g']),
    fiber: num(nutriments.fiber_100g),
    salt,
  };
  if ([out.kcal, out.protein, out.carbs, out.fat].some((v) => v == null)) return null;
  // Onzinnige waarden (meer dan 100 g per 100 g of > 900 kcal) wegfilteren
  if (out.kcal > 950 || out.protein > 100 || out.carbs > 100 || out.fat > 100) return null;
  for (const k of Object.keys(out)) if (out[k] != null) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}

export function normalizeOffProduct(p) {
  if (!p) return null;
  return {
    code: p.code,
    name: p.product_name_nl || p.product_name || p.generic_name_nl || '(naamloos product)',
    brands: p.brands || '',
    quantity: p.quantity || '',
    grams: num(p.product_quantity),
    nutriscore: p.nutriscore_grade && /^[a-e]$/.test(p.nutriscore_grade) ? p.nutriscore_grade : null,
    nova: num(p.nova_group),
    image: p.image_front_small_url || null,
    allergens: (p.allergens_tags || []).map((t) => t.replace(/^\w\w:/, '')),
    dutch: (p.countries_tags || []).includes('en:netherlands') || (p.countries_tags || []).includes('en:belgium'),
    nutrition: nutritionFromOff(p.nutriments),
    url: p.code ? `https://nl.openfoodfacts.org/product/${p.code}` : null,
    category: categoryFromOff(p.categories_tags),
  };
}

// OFF-categorieën → afdelingen in de app (eerste treffer wint; specifiek vóór algemeen)
const CATEGORY_RULES = [
  [/frozen/, 'Diepvries'],
  [/coconut-milks/, 'Pasta, rijst & wereldkeuken'],
  [/fresh-herbs|fresh-vegetables|fresh-fruits/, 'Aardappelen, groente & fruit'],
  [/cheeses|dairies|milks|yogurts|eggs|butters|creams/, 'Zuivel, eieren & kaas'],
  [/meats|poultries|sausages|fishes|seafood|meat-analogues|tofu/, 'Vlees, vis & vega'],
  [/breads|breakfast|cereals|spreads|peanut-butters/, 'Brood, ontbijt & beleg'],
  [/pastas|rices|noodles|asian|mexican|soy-sauces|coconut-milks/, 'Pasta, rijst & wereldkeuken'],
  [/canned|soups|sauces|tomato-pastes|condiments|mayonnaises|mustards|legumes/, 'Conserven, soepen & sauzen'],
  [/spices|herbs|flours|sugars|salts|baking/, 'Kruiden, specerijen & bakken'],
  [/oils|vinegars/, 'Olie, azijn & smaakmakers'],
  [/fruits|vegetables|potatoes|fresh-herbs/, 'Aardappelen, groente & fruit'],
  [/beverages|snacks|nuts|sweets|chocolates/, 'Dranken & overig'],
];

export function categoryFromOff(tags = []) {
  const joined = (tags || []).join(' ');
  for (const [re, cat] of CATEGORY_RULES) if (re.test(joined)) return cat;
  return null;
}

/** Mediaan van voedingswaarden over meerdere producten: robuust tegen uitschieters. */
export function medianNutrition(products) {
  const withData = products.filter((p) => p.nutrition);
  if (!withData.length) return null;
  const keys = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'sat_fat', 'fiber', 'salt'];
  const out = {};
  for (const k of keys) {
    const vals = withData.map((p) => p.nutrition[k]).filter((v) => v != null).sort((a, b) => a - b);
    if (!vals.length) { out[k] = null; continue; }
    const mid = Math.floor(vals.length / 2);
    out[k] = Math.round((vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2) * 10) / 10;
  }
  return { nutrition: out, count: withData.length };
}

// ---------- Publieke functies ----------

/** Zoek producten op naam, bij voorkeur Nederlandse producten. */
export async function searchOff(query, { pageSize = 20 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) throw Object.assign(new Error('Zoekterm is te kort'), { status: 400 });
  const key = `search:${q}:${pageSize}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  const params = new URLSearchParams({
    search_terms: q,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(pageSize),
    sort_by: 'unique_scans_n',
    fields: OFF_FIELDS,
    lc: 'nl',
    tagtype_0: 'countries',
    tag_contains_0: 'contains',
    tag_0: 'netherlands',
  });
  const json = await offFetch('search', `/cgi/search.pl?${params}`);
  const products = (json.products || []).map(normalizeOffProduct).filter(Boolean);
  const result = { query: q, products, median: medianNutrition(products) };
  cacheSet(key, result);
  return { ...result, cached: false };
}

/** Haal één product op via de barcode (EAN). */
export async function productByBarcode(code) {
  const clean = String(code || '').replace(/\D/g, '');
  if (clean.length < 8) throw Object.assign(new Error('Ongeldige barcode'), { status: 400 });
  const key = `product:${clean}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const json = await offFetch('product', `/api/v2/product/${clean}.json?fields=${OFF_FIELDS}`);
  if (json.status === 0 || !json.product) throw Object.assign(new Error('Product niet gevonden in Open Food Facts'), { status: 404 });
  const product = normalizeOffProduct({ ...json.product, code: clean });
  cacheSet(key, product);
  return product;
}

/** Velden om op een ingrediënt op te slaan na het kiezen van een OFF-bron. */
export function ingredientNutritionFields({ nutrition, product, count, query }) {
  const source = product
    ? `Open Food Facts: ${product.name}${product.brands ? ` (${product.brands})` : ''}`
    : `Open Food Facts: mediaan van ${count} producten (“${query}”)`;
  return {
    ...nutrition,
    nutrition_source: source.slice(0, 200),
    off_code: product?.code || null,
    nutriscore: product?.nutriscore || null,
    nutrition_updated_at: new Date().toISOString().slice(0, 10),
    fallback_image_url: product?.image || undefined,
  };
}

function words(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Zoek automatisch voedingswaarden voor een ingrediëntnaam: mediaan van producten waarvan de naam
 * het ingrediënt als los woord bevat (dus "ui" telt bij "rode ui", niet bij "uienringen").
 * Geeft { fields, matched } of null als er geen betrouwbare match is.
 */
export async function autoNutrition(name, aliases = []) {
  const result = await searchOff(name, { pageSize: 24 });
  const terms = [name, ...aliases].map(words).filter((w) => w.length);
  const relevant = result.products.filter((p) => {
    const pw = words(p.name);
    return terms.some((t) => t.every((w) => pw.includes(w) || pw.includes(`${w}en`) || pw.includes(`${w}s`)));
  });
  const median = medianNutrition(relevant);
  if (!median || median.count < 2) return null;
  return {
    fields: ingredientNutritionFields({ nutrition: median.nutrition, count: median.count, query: result.query }),
    matched: relevant.filter((p) => p.nutrition).slice(0, 5).map((p) => p.name),
  };
}
