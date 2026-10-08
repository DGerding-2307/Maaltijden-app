// Open Prices (https://prices.openfoodfacts.org): open database met winkelprijzen, beheerd door Open Food Facts.
// Officiële, openbare API (lezen zonder account), licentie ODbL – bron vermelden.
//
// Per ingrediënt zoeken we Nederlandse prijzen van de afgelopen 2 jaar via drie routes:
//   1. de barcode van het ingrediënt (als het gescand of aan een OFF-product gekoppeld is);
//   2. de Open Food Facts-categorie (bv. en:carrots): losse producten (groente/fruit, per kg of per stuk)
//      én verpakte producten in die categorie;
//   3. de barcodes van vergelijkbare producten uit Open Food Facts (voor ingrediënten zonder categorie).
// Alle prijzen worden omgerekend naar een prijs per kg; de mediaan bepaalt de prijs van de verpakking.
import { getDb } from './db.js';
import { searchOff } from './openfoodfacts.js';

const BASE = process.env.OPEN_PRICES_BASE || 'https://prices.openfoodfacts.org';
const USER_AGENT = process.env.OFF_USER_AGENT || 'Maaltijden-app/2.3 (zelfgehoste maaltijdplanner)';
const CACHE_DAYS = 7;
const MAX_AGE_DAYS = 730;
const COUNTRY = process.env.OPEN_PRICES_COUNTRY || 'NL';

