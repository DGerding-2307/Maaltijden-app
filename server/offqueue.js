// Achtergrondwachtrij voor Open Food Facts: houdt zich aan de limieten van OFF en blokkeert de app niet.
import { autoNutrition } from './openfoodfacts.js';
import { createQueue } from './jobqueue.js';
import * as repo from './repo.js';

const queue = createQueue(async (ing, { force }) => {
  const aliases = String(ing.aliases || '').split(',').map((a) => a.trim()).filter(Boolean).slice(0, 3);
  const found = await autoNutrition(ing.name, aliases);
  if (!found) return { status: 'skipped', reason: 'geen betrouwbare producten gevonden' };
  const oldKcal = Number(ing.kcal);
  const newKcal = Number(found.fields.kcal);
  const deviates = oldKcal > 20 && (newKcal > oldKcal * 2 || newKcal < oldKcal / 2);
  if (deviates && !force) {
    return { status: 'skipped', reason: `wijkt sterk af (${Math.round(oldKcal)} → ${Math.round(newKcal)} kcal), nakijken`, suggestion: found.fields };
  }
  repo.saveIngredient(found.fields, ing.id);
  return { status: 'updated', info: { kcal: newKcal, matched: found.matched } };
});

export const enqueue = queue.enqueue;
export const queueStatus = queue.status;
export const clearQueue = queue.clear;
