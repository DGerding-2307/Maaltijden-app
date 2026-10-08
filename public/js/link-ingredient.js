// Venster om een niet-herkend ingrediënt te koppelen aan een bestaand ingrediënt, of een nieuw aan te maken.
import { api, meta } from './api.js';
import { $, $$, esc, num, modal, toast, debounce } from './util.js';

// Bijvoeglijke naamwoorden overslaan bij zoeken op losse woorden ("verse rode peper" → "peper")
const ADJECTIVES = new Set(['verse', 'vers', 'rode', 'groene', 'gele', 'witte', 'zwarte', 'grote', 'kleine', 'gedroogde', 'gemalen',
  'gehakte', 'gesneden', 'gekookte', 'halfvolle', 'volle', 'magere', 'biologische', 'jonge', 'oude', 'zoete', 'zure', 'diepvries', 'blik']);

const NUTRIENT_FIELDS = [
  ['kcal', 'Energie (kcal)'], ['protein', 'Eiwit (g)'], ['carbs', 'Koolhydraten (g)'], ['sugar', 'waarvan suikers (g)'],
  ['fat', 'Vet (g)'], ['sat_fat', 'waarvan verzadigd (g)'], ['fiber', 'Vezels (g)'], ['salt', 'Zout (g)'],
];

/**
 * @param name naam zoals die in het recept staat
 * @param current id van het ingrediënt waaraan de regel nu gekoppeld is (of null)
 * @returns Promise<ingredient|null> het gekozen of nieuwe ingrediënt; null bij annuleren
 */
