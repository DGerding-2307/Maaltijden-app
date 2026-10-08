// Jumbo-prijzen ophalen.
// Jumbo heeft geen officiële publieke API. We gebruiken de (onofficiële) API van de Jumbo-app.
// Die kan zonder aankondiging veranderen; daarom is de basis-URL configureerbaar en
// valt de app terug op geschatte of handmatig ingevoerde prijzen als het ophalen mislukt.

const BASE = process.env.JUMBO_API_BASE || 'https://mobileapi.jumbo.com/v17';
const HEADERS = {
  'User-Agent': process.env.JUMBO_USER_AGENT || 'Jumbo/11.6.0 (Android 14)',
  Accept: 'application/json',
};

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** "500 g" → 500, "1,5 kg" → 1500, "1 l" → 1000, "6 x 0,33 l" → 1980, "10 stuks" → null */
export function parseQuantity(text) {
  if (!text) return null;
  const s = String(text).toLowerCase().replace(',', '.');
  const multi = s.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|gram|ml|cl|l|liter)\b/);
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|gram|ml|cl|l|liter)\b/);
  const factor = { kg: 1000, g: 1, gram: 1, ml: 1, cl: 10, l: 1000, liter: 1000 };
  if (multi) return Number(multi[1]) * Number(multi[2]) * factor[multi[3]];
  if (single) return Number(single[1]) * factor[single[2]];
  return null;
}

/** Zet een Jumbo-productobject om naar ons formaat. Defensief, want het formaat kan wijzigen. */
export function normalizeProduct(p) {
  if (!p) return null;
  const prices = p.prices || {};
  const priceCents = prices.promotionalPrice?.amount ?? prices.price?.amount ?? p.price?.amount ?? null;
  const regularCents = prices.price?.amount ?? null;
  const unitPrice = prices.unitPrice;
  let packageGrams = null;
  if (unitPrice?.price?.amount > 0 && regularCents > 0 && ['kg', 'l', 'liter'].includes(String(unitPrice.unit).toLowerCase())) {
    packageGrams = Math.round((regularCents / unitPrice.price.amount) * 1000);
  }
  if (!packageGrams) packageGrams = parseQuantity(p.quantity) || parseQuantity(p.title);
  const image = p.imageInfo?.primaryView?.[0]?.url || p.image || null;
  return {
    id: p.id,
    title: p.title,
    price_cents: priceCents != null ? Math.round(priceCents) : null,
    regular_price_cents: regularCents,
    on_promotion: !!prices.promotionalPrice,
    package_grams: packageGrams,
    package_label: p.quantity || null,
    unit_price: unitPrice?.price?.amount ? { cents: unitPrice.price.amount, unit: unitPrice.unit } : null,
    image,
    url: p.id ? `https://www.jumbo.com/producten/${slugify(p.title || '')}-${p.id}` : null,
  };
}

export async function searchJumbo(query, limit = 10) {
  const url = `${BASE}/search?q=${encodeURIComponent(query)}&offset=0&limit=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`Jumbo antwoordde met status ${res.status}`);
    const json = await res.json();
    const data = json?.products?.data || json?.data || [];
    return data.map(normalizeProduct).filter((p) => p && p.price_cents != null);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Jumbo reageert niet (timeout)');
    throw new Error(`Jumbo-prijzen ophalen mislukt: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Velden om op een ingrediënt op te slaan na het kiezen van een Jumbo-product. */
export function ingredientPriceFields(product, query) {
  return {
    jumbo_id: product.id,
    jumbo_name: product.title,
    jumbo_url: product.url,
    jumbo_image: product.image,
    jumbo_query: query,
    price_cents: product.price_cents,
    package_grams: product.package_grams,
    package_label: product.package_label,
    price_source: 'jumbo',
    price_updated_at: new Date().toISOString().slice(0, 10),
  };
}

/** Ververs de prijs van een ingrediënt; houdt het eerder gekozen product aan als dat nog bestaat. */
export async function refreshIngredientPrice(ingredient) {
  const query = ingredient.jumbo_query || ingredient.name;
  const results = await searchJumbo(query, 15);
  if (!results.length) return null;
  const same = ingredient.jumbo_id ? results.find((p) => p.id === ingredient.jumbo_id) : null;
  const chosen = same || results.find((p) => p.package_grams) || results[0];
  return ingredientPriceFields(chosen, query);
}
