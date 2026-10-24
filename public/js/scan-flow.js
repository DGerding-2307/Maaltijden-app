// Product scannen (v4): staat het al in je ingrediënten, kent Open Food Facts het, of is het nieuw?
// - Bekend bij Open Food Facts maar niet in je lijst: met één knop toevoegen (naam, voedingswaarden, foto, barcode).
// - Onbekend: Open Food Facts openen om het toe te voegen, of zelf invoeren / de foto van het etiket laten lezen.
import { api, meta } from './api.js';
import { $, esc, num, toast, modal, readImageFile, openExternal } from './util.js';
import { scanBarcode } from './scanner.js';
import { buddySvg } from './buddy.js';

const NUTRIENTS = [
  ['kcal', 'Energie', 'kcal'], ['protein', 'Eiwit', 'g'], ['carbs', 'Koolhydraten', 'g'], ['sugar', 'waarvan suikers', 'g'],
  ['fat', 'Vet', 'g'], ['sat_fat', 'waarvan verzadigd', 'g'], ['fiber', 'Vezels', 'g'], ['salt', 'Zout', 'g'],
];
const isPhone = () => /Android|iPhone|iPad|MaaltijdenApp/i.test(navigator.userAgent);

/** Link om een product aan Open Food Facts toe te voegen (op de telefoon opent de OFF-app als die er is). */
export function offAddUrl(code) {
  return isPhone()
    ? `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`
    : `https://world.openfoodfacts.org/cgi/product.pl?type=search_or_add&action=process&code=${encodeURIComponent(code)}`;
}

/**
 * Scan een barcode en geef het ingrediënt terug (bestaand of net toegevoegd), of null als je stopt.
 * @param purpose  'log' (eten loggen) | 'recipe' | 'list' (ingrediëntenlijst) – alleen voor de knopteksten
 */
export async function scanProduct({ purpose = 'list', code = null } = {}) {
  const ean = code || await scanBarcode({ title: 'Product scannen' });
  if (!ean) return null;
  return productDialog(ean, { purpose });
}

