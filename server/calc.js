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

// Eenheden die vrij meeschalen: afronden op hele stuks heeft daar geen zin
const FREE_UNITS = new Set([...Object.keys(MASS_UNITS), 'ml', 'cl', 'dl', 'l', 'liter']);

/**
 * Hoeveelheid van een receptregel na schalen, met de regels tegen restjes:
 * - min_quantity (per regel): nooit minder dan dit, ook niet bij minder personen
 * - 'round': afronden op hele stuks (minimaal 1), bv. 1,5 paprika → 2
 * - 'package': de hele verpakking gebruiken (of meerdere), zodat er niets overblijft
 * De regel van de receptregel gaat voor; 'none' zet een standaard van het ingrediënt uit.
 * @returns { quantity, grams, rule, packages, package_label }
 */
export function effectiveAmount(row, ing, factor = 1) {
  const rule = row.amount_rule && row.amount_rule !== '' ? row.amount_rule : (ing?.amount_rule || 'none');
  const unit = normalizeUnit(row.unit);
  const baseQty = row.quantity == null || row.quantity === '' ? null : Number(row.quantity);
  let quantity = baseQty == null ? null : baseQty * factor;
  let grams = gramsFor(row, ing) * factor;
  const scale = (to) => {
    if (quantity > 0) grams *= to / quantity;
    quantity = to;
  };
  const min = Number(row.min_quantity) || 0;
  if (quantity != null && min > 0 && quantity < min) scale(min);
  if (rule === 'round' && quantity > 0 && !FREE_UNITS.has(unit)) scale(Math.max(1, Math.round(quantity)));
  let packages = null;
  if (rule === 'package' && Number(ing?.package_grams) > 0 && grams > 0) {
    packages = Math.max(1, Math.ceil(grams / Number(ing.package_grams) - 0.02));
    const total = packages * Number(ing.package_grams);
    if (quantity > 0) quantity *= total / grams;
    grams = total;
  }
  return {
    quantity: quantity == null ? null : round(quantity, 2),
    grams,
    rule,
    packages,
    package_label: packages ? (ing.package_label || `${ing.package_grams} g`) : null,
  };
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
/**
 * Voedingswaarden en kosten van een recept.
 * @param factor schaal t.o.v. het originele aantal personen (bv. 0,5 = half zoveel personen)
 */
export function computeRecipe(recipe, rows, factor = 1) {
  const servings = Math.max(1, Number(recipe.servings) || 1) * factor;
  const total = emptyNutrition();
  let costCents = 0;
  let missingNutrition = 0;
  let missingPrice = 0;
  const lines = rows.map((row) => {
    const ing = row.ingredient || null;
    const amount = effectiveAmount(row, ing, factor);
    const grams = amount.grams;
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
    return {
      ...row,
      scaled_quantity: amount.quantity,
      amount_rule_applied: amount.rule,
      packages: amount.packages,
      package_label: amount.package_label,
      computed_grams: round(grams, 1),
      cost_cents: lineCost == null ? null : round(lineCost, 1),
    };
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

/** Eén persoon eet 1 portie, ook als er voor meer personen gekookt wordt. Een halve portie blijft een halve portie. */
export const plannedPortion = (servings) => (Number(servings) > 0 && Number(servings) < 1 ? Number(servings) : 1);

/** "500 g", "1,5 kg" */
export function packageLabel(grams) {
  const g = Number(grams);
  return g >= 1000 ? `${String(round(g / 1000, 3)).replace('.', ',')} kg` : `${round(g, 1)} g`;
}

/** Alle verpakkingen van een ingrediënt: eerst de hoofdverpakking, dan de extra opties. */
export function packageOptions(ing, extras = []) {
  const options = [];
  if (Number(ing?.package_grams) > 0) {
    options.push({
      key: 'main', grams: Number(ing.package_grams), label: ing.package_label || packageLabel(ing.package_grams),
      price_cents: Number(ing.price_cents) > 0 ? Number(ing.price_cents) : null,
    });
  }
  for (const x of extras) {
    if (!(Number(x.grams) > 0)) continue;
    options.push({
      key: `p${x.id}`, id: x.id, grams: Number(x.grams), label: x.label || packageLabel(x.grams),
      price_cents: Number(x.price_cents) > 0 ? Number(x.price_cents) : null,
    });
  }
  return options;
}

const packageResult = (need, chosen) => {
  const picks = chosen.map(([o, count]) => ({
    key: o.key, label: o.label, grams: o.grams, count, price_cents: o.price_cents,
    cost_cents: o.price_cents == null ? null : o.price_cents * count,
  }));
  const grams = picks.reduce((s, p) => s + p.grams * p.count, 0);
  return {
    picks, grams, packages: picks.reduce((s, p) => s + p.count, 0),
    cost_cents: picks.some((p) => p.cost_cents == null) ? null : picks.reduce((s, p) => s + p.cost_cents, 0),
    leftover_grams: Math.max(0, round(grams - need, 0)),
    text: picks.map((p) => `${p.count}× ${p.label}`).join(' + '),
  };
};

/** Zo vaak als nodig precies deze verpakking kopen. Een klein tekort (2% van de verpakking) telt niet mee. */
export function packagesOfOption(need, option) {
  return packageResult(need, [[option, Math.max(1, Math.ceil(need / option.grams - 0.02))]]);
}

/**
 * De goedkoopste combinatie verpakkingen waarmee je genoeg hebt. Bij gelijke prijs: de minste rest,
 * daarna de minste verpakkingen. Opties zonder prijs tellen alleen mee als geen enkele optie een prijs heeft.
 */
export function cheapestPackages(need, options) {
  const usable = (options || []).filter((o) => Number(o.grams) > 0);
  if (!usable.length || !(need > 0)) return null;
  const priced = usable.filter((o) => o.price_cents > 0);
  const pool = priced.length ? priced : usable;
  if (pool.length === 1) return packagesOfOption(need, pool[0]);
  // Dezelfde marge als bij één verpakking, gerekend op de kleinste optie
  const smallest = Math.min(...pool.map((o) => o.grams));
  const target = Math.max(1, Math.ceil(need - 0.02 * smallest));
  const sizes = pool.map((o) => Math.max(1, Math.round(o.grams)));
  const limit = target + Math.max(...sizes);
  // Te grote hoeveelheid om door te rekenen: de voordeligste prijs per gram is dan vrijwel altijd het beste
  if (limit > 200000) return packagesOfOption(need, [...pool].sort((a, b) => ((a.price_cents || 0) / a.grams) - ((b.price_cents || 0) / b.grams))[0]);
  const cost = new Float64Array(limit + 1).fill(Infinity);
  const count = new Int32Array(limit + 1);
  const from = new Int32Array(limit + 1).fill(-1);
  cost[0] = 0;
  for (let t = 0; t < target; t++) {
    if (cost[t] === Infinity) continue;
    pool.forEach((o, i) => {
      const next = t + sizes[i];
      const c = cost[t] + (priced.length ? o.price_cents : 0);
      if (c < cost[next] || (c === cost[next] && count[t] + 1 < count[next])) {
        cost[next] = c;
        count[next] = count[t] + 1;
        from[next] = i;
      }
    });
  }
  let best = -1;
  for (let t = target; t <= limit; t++) {
    if (cost[t] !== Infinity && (best < 0 || cost[t] < cost[best])) best = t;
  }
  const counts = pool.map(() => 0);
  for (let t = best; t > 0; t -= sizes[from[t]]) counts[from[t]]++;
  const chosen = pool.map((o, i) => [o, counts[i]]).filter(([, n]) => n > 0).sort((a, b) => b[0].grams - a[0].grams);
  return packageResult(need, chosen);
}

/**
 * Boodschappenlijst: aggregeer benodigde grammen per ingrediënt over meerdere geplande maaltijden.
 * @param entries [{servings, recipe: {servings}, rows: [...]}]
 * @param packagesFor (ingredientId) => extra verpakkingen van dat ingrediënt
 * @param choices Map artikelsleutel → zelf gekozen verpakking voor deze week
 */
export function buildShoppingList(entries, { packagesFor = () => [], choices = new Map() } = {}) {
  const items = new Map();
  for (const entry of entries) {
    const factor = (Number(entry.servings) || entry.recipe.servings) / (Number(entry.recipe.servings) || 1);
    for (const row of entry.rows) {
      const ing = row.ingredient || null;
      const amount = effectiveAmount(row, ing, factor);
      const grams = amount.grams;
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
      item.quantity += amount.quantity || 0;
      item.recipes.add(entry.recipe.title);
    }
  }
  let total = 0;
  const list = [...items.values()].map((item) => {
    const ing = item.ingredient;
    const options = ing ? packageOptions(ing, packagesFor(ing.id)) : [];
    const chosen = options.find((o) => o.key === choices.get(item.key));
    const pick = item.grams > 0 && options.length
      ? (chosen ? packagesOfOption(item.grams, chosen) : cheapestPackages(item.grams, options))
      : null;
    const packages = pick?.packages ?? null;
    const cost = pick?.cost_cents ?? null;
    if (cost != null && !item.pantry) total += cost;
    const { ingredient, recipes, ...rest } = item;
    return {
      ...rest,
      grams: round(item.grams, 0),
      quantity: round(item.quantity, 2),
      packages,
      density: Number(ing?.density) || 1,
      package_label: pick?.picks.length === 1 ? pick.picks[0].label : ing?.package_label || (ing?.package_grams ? `${ing.package_grams} g` : null),
      package_text: pick?.text ?? null,
      package_picks: pick?.picks ?? [],
      package_options: options,
      package_choice: chosen?.key ?? null,
      leftover_grams: pick?.leftover_grams ?? null,
      image_url: ing?.image_url || null,
      cost_cents: cost,
      recipes: [...recipes],
    };
  });
  list.sort((a, b) => a.category.localeCompare(b.category, 'nl') || a.name.localeCompare(b.name, 'nl'));
  return { items: list, total_cents: total };
}
