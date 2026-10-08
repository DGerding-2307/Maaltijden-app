// Barcode scannen: een product (EAN) omzetten naar een ingrediënt voor een recept.
// Bronnen: eigen database (eerder gescand) → Open Food Facts (naam, verpakking en voedingswaarden).
import { getDb } from './db.js';
import * as repo from './repo.js';
import { productByBarcode, ingredientNutritionFields } from './openfoodfacts.js';

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
  const result = { ean: code, ingredient: known || null, product: null, match: null, warnings: [] };
  try {
    result.product = await productByBarcode(code);
  } catch (err) {
    result.warnings.push(`Open Food Facts: ${err.message}`);
  }
  const name = result.product?.name || '';
  result.suggested_name = genericName(name, result.product?.brands) || name.toLowerCase();
  if (!known && result.suggested_name) result.match = repo.matchIngredient(result.suggested_name);
  return result;
}

/**
 * Sla het gescande product op als ingrediënt: koppel aan een bestaand ingrediënt of maak een nieuw aan.
 * @param body { ean, product, ingredient_id?, name?, update_nutrition? }
 */
export function applyBarcode({ ean, product, ingredient_id, name, update_nutrition = true }) {
  const fields = {};
  if (product?.nutrition && update_nutrition) {
    Object.assign(fields, ingredientNutritionFields({ nutrition: product.nutrition, product }));
    fields.off_code = String(ean || product.code || '');
  }
  if (product?.grams && !ingredient_id) fields.package_grams = product.grams;
  if (ingredient_id) {
    const existing = repo.getIngredient(Number(ingredient_id));
    if (!existing) throw Object.assign(new Error('Ingrediënt niet gevonden'), { status: 404 });
    return repo.saveIngredient(fields, existing.id);
  }
  const finalName = String(name || genericName(product?.name, product?.brands) || 'nieuw product').trim().toLowerCase();
  const clash = repo.listIngredients().find((i) => i.name.toLowerCase() === finalName);
  if (clash) return repo.saveIngredient(fields, clash.id);
  return repo.saveIngredient({
    name: finalName,
    category: product?.category || 'Overig',
    nutrition_source: fields.nutrition_source || 'onbekend',
    price_source: fields.price_source || 'schatting',
    package_label: product?.quantity || null,
    ...fields,
  });
}
