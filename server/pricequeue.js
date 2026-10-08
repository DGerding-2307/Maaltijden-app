// Achtergrondwachtrij voor Open Prices: prijzen per ingrediënt ophalen zonder de app te blokkeren.
import { priceForIngredient, ingredientPriceFields } from './openprices.js';
import { createQueue } from './jobqueue.js';
import * as repo from './repo.js';

const queue = createQueue(async (ing, { force }) => {
  // Zelf ingevulde prijzen nooit automatisch overschrijven
  if (ing.price_source === 'handmatig' && !force) return { status: 'skipped', reason: 'prijs is handmatig ingevuld' };
  const result = await priceForIngredient(ing);
  if (!result.count) return { status: 'skipped', reason: 'geen Nederlandse prijzen gevonden' };
  const fields = ingredientPriceFields(result);
  const old = Number(ing.price_cents);
  // Sterk afwijkend bij slechts één of twee metingen: ter controle voorleggen
  if (!force && old > 0 && result.count < 3 && (fields.price_cents > old * 2.5 || fields.price_cents < old / 2.5)) {
    return { status: 'skipped', reason: `wijkt sterk af (€ ${(old / 100).toFixed(2)} → € ${(fields.price_cents / 100).toFixed(2)}) bij ${result.count} meting(en), nakijken`, suggestion: fields };
  }
  repo.saveIngredient(fields, ing.id);
  return { status: 'updated', info: { price_cents: fields.price_cents, count: result.count } };
});

export const enqueuePrices = queue.enqueue;
export const priceQueueStatus = queue.status;
export const clearPriceQueue = queue.clear;
