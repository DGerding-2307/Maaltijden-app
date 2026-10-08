// Ingrediënten bij een geplande maaltijd: vlees of vis bij een gerecht zonder vlees, of een hele maaltijd
// van losse ingrediënten (zonder recept). Hoeveelheden per persoon.
import { api, meta } from './api.js';
import { $, $$, esc, num, euro, modal, toast, debounce } from './util.js';
import { ingThumb } from './ingredient-form.js';

const MEAT = 'Vlees, vis & vega';

/** Lijst met vlees, vis en vleesvervangers (voor keuzelijsten). */
export async function meatOptions() {
  return (await api.get('/ingredients')).filter((i) => i.category === MEAT);
}

/** Standaardportie per persoon: 1 stuk als het per stuk gaat, anders 125 g vlees/vis of 100 g. */
export const defaultPortion = (ing) => (ing.unit_weight_g >= 30 ? { quantity: 1, unit: 'stuk' } : { quantity: ing.category === MEAT ? 125 : 100, unit: 'g' });

export const meatDialog = (entry, onChange) => extrasDialog(entry, onChange, { mode: 'meat' });

/**
 * @param mode 'meat' (vlees of vis bij een gerecht) of 'all' (maaltijd van losse ingrediënten)
 * @param onClose aangeroepen met de gekozen extra's als het venster sluit
 */
export async function extrasDialog(entry, onChange, { mode = 'meat', onClose } = {}) {
  const m = await meta();
  const all = await api.get('/ingredients');
  let cat = mode === 'meat' ? MEAT : '';
  const title = entry.recipe_id ? entry.recipe_title : entry.title;
  const md = modal(`
    <h2>${mode === 'meat' ? `🥩 Vlees of vis bij ${esc(title)}` : '🥕 Maaltijd van losse ingrediënten'}</h2>
    <p class="muted small">Hoeveelheid per persoon; deze maaltijd is voor ${entry.servings} ${entry.servings === 1 ? 'persoon' : 'personen'}.
      Het telt mee voor de boodschappenlijst, de prijs, de voedingswaarden en het dagboek.</p>
    <div data-current></div>
    <h3>Toevoegen</h3>
    <div class="row wrap">
      <input type="search" class="input grow" placeholder="${mode === 'meat' ? 'Zoek, bv. slavink, kipfilet, zalm…' : 'Zoek, bv. kipschnitzel, friet, sla…'}" data-meat-q aria-label="Zoek ingrediënt">
      <select class="input narrow-auto" data-meat-cat aria-label="Afdeling">
        <option value="">Alle afdelingen</option>${m.categories.map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div class="meat-grid" data-meat-list></div>`, { wide: true, onClose: () => onClose?.(extras) });
  const el = md.el;
  let extras = entry.extras || [];

  const drawCurrent = () => {
    $('[data-current]', el).innerHTML = extras.length ? `<ul class="meat-current">${extras.map((x) => `
      <li data-x="${x.id}">
        ${ingThumb(x, 'sm')}<strong>${esc(x.name)}</strong>
        <input class="input narrow" type="number" min="0" step="any" value="${x.quantity}" data-x-qty aria-label="Hoeveelheid per persoon">
        <select class="input" data-x-unit aria-label="Eenheid">${['stuk', 'g', 'ml'].map((u) => `<option value="${u}" ${u === x.unit ? 'selected' : ''}>${{ stuk: 'stuks', g: 'gram', ml: 'ml' }[u]}</option>`).join('')}</select>
        <span class="muted small">p.p. · ${num(x.grams_per_person, 0)} g · ${x.cost_cents != null ? euro(x.cost_cents * entry.servings) : ''}</span>
        <button class="mini danger" data-x-del aria-label="Verwijderen">✕</button>
      </li>`).join('')}</ul>` : '<p class="muted">Nog niets gekozen.</p>';
  };
  const drawOptions = () => {
    const q = $('[data-meat-q]', el).value.trim().toLowerCase();
    const list = all.filter((i) => (!cat || i.category === cat) && (!q || `${i.name} ${i.aliases || ''}`.toLowerCase().includes(q))).slice(0, 60);
    $('[data-meat-list]', el).innerHTML = list.map((i) => `
      <button class="meat-option" data-add="${i.id}">${ingThumb(i) || `<span class="ing-thumb meat-emoji">${i.category === MEAT ? '🥩' : '🥕'}</span>`}<span>${esc(i.name)}</span></button>`).join('')
      || '<p class="muted">Niets gevonden. Nieuwe ingrediënten voeg je toe bij Ingrediënten.</p>';
  };
  drawCurrent();
  drawOptions();
  $('[data-meat-q]', el).addEventListener('input', debounce(drawOptions, 150));
  $('[data-meat-cat]', el).addEventListener('change', (e) => { cat = e.target.value; drawOptions(); });

  const changed = async (promise) => {
    try {
      extras = await promise;
      drawCurrent();
      onChange?.();
    } catch (err) { toast(err.message, 'error'); }
  };
  el.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const ing = all.find((i) => i.id === Number(add.dataset.add));
      await changed(api.post(`/plan/${entry.id}/extras`, { ingredient_id: ing.id, ...defaultPortion(ing) }));
      toast(`${ing.name} toegevoegd`, 'success');
      return;
    }
    const del = e.target.closest('[data-x-del]');
    if (del) {
      await api.del(`/plan/extras/${del.closest('[data-x]').dataset.x}`);
      extras = extras.filter((x) => String(x.id) !== del.closest('[data-x]').dataset.x);
      drawCurrent();
      onChange?.();
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-meat-cat]')) return;
    const li = e.target.closest('[data-x]');
    if (!li) return;
    changed(api.put(`/plan/extras/${li.dataset.x}`, { quantity: $('[data-x-qty]', li).value, unit: $('[data-x-unit]', li).value }));
  });
}
