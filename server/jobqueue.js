// Eenvoudige achtergrondwachtrij: verwerkt ingrediënten één voor één, zonder de app te blokkeren.
// Gebruikt voor Open Food Facts (voedingswaarden) en Open Prices (prijzen).
import * as repo from './repo.js';

/**
 * @param worker async (ingredient, { force }) => { status: 'updated'|'skipped', reason?, suggestion?, info? }
 */
export function createQueue(worker) {
  const state = { running: false, queue: [], done: 0, updated: [], skipped: [], errors: [], started_at: null };
  let finishHandlers = [];

  function status() {
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

  async function run() {
    state.running = true;
    let consecutiveErrors = 0;
    while (state.queue.length) {
      const { id, force } = state.queue.shift();
      const ing = repo.getIngredient(id);
      if (!ing) continue;
      try {
        const r = await worker(ing, { force });
        consecutiveErrors = 0;
        if (r.status === 'updated') state.updated.push({ id, name: ing.name, ...r.info });
        else state.skipped.push({ id, name: ing.name, reason: r.reason, suggestion: r.suggestion });
      } catch (err) {
        consecutiveErrors++;
        state.errors.push(`${ing.name}: ${err.message}`);
        // Dienst onbereikbaar: stoppen in plaats van de hele lijst te laten mislukken.
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
    for (const h of handlers) h(status());
  }

  function enqueue(ids, { force = false, onFinish = null } = {}) {
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
    return status();
  }

  return { enqueue, status, clear: () => { state.queue = []; } };
}
