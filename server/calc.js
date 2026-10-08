// Rekenlogica: eenheden omrekenen naar grammen, voedingswaarden en prijzen.

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'sat_fat', 'fiber', 'salt'];

// Eenheden die direct naar gram/ml om te rekenen zijn.
const MASS_UNITS = { g: 1, gr: 1, gram: 1, kg: 1000, kilo: 1000, mg: 0.001, ons: 100 };
const VOLUME_UNITS = {
  ml: 1, cl: 10, dl: 100, l: 1000, liter: 1000,
  el: 15, eetlepel: 15, eetlepels: 15,
  tl: 5, theelepel: 5, theelepels: 5,
  kop: 240, kopje: 150, beker: 250, glas: 200,
  snuf: 0.5, snufje: 0.5, scheut: 15, mespunt: 1,
};

export const UNITS = [
  'g', 'kg', 'ml', 'l', 'el', 'tl', 'stuk', 'teen', 'snufje', 'scheut', 'blik', 'pak', 'zakje', 'bos', 'plak', 'naar smaak',
];

export function normalizeUnit(unit) {
  const u = String(unit || '').trim().toLowerCase().replace(/\.$/, '');
  const aliases = {
    stuks: 'stuk', st: 'stuk', 'stuk(s)': 'stuk', tenen: 'teen', teentje: 'teen', teentjes: 'teen',
    blikje: 'blik', blikken: 'blik', pakje: 'pak', pakken: 'pak', zakjes: 'zakje', bosje: 'bos',
    plakken: 'plak', plakjes: 'plak', plakje: 'plak', eetl: 'el', theel: 'tl', grams: 'g', liters: 'l',
  };
  return aliases[u] || u;
}

/**
 * Bereken het gewicht in gram van een receptregel.
 * Volgorde: expliciete grams-override > massa-eenheid > volume (× dichtheid) > stuksgewicht van ingrediënt.
 */
