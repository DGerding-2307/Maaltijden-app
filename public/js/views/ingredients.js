import { api, meta } from '../api.js';
import { scanBarcode } from '../scanner.js';
import { $, esc, euro, num, toast, modal, confirmDialog, debounce, NUTRIENT_LABELS } from '../util.js';

const SOURCE_LABEL = { jumbo: '📦 eerder opgehaald', handmatig: '✍️ handmatig', schatting: '≈ schatting' };

export function nutritionBadge(i) {
  const src = String(i.nutrition_source || '');
  if (src.startsWith('Open Food Facts')) return `<span class="src src-off" title="${esc(src)}">🥫 OFF</span>`;
  if (src.startsWith('Claude')) return `<span class="src src-ai" title="${esc(src)}">✨ schatting</span>`;
  if (src.startsWith('NEVO')) return `<span class="src" title="${esc(src)}">NEVO</span>`;
  return `<span class="src" title="${esc(src)}">${esc(src || '–')}</span>`;
}

export function nutriscore(grade) {
  return grade ? `<span class="nutriscore ns-${esc(grade)}" title="Nutri-Score ${esc(grade.toUpperCase())}">${esc(grade.toUpperCase())}</span>` : '';
}

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
        <button class="btn" data-off-all title="Vul voedingswaarden aan met Open Food Facts (op de achtergrond)">🥫 Voedingswaarden via Open Food Facts</button>
      </div>
    </div>
    <div data-off-status></div>
    <p class="muted">Voedingswaarden per 100 g komen uit <a href="https://nl.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>
      (open database, ODbL) – per ingrediënt de mediaan van vergelijkbare Nederlandse producten, of één product dat je zelf kiest of scant.
      Waar nog geen OFF-gegevens zijn, staan NEVO-gemiddelden of een schatting van Claude.
      Prijzen zijn geschatte supermarktprijzen per verpakking; pas ze aan via ✏️ als je de actuele prijs weet.</p>
    <div class="filters">
      <input type="search" class="input grow" placeholder="Zoek ingrediënt…" data-q>
      <select class="input" data-cat><option value="">Alle afdelingen</option>${m.categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
    </div>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>Ingrediënt</th><th>Afdeling</th><th class="num">kcal</th><th class="num">eiwit</th><th>Voeding</th><th class="num">1 stuk</th><th>Verpakking</th><th class="num">Prijs</th><th class="num">€/kg</th><th>Prijsbron</th><th></th></tr></thead>
      <tbody data-body></tbody>
    </table></div>
  </div>`;
  const view = $('.view', root);

  function draw() {
    const list = all.filter((i) => (!cat || i.category === cat) && (!q || `${i.name} ${i.aliases}`.toLowerCase().includes(q)));
    $('[data-body]', view).innerHTML = list.map((i) => `
      <tr data-id="${i.id}">
        <td><strong>${esc(i.name)}</strong>${i.pantry ? ' <span class="badge">voorraad</span>' : ''}</td>
        <td class="small">${esc(i.category)}</td>
        <td class="num">${num(i.kcal, 0)}</td>
        <td class="num">${num(i.protein)}</td>
        <td class="small">${nutritionBadge(i)} ${nutriscore(i.nutriscore)}</td>
        <td class="num">${i.unit_weight_g ? `${num(i.unit_weight_g)} g` : ''}</td>
        <td class="small">${esc(i.package_label || (i.package_grams ? `${i.package_grams} g` : ''))}</td>
        <td class="num">${euro(i.price_cents)}</td>
        <td class="num">${i.price_cents != null && i.package_grams ? euro((i.price_cents / i.package_grams) * 1000) : ''}</td>
        <td class="small" title="${esc(i.price_updated_at || '')}">${SOURCE_LABEL[i.price_source] || esc(i.price_source || '')}</td>
        <td class="row-actions">
          <button class="mini" data-edit title="Bewerken">✏️</button>
          <button class="mini" data-off title="Voedingswaarden uit Open Food Facts">🥫</button>
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
        <p class="muted small">Bron: ${esc(ing.nutrition_source || '–')}</p>
        <div class="row wrap">
          ${ing.id ? '<button type="button" class="btn" data-off-dialog>🥫 Zoek in Open Food Facts</button>' : ''}
          ${m.claude.configured && ing.id ? '<button type="button" class="btn btn-ai" data-estimate>✨ Laat Claude schatten</button>' : ''}
        </div>
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
    $('[data-off-dialog]', md.el)?.addEventListener('click', () => { md.close(); offDialog(ing); });
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

  function offDialog(ing) {
    const md = modal(`
      <h2>🥫 Voedingswaarden voor ${esc(ing.name)}</h2>
      <p class="muted small">Zoek in <a href="https://nl.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a>. Kies één product,
        of de mediaan van alle gevonden producten (aanbevolen voor algemene ingrediënten zoals groente).</p>
      <form class="row wrap" data-search>
        <input class="input grow" name="q" value="${esc(ing.name)}" aria-label="Zoekterm">
        <button class="btn">Zoeken</button>
      </form>
      <form class="row wrap" data-barcode>
        <input class="input grow" name="code" inputmode="numeric" placeholder="of barcode (EAN), bv. 8710400…" aria-label="Barcode">
        <button class="btn" type="submit">Opzoeken</button>
        <button class="btn" type="button" data-scan>📷 Scan</button>
      </form>
      <div class="off-results"><p class="muted">Zoeken… (Open Food Facts staat max. 10 zoekopdrachten per minuut toe)</p></div>`, { wide: true });
    const results = $('.off-results', md.el);
    let data = null;
    const row = (p, i) => `
      <button class="off-product" data-pick="${i}" ${p.nutrition ? '' : 'disabled'}>
        ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="thumb-emoji">🥫</span>'}
        <span><strong>${esc(p.name)}</strong> ${nutriscore(p.nutriscore)}<br><span class="muted small">${esc(p.brands)} ${esc(p.quantity)}</span></span>
        <span class="num small">${p.nutrition ? `${num(p.nutrition.kcal, 0)} kcal · ${num(p.nutrition.protein)} g eiwit<br>${num(p.nutrition.carbs)} g kh · ${num(p.nutrition.fat)} g vet` : 'geen voedingswaarden'}</span>
      </button>`;
    const show = () => {
      results.innerHTML = `
        ${data.median ? `<div class="off-median">
          <div><strong>Mediaan van ${data.median.count} producten</strong><br>
            <span class="muted small">${num(data.median.nutrition.kcal, 0)} kcal · ${num(data.median.nutrition.protein)} g eiwit · ${num(data.median.nutrition.carbs)} g kh · ${num(data.median.nutrition.fat)} g vet · ${num(data.median.nutrition.salt)} g zout per 100 g</span></div>
          <button class="btn btn-primary" data-median>Gebruik mediaan</button></div>` : ''}
        ${data.products.map(row).join('') || '<p class="muted">Niets gevonden. Probeer een andere zoekterm.</p>'}
        <p class="muted small">Gegevens: © Open Food Facts-bijdragers, ODbL.</p>`;
    };
    const fail = (err) => {
      results.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    };
    const search = async (q) => {
      results.innerHTML = '<p class="muted">Zoeken…</p>';
      try { data = await api.get(`/off/search?q=${encodeURIComponent(q)}`); show(); } catch (err) { fail(err); }
    };
    const lookup = async (code) => {
      results.innerHTML = '<p class="muted">Opzoeken…</p>';
      try {
        const p = await api.get(`/off/product/${encodeURIComponent(code)}`);
        data = { products: [p], median: null };
        show();
      } catch (err) { fail(err); }
    };
    const save = async (body) => {
      await api.post(`/ingredients/${ing.id}/off`, body);
      toast('Voedingswaarden bijgewerkt uit Open Food Facts', 'success');
      md.close();
      reload();
    };
    $('[data-search]', md.el).addEventListener('submit', (e) => { e.preventDefault(); search(e.target.q.value); });
    $('[data-barcode]', md.el).addEventListener('submit', (e) => { e.preventDefault(); lookup(e.target.code.value); });
    $('[data-scan]', md.el).addEventListener('click', async () => {
      const code = await scanBarcode({ title: `Product scannen voor ${ing.name}` });
      if (!code) return;
      $('[data-barcode]', md.el).code.value = code;
      lookup(code);
    });
    results.addEventListener('click', (e) => {
      if (e.target.closest('[data-median]')) return save({ median: data.median, query: data.query });
      const pick = e.target.closest('[data-pick]');
      if (pick) save({ product: data.products[Number(pick.dataset.pick)] });
    });
    search(ing.name);
  }

  let pollTimer = null;
  async function showQueue() {
    const box = $('[data-off-status]', view);
    if (!box) return;
    const st = await api.get('/off/queue').catch(() => null);
    if (!st || (!st.running && !st.done)) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="notice off-status">
      <strong>🥫 Open Food Facts:</strong> ${st.running ? `bezig… ${st.done} klaar, nog ${st.pending} te gaan (±${Math.ceil(st.pending * 6.5 / 60)} min)` : `klaar – ${st.updated.length} bijgewerkt, ${st.skipped.length} overgeslagen`}
      ${st.errors.length ? `<br><span class="error">${esc(st.errors.at(-1))}</span>` : ''}
      ${st.skipped.length ? `<details><summary>Overgeslagen (${st.skipped.length})</summary><ul>${st.skipped.map((x) => `<li>${esc(x.name)}: ${esc(x.reason)}
        ${x.suggestion ? ` <button class="mini" data-accept="${x.id}">toch gebruiken (${num(x.suggestion.kcal, 0)} kcal)</button>` : ''}</li>`).join('')}</ul></details>` : ''}
    </div>`;
    box.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', async () => {
      const x = st.skipped.find((s) => String(s.id) === b.dataset.accept);
      await api.put(`/ingredients/${x.id}`, x.suggestion);
      b.replaceWith('✔');
      reload();
    }));
    clearTimeout(pollTimer);
    if (st.running) pollTimer = setTimeout(async () => { await reload(); showQueue(); }, 4000);
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
      if (e.target.closest('[data-off-all]')) {
        await api.post('/off/queue', { scope: 'estimates' });
        toast('Open Food Facts wordt op de achtergrond doorzocht', 'success');
        return showQueue();
      }
      if (!ing) return;
      if (e.target.closest('[data-edit]')) return editDialog(ing);
      if (e.target.closest('[data-off]')) return offDialog(ing);
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
  showQueue();
  return () => clearTimeout(pollTimer);
}
