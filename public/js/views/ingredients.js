import { api, meta } from '../api.js';
import { $, esc, euro, num, toast, modal, confirmDialog, debounce, NUTRIENT_LABELS } from '../util.js';

const SOURCE_LABEL = { jumbo: '🟡 Jumbo', handmatig: '✍️ handmatig', schatting: '≈ schatting' };

export async function render(root) {
  const m = await meta();
  let all = await api.get('/ingredients');
  let q = '';
  let cat = '';

  root.innerHTML = `<div class="view ingredients">
    <div class="page-head">
      <h1>Ingrediënten & prijzen</h1>
      <div class="actions">
        <button class="btn" data-new>+ Nieuw ingrediënt</button>
        <button class="btn" data-refresh-all title="Ververs prijzen van ingrediënten die aan een Jumbo-product gekoppeld zijn">🟡 Jumbo-prijzen verversen</button>
      </div>
    </div>
    <p class="muted">Voedingswaarden per 100 g (NEVO-gemiddelden). Prijzen zijn per verpakking; de prijs per maaltijd wordt naar verhouding berekend.
      Koppel een ingrediënt aan een Jumbo-product om actuele prijzen op te halen.</p>
    <div class="filters">
      <input type="search" class="input grow" placeholder="Zoek ingrediënt…" data-q>
      <select class="input" data-cat><option value="">Alle afdelingen</option>${m.categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Ingrediënt</th><th>Afdeling</th><th class="num">kcal</th><th class="num">eiwit</th><th class="num">1 stuk</th><th>Verpakking</th><th class="num">Prijs</th><th class="num">€/kg</th><th>Bron</th><th></th></tr></thead>
      <tbody data-body></tbody>
    </table></div>
  </div>`;
  const view = $('.view', root);

  function draw() {
    const list = all.filter((i) => (!cat || i.category === cat) && (!q || `${i.name} ${i.aliases}`.toLowerCase().includes(q)));
    $('[data-body]', view).innerHTML = list.map((i) => `
      <tr data-id="${i.id}">
        <td><strong>${esc(i.name)}</strong>${i.pantry ? ' <span class="badge">voorraad</span>' : ''}${i.jumbo_name ? `<br><small class="muted">${esc(i.jumbo_name)}</small>` : ''}</td>
        <td class="small">${esc(i.category)}</td>
        <td class="num">${num(i.kcal, 0)}</td>
        <td class="num">${num(i.protein)}</td>
        <td class="num">${i.unit_weight_g ? `${num(i.unit_weight_g)} g` : ''}</td>
        <td class="small">${esc(i.package_label || (i.package_grams ? `${i.package_grams} g` : ''))}</td>
        <td class="num">${euro(i.price_cents)}</td>
        <td class="num">${i.price_cents != null && i.package_grams ? euro((i.price_cents / i.package_grams) * 1000) : ''}</td>
        <td class="small" title="${esc(i.price_updated_at || '')}">${SOURCE_LABEL[i.price_source] || esc(i.price_source || '')}</td>
        <td class="row-actions">
          <button class="mini" data-edit title="Bewerken">✏️</button>
          <button class="mini" data-jumbo title="Koppel aan Jumbo-product">🟡</button>
          ${i.jumbo_id ? '<button class="mini" data-refresh title="Prijs verversen">↻</button>' : ''}
          <button class="mini danger" data-del title="Verwijderen">✕</button>
        </td>
      </tr>`).join('');
  }

  async function reload() {
    all = await api.get('/ingredients');
    draw();
  }

  function editDialog(ing = {}) {
    const fields = Object.entries(NUTRIENT_LABELS).map(([k, [label, unit]]) => `
      <label>${esc(label.trim())} (${unit}) <input class="input" type="number" step="any" min="0" name="${k}" value="${ing[k] ?? ''}"></label>`).join('');
    const md = modal(`
      <h2>${ing.id ? 'Ingrediënt bewerken' : 'Nieuw ingrediënt'}</h2>
      <form class="form" data-form>
        <div class="grid-2">
          <label>Naam <input class="input" name="name" required value="${esc(ing.name || '')}"></label>
          <label>Afdeling <select class="input" name="category">${m.categories.map((c) => `<option ${c === ing.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="span-2">Andere namen (komma's) <input class="input" name="aliases" value="${esc(ing.aliases || '')}" placeholder="worden gebruikt bij het koppelen van recepten"></label>
        </div>
        <h3>Voedingswaarden per 100 g</h3>
        <div class="grid-4">${fields}</div>
        ${m.claude.configured && ing.id ? '<button type="button" class="btn btn-ai" data-estimate>✨ Laat Claude schatten</button>' : ''}
        <h3>Gewicht & prijs</h3>
        <div class="grid-4">
          <label>Gewicht 1 stuk (g) <input class="input" type="number" step="any" min="0" name="unit_weight_g" value="${ing.unit_weight_g ?? ''}"></label>
          <label>Dichtheid (g/ml) <input class="input" type="number" step="any" min="0" name="density" value="${ing.density ?? 1}"></label>
          <label>Verpakking (g) <input class="input" type="number" step="any" min="0" name="package_grams" value="${ing.package_grams ?? ''}"></label>
          <label>Prijs verpakking (€) <input class="input" type="number" step="0.01" min="0" name="price" value="${ing.price_cents != null ? (ing.price_cents / 100).toFixed(2) : ''}"></label>
          <label class="span-2">Verpakkingslabel <input class="input" name="package_label" value="${esc(ing.package_label || '')}" placeholder="bv. 500 g of 6 stuks"></label>
          <label class="span-2 check"><input type="checkbox" name="pantry" ${ing.pantry ? 'checked' : ''}> Voorraadkast-artikel (niet standaard op de boodschappenlijst)</label>
        </div>
        <div class="row end"><button class="btn btn-primary">Opslaan</button></div>
      </form>`, { wide: true });
    const form = $('[data-form]', md.el);
    $('[data-estimate]', md.el)?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Claude schat…';
      try {
        const updated = await api.post(`/ingredients/${ing.id}/estimate`);
        md.close();
        await reload();
        editDialog(updated);
        toast('Voedingswaarden geschat door Claude', 'success');
      } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.pantry = fd.has('pantry');
      const price = data.price;
      delete data.price;
      for (const k of [...Object.keys(NUTRIENT_LABELS), 'unit_weight_g', 'density', 'package_grams']) data[k] = data[k] === '' ? null : Number(data[k]);
      const newPrice = price === '' ? null : Math.round(Number(price) * 100);
      if (newPrice !== (ing.price_cents ?? null) || data.package_grams !== (ing.package_grams ?? null)) {
        data.price_cents = newPrice;
        data.price_source = 'handmatig';
        data.price_updated_at = new Date().toISOString().slice(0, 10);
      }
      try {
        if (ing.id) await api.put(`/ingredients/${ing.id}`, data);
        else await api.post('/ingredients', data);
        md.close();
        reload();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  function jumboDialog(ing) {
    const md = modal(`
      <h2>🟡 ${esc(ing.name)} koppelen aan Jumbo</h2>
      <form class="row" data-search><input class="input grow" name="q" value="${esc(ing.jumbo_query || ing.name)}"><button class="btn">Zoeken</button></form>
      <div class="jumbo-results"><p class="muted">Zoeken…</p></div>`, { wide: true });
    const results = $('.jumbo-results', md.el);
    let products = [];
    const search = async (term) => {
      results.innerHTML = '<p class="muted">Zoeken…</p>';
      try {
        products = await api.get(`/jumbo/search?q=${encodeURIComponent(term)}`);
        results.innerHTML = products.map((p, i) => `
          <button class="jumbo-product" data-pick="${i}">
            ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="thumb-emoji">🛒</span>'}
            <span><strong>${esc(p.title)}</strong><br><span class="muted small">${esc(p.package_label || '')}${p.package_grams ? ` · ${num(p.package_grams, 0)} g` : ' · ⚠ inhoud onbekend'}</span></span>
            <span class="num"><strong>${euro(p.price_cents)}</strong>${p.on_promotion ? '<br><span class="badge">actie</span>' : ''}
              ${p.unit_price ? `<br><span class="muted small">${euro(p.unit_price.cents)}/${esc(p.unit_price.unit)}</span>` : ''}</span>
          </button>`).join('') || '<p class="muted">Geen producten gevonden.</p>';
      } catch (err) {
        results.innerHTML = `<p class="error">${esc(err.message)}</p><p class="muted small">De Jumbo-koppeling gebruikt een onofficiële API die soms niet bereikbaar is. Je kunt de prijs ook handmatig invullen via ✏️.</p>`;
      }
    };
    const form = $('[data-search]', md.el);
    form.addEventListener('submit', (e) => { e.preventDefault(); search(form.q.value); });
    results.addEventListener('click', async (e) => {
      const pick = e.target.closest('[data-pick]');
      if (!pick) return;
      const product = products[Number(pick.dataset.pick)];
      if (!product.package_grams) {
        const g = prompt('Hoeveel gram/ml zit er in deze verpakking?');
        if (!g) return;
        product.package_grams = Number(g);
      }
      await api.post(`/ingredients/${ing.id}/jumbo`, { product, query: form.q.value });
      toast('Gekoppeld aan Jumbo-product', 'success');
      md.close();
      reload();
    });
    search(form.q.value);
  }

  view.addEventListener('input', debounce((e) => {
    if (e.target.matches('[data-q]')) { q = e.target.value.toLowerCase(); draw(); }
    if (e.target.matches('[data-cat]')) { cat = e.target.value; draw(); }
  }, 150));
  view.addEventListener('click', async (e) => {
    const tr = e.target.closest('[data-id]');
    const ing = tr && all.find((i) => i.id === Number(tr.dataset.id));
    try {
      if (e.target.closest('[data-new]')) return editDialog();
      if (e.target.closest('[data-refresh-all]')) {
        const btn = e.target.closest('[data-refresh-all]');
        btn.disabled = true;
        btn.textContent = 'Bezig…';
        const res = await api.post('/jumbo/refresh-all');
        toast(`${res.updated} van ${res.total} prijzen ververst${res.errors.length ? ` (${res.errors.length} fouten)` : ''}`, res.errors.length ? 'error' : 'success');
        btn.disabled = false;
        btn.textContent = '🟡 Jumbo-prijzen verversen';
        return reload();
      }
      if (!ing) return;
      if (e.target.closest('[data-edit]')) return editDialog(ing);
      if (e.target.closest('[data-jumbo]')) return jumboDialog(ing);
      if (e.target.closest('[data-refresh]')) {
        await api.post(`/ingredients/${ing.id}/refresh-price`);
        toast('Prijs ververst', 'success');
        return reload();
      }
      if (e.target.closest('[data-del]')) {
        if (!(await confirmDialog(`“${ing.name}” verwijderen? Recepten die het gebruiken verliezen de koppeling.`))) return;
        await api.del(`/ingredients/${ing.id}`);
        return reload();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  draw();
}