// Rustig aan: geen gedocumenteerde limiet, dus max. ~1 verzoek per 1,5 s.
const MIN_GAP = process.env.OPEN_PRICES_MIN_GAP_MS != null ? Number(process.env.OPEN_PRICES_MIN_GAP_MS) : 1500;
let lastCall = 0;
async function throttle() {
  const next = Math.max(Date.now(), lastCall + MIN_GAP);
  lastCall = next;
  const wait = next - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

function cacheGet(key) {
  const row = getDb().prepare('SELECT value, fetched_at FROM off_cache WHERE key = ?').get(key);
  if (!row || Date.now() - Date.parse(row.fetched_at) > CACHE_DAYS * 86400000) return null;
  return JSON.parse(row.value);
}

function cacheSet(key, value) {
  getDb().prepare(`INSERT INTO off_cache (key, value, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`)
    .run(key, JSON.stringify(value), new Date().toISOString());
}

/** Eén pagina prijzen ophalen (max. 100), nieuwste eerst, in euro. */
export async function fetchPrices(filters) {
  const params = new URLSearchParams({ currency: 'EUR', order_by: '-date', size: '100', ...filters });
  const key = `prices:${params}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  await throttle();
  let res;
  try {
    res = await fetch(`${BASE}/api/v1/prices?${params}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw Object.assign(new Error(`Open Prices is niet bereikbaar (${err.name === 'TimeoutError' ? 'timeout' : err.message})`), { status: 502 });
  }
  if (res.status === 429 || res.status === 503) throw Object.assign(new Error('Open Prices is even druk. Probeer het later opnieuw.'), { status: 503 });
  if (!res.ok) throw Object.assign(new Error(`Open Prices gaf status ${res.status}`), { status: 502 });
  const json = await res.json();
  const items = json.items || [];
  cacheSet(key, items);
  return items;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Gewicht van een verpakt product in gram (op basis van de productgegevens in Open Prices). */
function productGrams(product, density = 1) {
  const q = num(product?.product_quantity);
  if (!q || q <= 0) return null;
  const unit = String(product?.product_quantity_unit || 'g').toLowerCase();
  if (unit === 'g') return q;
  if (unit === 'kg') return q * 1000;
  if (unit === 'ml') return q * density;
  if (unit === 'l') return q * 1000 * density;
  return null;
}

/**
 * Zet een prijsregel uit Open Prices om naar een prijs per kg (in euro), of null als dat niet kan.
 * Bij een actieprijs gebruiken we de normale prijs, zodat een aanbieding de schatting niet vertekent.
 */
export function pricePerKg(item, ingredient = {}) {
  let price = num(item.price);
  if (item.price_is_discounted && num(item.price_without_discount)) price = num(item.price_without_discount);
  if (!price || price <= 0) return null;
  if (item.price_per === 'KILOGRAM') return price;
  if (item.type === 'CATEGORY' || item.price_per === 'UNIT' && !item.product_code) {
    // Losse producten per stuk: omrekenen met het stuksgewicht van het ingrediënt
    const w = num(ingredient.unit_weight_g);
    return w ? price / (w / 1000) : null;
  }
  const grams = productGrams(item.product, num(ingredient.density) || 1);
  return grams ? price / (grams / 1000) : null;
}

function isRecentInCountry(item) {
  const country = item.location?.osm_address_country_code;
  if (country && country.toUpperCase() !== COUNTRY) return false;
  if (!country) return false;
  if (item.date && Date.now() - Date.parse(item.date) > MAX_AGE_DAYS * 86400000) return false;
  return true;
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Zoek Nederlandse prijzen voor een ingrediënt en bereken een prijs per verpakking.
 * @returns { observations, per_kg, price_cents, count, stores, route } of { observations: [] } als er niets is
 */
export async function priceForIngredient(ingredient) {
  const routes = [];
  if (ingredient.off_code) routes.push(['barcode', { product_code: ingredient.off_code }]);
  for (const tag of String(ingredient.off_category || '').split(',').map((t) => t.trim()).filter(Boolean)) {
    routes.push([`categorie ${tag}`, { category_tag: tag }]);
    routes.push([`producten in ${tag}`, { product__categories_tags__contains: tag }]);
  }
  if (!ingredient.off_category && !ingredient.off_code) {
    // Vergelijkbare producten uit Open Food Facts (resultaat staat meestal al in de cache)
    try {
      const search = await searchOff(ingredient.name, { pageSize: 24 });
      const codes = search.products.map((p) => p.code).filter(Boolean).slice(0, 15);
      if (codes.length) routes.push(['vergelijkbare producten', { product_code__in: codes.join(',') }]);
    } catch { /* geen OFF: alleen andere routes */ }
  }

  const seen = new Set();
  const observations = [];
  let usedRoute = null;
  for (const [route, filters] of routes) {
    const items = await fetchPrices(filters);
    for (const item of items) {
      if (seen.has(item.id) || !isRecentInCountry(item)) continue;
      seen.add(item.id);
      const perKg = pricePerKg(item, ingredient);
      if (perKg == null || perKg > 500) continue;
      observations.push({
        id: item.id,
        date: item.date,
        store: item.location?.osm_brand || item.location?.osm_name || 'onbekende winkel',
        city: item.location?.osm_address_city || null,
        product: item.product?.product_name || item.product_name || (item.type === 'CATEGORY' ? 'los' : null),
        price: num(item.price),
        discounted: !!item.price_is_discounted,
        price_per: item.price_per || (item.product_code ? 'VERPAKKING' : null),
        per_kg: Math.round(perKg * 100) / 100,
        route,
      });
    }
    usedRoute ??= observations.length ? route : null;
    // Een exacte barcode-match is genoeg; anders verder zoeken voor meer metingen.
    if (route === 'barcode' && observations.length) break;
  }
  if (!observations.length) return { observations: [], count: 0 };
  observations.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const perKg = median(observations.map((o) => o.per_kg));
  const pkg = num(ingredient.package_grams) || 1000;
  const stores = [...new Set(observations.map((o) => o.store))];
  return {
    observations: observations.slice(0, 50),
    count: observations.length,
    per_kg: Math.round(perKg * 100) / 100,
    price_cents: Math.max(1, Math.round(perKg * (pkg / 1000) * 100)),
    package_grams: pkg,
    stores,
    latest: observations[0].date,
    route: usedRoute,
  };
}

/** Velden om op een ingrediënt op te slaan. */
export function ingredientPriceFields(result) {
  const stores = result.stores.slice(0, 4).join(', ') + (result.stores.length > 4 ? ` +${result.stores.length - 4}` : '');
  return {
    price_cents: result.price_cents,
    price_source: 'open prices',
    price_count: result.count,
    price_note: `${result.count === 1 ? '1 prijs' : `Mediaan van ${result.count} prijzen`} (${stores}); laatste ${result.latest || '?'}`.slice(0, 250),
    price_updated_at: new Date().toISOString().slice(0, 10),
  };
}
