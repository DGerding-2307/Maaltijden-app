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
  const known = getDb().prepare('SELECT i.* FROM ingredient_barcodes b JOIN ingredients i ON i.id = b.ingredient_id WHERE b.code = ?').get(code)
    || getDb().prepare('SELECT * FROM ingredients WHERE off_code = ?').get(code);
  const result = { ean: code, ingredient: known || null, product: null, match: null, warnings: [] };
  try {
    result.product = await productByBarcode(code);
  } catch (err) {
    // Onbekend product (404) is iets anders dan een storing: dan kun je het zelf aan Open Food Facts toevoegen
    if (err.status === 404 || /404|niet gevonden/i.test(err.message)) result.not_in_off = true;
    else {
      result.off_unreachable = true;
      result.warnings.push(`Open Food Facts: ${err.message}`);
    }
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
export function applyBarcode(args) {
  const saved = applyBarcodeInner(args);
  const code = String(args.ean || args.product?.code || '').replace(/\D/g, '');
  if (saved?.id && code.length >= 8) linkBarcode(saved.id, code, { label: args.product?.name, grams: args.product?.grams });
  return saved;
}

/** Koppel een barcode aan een ingrediënt (een ingrediënt kan meerdere barcodes hebben). */
export function linkBarcode(ingredientId, ean, { label = null, grams = null } = {}) {
  const code = String(ean || '').replace(/\D/g, '');
  if (code.length < 8) throw Object.assign(new Error('Ongeldige barcode'), { status: 400 });
  getDb().prepare(`INSERT INTO ingredient_barcodes (code, ingredient_id, label, grams) VALUES (?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET ingredient_id = excluded.ingredient_id, label = COALESCE(excluded.label, label), grams = COALESCE(excluded.grams, grams)`)
    .run(code, Number(ingredientId), label || null, Number(grams) > 0 ? Number(grams) : null);
  return listBarcodes(ingredientId);
}

export function listBarcodes(ingredientId) {
  return getDb().prepare('SELECT code, label, grams FROM ingredient_barcodes WHERE ingredient_id = ? ORDER BY created_at').all(Number(ingredientId));
}

export function unlinkBarcode(ingredientId, ean) {
  getDb().prepare('DELETE FROM ingredient_barcodes WHERE ingredient_id = ? AND code = ?').run(Number(ingredientId), String(ean));
  return listBarcodes(ingredientId);
}

/** Ingrediënt + pakgewicht bij een al gekoppelde barcode (zonder Open Food Facts). */
export function knownBarcode(ean) {
  const code = String(ean || '').replace(/\D/g, '');
  return getDb().prepare('SELECT b.code, b.grams, b.label, b.ingredient_id FROM ingredient_barcodes b WHERE b.code = ?').get(code) || null;
}

function applyBarcodeInner({ ean, product, ingredient_id, name, update_nutrition = true }) {
  // Na het opslaan zoekt de prijswachtrij (Open Prices) via de barcode een echte prijs.
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