export function gramsFor(row, ingredient) {
  if (row.grams != null && row.grams !== '' && Number(row.grams) > 0) return Number(row.grams);
  const qty = Number(row.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const unit = normalizeUnit(row.unit);
  if (unit in MASS_UNITS) return qty * MASS_UNITS[unit];
  if (unit in VOLUME_UNITS) return qty * VOLUME_UNITS[unit] * (Number(ingredient?.density) || 1);
  // stuk, teen, blik, pak, bos, ... → stuksgewicht van het ingrediënt
  const unitWeight = Number(ingredient?.unit_weight_g);
  if (unitWeight > 0) return qty * unitWeight;
  return 0;
}

export function emptyNutrition() {
  return Object.fromEntries(NUTRIENTS.map((n) => [n, 0]));
}

function round(n, d = 1) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Prijs per gram (in centen) van een ingrediënt, of null als onbekend. */
export function pricePerGram(ingredient) {
  if (!ingredient) return null;
  if (ingredient.price_cents == null || ingredient.price_cents === '') return null;
  const price = Number(ingredient.price_cents);
  const pkg = Number(ingredient.package_grams);
  if (price >= 0 && pkg > 0) return price / pkg;
  return null;
}

/**
 * Bereken voedingswaarden en kosten van een recept.
 * @param recipe {servings}
 * @param rows   receptregels met optioneel `ingredient` (object uit de ingrediëntentabel)
 * @returns totaal + per persoon, plus per regel de berekende grammen en kosten
 */
export function computeRecipe(recipe, rows) {
  const servings = Math.max(1, Number(recipe.servings) || 1);
  const total = emptyNutrition();
  let costCents = 0;
  let missingNutrition = 0;
  let missingPrice = 0;
  const lines = rows.map((row) => {
    const ing = row.ingredient || null;
    const grams = gramsFor(row, ing);
    let lineCost = null;
    if (ing && grams > 0) {
      for (const n of NUTRIENTS) total[n] += (Number(ing[n]) || 0) * grams / 100;
      const ppg = pricePerGram(ing);
      if (ppg != null) {
        lineCost = ppg * grams;
        costCents += lineCost;
      } else missingPrice++;
    } else if (!row.optional && normalizeUnit(row.unit) !== 'naar smaak') {
      missingNutrition++;
      if (!ing) missingPrice++;
    }
    return { ...row, computed_grams: round(grams, 1), cost_cents: lineCost == null ? null : round(lineCost, 1) };
  });
  const perServing = Object.fromEntries(NUTRIENTS.map((n) => [n, round(total[n] / servings, n === 'kcal' ? 0 : 1)]));
  for (const n of NUTRIENTS) total[n] = round(total[n], n === 'kcal' ? 0 : 1);
  return {
    servings,
    nutrition_total: total,
    nutrition_per_serving: perServing,
    cost_total_cents: Math.round(costCents),
    cost_per_serving_cents: Math.round(costCents / servings),
    missing_nutrition: missingNutrition,
    missing_price: missingPrice,
    lines,
  };
}

export function jumboUrl(ingredient, fallbackName) {
  if (ingredient?.jumbo_url) return ingredient.jumbo_url;
  const q = ingredient?.jumbo_query || ingredient?.name || fallbackName;
  return `https://www.jumbo.com/zoeken/?searchTerms=${encodeURIComponent(q)}`;
}

/**
 * Boodschappenlijst: aggregeer benodigde grammen per ingrediënt over meerdere geplande maaltijden.
 * @param entries [{servings, recipe: {servings}, rows: [...]}]
 */
export function buildShoppingList(entries) {
  const items = new Map();
  for (const entry of entries) {
    const factor = (Number(entry.servings) || entry.recipe.servings) / (Number(entry.recipe.servings) || 1);
    for (const row of entry.rows) {
      const ing = row.ingredient || null;
      const grams = gramsFor(row, ing) * factor;
      const key = ing ? `i${ing.id}` : `n:${row.name.toLowerCase()}|${normalizeUnit(row.unit)}`;
      let item = items.get(key);
      if (!item) {
        item = {
          key,
          ingredient_id: ing?.id ?? null,
          name: ing?.name ?? row.name,
          category: ing?.category ?? 'Overig',
          pantry: !!ing?.pantry,
          grams: 0,
          quantity: 0,
          unit: normalizeUnit(row.unit),
          recipes: new Set(),
          ingredient: ing,
        };
        items.set(key, item);
      }
      if (item.unit !== normalizeUnit(row.unit)) item.unit = 'g'; // gemengde eenheden → toon in gram
      item.grams += grams;
      item.quantity += (Number(row.quantity) || 0) * factor;
      item.recipes.add(entry.recipe.title);
    }
  }
  let total = 0;
  const list = [...items.values()].map((item) => {
    const ing = item.ingredient;
    let packages = null;
    let cost = null;
    if (ing && Number(ing.package_grams) > 0 && item.grams > 0) {
      packages = Math.max(1, Math.ceil(item.grams / Number(ing.package_grams) - 0.02));
      if (Number(ing.price_cents) > 0) cost = packages * Number(ing.price_cents);
    }
    if (cost != null && !item.pantry) total += cost;
    const { ingredient, recipes, ...rest } = item;
    return {
      ...rest,
      grams: round(item.grams, 0),
      quantity: round(item.quantity, 2),
      packages,
      density: Number(ing?.density) || 1,
      package_label: ing?.package_label || (ing?.package_grams ? `${ing.package_grams} g` : null),
      product_name: ing?.jumbo_name || null,
      jumbo_url: jumboUrl(ing, item.name),
      cost_cents: cost,
      recipes: [...recipes],
    };
  });
  list.sort((a, b) => a.category.localeCompare(b.category, 'nl') || a.name.localeCompare(b.name, 'nl'));
  return { items: list, total_cents: total };
}