export function productDialog(code, { purpose = 'list' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ing) => { done = true; resolve(ing); md.close(); };
    const md = modal(`<div class="sheet"><h2>Product <span class="muted small">${esc(code)}</span></h2><div data-body><p class="muted">Opzoeken in Open Food Facts…</p></div></div>`,
      { onClose: () => !done && resolve(null) });
    const body = $('[data-body]', md.el);
    const useLabel = purpose === 'log' ? 'Loggen' : purpose === 'recipe' ? 'Gebruiken in recept' : 'Klaar';

    async function lookup() {
      body.innerHTML = '<p class="muted">Opzoeken in Open Food Facts…</p>';
      let info;
      try { info = await api.get(`/scan/${code}`); } catch (err) { body.innerHTML = `<p class="error">${esc(err.message)}</p>`; return; }
      if (info.ingredient) return known(info.ingredient);
      if (info.product) return found(info);
      unknown(info);
    }

    // Al eerder gescand of gekoppeld
    function known(ing) {
      body.innerHTML = `<div class="scan-product"><span class="thumb-emoji">✅</span><div><strong>${esc(ing.name)}</strong>
        <div class="muted small">Staat al in je ingrediënten · ${num(ing.kcal, 0)} kcal per 100 g</div></div></div>
        <button class="btn btn-primary cta" data-use>${esc(useLabel)}</button>`;
      $('[data-use]', body).addEventListener('click', () => finish(ing));
    }

    // Open Food Facts kent het product: met één knop toevoegen
    function found(info) {
      const p = info.product;
      body.innerHTML = `<div class="scan-product">
          ${p.image ? `<img src="${esc(p.image)}" alt="" referrerpolicy="no-referrer">` : '<span class="thumb-emoji">🛒</span>'}
          <div><strong>${esc(p.name)}</strong> ${p.nutriscore ? `<span class="nutriscore ns-${esc(p.nutriscore)}">${esc(p.nutriscore.toUpperCase())}</span>` : ''}
            <div class="muted small">${esc(p.brands || '')} ${esc(p.quantity || '')}</div>
            ${p.nutrition ? `<div class="small">${num(p.nutrition.kcal, 0)} kcal · ${num(p.nutrition.protein)} g eiwit · ${num(p.nutrition.carbs)} g kh · ${num(p.nutrition.fat)} g vet per 100 g</div>` : '<div class="small muted">Geen voedingswaarden in Open Food Facts</div>'}
          </div></div>
        <form class="form" data-apply>
          <label>Naam in je ingrediëntenlijst <input class="input" name="name" value="${esc(info.suggested_name || p.name || '')}" required></label>
          ${info.match ? `<label class="check"><input type="checkbox" name="link"> Koppel aan bestaand ingrediënt <strong>${esc(info.match.name)}</strong> (en neem deze voedingswaarden over)</label>` : ''}
          ${p.nutrition?.kcal ? '' : `<p class="muted small">Zonder voedingswaarden kun je het straks aanvullen, of <button type="button" class="link-btn" data-label>📷 laat Claude het etiket lezen</button>.</p>`}
          <button class="btn btn-primary cta">➕ Toevoegen aan mijn ingrediënten</button>
        </form>`;
      $('[data-label]', body)?.addEventListener('click', () => manual({ name: info.suggested_name }, true));
      $('[data-apply]', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        try {
          const ing = await api.post('/scan/apply', { ean: code, product: p, update_nutrition: true, ...(f.link?.checked ? { ingredient_id: info.match.id } : { name: f.name.value.trim() }) });
          toast(`${ing.name} toegevoegd aan je ingrediënten`, 'success');
          finish(ing);
        } catch (err) { toast(err.message, 'error'); }
      });
    }

    // Onbekend product
    function unknown(info) {
      const offline = !!info.off_unreachable;
      body.innerHTML = `<div class="scan-unknown">${buddySvg({ mood: 'bezorgd' })}
        <h3>${offline ? 'Open Food Facts is nu niet bereikbaar' : 'Dit product kent Open Food Facts nog niet'}</h3>
        <p class="muted">${offline ? 'Je kunt het product zelf toevoegen of het later nog eens proberen.' : 'Help iedereen en voeg het toe aan Open Food Facts (de barcode staat al klaar), of zet het meteen in je eigen lijst.'}</p>
        <div class="scan-actions">
          ${offline ? '' : '<button class="btn btn-primary" data-off>🌍 Toevoegen aan Open Food Facts</button>'}
          <button class="btn" data-label>📷 Foto van het etiket – Claude vult het in</button>
          <button class="btn" data-manual>✍️ Zelf invoeren</button>
          <button class="btn btn-ghost" data-again>↻ Opnieuw zoeken (na toevoegen aan Open Food Facts)</button>
        </div></div>`;
      $('[data-off]', body)?.addEventListener('click', async () => {
        try { await navigator.clipboard?.writeText(code); toast('Barcode gekopieerd', 'success'); } catch { /* geen klembord */ }
        openExternal(offAddUrl(code));
      });
      $('[data-label]', body).addEventListener('click', () => manual({}, true));
      $('[data-manual]', body).addEventListener('click', () => manual({}));
      $('[data-again]', body).addEventListener('click', lookup);
    }

    // Zelf invoeren, eventueel ingevuld vanaf een foto van het etiket
    async function manual(start = {}, photoFirst = false) {
      const m = await meta();
      body.innerHTML = `<form class="form" data-manual-form>
        <input type="file" accept="image/*" data-file hidden>
        <button type="button" class="btn" data-photo>📷 ${photoFirst ? 'Foto van het etiket maken' : 'Liever een foto van het etiket?'}</button>
        <p class="muted small" data-status></p>
        <div class="grid-2">
          <label class="span-2">Naam <input class="input" name="name" value="${esc(start.name || '')}" required placeholder="bv. griekse yoghurt 0%"></label>
          <label class="span-2">Afdeling <select class="input" name="category">${m.categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
          ${NUTRIENTS.map(([k, l, u]) => `<label>${l} (${u}/100 g) <input class="input" type="number" step="any" min="0" inputmode="decimal" name="${k}" ${k === 'kcal' ? 'required' : ''}></label>`).join('')}
          <label>Verpakking (g) <input class="input" type="number" step="any" min="0" name="package_grams"></label>
          <label>1 stuk (g) <input class="input" type="number" step="any" min="0" name="unit_weight_g"></label>
        </div>
        <input type="hidden" name="allergens"><input type="hidden" name="source" value="handmatig">
        <button class="btn btn-primary cta">➕ Toevoegen aan mijn ingrediënten</button>
      </form>`;
      const f = $('[data-manual-form]', body);
      const file = $('[data-file]', f);
      $('[data-photo]', f).addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        if (!file.files?.[0]) return;
        const status = $('[data-status]', f);
        status.textContent = 'Claude leest het etiket…';
        try {
          const image = await readImageFile(file.files[0], 1600);
          const r = await api.post('/ai/label', { image: { media_type: image.media_type, data: image.data } });
          if (!r.readable) { status.textContent = 'Ik kon geen etiket lezen. Probeer een scherpere foto van de voedingswaarden.'; return; }
          f.name.value = r.name;
          f.category.value = r.category;
          for (const [k] of NUTRIENTS) f[k].value = r.per100[k] ?? '';
          f.package_grams.value = r.package_grams ?? '';
          f.unit_weight_g.value = r.unit_weight_g ?? '';
          f.allergens.value = r.allergens || '';
          f.source.value = 'Etiket (foto, Claude)';
          status.textContent = `Ingevuld vanaf het etiket${r.brand ? ` (${r.brand})` : ''}. Kijk even of het klopt.`;
        } catch (err) { status.textContent = /nog niet ingesteld/.test(err.message) ? 'Hiervoor heb je Claude nodig (Instellingen).' : err.message; }
      });
      if (photoFirst) file.click();
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(f));
        try {
          const ing = await api.post('/ingredients', {
            name: data.name.trim().toLowerCase(), category: data.category, off_code: code, allergens: data.allergens || null,
            ...Object.fromEntries(NUTRIENTS.map(([k]) => [k, Number(data[k]) || 0])),
            package_grams: Number(data.package_grams) || null, unit_weight_g: Number(data.unit_weight_g) || null,
            nutrition_source: data.source, price_source: 'schatting',
          });
          toast(`${ing.name} toegevoegd aan je ingrediënten`, 'success');
          finish(ing);
        } catch (err) { toast(err.message, 'error'); }
      });
    }

    lookup();
  });
}
