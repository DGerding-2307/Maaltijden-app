// Bonnetje uploaden: Claude leest de regels, jij controleert ze, daarna worden verpakkingen en prijzen bijgewerkt.
import { api } from './api.js';
import { $, $$, esc, euro, modal, toast, readImageFile } from './util.js';

const MAX_PHOTOS = 4;
const eur = (cents) => (cents == null ? '' : (cents / 100).toFixed(2));

function lineHtml(l, i) {
  const was = l.old_price_cents == null ? (l.ingredient_id ? 'Nieuwe verpakking voor dit ingrediënt' : '')
    : l.old_price_cents === l.price_cents ? 'Prijs is gelijk gebleven' : `Was ${euro(l.old_price_cents)}`;
  const notes = [
    was,
    l.discount ? 'Korting op de bon: normale prijs wordt bewaard' : '',
    l.ingredient_id && !l.grams_on_receipt ? '⚠️ Gewicht staat niet op de bon, controleer het' : '',
    !l.ingredient_id && l.is_food ? 'Geen ingrediënt gevonden: kies er een of laat dit uit' : '',
  ].filter(Boolean);
  return `<div class="receipt-line" data-line="${i}">
    <label class="check"><input type="checkbox" data-use ${l.selected ? 'checked' : ''}>
      <span><strong>${esc(l.receipt_text)}</strong> <span class="muted small">${l.count > 1 ? `${l.count}× ` : ''}${euro(l.price_cents)}</span></span></label>
    <div class="receipt-fields">
      <label class="receipt-ing">Ingrediënt <input class="input" list="receipt-ingredients" data-ing value="${esc(l.ingredient_name || '')}" autocomplete="off"></label>
      <label>Verpakking (g) <input class="input" type="number" step="any" min="0" inputmode="decimal" data-grams value="${l.grams ?? ''}"></label>
      <label>Prijs (€) <input class="input" type="number" step="0.01" min="0" inputmode="decimal" data-price value="${eur(l.price_cents)}"></label>
    </div>
    ${notes.length ? `<p class="muted small">${notes.map(esc).join(' · ')}</p>` : ''}
  </div>`;
}

/** Kies een of meer foto's en open daarna het controlescherm. */
export function chooseReceipt(onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', async () => {
    const files = [...input.files].slice(0, MAX_PHOTOS);
    if (files.length) await readReceipt(files, onDone);
  });
  input.click();
}

async function readReceipt(files, onDone) {
  const wait = modal(`<h2>🧾 Bonnetje lezen</h2><p class="muted" role="status">Claude leest je bonnetje. Dat duurt meestal een halve minuut.</p>`);
  try {
    const images = await Promise.all(files.map(async (f) => {
      const img = await readImageFile(f, 2000);
      return { media_type: img.media_type, data: img.data };
    }));
    const [result, ingredients] = await Promise.all([api.post('/receipt/read', { images }), api.get('/ingredients')]);
    wait.close();
    if (!result.readable || !result.lines.length) return toast('Op deze foto kon ik geen bonnetje lezen. Probeer een scherpere foto.', 'error');
    review(result, ingredients, onDone);
  } catch (err) {
    wait.close();
    toast(err.message, 'error');
  }
}

function review(result, ingredients, onDone) {
  const byName = new Map(ingredients.map((i) => [i.name.toLowerCase(), i]));
  const md = modal(`
    <h2>🧾 Bonnetje controleren</h2>
    <p class="muted small">${esc([result.store, result.date].filter(Boolean).join(' · '))}. Controleer de regels: alleen wat is aangevinkt, wordt opgeslagen.
      De foto zelf wordt niet bewaard.</p>
    <datalist id="receipt-ingredients">${ingredients.map((i) => `<option value="${esc(i.name)}"></option>`).join('')}</datalist>
    <div class="receipt-lines">${result.lines.map(lineHtml).join('')}</div>
    <div class="row end"><button type="button" class="btn btn-primary" data-save>Opslaan</button></div>`, { wide: true });
  // Ingrediënt gekozen bij een lege regel: meteen aanvinken en het gewicht van de hoofdverpakking invullen
  $('.receipt-lines', md.el).addEventListener('change', (e) => {
    if (!e.target.matches('[data-ing]')) return;
    const row = e.target.closest('.receipt-line');
    const ing = byName.get(e.target.value.trim().toLowerCase());
    if (!ing) return;
    $('[data-use]', row).checked = true;
    if (!$('[data-grams]', row).value && ing.package_grams) $('[data-grams]', row).value = ing.package_grams;
  });
  $('[data-save]', md.el).addEventListener('click', async (e) => {
    const lines = [];
    for (const row of $$('.receipt-line', md.el)) {
      if (!$('[data-use]', row).checked) continue;
      const line = result.lines[Number(row.dataset.line)];
      const id = byName.get($('[data-ing]', row).value.trim().toLowerCase())?.id;
      const grams = Number($('[data-grams]', row).value);
      const price = Math.round(Number($('[data-price]', row).value) * 100);
      if (!id) return toast(`Kies bij “${line.receipt_text}” een bestaand ingrediënt, of vink de regel uit.`, 'error');
      if (!(grams > 0) || !(price > 0)) return toast(`Vul bij “${line.receipt_text}” een gewicht en prijs in.`, 'error');
      lines.push({ ingredient_id: id, grams, price_cents: price });
    }
    if (!lines.length) return toast('Er is niets aangevinkt.', 'error');
    e.target.disabled = true;
    try {
      const r = await api.post('/receipt/apply', { store: result.store, date: result.date, lines });
      md.close();
      toast(`${r.updated} ${r.updated === 1 ? 'ingrediënt' : 'ingrediënten'} bijgewerkt`, 'success');
      onDone?.();
    } catch (err) {
      e.target.disabled = false;
      toast(err.message, 'error');
    }
  });
}
