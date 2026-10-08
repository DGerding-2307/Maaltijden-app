import { api, liveSync } from '../api.js';
import { $, esc, euro, num, qty, addDays, mondayOf, todayISO, fmtDate, weekNumber, toast } from '../util.js';
import { ingThumb } from '../ingredient-form.js';

const COUNT_UNITS = ['stuk', 'teen', 'blik', 'pak', 'zakje', 'bos', 'plak'];

function amount(item) {
  if (COUNT_UNITS.includes(item.unit) && item.quantity > 0) {
    const label = item.quantity === 1 || item.unit !== 'stuk' ? item.unit : 'stuks';
    return `${qty(item.quantity)} ${esc(label)}${item.grams > 0 ? ` (${num(item.grams, 0)} g)` : ''}`;
  }
  if (item.grams > 0 && item.ingredient_id) {
    const isLiquid = ['ml', 'l', 'el', 'tl'].includes(item.unit);
    const v = isLiquid ? item.grams / (item.density || 1) : item.grams;
    if (v >= 1000) return `${num(v / 1000, 2)} ${isLiquid ? 'l' : 'kg'}`;
    return `${num(v, 0)} ${isLiquid ? 'ml' : 'g'}`;
  }
  return `${qty(item.quantity)} ${esc(item.unit)}`;
}

