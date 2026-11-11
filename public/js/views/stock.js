// Voorraad (v4.12): wat je in huis hebt, per pak met THT. Inscannen, uitscannen, toevoegen en afboeken.
import { api } from '../api.js';
import { $, $$, esc, num, toast, modal, fmtDate, debounce } from '../util.js';
import { scanBarcode } from '../scanner.js';
import { productDialog } from '../scan-flow.js';

const thtText = (i) => {
  if (!i.best_before) return '';
  if (i.expired) return `<span class="badge warn">over datum (${fmtDate(i.best_before)})</span>`;
  if (i.expiring) return `<span class="badge warn">THT ${i.days_left === 0 ? 'vandaag' : `over ${i.days_left} ${i.days_left === 1 ? 'dag' : 'dagen'}`}</span>`;
  return `<span class="muted small">THT ${fmtDate(i.best_before)}</span>`;
};

/** Gewicht en THT invullen voor één of meer pakken. */
export function addDialog({ ingredient = null, grams = null, ean = null, title = 'In voorraad zetten' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const md = modal(`<div class="sheet"><h2>${esc(title)}</h2>
      <form class="form" data-f>
        ${ingredient ? `<p><strong>${esc(ingredient.name)}</strong></p>` : `<label>Ingrediënt <input class="input" name="q" autocomplete="off" placeholder="zoek…" required></label><div data-hits class="stock-hits"></div>`}
        <div class="grid-2">
          <label>Gewicht per pak (g) <input class="input" type="number" step="any" min="1" inputmode="decimal" name="grams" value="${grams || ''}" required></label>
          <label>Aantal <input class="input" type="number" min="1" max="50" name="count" value="1"></label>
          <label class="span-2">THT-datum (optioneel) <input class="input" type="date" name="best_before"></label>
        </div>
        <button class="btn btn-primary cta">In voorraad</button>
      </form></div>`, { onClose: () => !done && resolve(null) });
    const f = $('[data-f]', md.el);
    let chosen = ingredient;
    if (!ingredient) {
      const hits = $('[data-hits]', md.el);
      f.q.addEventListener('input', debounce(async () => {
        chosen = null;
        const q = f.q.value.trim();
        if (!q) { hits.innerHTML = ''; return; }
        const list = await api.get(`/ingredients?q=${encodeURIComponent(q)}`);
        const items = (Array.isArray(list) ? list : list.ingredients || []).slice(0, 8);
        hits.innerHTML = items.map((i) => `<button type="button" class="chip-toggle" data-id="${i.id}" data-g="${i.package_grams || ''}">${esc(i.name)}</button>`).join('') || '<p class="muted small">Niets gevonden</p>';
        $$('[data-id]', hits).forEach((b) => b.addEventListener('click', () => {
          chosen = items.find((i) => i.id === Number(b.dataset.id));
          f.q.value = chosen.name;
          hits.innerHTML = '';
          if (!f.grams.value && b.dataset.g) f.grams.value = b.dataset.g;
        }));
      }));
    }
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!chosen) { toast('Kies een ingrediënt uit de lijst', 'error'); return; }
      try {
        const added = await api.post('/stock', { ingredient_id: chosen.id, grams: f.grams.value, count: f.count.value, best_before: f.best_before.value || null, ean });
        done = true;
        md.close();
        toast(`${chosen.name} in voorraad gezet`, 'success');
        resolve(added);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

/** Barcode scannen en inboeken. Onbekende code: opzoeken in Open Food Facts en koppelen aan een ingrediënt. */
export async function scanIn() {
  const ean = await scanBarcode({ title: 'Scan in (in huis)' });
  if (!ean) return null;
  const info = await api.get(`/stock/barcode/${ean}`);
  if (info.ingredient_id) return addDialog({ ingredient: { id: info.ingredient_id, name: info.name }, grams: info.grams, ean });
  const ing = await productDialog(ean, { purpose: 'stock' });
  if (!ing) return null;
  return addDialog({ ingredient: ing, grams: ing.package_grams, ean });
}

/** Barcode scannen en afboeken: standaard het hele oudste pak, of minder. */
export async function scanOut() {
  const ean = await scanBarcode({ title: 'Scan uit (opgebruikt)' });
  if (!ean) return null;
  const info = await api.get(`/stock/barcode/${ean}`);
  if (!info.ingredient_id) { toast('Deze barcode is nog niet gekoppeld; er staat niets van in de voorraad', 'error'); return null; }
  if (!info.in_stock) { toast(`Er staat geen ${info.name} in de voorraad`, 'error'); return null; }
  return consumeDialog({ id: info.ingredient_id, name: info.name, grams: info.in_stock });
}

function consumeDialog(group) {
  return new Promise((resolve) => {
    let done = false;
    const md = modal(`<div class="sheet"><h2>${esc(group.name)} afboeken</h2>
      <p class="muted">${num(group.grams, 0)} g in huis. Leeg = het hele (oudste) pak.</p>
      <form class="form" data-f>
        <label>Hoeveel gram gebruikt? <input class="input" type="number" step="any" min="1" inputmode="decimal" name="grams" placeholder="heel pak"></label>
        <button class="btn btn-primary cta">Afboeken</button>
      </form></div>`, { onClose: () => !done && resolve(null) });
    $('[data-f]', md.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await api.post('/stock/consume', { ingredient_id: group.id, grams: e.target.grams.value || null });
        done = true;
        md.close();
        toast(`${num(res.used, 0)} g ${group.name} afgeboekt`, 'success');
        resolve(res);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function editDialog(item) {
  return new Promise((resolve) => {
    let done = false;
    const md = modal(`<div class="sheet"><h2>${esc(item.name)}</h2>
      <form class="form" data-f>
        <div class="grid-2">
          <label>Nog over (g) <input class="input" type="number" step="any" min="0" inputmode="decimal" name="grams" value="${item.grams_left}"></label>
          <label>THT-datum <input class="input" type="date" name="best_before" value="${esc(item.best_before || '')}"></label>
        </div>
        <div class="row"><button class="btn btn-primary">Opslaan</button><button type="button" class="btn btn-ghost" data-del>🗑️ Weg</button></div>
      </form></div>`, { onClose: () => !done && resolve(false) });
    const close = () => { done = true; md.close(); resolve(true); };
    $('[data-f]', md.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api.put(`/stock/${item.id}`, { grams_left: e.target.grams.value, best_before: e.target.best_before.value || null }); close(); } catch (err) { toast(err.message, 'error'); }
    });
    $('[data-del]', md.el).addEventListener('click', async () => {
      try { await api.del(`/stock/${item.id}`); close(); } catch (err) { toast(err.message, 'error'); }
    });
  });
}

export async function render(root) {
  root.innerHTML = `<div class="view stock">
    <div class="page-head"><h1>Voorraad</h1>
      <div class="row wrap">
        <button class="btn btn-primary" data-in>📷 Scan in</button>
        <button class="btn" data-out>📤 Scan uit</button>
        <button class="btn" data-add>＋ Toevoegen</button>
      </div></div>
    <div data-body><p class="muted">Laden…</p></div>
  </div>`;
  const body = $('[data-body]', root);
  const after = (r) => r && load();
  $('[data-in]', root).addEventListener('click', () => scanIn().then(after).catch((e) => toast(e.message, 'error')));
  $('[data-out]', root).addEventListener('click', () => scanOut().then(after).catch((e) => toast(e.message, 'error')));
  $('[data-add]', root).addEventListener('click', () => addDialog().then(after));

  async function load() {
    const data = await api.get('/stock');
    if (!data.ingredients.length) {
      body.innerHTML = `<div class="card empty"><p><strong>Nog niets in de voorraad.</strong></p>
        <p class="muted">Vink boodschappen af, scan een barcode of voeg iets toe. Koken haalt het er weer af.</p></div>`;
      return;
    }
    const attention = data.attention.length ? `<div class="card stock-attention"><h2>Bijna over datum</h2>
      ${data.attention.map((i) => `<div>${esc(i.name)} · ${num(i.grams_left, 0)} g ${thtText(i)}</div>`).join('')}</div>` : '';
    body.innerHTML = `${attention}<div class="stock-list">${data.ingredients.map((g) => `
      <div class="card stock-group ${g.expired ? 'expired' : g.expiring ? 'expiring' : ''}">
        <div class="stock-head">
          <div><strong>${esc(g.name)}</strong> <span class="muted small">${esc(g.category)}</span><div class="stock-total">${num(g.grams, 0)} g in huis</div></div>
          <div class="row"><button class="btn small" data-plus="${g.ingredient_id}" aria-label="Pak toevoegen">＋</button>
            <button class="btn small" data-minus="${g.ingredient_id}" aria-label="Afboeken">−</button></div>
        </div>
        <div class="stock-items">${g.items.map((i) => `<button type="button" class="stock-item" data-item="${i.id}">
          <span>${num(i.grams_left, 0)}${i.grams_left < i.grams_initial ? ` / ${num(i.grams_initial, 0)}` : ''} g</span>${thtText(i) || '<span class="muted small">geen THT</span>'}</button>`).join('')}</div>
      </div>`).join('')}</div>`;
    const byId = new Map(data.ingredients.map((g) => [g.ingredient_id, g]));
    const items = new Map(data.ingredients.flatMap((g) => g.items).map((i) => [i.id, i]));
    $$('[data-plus]', body).forEach((b) => b.addEventListener('click', () => {
      const g = byId.get(Number(b.dataset.plus));
      addDialog({ ingredient: { id: g.ingredient_id, name: g.name }, grams: g.items[0]?.grams_initial }).then(after);
    }));
    $$('[data-minus]', body).forEach((b) => b.addEventListener('click', () => {
      const g = byId.get(Number(b.dataset.minus));
      consumeDialog({ id: g.ingredient_id, name: g.name, grams: g.grams }).then(after);
    }));
    $$('[data-item]', body).forEach((b) => b.addEventListener('click', () => editDialog(items.get(Number(b.dataset.item))).then(after)));
  }
  await load();
}

