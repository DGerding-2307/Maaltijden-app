// Voorraad (v4.12): wat je in huis hebt, per pak met THT. Inscannen, uitscannen, toevoegen en afboeken.
import { api, meta } from '../api.js';
import { $, $$, esc, num, toast, modal, fmtDate, debounce, todayISO, CAT_EMOJI } from '../util.js';
import { scanBarcode } from '../scanner.js';
import { productDialog } from '../scan-flow.js';

/** Gewicht van 1 stuk als het ingrediënt per stuk gaat (eieren, paprika's...), anders null. */
const pieceW = (x) => (Number(x?.unit_weight_g) >= 30 ? Number(x.unit_weight_g) : null);
const pieces = (grams, w) => Math.round((Number(grams) / w) * 10) / 10;
/** Stuks alleen als een pak uit hele stuks bestaat (10 eieren = 600 g); 300 g kipfilet blijft gram. */
const wFor = (x, packGrams) => {
  const w = pieceW(x);
  if (!w || !(Number(packGrams) > 0)) return w;
  const n = Number(packGrams) / w;
  return n >= 0.95 && Math.abs(n - Math.round(n)) < 0.05 ? w : null;
};
/** '6 stuks' bij ingrediënten per stuk, anders '300 g'. */
const amount = (grams, w) => {
  if (!w) return `${num(grams, 0)} g`;
  const n = pieces(grams, w);
  return `${num(n, 1)} ${n === 1 ? 'stuk' : 'stuks'}`;
};

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
    let w = wFor(ingredient, grams);
    const startVal = grams && w ? pieces(grams, w) : grams;
    const md = modal(`<div class="sheet"><h2>${esc(title)}</h2>
      <form class="form" data-f>
        ${ingredient ? `<p><strong>${esc(ingredient.name)}</strong></p>` : `<label>Ingrediënt <input class="input" name="q" autocomplete="off" placeholder="zoek…" required></label><div data-hits class="stock-hits"></div>`}
        <div class="grid-2">
          <label><span data-amount-label>${w ? 'Stuks per pak' : 'Gewicht per pak (g)'}</span> <input class="input" type="number" step="any" min="${w ? '0.1' : '1'}" inputmode="decimal" name="grams" value="${startVal || ''}" required></label>
          <label>Aantal <input class="input" type="number" min="1" max="50" name="count" value="1"></label>
          <label class="span-2">THT-datum (optioneel) <input class="input" type="date" name="best_before"></label>
        </div>
        <button class="btn btn-primary cta">In voorraad</button>
      </form></div>`, { onClose: () => !done && resolve(null) });
    const f = $('[data-f]', md.el);
    let chosen = ingredient;
    const setUnit = (ing) => {
      w = wFor(ing, ing.package_grams);
      $('[data-amount-label]', md.el).textContent = w ? 'Stuks per pak' : 'Gewicht per pak (g)';
      f.grams.min = w ? '0.1' : '1';
    };
    if (!ingredient) {
      const hits = $('[data-hits]', md.el);
      f.q.addEventListener('input', debounce(async () => {
        chosen = null;
        const q = f.q.value.trim();
        if (!q) { hits.innerHTML = ''; return; }
        const list = await api.get(`/ingredients?q=${encodeURIComponent(q)}`);
        const items = (Array.isArray(list) ? list : list.ingredients || []).slice(0, 8);
        hits.innerHTML = items.map((i) => `<button type="button" class="chip-toggle" data-id="${i.id}">${esc(i.name)}</button>`).join('') || '<p class="muted small">Niets gevonden</p>';
        $$('[data-id]', hits).forEach((b) => b.addEventListener('click', () => {
          chosen = items.find((i) => i.id === Number(b.dataset.id));
          f.q.value = chosen.name;
          hits.innerHTML = '';
          setUnit(chosen);
          const pack = Number(chosen.package_grams) || null;
          if (pack) f.grams.value = w ? pieces(pack, w) : pack;
        }));
      }));
    }
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!chosen) { toast('Kies een ingrediënt uit de lijst', 'error'); return; }
      try {
        const v = Number(f.grams.value);
        const added = await api.post('/stock', { ingredient_id: chosen.id, grams: w ? Math.round(v * w * 10) / 10 : v, count: f.count.value, best_before: f.best_before.value || null, ean });
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
  if (info.ingredient_id) return addDialog({ ingredient: { id: info.ingredient_id, name: info.name, unit_weight_g: info.unit_weight_g }, grams: info.grams, ean });
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
  return consumeDialog({ id: info.ingredient_id, name: info.name, grams: info.in_stock, unit_weight_g: info.unit_weight_g, pack_grams: info.grams });
}

