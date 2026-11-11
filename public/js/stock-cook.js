// 'Gekookt' (v4.12): de ingrediënten van een recept gaan van de voorraad af, oudste THT eerst.
import { api } from './api.js';
import { toast, num } from './util.js';

/** @returns het afboek-record ({ id, lines }) of null bij een fout */
export async function markCooked({ recipe_id = null, servings = null, plan_entry_id = null } = {}) {
  try {
    const res = await api.post('/stock/cook', { recipe_id, servings, plan_entry_id });
    const used = res.lines.filter((l) => l.used > 0);
    const short = res.lines.filter((l) => l.short > 0 && !l.used);
    toast(used.length
      ? `Afgeboekt van de voorraad: ${used.map((l) => `${l.name} ${num(l.used, 0)} g`).join(', ')}`
      : 'Gekookt ✓ (niets hiervan stond in de voorraad)', 'success');
    if (short.length && used.length) console.info('Niet in voorraad:', short.map((l) => l.name).join(', '));
    return res;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

export async function undoCooked(id) {
  try {
    await api.del(`/stock/cook/${id}`);
    toast('Afboeking ongedaan gemaakt: alles staat weer in de voorraad');
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
}