export async function render(root, params) {
  const start = mondayOf(params.week || todayISO());
  let showPantry = localStorage.getItem('showPantry') === '1';
  let data;

  root.innerHTML = '<div class="view shopping"></div>';
  const view = $('.view', root);

  async function load() {
    data = await api.get(`/shopping?week=${start}`);
    draw();
  }

  function draw() {
    const inHouse = data.items.filter((i) => i.have && (showPantry || !i.pantry));
    const items = data.items.filter((i) => (showPantry || !i.pantry) && !i.have);
    const pantryCount = data.items.filter((i) => i.pantry).length;
    const groups = new Map();
    for (const item of items) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }
    const open = items.filter((i) => !i.checked);
    const openCost = open.reduce((s, i) => s + (i.cost_cents || 0), 0);
    view.innerHTML = `
      <div class="page-head">
        <div class="week-nav">
          <a class="btn icon-btn" href="#/boodschappen?week=${addDays(start, -7)}" aria-label="Vorige week">‹</a>
          <div class="week-title"><h1>Boodschappen week ${weekNumber(start)}</h1>
            <span class="muted">${fmtDate(start)} – ${fmtDate(addDays(start, 6))} · ${data.meals} maaltijden</span></div>
          <a class="btn icon-btn" href="#/boodschappen?week=${addDays(start, 7)}" aria-label="Volgende week">›</a>
        </div>
        <div class="actions">
          <button class="btn" data-copy>📋 Kopieer lijst</button>
          <button class="btn" data-print>🖨️ Afdrukken</button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span class="stat-label">Verwachte kosten</span><span class="stat-value">${euro(data.total_cents)}</span><span class="stat-sub">hele verpakkingen, excl. voorraadkast</span></div>
        <div class="stat"><span class="stat-label">Nog te halen</span><span class="stat-value">${open.length}</span><span class="stat-sub">${euro(openCost)}</span></div>
      </div>
      <div class="row wrap no-print">
        <label class="chip-toggle"><input type="checkbox" data-pantry ${showPantry ? 'checked' : ''}> Toon voorraadkast (${pantryCount}: zout, olie, kruiden…)</label>
        <span class="muted small">Tik 🏠 bij wat je al in huis hebt. Wijzigingen van huisgenoten verschijnen vanzelf.</span>
      </div>

      ${!data.items.length && !data.extras.length ? `<div class="empty"><p>Nog niets op de lijst. Plan eerst maaltijden in.</p><a class="btn btn-primary" href="#/planner?week=${start}">Naar de planner</a></div>` : ''}

      ${[...groups.entries()].map(([cat, list]) => `
        <section class="shop-group">
          <h2>${esc(cat)}</h2>
          <ul class="shop-list">
            ${list.map((i) => `
              <li class="${i.checked ? 'done' : ''} ${i.pantry ? 'pantry' : ''}">
                <label>
                  <input type="checkbox" data-key="${esc(i.key)}" ${i.checked ? 'checked' : ''}>
                  <span class="shop-name">${ingThumb(i, 'sm')}<strong>${esc(i.name)}</strong> <span class="muted">${amount(i)}</span>
                    <small class="muted shop-for" title="${esc(i.recipes.join(', '))}">voor ${esc(i.recipes.slice(0, 2).join(', '))}${i.recipes.length > 2 ? ` +${i.recipes.length - 2}` : ''}</small></span>
                  <span class="shop-pack">${i.packages ? `${i.packages}× ${esc(i.package_label || '')}` : ''}</span>
                  <span class="shop-cost">${i.cost_cents != null ? euro(i.cost_cents) : ''}</span>
                </label>
                <button class="mini no-print have-btn" data-have="${esc(i.key)}" title="Heb ik al in huis – niet kopen">🏠</button>
              </li>`).join('')}
          </ul>
        </section>`).join('')}

      ${inHouse.length ? `<details class="shop-group in-house no-print">
        <summary><h2>🏠 Al in huis (${inHouse.length})</h2></summary>
        <ul class="shop-list">${inHouse.map((i) => `<li>
          <span class="shop-name"><strong>${esc(i.name)}</strong> <span class="muted">${amount(i)}</span></span>
          ${i.ingredient_id ? `<button class="mini" data-always="${i.ingredient_id}" title="Nooit meer op de lijst zetten (voorraadkast)">altijd in huis</button>` : ''}
          <button class="mini" data-unhave="${esc(i.key)}">toch kopen</button></li>`).join('')}</ul>
      </details>` : ''}

      <section class="shop-group">
        <h2>Extra boodschappen</h2>
        <ul class="shop-list">
          ${data.extras.map((x) => `<li class="${x.checked ? 'done' : ''}"><label><input type="checkbox" data-extra="${x.id}" ${x.checked ? 'checked' : ''}><span class="shop-name">${esc(x.name)}</span></label>
            <button class="mini danger no-print" data-del-extra="${x.id}" aria-label="Verwijderen">✕</button></li>`).join('')}
        </ul>
        <form class="row no-print" data-add-extra>
          <input class="input grow" placeholder="Bijv. wc-papier, koffie, fruit…" name="name">
          <button class="btn">Toevoegen</button>
        </form>
      </section>`;
  }

  view.addEventListener('change', async (e) => {
    const t = e.target;
    try {
      if (t.matches('[data-key]')) {
        const item = data.items.find((i) => i.key === t.dataset.key);
        item.checked = t.checked;
        await api.put('/shopping/check', { week: start, key: item.key, checked: t.checked });
        draw();
      } else if (t.matches('[data-extra]')) {
        await api.put(`/shopping/extras/${t.dataset.extra}`, { checked: t.checked });
        await load();
      } else if (t.matches('[data-pantry]')) {
        showPantry = t.checked;
        try { localStorage.setItem('showPantry', showPantry ? '1' : '0'); } catch { /* opslag niet beschikbaar */ }
        draw();
      }
    } catch (err) { toast(err.message, 'error'); }
  });
  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    await api.post('/shopping/extras', { week: start, name });
    load();
  });
  view.addEventListener('click', async (e) => {
    const have = e.target.closest('[data-have], [data-unhave]');
    if (have) {
      const key = have.dataset.have || have.dataset.unhave;
      await api.put('/shopping/have', { week: start, key, have: !!have.dataset.have });
      return load();
    }
    const always = e.target.closest('[data-always]');
    if (always) {
      await api.put(`/ingredients/${always.dataset.always}`, { pantry: true });
      toast('Staat voortaan bij de voorraadkast', 'success');
      return load();
    }
    if (e.target.closest('[data-del-extra]')) {
      await api.del(`/shopping/extras/${e.target.closest('[data-del-extra]').dataset.delExtra}`);
      load();
    }
    if (e.target.closest('[data-print]')) window.print();
    if (e.target.closest('[data-copy]')) {
      const lines = [`Boodschappen week ${weekNumber(start)}`];
      const items = data.items.filter((i) => !i.checked && !i.have && (showPantry || !i.pantry));
      let cat = '';
      for (const i of items) {
        if (i.category !== cat) { cat = i.category; lines.push('', `*${cat}*`); }
        lines.push(`- ${i.name} (${amount(i)}${i.packages ? `, ${i.packages}× ${i.package_label || ''}` : ''})`);
      }
      const extras = data.extras.filter((x) => !x.checked);
      if (extras.length) lines.push('', '*Extra*', ...extras.map((x) => `- ${x.name}`));
      try {
        await navigator.clipboard.writeText(lines.join('\n'));
        toast('Lijst gekopieerd – plak hem in WhatsApp of je notities', 'success');
      } catch {
        toast('Kopiëren lukte niet in deze browser', 'error');
      }
    }
  });

  await load();
  return liveSync(load);
}
