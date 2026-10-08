import { api, meta } from '../api.js';
import { $, esc, euro, num, minutes, debounce, toast } from '../util.js';

const CATEGORY_EMOJI = {
  Ontbijt: '🥣', Lunch: '🥪', Hoofdgerecht: '🍽️', Soep: '🍲', Bijgerecht: '🥗', Salade: '🥗', Nagerecht: '🍮', Snack: '🥨', Bakken: '🥧',
};

export function recipeThumb(r) {
  return r.image_url
    ? `<img src="${esc(r.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="thumb-emoji">${CATEGORY_EMOJI[r.category] || '🍽️'}</span>`;
}

export async function render(root, params) {
  const m = await meta(true);
  const state = {
    q: params.q || '', tag: params.tag || '', category: params.category || '', favorite: params.favorite === '1',
    maxMinutes: params.maxMinutes || '', sort: params.sort || 'title', maxPrice: params.maxPrice || '', have: params.have || '',
  };

  root.innerHTML = `<div class="view">
    <div class="page-head">
      <h1>Receptenboek</h1>
      <div class="actions">
        <a class="btn btn-ai" href="#/importeren">✨ Recept toevoegen</a>
        <a class="btn" href="#/recept/nieuw">+ Zelf invoeren</a>
      </div>
    </div>
    <div class="filters">
      <input type="search" class="input grow" placeholder="Zoek op naam, tag of ingrediënt (bv. ‘kip’, ‘stamppot’)…" value="${esc(state.q)}" data-f="q">
      <select class="input" data-f="category">
        <option value="">Alle categorieën</option>
        ${['Ontbijt', 'Lunch', 'Hoofdgerecht', 'Soep', 'Bijgerecht', 'Salade', 'Nagerecht', 'Snack', 'Bakken'].map((c) => `<option ${c === state.category ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <select class="input" data-f="maxMinutes">
        <option value="">Elke bereidingstijd</option>
        ${[20, 30, 45, 60].map((t) => `<option value="${t}" ${String(t) === String(state.maxMinutes) ? 'selected' : ''}>Max. ${t} min</option>`).join('')}
      </select>
      <select class="input" data-f="sort">
        ${[['title', 'A–Z'], ['newest', 'Nieuwste'], ['price', 'Goedkoopste'], ['kcal', 'Minste kcal'], ['time', 'Snelste'], ['rating', 'Hoogste waardering']]
          .map(([v, l]) => `<option value="${v}" ${v === state.sort ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <label class="chip-toggle"><input type="checkbox" data-f="favorite" ${state.favorite ? 'checked' : ''}> ★ Favorieten</label>
    </div>
    <div class="quick-filters">
      <button class="tag ${state.tag === 'vegetarisch' ? 'active' : ''}" data-quick="veg">🌱 Vegetarisch</button>
      <button class="tag ${String(state.maxMinutes) === '30' ? 'active' : ''}" data-quick="fast">⚡ Snel (≤ 30 min)</button>
      <button class="tag ${String(state.maxPrice) === '250' ? 'active' : ''}" data-quick="cheap">💶 Goedkoop (≤ € 2,50 p.p.)</button>
    </div>
    <form class="pantry-search" data-have-form>
      <label for="have-input">🧺 Wat kan ik maken met wat ik in huis heb?</label>
      <div class="row">
        <input id="have-input" class="input grow" name="have" value="${esc(state.have)}" placeholder="bv. kip, prei, rijst, paprika (komma's)">
        <button class="btn">Zoek</button>
        ${state.have ? '<button type="button" class="btn btn-ghost" data-clear-have>Wissen</button>' : ''}
      </div>
    </form>
    <div class="tags">
      ${m.tags.slice(0, 18).map((t) => `<button class="tag ${t.tag === state.tag ? 'active' : ''}" data-tag="${esc(t.tag)}">${esc(t.tag)} <span>${t.count}</span></button>`).join('')}
    </div>
    <div class="recipe-grid"></div>
  </div>`;
  const view = $('.view', root);

  async function load() {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v) qs.set(k, v === true ? '1' : v);
    history.replaceState(null, '', `#/recepten${qs.toString() ? `?${qs}` : ''}`);
    const list = await api.get(`/recipes?${qs}`);
    $('.recipe-grid', view).innerHTML = list.map((r) => `
      <article class="recipe-card">
        <a href="#/recept/${r.id}" class="recipe-thumb">${recipeThumb(r)}</a>
        <button class="fav ${r.favorite ? 'on' : ''}" data-fav="${r.id}" aria-label="Favoriet">${r.favorite ? '★' : '☆'}</button>
        <div class="recipe-body">
          <a href="#/recept/${r.id}" class="recipe-title">${esc(r.title)}</a>
          <div class="recipe-meta">
            ${r.total_minutes ? `<span>⏱ ${minutes(r.total_minutes)}</span>` : ''}
            <span>🔥 ${num(r.kcal_per_serving, 0)} kcal</span>
            <span title="per persoon bij Jumbo">💶 ${euro(r.cost_per_serving_cents)}</span>
          </div>
          ${r.pantry_match ? `<div class="pantry-match ${r.pantry_match.missing.length ? '' : 'all'}">
            <strong>${r.pantry_match.matched}/${r.pantry_match.total} in huis</strong>
            ${r.pantry_match.missing.length ? `<span class="muted small">mist: ${esc(r.pantry_match.missing.slice(0, 4).join(', '))}${r.pantry_match.missing.length > 4 ? '…' : ''}</span>` : '<span class="small">alles in huis!</span>'}
          </div>` : ''}
          <div class="recipe-tags">${r.tags.slice(0, 3).map((t) => `<span class="tag small">${esc(t)}</span>`).join('')}</div>
        </div>
      </article>`).join('') || `<div class="empty"><p>Geen recepten gevonden.</p><a class="btn btn-ai" href="#/importeren">✨ Voeg een recept toe met Claude</a></div>`;
  }

  view.addEventListener('input', debounce((e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    state[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    load();
  }, 200));
  view.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-have-form]')) return;
    e.preventDefault();
    state.have = e.target.have.value.trim();
    load();
  });
  view.addEventListener('click', async (e) => {
    const quick = e.target.closest('[data-quick]');
    if (quick) {
      const k = quick.dataset.quick;
      if (k === 'veg') state.tag = state.tag === 'vegetarisch' ? '' : 'vegetarisch';
      if (k === 'fast') state.maxMinutes = String(state.maxMinutes) === '30' ? '' : '30';
      if (k === 'cheap') state.maxPrice = String(state.maxPrice) === '250' ? '' : '250';
      quick.classList.toggle('active');
      view.querySelector('[data-f="maxMinutes"]').value = state.maxMinutes;
      return load();
    }
    if (e.target.closest('[data-clear-have]')) {
      state.have = '';
      view.querySelector('#have-input').value = '';
      e.target.closest('[data-clear-have]').remove();
      return load();
    }
    const tag = e.target.closest('[data-tag]');
    if (tag) {
      state.tag = state.tag === tag.dataset.tag ? '' : tag.dataset.tag;
      view.querySelectorAll('[data-tag]').forEach((t) => t.classList.toggle('active', t.dataset.tag === state.tag));
      return load();
    }
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      const on = !fav.classList.contains('on');
      try {
        await api.patch(`/recipes/${fav.dataset.fav}`, { favorite: on });
        fav.classList.toggle('on', on);
        fav.textContent = on ? '★' : '☆';
      } catch (err) { toast(err.message, 'error'); }
    }
  });
  await load();
}
