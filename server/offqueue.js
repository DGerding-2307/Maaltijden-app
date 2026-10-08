// Achtergrondwachtrij voor Open Food Facts: houdt zich aan de limieten van OFF en blokkeert de app niet.
import { autoNutrition } from './openfoodfacts.js';
import * as repo from './repo.js';

const state = {
  running: false,
  queue: [],
  done: 0,
  updated: [],
  skipped: [],
  errors: [],
  started_at: null,
};

export function queueStatus() {
  return {
    running: state.running,
    pending: state.queue.length,
    done: state.done,
    updated: state.updated.slice(-50),
    skipped: state.skipped.slice(-50),
    errors: state.errors.slice(-10),
    started_at: state.started_at,
  };
}

/**
 * Zet ingrediënten in de wachtrij.
 * @param ids     ingrediënt-id's
 * @param options.force  ook overschrijven als de nieuwe waarde sterk afwijkt van de huidige
 */
let finishHandlers = [];

export function enqueue(ids, { force = false, onFinish = null } = {}) {
  if (onFinish) finishHandlers.push(onFinish);
  for (const id of ids) if (!state.queue.some((q) => q.id === id)) state.queue.push({ id, force });
  if (!state.running) {
    state.done = 0;
    state.updated = [];
    state.skipped = [];
    state.errors = [];
    state.started_at = new Date().toISOString();
    run();
  }
  return queueStatus();
}

export function clearQueue() {
  state.queue = [];
}

async function run() {
  state.running = true;
  let consecutiveErrors = 0;
  while (state.queue.length) {
    const { id, force } = state.queue.shift();
    const ing = repo.getIngredient(id);
    if (!ing) continue;
    try {
      const aliases = String(ing.aliases || '').split(',').map((a) => a.trim()).filter(Boolean).slice(0, 3);
      const found = await autoNutrition(ing.name, aliases);
      consecutiveErrors = 0;
      if (!found) {
        state.skipped.push({ id, name: ing.name, reason: 'geen betrouwbare producten gevonden' });
      } else {
        const oldKcal = Number(ing.kcal);
        const newKcal = Number(found.fields.kcal);
        const deviates = oldKcal > 20 && (newKcal > oldKcal * 2 || newKcal < oldKcal / 2);
        if (deviates && !force) {
          state.skipped.push({ id, name: ing.name, reason: `wijkt sterk af (${Math.round(oldKcal)} → ${Math.round(newKcal)} kcal), nakijken`, suggestion: found.fields });
        } else {
          repo.saveIngredient(found.fields, id);
          state.updated.push({ id, name: ing.name, kcal: newKcal, matched: found.matched });
        }
      }
    } catch (err) {
      consecutiveErrors++;
      state.errors.push(`${ing.name}: ${err.message}`);
      // OFF onbereikbaar: stop in plaats van de hele lijst te laten mislukken.
      if (consecutiveErrors >= 3) {
        state.queue = [];
        break;
      }
    }
    state.done++;
  }
  state.running = false;
  const handlers = finishHandlers;
  finishHandlers = [];
  for (const h of handlers) h(queueStatus());
}
