// Recept toevoegen/bewerken. Wordt ook gebruikt om een door Claude gemaakt concept na te kijken.
import { api, meta } from '../api.js';
import { scanBarcode } from '../scanner.js';
import { linkIngredientDialog } from '../link-ingredient.js';
import { $, $$, esc, toast, readImageFile, modal, num } from '../util.js';

export const DRAFT_KEY = 'recipeDraft';

// Duidelijkere namen in de keuzelijst; de opgeslagen eenheid blijft kort (stuk, el, tl)
const UNIT_LABELS = { '': '–', stuk: 'stuks', el: 'el (eetlepel)', tl: 'tl (theelepel)', teen: 'teen (knoflook)' };
// Regels tegen restjes (zie effectiveAmount in server/calc.js)
const RULES = [['', 'Standaard'], ['none', 'Gewoon meeschalen'], ['round', 'Afronden op hele stuks'], ['package', 'Hele verpakking gebruiken']];
const RULE_LABEL = { none: 'meeschalen', round: 'hele stuks', package: 'hele verpakking' };

export async function render(root, params) {
  const m = await meta();
  const ingredients = await api.get('/ingredients');
  let recipe;
  let isDraft = false;
  if (params.id) {
    recipe = await api.get(`/recipes/${params.id}`);
  } else {
    const draft = sessionStorage.getItem(DRAFT_KEY);
    if (draft && params.concept === '1') {
      recipe = JSON.parse(draft);
      isDraft = true;
    } else {
      recipe = { title: '', description: '', servings: m.default_servings, category: 'Hoofdgerecht', cuisine: 'Nederlands', tags: [], steps: [], ingredients: [] };
    }
  }
  const rows = (recipe.ingredients || []).map((r) => ({
    name: r.name, quantity: r.quantity, unit: ({ stuks: 'stuk', st: 'stuk', 'stuk(s)': 'stuk' })[r.unit] ?? r.unit ?? '', note: r.note || '', optional: !!r.optional,
    grams: r.grams ?? null, ingredient_id: r.ingredient_id ?? null, estimate: r.estimate || null,
    ingredient_name: r.ingredient?.name || null,
    amount_rule: r.amount_rule || '', min_quantity: r.min_quantity ?? '',
  }));
  if (!rows.length) rows.push(emptyRow());

  function emptyRow() {
    return { name: '', quantity: '', unit: 'g', note: '', optional: false, grams: null, ingredient_id: null, estimate: null };
  }

  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const ingByName = new Map(ingredients.map((i) => [i.name.toLowerCase(), i]));

  root.innerHTML = `<div class="view editor">
    <div class="page-head">
      <h1>${params.id ? 'Recept bewerken' : isDraft ? 'Concept nakijken' : 'Nieuw recept'}</h1>
      ${isDraft ? '<p class="muted">Claude heeft dit recept voor je klaargezet. Controleer het en klik op Opslaan.</p>' : ''}
    </div>
    <form class="form" data-form>
      <div class="grid-2">
        <label class="span-2">Titel <input class="input" name="title" required value="${esc(recipe.title)}"></label>
        <label class="span-2">Korte beschrijving <textarea class="input" name="description" rows="2">${esc(recipe.description)}</textarea></label>
        <label>Aantal personen <input class="input" type="number" min="1" name="servings" value="${recipe.servings}"></label>
        <label>Categorie
          <select class="input" name="category">${['Ontbijt', 'Lunch', 'Hoofdgerecht', 'Soep', 'Bijgerecht', 'Salade', 'Nagerecht', 'Snack', 'Bakken'].map((c) => `<option ${c === recipe.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </label>
        <label>Voorbereiding (min) <input class="input" type="number" min="0" name="prep_minutes" value="${recipe.prep_minutes ?? ''}"></label>
        <label>Kooktijd (min) <input class="input" type="number" min="0" name="cook_minutes" value="${recipe.cook_minutes ?? ''}"></label>
        <label>Keuken <input class="input" name="cuisine" value="${esc(recipe.cuisine || 'Nederlands')}"></label>
        <label>Tags (komma's) <input class="input" name="tags" value="${esc((recipe.tags || []).join(', '))}" placeholder="stamppot, winter, snel"></label>
        <div class="span-2 photo-field">
          <img data-photo-preview src="${esc(recipe.image_url || '')}" alt="" ${recipe.image_url ? '' : 'hidden'} referrerpolicy="no-referrer">
          <label class="grow">Foto <input class="input" name="image_url" value="${esc(recipe.image_url || '')}" placeholder="https://… of upload een eigen foto"></label>
          <label class="btn">📷 Foto uploaden<input type="file" accept="image/*" data-photo hidden></label>
        </div>
        <label class="span-2">Bron (URL) <input class="input" name="source_url" value="${esc(recipe.source_url || '')}"></label>
      </div>

      <h2>Ingrediënten</h2>
      <p class="muted small">Ingrediënten worden automatisch gekoppeld aan de ingrediëntendatabase voor voedingswaarden en prijzen.
        Bij eenheden als ‘stuk’ wordt het stuksgewicht van het ingrediënt gebruikt; vul eventueel zelf grammen in.</p>
      <datalist id="ing-names">${ingredients.map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist>
      <datalist id="units">${m.units.map((u) => `<option value="${esc(u)}">`).join('')}</datalist>
      <div class="ing-table">
        <div class="ing-row ing-header"><span>Hoeveelheid</span><span>Eenheid</span><span>Ingrediënt</span><span>Notitie</span><span>Gram</span><span></span></div>
        <div data-rows></div>
      </div>
      <div class="row wrap">
        <button type="button" class="btn btn-ghost" data-add-row>+ Ingrediënt</button>
        <button type="button" class="btn" data-scan-row>📷 Ingrediënt scannen</button>
      </div>

      <h2>Bereiding</h2>
      <label>Eén stap per regel
        <textarea class="input" name="steps" rows="10">${esc((recipe.steps || []).join('\n'))}</textarea>
      </label>
      <label>Notities <textarea class="input" name="notes" rows="2">${esc(recipe.notes || '')}</textarea></label>

      <div class="row end sticky-actions">
        <a class="btn" href="${params.id ? `#/recept/${params.id}` : '#/recepten'}">Annuleren</a>
        <button class="btn btn-primary" type="submit">Opslaan</button>
      </div>
    </form>
  </div>`;
  const view = $('.view', root);
  const form = $('[data-form]', view);

  function status(row) {
    const linked = row.ingredient_id ? ingById.get(Number(row.ingredient_id)) : null;
    if (linked) return `<span class="link-ok" title="Gekoppeld aan ‘${esc(linked.name)}’">✔ ${esc(linked.name)}</span> <button type="button" class="link-btn" data-link title="Ander ingrediënt kiezen">wijzig</button>`;
    if (row.estimate) return '<span class="link-new" title="Wordt als nieuw ingrediënt toegevoegd met Claude-schatting">✨ nieuw</span> <button type="button" class="link-btn" data-link>zelf koppelen</button>';
    if (row.name) return '<span class="link-none" title="Niet gevonden in de database: geen voedingswaarden/prijs">⚠ onbekend</span> <button type="button" class="link-btn strong" data-link>🔗 Koppelen of aanmaken</button>';
    return '';
  }

  function unitSelect(current) {
    const units = ['', ...m.units];
    if (current && !units.includes(current)) units.push(current);
    return `<select class="input" data-k="unit" aria-label="Eenheid">${units.map((u) => `<option value="${esc(u)}" ${u === (current || '') ? 'selected' : ''}>${esc(UNIT_LABELS[u] ?? u)}</option>`).join('')}</select>`;
  }

  function drawRows() {
    $('[data-rows]', view).innerHTML = rows.map((row, i) => `
      <div class="ing-row" data-i="${i}">
        <input class="input" type="number" step="any" min="0" data-k="quantity" value="${row.quantity ?? ''}" aria-label="Hoeveelheid">
        ${unitSelect(row.unit)}
        <div class="ing-name"><input class="input" list="ing-names" data-k="name" value="${esc(row.name)}" aria-label="Ingrediënt"><small data-status>${status(row)}</small></div>
        <input class="input" data-k="note" value="${esc(row.note)}" placeholder="bv. fijngesneden" aria-label="Notitie">
        <input class="input" type="number" step="any" min="0" data-k="grams" value="${row.grams ?? ''}" placeholder="auto" aria-label="Gram">
        <div class="row-actions">
          <label title="Optioneel"><input type="checkbox" data-k="optional" ${row.optional ? 'checked' : ''}> opt.</label>
          <button type="button" class="mini ${row.amount_rule || row.min_quantity ? 'on' : ''}" data-opts title="Hoeveelheid: hele verpakking, hele stuks of minimum">⚖️</button>
          <button type="button" class="mini" data-up title="Omhoog">↑</button>
          <button type="button" class="mini danger" data-del title="Verwijderen">✕</button>
        </div>
        <div class="row-opts" ${row.amount_rule || row.min_quantity || row.showOpts ? '' : 'hidden'}>
          <label>Tegen restjes
            <select class="input" data-k="amount_rule">${RULES.map(([v, l]) => `<option value="${v}" ${v === (row.amount_rule || '') ? 'selected' : ''}>${l}${v === '' ? defaultRuleHint(row) : ''}</option>`).join('')}</select></label>
          <label>Minimaal <span class="row"><input class="input narrow" type="number" step="any" min="0" data-k="min_quantity" value="${row.min_quantity ?? ''}" placeholder="–">
            <span class="muted small">${esc(UNIT_LABELS[row.unit] ?? row.unit ?? '')}</span></span></label>
          <p class="muted small">Ook bij minder personen nooit minder dan het minimum. ‘Hele verpakking’ rondt af op hele pakken van het ingrediënt, zodat je niets overhoudt.</p>
        </div>
      </div>`).join('');
  }

  function defaultRuleHint(row) {
    const ing = row.ingredient_id ? ingById.get(Number(row.ingredient_id)) : null;
    return ing?.amount_rule && ing.amount_rule !== 'none' ? ` (ingrediënt: ${RULE_LABEL[ing.amount_rule]})` : ' (meeschalen)';
  }

  async function matchRow(row) {
    let match = ingByName.get(row.name.toLowerCase());
    if (!match && row.name) match = (await api.get(`/ingredients/match?name=${encodeURIComponent(row.name)}`).catch(() => null))?.match;
    row.ingredient_id = match?.id ?? null;
    if (match) {
      row.estimate = null;
      // Het stuksgewicht uit de database is betrouwbaarder dan een losse schatting.
      if (match.unit_weight_g && !['g', 'kg', 'ml', 'l', 'el', 'tl'].includes(String(row.unit).toLowerCase())) row.grams = null;
    }
    const i = rows.indexOf(row);
    const el = $(`[data-i="${i}"]`, view);
    if (el) {
      $('[data-status]', el).innerHTML = status(row);
      $('[data-k="grams"]', el).value = row.grams ?? '';
    }
  }
  async function linkRow(i) {
    const row = rows[i];
    const ing = await linkIngredientDialog(row.name, row.ingredient_id ? Number(row.ingredient_id) : null);
    if (!ing) return;
    if (ing.id) ingById.set(ing.id, ing);
    row.ingredient_id = ing.id;
    row.estimate = null;
    // Bewust ontkoppeld: bij opslaan niet opnieuw automatisch koppelen
    row.auto_match = !!ing.id;
    if (ing.id && ing.unit_weight_g && !['g', 'kg', 'ml', 'l', 'el', 'tl'].includes(String(row.unit).toLowerCase())) row.grams = null;
    const el = $(`[data-i="${i}"]`, view);
    if (el) {
      $('[data-status]', el).innerHTML = status(row);
      $('[data-k="grams"]', el).value = row.grams ?? '';
    }
  }

  const timers = new Map();
  const rematch = (i) => {
    const row = rows[i];
    clearTimeout(timers.get(row));
    timers.set(row, setTimeout(() => matchRow(row), 300));
  };

  view.addEventListener('input', (e) => {
    const rowEl = e.target.closest('[data-i]');
    if (!rowEl) return;
    const i = Number(rowEl.dataset.i);
    const k = e.target.dataset.k;
    rows[i][k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'name') {
      rows[i].estimate = null;
      rematch(i);
    }
  });
  view.addEventListener('click', (e) => {
    if (e.target.closest('[data-scan-row]')) return scanIngredient();
    if (e.target.closest('[data-add-row]')) {
      rows.push(emptyRow());
      drawRows();
      $$('[data-k="quantity"]', view).at(-1)?.focus();
      return;
    }
    const rowEl = e.target.closest('[data-i]');
    if (!rowEl) return;
    const i = Number(rowEl.dataset.i);
    if (e.target.closest('[data-link]')) return linkRow(i);
    if (e.target.closest('[data-opts]')) {
      rows[i].showOpts = true;
      const opts = $('.row-opts', rowEl);
      opts.hidden = !opts.hidden;
      return;
    }
    if (e.target.closest('[data-del]')) { rows.splice(i, 1); drawRows(); }
    if (e.target.closest('[data-up]') && i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; drawRows(); }
  });

  $('[data-photo]', view).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const img = await readImageFile(file);
      const { url } = await api.post('/uploads', { media_type: img.media_type, data: img.data });
      form.image_url.value = url;
      const prev = $('[data-photo-preview]', view);
      prev.src = url;
      prev.hidden = false;
      toast('Foto toegevoegd', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  // ---- Ingrediënt toevoegen door de barcode van een product te scannen ----
  async function scanIngredient() {
    const code = await scanBarcode({ title: 'Ingrediënt scannen' });
    if (!code) return;
    const md = modal(`<h2>Product ${esc(code)}</h2><div data-body><p class="muted">Opzoeken in Open Food Facts…</p></div>`, { wide: true });
    const body = $('[data-body]', md.el);
    let info;
    try {
      info = await api.get(`/scan/${code}`);
    } catch (err) {
      body.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      return;
    }
    const p = info.product;
    const existing = info.ingredient || info.match;
    if (!p && !info.ingredient) {
      body.innerHTML = `<p>Dit product is niet gevonden in Open Food Facts.</p>
        ${info.warnings.map((w) => `<p class="muted small">${esc(w)}</p>`).join('')}
        <p class="muted small">Je kunt het product toevoegen aan <a href="https://nl.openfoodfacts.org/cgi/product.pl?code=${esc(code)}" target="_blank" rel="noopener">Open Food Facts</a>
        of het ingrediënt hieronder met de hand invoeren.</p>`;
      return;
    }
    const grams = p?.grams || 100;
    body.innerHTML = `
      <div class="scan-product">
        ${p?.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer">` : '<span class="thumb-emoji">🛒</span>'}
        <div>
          <strong>${esc(p?.name || info.ingredient?.name)}</strong>
          ${p?.nutriscore ? `<span class="nutriscore ns-${esc(p.nutriscore)}">${esc(p.nutriscore.toUpperCase())}</span>` : ''}
          <div class="muted small">${esc(p?.brands || '')} ${esc(p?.quantity || '')}</div>
          ${p?.nutrition ? `<div class="small">${num(p.nutrition.kcal, 0)} kcal · ${num(p.nutrition.protein)} g eiwit · ${num(p.nutrition.carbs)} g kh · ${num(p.nutrition.fat)} g vet per 100 g</div>` : '<div class="small muted">Geen voedingswaarden in Open Food Facts</div>'}
        </div>
      </div>
      <form class="form" data-apply>
        ${existing ? `<label class="check"><input type="radio" name="mode" value="link" checked> Koppel aan bestaand ingrediënt <strong>${esc(existing.name)}</strong></label>
          <label class="check sub"><input type="checkbox" name="update" ${info.ingredient ? '' : 'checked'}> Voedingswaarden van dit product overnemen</label>` : ''}
        <label class="check"><input type="radio" name="mode" value="new" ${existing ? '' : 'checked'}> Nieuw ingrediënt:
          <input class="input" name="name" value="${esc(info.suggested_name || '')}" aria-label="Naam nieuw ingrediënt"></label>
        <div class="grid-2">
          <label>Hoeveelheid <input class="input" type="number" step="any" min="0" name="quantity" value="${grams}"></label>
          <label>Eenheid <select class="input" name="unit">${['g', 'ml', 'stuk', 'pak', 'blik', 'el', 'tl'].map((u) => `<option>${u}</option>`).join('')}</select></label>
        </div>
        <p class="muted small">Standaard de hele verpakking (${num(grams, 0)} g). Pas aan naar wat het recept gebruikt.</p>
        ${info.warnings.map((w) => `<p class="muted small">⚠ ${esc(w)}</p>`).join('')}
        <div class="row end"><button class="btn btn-primary">Toevoegen aan recept</button></div>
      </form>`;
    $('[data-apply]', body).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const mode = f.querySelector('[name=mode]:checked').value;
      try {
        let ing;
        if (mode === 'link' && f.update && !f.update.checked) ing = existing;
        else {
          ing = await api.post('/scan/apply', {
            ean: code, product: p, update_nutrition: true,
            ...(mode === 'link' ? { ingredient_id: existing.id } : { name: f.name.value }),
          });
        }
        ingById.set(ing.id, ing);
        ingByName.set(ing.name.toLowerCase(), ing);
        const empty = rows.findIndex((r) => !r.name);
        const row = { ...emptyRow(), name: ing.name, ingredient_id: ing.id, quantity: Number(f.quantity.value) || '', unit: f.unit.value };
        if (empty >= 0) rows[empty] = row;
        else rows.push(row);
        drawRows();
        md.close();
        toast(`${ing.name} toegevoegd`, 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      title: fd.get('title'),
      description: fd.get('description'),
      servings: Number(fd.get('servings')),
      category: fd.get('category'),
      cuisine: fd.get('cuisine'),
      prep_minutes: fd.get('prep_minutes'),
      cook_minutes: fd.get('cook_minutes'),
      tags: String(fd.get('tags')).split(',').map((t) => t.trim()).filter(Boolean),
      image_url: fd.get('image_url'),
      source_url: fd.get('source_url'),
      steps: String(fd.get('steps')).split('\n').map((s) => s.trim()).filter(Boolean),
      notes: fd.get('notes'),
      favorite: recipe.favorite,
      rating: recipe.rating,
      ingredients: rows.filter((r) => r.name.trim()),
    };
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      const saved = params.id ? await api.put(`/recipes/${params.id}`, data) : await api.post('/recipes', data);
      if (isDraft) sessionStorage.removeItem(DRAFT_KEY);
      toast('Recept opgeslagen', 'success');
      location.hash = `#/recept/${saved.id}`;
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });

  drawRows();
  // Concepten van Claude: ingrediënten direct koppelen aan de database.
  if (isDraft) for (const row of rows.filter((r) => !r.ingredient_id && r.name)) matchRow(row);
}
