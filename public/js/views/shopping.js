import { api, liveSync } from '../api.js';
import { $, esc, euro, num, qty, addDays, mondayOf, todayISO, fmtDate, weekNumber, toast, confirmDialog } from '../util.js';
import { say } from '../say.js';

const COUNT_UNITS = ['stuk', 'teen', 'blik', 'pak', 'zakje', 'bos', 'plak'];
const CAT_EMOJI = {
  'Aardappelen, groente & fruit': '🥦', 'Vlees, vis & vega': '🍗', 'Zuivel, eieren & kaas': '🧀', 'Brood, ontbijt & beleg': '🍞',
  'Pasta, rijst & wereldkeuken': '🍚', 'Conserven, soepen & sauzen': '🥫', 'Kruiden, specerijen & bakken': '🧂', 'Olie, azijn & smaakmakers': '🫒',
  Diepvries: '🧊', 'Dranken & overig': '🧃', Overig: '🛒',
};

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
  let cat = ''; // gekozen afdeling

  root.innerHTML = '<div class="view shopping shop-c"></div>';
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
    const doneCount = data.items.filter((i) => i.checked && !i.have).length + data.extras.filter((x) => x.checked).length;
    const shown = cat ? [...groups.entries()].filter(([c]) => c === cat) : [...groups.entries()];
    const total = items.length;
    const line = !data.items.length && !data.extras.length ? { mood: 'rust', text: 'Nog niets op de lijst. Plan eerst wat maaltijden, dan zet ik alles voor je klaar 🐾' }
      : !open.length ? { mood: 'blij', text: 'Alles in je mandje! Goed gedaan 🎉 Vergeet niet ‘in huis zetten’ te tikken.' }
        : open.length < total ? { mood: 'trots', text: `Nog ${open.length} ${open.length === 1 ? 'dingetje' : 'dingetjes'}! Samen zijn we zo klaar 🛒` }
          : { mood: 'hongerig', text: `${open.length} dingen op je lijstje, samen ± ${euro(openCost)}. Zullen we gaan? 🛒` };
    view.innerHTML = `
      ${say(line)}
      <div class="head-row">
        <div class="row">
          <a class="round-btn" href="#/boodschappen?week=${addDays(start, -7)}" aria-label="Vorige week">‹</a>
          <div><h1 class="page-title">Boodschappen</h1>
            <p class="page-sub">Week ${weekNumber(start)} · ${data.meals} maaltijden · ${euro(data.total_cents)}</p></div>
          <a class="round-btn" href="#/boodschappen?week=${addDays(start, 7)}" aria-label="Volgende week">›</a>
        </div>
        <div class="actions no-print">
          <button class="btn" data-copy>📋 Kopieer</button>
          <button class="btn btn-ghost" data-print aria-label="Afdrukken">🖨️</button>
        </div>
      </div>
      <div class="filter-chips no-print">
        <button class="tag ${cat ? '' : 'active'}" data-cat="">Alles · ${total}</button>
        ${[...groups.entries()].map(([c, list]) => `<button class="tag ${c === cat ? 'active' : ''}" data-cat="${esc(c)}" title="${esc(c)}">${CAT_EMOJI[c] || '🛒'} ${list.length}</button>`).join('')}
        <label class="tag ${showPantry ? 'active' : ''}" title="Voorraadkast tonen: zout, olie, kruiden…"><input type="checkbox" data-pantry ${showPantry ? 'checked' : ''} hidden> 🧂 Voorraad (${pantryCount})</label>
      </div>

      ${!data.items.length && !data.extras.length ? `<div class="empty"><a class="btn btn-primary" href="#/planner?week=${start}">Naar de planner</a></div>` : ''}

      ${shown.map(([c, list]) => `
        <section class="shop-group">
          <div class="sec-k">${CAT_EMOJI[c] || '🛒'} ${esc(c)}</div>
          <div class="shop-tiles">
            ${list.map((i) => `
              <label class="shop-tile ${i.checked ? 'done' : ''} ${i.pantry ? 'pantry' : ''}">
                <input type="checkbox" data-key="${esc(i.key)}" ${i.checked ? 'checked' : ''} aria-label="${esc(i.name)} in je mandje">
                <span class="ph">${i.image_url ? `<img src="${esc(i.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : CAT_EMOJI[c] || '🛒'}</span>
                ${i.cost_cents != null ? `<span class="pr">${euro(i.cost_cents)}</span>` : ''}
                <span class="ck" aria-hidden="true">✓</span>
                <span class="nm">${esc(i.name)}</span>
                <span class="am">${amount(i)}${i.packages ? ` · ${i.packages}× ${esc(i.package_label || '')}` : ''}</span>
                <span class="for" title="${esc(i.recipes.join(', '))}">voor ${esc(i.recipes.slice(0, 2).join(', '))}${i.recipes.length > 2 ? ` +${i.recipes.length - 2}` : ''}</span>
                <button type="button" class="mini no-print have-btn" data-have="${esc(i.key)}" title="Heb ik al in huis – niet kopen" aria-label="${esc(i.name)} al in huis">🏠</button>
              </label>`).join('')}
          </div>
        </section>`).join('')}

      ${doneCount ? `<div class="done-bar no-print">
        <span>✔ ${doneCount} afgevinkt</span>
        <button class="btn btn-primary" data-done-to-have>🏠 Afgevinkte in huis zetten</button>
      </div>` : ''}

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
    const chip = e.target.closest('[data-cat]');
    if (chip) { cat = chip.dataset.cat; return draw(); }
    if (e.target.closest('[data-done-to-have]')) {
      const items = data.items.filter((i) => i.checked && !i.have).length;
      const extras = data.extras.filter((x) => x.checked).length;
      const parts = [items ? `${items} afgevinkte ${items === 1 ? 'artikel' : 'artikelen'} naar ‘Al in huis’ zetten` : '',
        extras ? `${extras} afgevinkte extra ${extras === 1 ? 'boodschap' : 'boodschappen'} van de lijst halen` : ''].filter(Boolean);
      if (!(await confirmDialog(`${parts.join(' en ')}?`, 'In huis zetten'))) return;
      const r = await api.post('/shopping/checked-to-have', { week: start });
      toast(`${r.moved ? `${r.moved} naar ‘Al in huis’` : ''}${r.moved && r.extras_removed ? ', ' : ''}${r.extras_removed ? `${r.extras_removed} extra van de lijst` : ''}. Per artikel terug met ‘toch kopen’.`, 'success');
      return load();
    }
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