function consumeDialog(group) {
  return new Promise((resolve) => {
    let done = false;
    const w = wFor(group, group.pack_grams ?? group.grams);
    const md = modal(`<div class="sheet"><h2>${esc(group.name)} afboeken</h2>
      <p class="muted">${amount(group.grams, w)} in huis. Leeg = het hele (oudste) pak.</p>
      <form class="form" data-f>
        <label>${w ? 'Hoeveel stuks gebruikt?' : 'Hoeveel gram gebruikt?'} <input class="input" type="number" step="any" min="${w ? '0.1' : '1'}" inputmode="decimal" name="grams" placeholder="heel pak"></label>
        <button class="btn btn-primary cta">Afboeken</button>
      </form></div>`, { onClose: () => !done && resolve(null) });
    $('[data-f]', md.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const v = Number(e.target.grams.value) || null;
        const res = await api.post('/stock/consume', { ingredient_id: group.id, grams: v && w ? v * w : v });
        done = true;
        md.close();
        toast(`${amount(res.used, w)} ${group.name} afgeboekt`, 'success');
        resolve(res);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function editDialog(item) {
  return new Promise((resolve) => {
    let done = false;
    const w = wFor(item, item.grams_initial);
    const md = modal(`<div class="sheet"><h2>${esc(item.name)}</h2>
      <form class="form" data-f>
        <div class="grid-2">
          <label>${w ? 'Nog over (stuks)' : 'Nog over (g)'} <input class="input" type="number" step="any" min="0" inputmode="decimal" name="grams" value="${w ? pieces(item.grams_left, w) : item.grams_left}"></label>
          <label>THT-datum <input class="input" type="date" name="best_before" value="${esc(item.best_before || '')}"></label>
        </div>
        <div class="row"><button class="btn btn-primary">Opslaan</button><button type="button" class="btn btn-ghost" data-del>🗑️ Weg</button></div>
      </form></div>`, { onClose: () => !done && resolve(false) });
    const close = () => { done = true; md.close(); resolve(true); };
    $('[data-f]', md.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = e.target.grams.value === '' ? undefined : Number(e.target.grams.value);
      try { await api.put(`/stock/${item.id}`, { grams_left: v != null && w ? Math.round(v * w * 10) / 10 : v, best_before: e.target.best_before.value || null }); close(); } catch (err) { toast(err.message, 'error'); }
    });
    $('[data-del]', md.el).addEventListener('click', async () => {
      try { await api.del(`/stock/${item.id}`); close(); } catch (err) { toast(err.message, 'error'); }
    });
  });
}

const portions = (n) => `${num(n, 1)} ${Number(n) === 1 ? 'portie' : 'porties'}`;
const PLACE = { koelkast: '🧊 koelkast', vriezer: '❄️ vriezer' };

/** Een maaltijd of restjes in de voorraad zetten (met of zonder recept). */
export function addMealDialog() {
  return new Promise((resolve) => {
    let done = false;
    let chosen = null;
    const md = modal(`<div class="sheet"><h2>🍲 Maaltijd in voorraad</h2>
      <p class="muted small">Restjes van een maaltijd die je als <b>gekookt</b> afvinkt, komen er vanzelf in. Dit is voor zelf ingevroren porties en wat al in huis is.</p>
      <form class="form" data-f>
        <label>Recept of naam <input class="input" name="q" autocomplete="off" placeholder="zoek een recept of typ een naam…" required></label>
        <div data-hits class="stock-hits"></div>
        <div class="grid-2">
          <label>Porties <input class="input" type="number" step="any" min="0.5" inputmode="decimal" name="portions" value="2" required></label>
          <label>Waar? <select class="input" name="location"><option value="koelkast">🧊 Koelkast</option><option value="vriezer">❄️ Vriezer</option></select></label>
          <label class="span-2">THT-datum (leeg = koelkast 3 dagen, vriezer 3 maanden) <input class="input" type="date" name="best_before"></label>
        </div>
        <button class="btn btn-primary cta">In voorraad</button>
      </form></div>`, { onClose: () => !done && resolve(null) });
    const f = $('[data-f]', md.el);
    const hits = $('[data-hits]', md.el);
    f.q.addEventListener('input', debounce(async () => {
      chosen = null;
      const q = f.q.value.trim();
      if (q.length < 2) { hits.innerHTML = ''; return; }
      const list = await api.get(`/recipes?q=${encodeURIComponent(q)}`);
      const items = (Array.isArray(list) ? list : list.recipes || []).slice(0, 8);
      hits.innerHTML = items.map((r) => `<button type="button" class="chip-toggle" data-id="${r.id}">${esc(r.title)}</button>`).join('');
      $$('[data-id]', hits).forEach((b) => b.addEventListener('click', () => {
        chosen = items.find((r) => r.id === Number(b.dataset.id));
        f.q.value = chosen.title;
        hits.innerHTML = '';
      }));
    }, 200));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = f.q.value.trim();
      try {
        const meal = await api.post('/stock/meals', {
          recipe_id: chosen && chosen.title === title ? chosen.id : null, title,
          portions: Number(f.portions.value), location: f.location.value, best_before: f.best_before.value || null,
        });
        done = true;
        md.close();
        toast(`${meal.title} in de voorraad gezet (${portions(meal.portions_left)})`, 'success');
        resolve(meal);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

/** Een maaltijd uit de voorraad: opeten, inplannen of aanpassen. */
async function mealDialog(meal) {
  const m = await meta();
  return new Promise((resolve) => {
    let done = false;
    const md = modal(`<div class="sheet"><h2>🍲 ${esc(meal.title)}</h2>
      <p class="muted">${portions(meal.portions_left)} · ${PLACE[meal.location] || esc(meal.location)}${meal.best_before ? ` · THT ${fmtDate(meal.best_before)}` : ''}</p>
      <form class="form" data-plan>
        <h3>📅 Inplannen</h3>
        <div class="grid-2">
          <label>Dag <input class="input" type="date" name="date" value="${todayISO()}" required></label>
          <label>Moment <select class="input" name="meal">${m.meals.map((x) => `<option ${x === 'diner' ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>Porties <input class="input" type="number" min="1" name="servings" value="${Math.max(1, Math.min(2, Math.floor(meal.portions_left)))}"></label>
        </div>
        <p class="muted small">Komt niet op de boodschappenlijst. Tik in de planner op <b>opgegeten?</b>, dan gaan de porties van de voorraad af.</p>
        <button class="btn btn-primary">Inplannen</button>
      </form>
      <hr>
      <form class="form" data-edit>
        <h3>Aanpassen</h3>
        <div class="grid-2">
          <label>Porties over <input class="input" type="number" step="any" min="0" inputmode="decimal" name="portions" value="${meal.portions_left}"></label>
          <label>Waar? <select class="input" name="location"><option value="koelkast" ${meal.location === 'koelkast' ? 'selected' : ''}>🧊 Koelkast</option><option value="vriezer" ${meal.location === 'vriezer' ? 'selected' : ''}>❄️ Vriezer</option></select></label>
          <label class="span-2">THT-datum <input class="input" type="date" name="best_before" value="${esc(meal.best_before || '')}"></label>
        </div>
        <div class="row wrap"><button class="btn">Opslaan</button><button type="button" class="btn" data-eat>🍽️ 1 portie opgegeten</button><button type="button" class="btn btn-ghost" data-del>🗑️ Weg</button></div>
      </form></div>`, { onClose: () => !done && resolve(false) });
    const close = () => { done = true; md.close(); resolve(true); };
    const fail = (err) => toast(err.message, 'error');
    $('[data-plan]', md.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api.post(`/stock/meals/${meal.id}/plan`, { date: f.date.value, meal: f.meal.value, servings: Number(f.servings.value) || 1 });
        toast(`${meal.title} ingepland op ${fmtDate(f.date.value)}`, 'success');
        close();
      } catch (err) { fail(err); }
    });
    $('[data-edit]', md.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await api.put(`/stock/meals/${meal.id}`, { portions_left: Number(f.portions.value), location: f.location.value, best_before: f.best_before.value || null }); close(); } catch (err) { fail(err); }
    });
    $('[data-eat]', md.el).addEventListener('click', async () => {
      try { const r = await api.post(`/stock/meals/${meal.id}/eat`, { portions: 1 }); toast(`1 portie ${meal.title} afgeboekt`, 'success'); close(); return r; } catch (err) { fail(err); }
    });
    $('[data-del]', md.el).addEventListener('click', async () => {
      try { await api.del(`/stock/meals/${meal.id}`); close(); } catch (err) { fail(err); }
    });
  });
}

const mealTht = (x) => {
  if (!x.best_before) return '';
  if (x.expired) return `<span class="badge warn">over datum (${fmtDate(x.best_before)})</span>`;
  if (x.expiring) return `<span class="badge warn">THT ${x.days_left === 0 ? 'vandaag' : 'morgen'}</span>`;
  return `<span class="muted small">THT ${fmtDate(x.best_before)}</span>`;
};

// Uitklapbare categorieën; welke open staan, onthoudt de app per apparaat
const OPEN_KEY = 'stockOpenCats';
const openCats = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch { return new Set(); } };
const saveOpen = (set) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...set])); } catch { /* opslag niet beschikbaar */ } };
const MEALS_CAT = 'Maaltijden & restjes';
const CAT_ORDER = Object.keys(CAT_EMOJI);
const catRank = (c) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? CAT_ORDER.length - 1 : i; };
const warnOf = (list) => (list.some((x) => x.expired) ? 'expired' : list.some((x) => x.expiring) ? 'expiring' : '');

function catHtml(name, emoji, count, warn, inner, open) {
  return `<details class="stock-cat ${warn}" data-cat="${esc(name)}" ${open ? 'open' : ''}>
    <summary><span class="stock-cat-name">${emoji} ${esc(name)}</span>
      <span class="stock-cat-meta">${warn === 'expired' ? '<span class="badge warn">over datum</span>' : warn === 'expiring' ? '<span class="badge warn">bijna THT</span>' : ''}<span class="stock-cat-count">${count}</span></span></summary>
    <div class="stock-list">${inner}</div>
  </details>`;
}

function mealsHtml(meals, open) {
  if (!meals.length) return '';
  return catHtml(MEALS_CAT, '🍲', meals.length, warnOf(meals), meals.map((x) => `
    <div class="card stock-group stock-meal ${x.expired ? 'expired' : x.expiring ? 'expiring' : ''}">
      <div class="stock-head">
        <div><strong>${esc(x.title)}</strong> <span class="muted small">${PLACE[x.location] || ''}${x.source === 'restjes' ? ' · restjes' : ''}</span>
          <div class="stock-total">${portions(x.portions_left)}</div></div>
        <div class="row"><button class="btn small" data-meal-plan="${x.id}" aria-label="Inplannen" title="Inplannen">📅</button>
          <button class="btn small" data-meal-eat="${x.id}" aria-label="1 portie opgegeten" title="1 portie opgegeten">−</button></div>
      </div>
      <div class="stock-items"><button type="button" class="stock-item" data-meal="${x.id}">${mealTht(x) || '<span class="muted small">geen THT</span>'}</button></div>
    </div>`).join(''), open.has(MEALS_CAT));
}

export async function render(root) {
  root.innerHTML = `<div class="view stock">
    <div class="page-head"><h1>Voorraad</h1>
      <div class="row wrap">
        <button class="btn btn-primary" data-in>📷 Scan in</button>
        <button class="btn" data-out>📤 Scan uit</button>
        <button class="btn" data-add>＋ Toevoegen</button>
        <button class="btn" data-add-meal>🍲 Maaltijd</button>
        <button class="btn btn-ghost" data-toggle-all hidden>Alles uitklappen</button>
      </div></div>
    <div data-body><p class="muted">Laden…</p></div>
  </div>`;
  const body = $('[data-body]', root);
  const after = (r) => r && load();
  $('[data-in]', root).addEventListener('click', () => scanIn().then(after).catch((e) => toast(e.message, 'error')));
  $('[data-out]', root).addEventListener('click', () => scanOut().then(after).catch((e) => toast(e.message, 'error')));
  $('[data-add]', root).addEventListener('click', () => addDialog().then(after));
  $('[data-add-meal]', root).addEventListener('click', () => addMealDialog().then(after));

  async function load() {
    const data = await api.get('/stock');
    const meals = data.meals || [];
    if (!data.ingredients.length && !meals.length) {
      body.innerHTML = `<div class="card empty"><p><strong>Nog niets in de voorraad.</strong></p>
        <p class="muted">Vink boodschappen af, scan een barcode of voeg iets toe. Koken haalt het er weer af.
        Kook je extra voor restjes, dan komen die porties hier vanzelf bij de maaltijden.</p></div>`;
      return;
    }
    const mealAttention = data.meal_attention || [];
    const attention = data.attention.length || mealAttention.length ? `<div class="card stock-attention"><h2>Bijna over datum</h2>
      ${mealAttention.map((x) => `<div>🍲 ${esc(x.title)} · ${portions(x.portions_left)} ${mealTht(x)}</div>`).join('')}
      ${data.attention.map((i) => `<div>${esc(i.name)} · ${amount(i.grams_left, wFor(i, i.grams_initial))} ${thtText(i)}</div>`).join('')}</div>` : '';
    const open = openCats();
    const cats = new Map();
    for (const g of data.ingredients) {
      const c = g.category || 'Overig';
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c).push(g);
    }
    const ingCats = [...cats.entries()].sort(([a], [b]) => catRank(a) - catRank(b) || a.localeCompare(b, 'nl'));
    const groupHtml = (g) => `
      <div class="card stock-group ${g.expired ? 'expired' : g.expiring ? 'expiring' : ''}">
        <div class="stock-head">
          <div><strong>${esc(g.name)}</strong><div class="stock-total">${amount(g.grams, wFor(g, g.items[0]?.grams_initial))} in huis</div></div>
          <div class="row"><button class="btn small" data-plus="${g.ingredient_id}" aria-label="Pak toevoegen">＋</button>
            <button class="btn small" data-minus="${g.ingredient_id}" aria-label="Afboeken">−</button></div>
        </div>
        <div class="stock-items">${g.items.map((i) => `<button type="button" class="stock-item" data-item="${i.id}">
          <span>${wFor(i, i.grams_initial)
    ? `${num(pieces(i.grams_left, i.unit_weight_g), 1)}${i.grams_left < i.grams_initial ? ` / ${num(pieces(i.grams_initial, i.unit_weight_g), 1)}` : ''} ${pieces(i.grams_initial, i.unit_weight_g) === 1 ? 'stuk' : 'stuks'}`
    : `${num(i.grams_left, 0)}${i.grams_left < i.grams_initial ? ` / ${num(i.grams_initial, 0)}` : ''} g`}</span>${thtText(i) || '<span class="muted small">geen THT</span>'}</button>`).join('')}</div>
      </div>`;
    body.innerHTML = `${attention}<div class="stock-cats">${mealsHtml(meals, open)}${ingCats.map(([c, list]) => catHtml(c, CAT_EMOJI[c] || '🛒', list.length, warnOf(list), list.map(groupHtml).join(''), open.has(c))).join('')}</div>`;
    const toggleAll = $('[data-toggle-all]', root);
    const allDetails = () => $$('details.stock-cat', body);
    const syncToggle = () => {
      toggleAll.hidden = allDetails().length < 2;
      toggleAll.textContent = allDetails().every((d) => d.open) ? 'Alles inklappen' : 'Alles uitklappen';
    };
    allDetails().forEach((d) => d.addEventListener('toggle', () => {
      const set = openCats();
      if (d.open) set.add(d.dataset.cat); else set.delete(d.dataset.cat);
      saveOpen(set);
      syncToggle();
    }));
    toggleAll.onclick = () => {
      const openAll = !allDetails().every((d) => d.open);
      saveOpen(new Set(openAll ? allDetails().map((d) => d.dataset.cat) : []));
      allDetails().forEach((d) => { d.open = openAll; });
      syncToggle();
    };
    syncToggle();
    const byId = new Map(data.ingredients.map((g) => [g.ingredient_id, g]));
    const items = new Map(data.ingredients.flatMap((g) => g.items).map((i) => [i.id, i]));
    $$('[data-plus]', body).forEach((b) => b.addEventListener('click', () => {
      const g = byId.get(Number(b.dataset.plus));
      addDialog({ ingredient: { id: g.ingredient_id, name: g.name, unit_weight_g: g.unit_weight_g }, grams: g.items[0]?.grams_initial }).then(after);
    }));
    $$('[data-minus]', body).forEach((b) => b.addEventListener('click', () => {
      const g = byId.get(Number(b.dataset.minus));
      consumeDialog({ id: g.ingredient_id, name: g.name, grams: g.grams, unit_weight_g: g.unit_weight_g, pack_grams: g.items[0]?.grams_initial }).then(after);
    }));
    $$('[data-item]', body).forEach((b) => b.addEventListener('click', () => editDialog(items.get(Number(b.dataset.item))).then(after)));
    const mealById = new Map(meals.map((x) => [x.id, x]));
    $$('[data-meal], [data-meal-plan]', body).forEach((b) => b.addEventListener('click', () => mealDialog(mealById.get(Number(b.dataset.meal || b.dataset.mealPlan))).then(after)));
    $$('[data-meal-eat]', body).forEach((b) => b.addEventListener('click', async () => {
      const x = mealById.get(Number(b.dataset.mealEat));
      try { await api.post(`/stock/meals/${x.id}/eat`, { portions: 1 }); toast(`1 portie ${x.title} afgeboekt`, 'success'); load(); } catch (err) { toast(err.message, 'error'); }
    }));
  }
  await load();
}

