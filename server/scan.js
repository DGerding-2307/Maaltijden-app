// Barcode scannen: een product (EAN) omzetten naar een ingrediënt voor een recept.
// Bronnen: eigen database (eerder gescand) → Open Food Facts (voedingswaarden) → Jumbo (prijs en verpakking).
import { getDb } from './db.js';
import * as repo from './repo.js';
import { productByBarcode, ingredientNutritionFields } from './openfoodfacts.js';
import { searchJumbo, ingredientPriceFields } from './jumbo.js';

/** "Jumbo Halfvolle Melk 1L" → "halfvolle melk" */
export function genericName(name, brands = '') {
  let s = ` ${String(name || '').toLowerCase()} `;
  for (const b of String(brands).toLowerCase().split(',').map((x) => x.trim()).filter(Boolean)) s = s.replaceAll(` ${b} `, ' ');
  s = s
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|g|gr|gram|ml|cl|l|liter|stuks?|st)\b/g, ' ')
    .replace(/\b(jumbo|ah|albert heijn|biologisch|bio|huismerk|voordeelverpakking|xl|mini)\b/g, ' ')
    .replace(/[^a-zà-ÿ' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

export async function lookupBarcode(ean) {
  const code = String(ean || '').replace(/\D/g, '');
  if (code.length < 8) throw Object.assign(new Error('Ongeldige barcode'), { status: 400 });
  const known = getDb().prepare('SELECT * FROM ingredients WHERE off_code = ?').get(code);
  const result = { ean: code, ingredient: known || null, product: null, jumbo: null, match: null, warnings: [] };
  try {
    result.product = await productByBarcode(code);
  } catch (err) {
    result.warnings.push(`Open Food Facts: ${err.message}`);
  }
  try {
    const hits = await searchJumbo(code, 3);
    result.jumbo = hits[0] || null;
  } catch (err) {
    result.warnings.push(`Jumbo: ${err.message}`);
  }
  const name = result.product?.name || result.jumbo?.title || '';
  result.suggested_name = genericName(name, result.product?.brands) || name.toLowerCase();
  if (!known && result.suggested_name) result.match = repo.matchIngredient(result.suggested_name);
  return result;
}

/**
 * Sla het gescande product op als ingrediënt: koppel aan een bestaand ingrediënt of maak een nieuw aan.
 * @param body { ean, product, jumbo, ingredient_id?, name?, update_nutrition? }
 */
export function applyBarcode({ ean, product, jumbo, ingredient_id, name, update_nutrition = true }) {
  const fields = {};
  if (product?.nutrition && update_nutrition) {
    Object.assign(fields, ingredientNutritionFields({ nutrition: product.nutrition, product }));
    fields.off_code = String(ean || product.code || '');
  }
  if (jumbo?.price_cents != null && jumbo.package_grams) Object.assign(fields, ingredientPriceFields(jumbo, jumbo.title));
  else if (product?.grams && !ingredient_id) fields.package_grams = product.grams;
  if (ingredient_id) {
    const existing = repo.getIngredient(Number(ingredient_id));
    if (!existing) throw Object.assign(new Error('Ingrediënt niet gevonden'), { status: 404 });
    // Prijs van een bestaand ingrediënt alleen overschrijven als het nog niet aan Jumbo gekoppeld was
    if (existing.jumbo_id) for (const k of Object.keys(ingredientPriceFields({}, ''))) delete fields[k];
    return repo.saveIngredient(fields, existing.id);
  }
  const finalName = String(name || genericName(product?.name || jumbo?.title, product?.brands) || 'nieuw product').trim().toLowerCase();
  const clash = repo.listIngredients().find((i) => i.name.toLowerCase() === finalName);
  if (clash) return repo.saveIngredient(fields, clash.id);
  return repo.saveIngredient({
    name: finalName,
    category: product?.category || 'Overig',
    nutrition_source: fields.nutrition_source || 'onbekend',
    price_source: fields.price_source || 'schatting',
    package_label: jumbo?.package_label || product?.quantity || null,
    ...fields,
  });
}