export async function linkIngredientDialog(name, current = null) {
  const m = await meta();
  return new Promise((resolve) => {
    let done = false;
    const finish = (ing) => {
      if (done) return;
      done = true;
      md.close();
      resolve(ing);
    };
    const md = modal(`
      <h2>‘${esc(name)}’ koppelen</h2>
      <p class="muted small">Koppel deze regel aan een ingrediënt, dan tellen voedingswaarden en prijs mee.</p>
      <div class="seg small" role="tablist">
        <button type="button" class="active" data-tab="bestaand">🔗 Bestaand ingrediënt</button>
        <button type="button" data-tab="nieuw">＋ Nieuw aanmaken</button>
      </div>
      <div data-pane="bestaand">
        <input type="search" class="input" data-ing-q value="${esc(name)}" placeholder="Zoek ingrediënt…" aria-label="Zoek ingrediënt">
        <label class="check small"><input type="checkbox" data-remember checked> Onthoud ‘${esc(name)}’ als andere naam, zodat het voortaan vanzelf gekoppeld wordt</label>
        <div class="pick-list" data-results></div>
        ${current ? '<button type="button" class="btn btn-ghost small" data-unlink>Koppeling verwijderen</button>' : ''}
      </div>
      <form class="form" data-pane="nieuw" hidden>
        <div class="grid-2">
          <label>Naam <input class="input" name="name" value="${esc(String(name).toLowerCase())}" required></label>
          <label>Afdeling <select class="input" name="category">${m.categories.map((c) => `<option ${c === 'Overig' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        </div>
        <fieldset class="nutri-fields">
          <legend>Voedingswaarden per 100 g <span class="muted small">(leeg laten = automatisch opzoeken in Open Food Facts)</span></legend>
          <div class="grid-4">
            ${NUTRIENT_FIELDS.map(([k, l]) => `<label>${l} <input class="input" type="number" step="any" min="0" name="${k}"></label>`).join('')}
          </div>
        </fieldset>
        <div class="grid-4">
          <label>1 stuk weegt (g) <input class="input" type="number" step="any" min="0" name="unit_weight_g" placeholder="bv. 100"></label>
          <label>Verpakking (g) <input class="input" type="number" step="any" min="0" name="package_grams" placeholder="bv. 500"></label>
          <label>Prijs verpakking (€) <input class="input" type="number" step="0.01" min="0" name="price" placeholder="bv. 1,49"></label>
          <label class="check"><input type="checkbox" name="pantry"> Voorraadkast</label>
        </div>
        <div class="row wrap end">
          ${m.claude?.configured ? '<button type="button" class="btn btn-ai" data-estimate>✨ Schatten met Claude</button>' : ''}
          <button class="btn btn-primary">Aanmaken en koppelen</button>
        </div>
      </form>`, { wide: true, onClose: () => { if (!done) { done = true; resolve(null); } } });

    const el = md.el;
    let estimated = false;
    $$('[data-tab]', el).forEach((b) => b.addEventListener('click', () => {
      $$('[data-tab]', el).forEach((x) => x.classList.toggle('active', x === b));
      $$('[data-pane]', el).forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
      (b.dataset.tab === 'nieuw' ? el.querySelector('[name="name"]') : $('[data-ing-q]', el)).focus();
    }));

    // ---- Bestaand ingrediënt kiezen ----
    let shown = [];
    async function search() {
      const q = $('[data-ing-q]', el).value.trim();
      let list = q ? await api.get(`/ingredients?q=${encodeURIComponent(q)}`) : [];
      // Niets gevonden op de hele naam: probeer de losse woorden (bv. "verse rode peper" → "peper")
      if (!list.length && q.includes(' ')) {
        for (const w of q.split(/\s+/).filter((x) => x.length >= 3 && !ADJECTIVES.has(x.toLowerCase())).reverse()) {
          list = await api.get(`/ingredients?q=${encodeURIComponent(w)}`);
          if (list.length) break;
        }
      }
      // Exacte naam eerst, dan namen die met de zoekterm beginnen
      const ql = q.toLowerCase();
      const rank = (i) => (i.name === ql ? 0 : i.name.startsWith(ql) ? 1 : 2);
      shown = list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'nl')).slice(0, 30);
      $('[data-results]', el).innerHTML = shown.map((i) => `
        <button type="button" class="pick-item ${i.id === current ? 'active' : ''}" data-pick="${i.id}">
          <span>${esc(i.name)}${i.id === current ? ' <span class="badge">huidig</span>' : ''}</span>
          <span class="muted small">${esc(i.category)} · ${i.kcal != null ? `${num(i.kcal, 0)} kcal/100 g` : 'geen voedingswaarden'}${i.unit_weight_g >= 1 ? ` · 1 stuk ≈ ${num(i.unit_weight_g, 0)} g` : ''}</span>
        </button>`).join('') || `<p class="muted">Geen ingrediënt gevonden. Pas de zoekterm aan of <a href="#" data-goto-new>maak een nieuw ingrediënt aan</a>.</p>`;
    }
    $('[data-ing-q]', el).addEventListener('input', debounce(search, 200));
    search();
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-goto-new]')) {
        e.preventDefault();
        return $('[data-tab="nieuw"]', el).click();
      }
      if (e.target.closest('[data-unlink]')) return finish({ id: null });
      const pick = e.target.closest('[data-pick]');
      if (!pick) return;
      try {
        let ing = shown.find((i) => i.id === Number(pick.dataset.pick));
        if ($('[data-remember]', el).checked) ing = await api.post(`/ingredients/${ing.id}/alias`, { name });
        finish(ing);
      } catch (err) { toast(err.message, 'error'); }
    });

    // ---- Nieuw ingrediënt ----
    const form = $('form[data-pane="nieuw"]', el);
    $('[data-estimate]', el)?.addEventListener('click', async (e) => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Claude schat…';
      try {
        const est = await api.post('/ingredients/estimate', { name: form.name.value });
        for (const [k] of NUTRIENT_FIELDS) form[k].value = est[k] ?? '';
        form.category.value = est.category;
        form.unit_weight_g.value = est.unit_weight_g ?? '';
        form.package_grams.value = est.package_grams ?? '';
        form.price.value = est.price_cents ? (est.price_cents / 100).toFixed(2) : '';
        form.pantry.checked = !!est.pantry;
        estimated = true;
        toast('Geschat door Claude – controleer de waarden', 'success');
      } catch (err) { toast(err.message, 'error'); }
      btn.disabled = false;
      btn.textContent = '✨ Opnieuw schatten';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = (k) => (form[k].value === '' ? null : Number(form[k].value));
      const hasNutrition = NUTRIENT_FIELDS.some(([k]) => form[k].value !== '');
      const body = {
        name: form.name.value.trim().toLowerCase(),
        category: form.category.value,
        ...Object.fromEntries(NUTRIENT_FIELDS.map(([k]) => [k, val(k)])),
        unit_weight_g: val('unit_weight_g'),
        package_grams: val('package_grams'),
        price_cents: form.price.value ? Math.round(Number(form.price.value) * 100) : null,
        price_source: form.price.value ? (estimated ? 'schatting' : 'handmatig') : 'schatting',
        pantry: form.pantry.checked ? 1 : 0,
        aliases: aliasFor(name, form.name.value),
      };
      if (hasNutrition) body.nutrition_source = estimated ? 'Claude (schatting)' : 'handmatig';
      try {
        const ing = await api.post('/ingredients', body);
        toast(`‘${ing.name}’ aangemaakt${hasNutrition ? '' : ' – voedingswaarden worden opgezocht'}`, 'success');
        finish(ing);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// De naam uit het recept als andere naam bewaren als die afwijkt van de ingrediëntnaam
function aliasFor(recipeName, ingName) {
  const a = String(recipeName).trim().toLowerCase();
  return a && a !== String(ingName).trim().toLowerCase() ? a : '';
}
