import { api, meta } from '../api.js';
import { $, $$, esc, euro, num, minutes, debounce, toast, confirmDialog } from '../util.js';
import { say } from '../say.js';

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

  const active = () => state.q || state.tag || state.category || state.favorite || state.maxMinutes || state.maxPrice || state.have;
  root.innerHTML = `<div class="view recipes-c">
    <div data-say></div>
    <div class="head-row">
      <h1 class="page-title">Recepten</h1>
      <div class="actions">
        <a class="btn btn-ai" href="#/importeren">✨ Toevoegen</a>
        <a class="btn" href="#/recept/nieuw">+ Zelf</a>
        <button class="btn btn-ghost" data-select-mode title="Meerdere recepten selecteren">☑️</button>
      </div>
    </div>
    <div class="select-bar" data-select-bar hidden>
      <strong data-select-count>0 geselecteerd</strong>
      <button class="btn btn-ghost" data-select-all>Alles selecteren</button>
      <button class="btn btn-danger" data-delete-selected disabled>🗑️ Verwijderen</button>
      <button class="btn" data-select-done>Klaar</button>
    </div>
    <div class="search-row">
      <input type="search" class="input grow" placeholder="🔎 Zoek recept, tag of ingrediënt…" value="${esc(state.q)}" data-f="q" aria-label="Zoeken">
    </div>
    <div class="filter-chips">
      <label class="tag ${state.favorite ? 'active' : ''}" data-fav-chip><input type="checkbox" data-f="favorite" ${state.favorite ? 'checked' : ''} hidden> ♥ Favorieten</label>
      <button class="tag ${String(state.maxMinutes) === '30' ? 'active' : ''}" data-quick="fast">⚡ Snel</button>
      <button class="tag ${state.tag === 'vegetarisch' ? 'active' : ''}" data-quick="veg">🌱 Vega</button>
      <button class="tag ${String(state.maxPrice) === '250' ? 'active' : ''}" data-quick="cheap">💶 Goedkoop</button>
      ${m.tags.filter((t) => t.tag !== 'vegetarisch').slice(0, 12).map((t) => `<button class="tag ${t.tag === state.tag ? 'active' : ''}" data-tag="${esc(t.tag)}">${esc(t.tag)}</button>`).join('')}
    </div>
    <details class="more-filters" ${state.category || state.have || (state.maxMinutes && String(state.maxMinutes) !== '30') || state.sort !== 'title' ? 'open' : ''}>
      <summary>Meer filters ▾</summary>
      <div class="filters">
        <select class="input" data-f="category" aria-label="Categorie">
          <option value="">Alle categorieën</option>
          ${['Ontbijt', 'Lunch', 'Hoofdgerecht', 'Soep', 'Bijgerecht', 'Salade', 'Nagerecht', 'Snack', 'Bakken'].map((c) => `<option ${c === state.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <select class="input" data-f="maxMinutes" aria-label="Bereidingstijd">
          <option value="">Elke bereidingstijd</option>
          ${[20, 30, 45, 60].map((t) => `<option value="${t}" ${String(t) === String(state.maxMinutes) ? 'selected' : ''}>Max. ${t} min</option>`).join('')}
        </select>
        <select class="input" data-f="sort" aria-label="Sorteren">
          ${[['title', 'A–Z'], ['newest', 'Nieuwste'], ['price', 'Goedkoopste'], ['kcal', 'Minste kcal'], ['time', 'Snelste'], ['rating', 'Hoogste waardering']]
            .map(([v, l]) => `<option value="${v}" ${v === state.sort ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <form class="pantry-search" data-have-form>
        <label for="have-input">🧺 Wat kan ik maken met wat ik in huis heb?</label>
        <div class="row">
          <input id="have-input" class="input grow" name="have" value="${esc(state.have)}" placeholder="bv. kip, prei, rijst, paprika (komma's)">
          <button class="btn">Zoek</button>
          ${state.have ? '<button type="button" class="btn btn-ghost" data-clear-have>Wissen</button>' : ''}
        </div>
      </form>
    </details>
    <div data-for-you></div>
    <div class="sec-k" data-all-label>Alles</div>
    <div class="recipe-grid"></div>
  </div>`;
  const view = $('.view', root);
  // Selecteermodus: meerdere recepten tegelijk verwijderen
  let selecting = false;
  const selected = new Set();
  const updateSelectBar = () => {
    $('[data-select-count]', view).textContent = `${selected.size} geselecteerd`;
    $('[data-delete-selected]', view).disabled = !selected.size;
    $$('.recipe-card', view).forEach((c) => {
      const on = selected.has(Number(c.dataset.id));
      c.classList.toggle('selected', on);
      const box = $('[data-pick]', c);
      if (box) box.checked = on;
    });
  };
  const setSelecting = (on) => {
    selecting = on;
    selected.clear();
    view.classList.toggle('selecting', on);
    $('[data-select-bar]', view).hidden = !on;
    $('[data-select-mode]', view).hidden = on;
    updateSelectBar();
  };

  async function load() {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v) qs.set(k, v === true ? '1' : v);
    history.replaceState(null, '', `#/recepten${qs.toString() ? `?${qs}` : ''}`);
    const list = await api.get(`/recipes?${qs}`);
    drawForYou(list);
    $('.recipe-grid', view).innerHTML = list.map((r) => `
      <article class="recipe-card" data-id="${r.id}">
        <label class="pick" aria-label="${esc(r.title)} selecteren"><input type="checkbox" data-pick></label>
        <a href="#/recept/${r.id}" class="recipe-thumb">${recipeThumb(r)}</a>
        <button class="fav ${r.favorite ? 'on' : ''}" data-fav="${r.id}" aria-label="Favoriet">${r.favorite ? '★' : '☆'}</button>
        <div class="recipe-body">
          <a href="#/recept/${r.id}" class="recipe-title">${esc(r.title)}</a>
          <div class="recipe-meta">
            ${r.total_minutes ? `<span>⏱ ${minutes(r.total_minutes)}</span>` : ''}
            <span>🔥 ${num(r.kcal_per_serving, 0)} kcal</span>
            <span title="geschatte prijs per persoon">💶 ${euro(r.cost_per_serving_cents)}</span>
          </div>
          ${r.pantry_match ? `<div class="pantry-match ${r.pantry_match.missing.length ? '' : 'all'}">
            <strong>${r.pantry_match.matched}/${r.pantry_match.total} in huis</strong>
            ${r.pantry_match.missing.length ? `<span class="muted small">mist: ${esc(r.pantry_match.missing.slice(0, 4).join(', '))}${r.pantry_match.missing.length > 4 ? '…' : ''}</span>` : '<span class="small">alles in huis!</span>'}
          </div>` : ''}
          <div class="recipe-tags">${r.tags.slice(0, 3).map((t) => `<span class="tag small">${esc(t)}</span>`).join('')}</div>
        </div>
      </article>`).join('') || `<div class="empty"><p>Geen recepten gevonden.</p><a class="btn btn-ai" href="#/importeren">✨ Voeg een recept toe met Claude</a></div>`;
    if (selecting) updateSelectBar();
  }

  // Bovenaan: het maatje en (zonder filters) een paar recepten om te proberen
  function drawForYou(list) {
    const favs = list.filter((r) => r.favorite && r.image_url);
    const day = Number(new Date().toISOString().slice(8, 10));
    const pool = (favs.length >= 3 ? favs : list.filter((r) => r.image_url));
    const pick = pool.length ? Array.from({ length: Math.min(5, pool.length) }, (_, i) => pool[(day * 7 + i * 11) % pool.length])
      .filter((r, i, arr) => arr.indexOf(r) === i) : [];
    const f = active();
    $('[data-say]', view).innerHTML = say(f
      ? { mood: list.length ? 'blij' : 'bezorgd', text: list.length ? `Ik vond ${list.length} ${list.length === 1 ? 'recept' : 'recepten'} voor je! 🐾` : 'Hmm, daar vind ik niets bij. Probeer iets anders, of laat Claude een recept bedenken ✨' }
      : { mood: 'hongerig', text: 'Wat eten we vandaag? Ik heb al een paar ideetjes!' });
    $('[data-for-you]', view).innerHTML = !f && pick.length ? `<div class="sec-k">✨ ${favs.length >= 3 ? 'Jouw favorieten' : 'Voor jou'}</div>
      <div class="for-you">${pick.map((r) => `<a href="#/recept/${r.id}"><img src="${esc(r.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span class="tile-ov"><b>${esc(r.title)}</b><small>${r.total_minutes ? `${minutes(r.total_minutes)} · ` : ''}${num(r.kcal_per_serving, 0)} kcal</small></span></a>`).join('')}</div>` : '';
    $('[data-all-label]', view).textContent = f ? `${list.length} gevonden` : 'Alles';
  }

  view.addEventListener('change', (e) => {
    // Favorieten-chip: het verborgen vinkje zit in het label
    if (e.target.matches('[data-f="favorite"]')) e.target.closest('[data-fav-chip]').classList.toggle('active', e.target.checked);
  });
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
    if (e.target.closest('[data-select-mode]')) return setSelecting(true);
    if (e.target.closest('[data-select-done]')) return setSelecting(false);
    if (e.target.closest('[data-select-all]')) {
      const cards = $$('.recipe-card', view).map((c) => Number(c.dataset.id));
      const all = cards.every((id) => selected.has(id));
      cards.forEach((id) => (all ? selected.delete(id) : selected.add(id)));
      return updateSelectBar();
    }
    if (e.target.closest('[data-delete-selected]')) {
      const n = selected.size;
      if (!n || !(await confirmDialog(`${n} recept${n === 1 ? '' : 'en'} verwijderen? ${n === 1 ? 'Het verdwijnt' : 'Ze verdwijnen'} ook uit de planning.`))) return;
      try {
        const { deleted } = await api.post('/recipes/delete', { ids: [...selected] });
        toast(`${deleted} recept${deleted === 1 ? '' : 'en'} verwijderd`, 'success');
        setSelecting(false);
        await meta(true);
        return load();
      } catch (err) { return toast(err.message, 'error'); }
    }
    // In de selecteermodus selecteert een klik op een kaart in plaats van hem te openen
    const card = selecting && e.target.closest('.recipe-card');
    if (card) {
      e.preventDefault();
      const id = Number(card.dataset.id);
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      return updateSelectBar();
    }
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
