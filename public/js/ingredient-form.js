// Gedeelde formulierdelen voor ingrediënten: foto en webwinkel-link (Claude haalt de productgegevens op).
import { api } from './api.js';
import { $, esc, toast, readImageFile } from './util.js';

const NUTRIENTS = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'sat_fat', 'fiber', 'salt'];

/** Kleine foto van een ingrediënt (of niets als er geen foto is). */
export function ingThumb(ing, size = '') {
  const url = ing?.image_url;
  return url ? `<img class="ing-thumb ${size}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
}

export function mediaFields(ing = {}, { claude = false } = {}) {
  return `
    <div class="ing-media">
      <div class="ing-photo" data-photo-box>${ing.image_url ? `<img src="${esc(ing.image_url)}" alt="" referrerpolicy="no-referrer">` : '<span>🥕</span>'}</div>
      <div class="ing-media-fields">
        <label>Foto (link) <input class="input" name="image_url" value="${esc(ing.image_url || '')}" placeholder="https://… of upload een foto"></label>
        <div class="row wrap">
          <label class="btn small">📷 Foto uploaden<input type="file" accept="image/*" data-photo-file hidden></label>
          <button type="button" class="btn btn-ghost small" data-photo-clear>Foto weghalen</button>
        </div>
      </div>
    </div>
    <label>Link naar het product in een webwinkel
      <div class="row">
        <input class="input grow" name="shop_url" type="url" value="${esc(ing.shop_url || '')}" placeholder="bv. https://www.ah.nl/producten/… of https://www.jumbo.com/…">
        ${claude ? '<button type="button" class="btn btn-ai" data-shop-fetch>✨ Gegevens ophalen</button>' : ''}
        ${ing.shop_url ? `<a class="btn btn-ghost" href="${esc(ing.shop_url)}" target="_blank" rel="noopener" title="Openen">↗</a>` : ''}
      </div>
    </label>
    <p class="muted small" data-shop-status>${claude ? 'Plak een productlink en klik op ‘Gegevens ophalen’: Claude leest de pagina en vult naam, voedingswaarden, verpakking, prijs en foto in.' : ''}</p>`;
}

/**
 * Koppelt de foto- en webwinkelknoppen aan een formulier.
 * Na het ophalen staat de opgehaalde informatie in form.shopData (voor bron en prijsnotitie).
 */
export function bindMediaFields(form) {
  const box = $('[data-photo-box]', form);
  const preview = () => {
    const url = form.image_url.value.trim();
    box.innerHTML = url ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer">` : '<span>🥕</span>';
  };
  form.image_url.addEventListener('change', preview);
  $('[data-photo-clear]', form).addEventListener('click', () => { form.image_url.value = ''; preview(); });
  $('[data-photo-file]', form).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const img = await readImageFile(file, 800);
      const { url } = await api.post('/uploads', { media_type: img.media_type, data: img.data });
      form.image_url.value = url;
      preview();
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });

  $('[data-shop-fetch]', form)?.addEventListener('click', async (e) => {
    const btn = e.target;
    const status = $('[data-shop-status]', form);
    const url = form.shop_url.value.trim();
    if (!url) { form.shop_url.focus(); return toast('Plak eerst een link naar het product', 'error'); }
    btn.disabled = true;
    btn.textContent = 'Claude leest de pagina…';
    status.className = 'muted small';
    status.textContent = 'Pagina ophalen en uitlezen (kan 10–30 seconden duren)…';
    try {
      const d = await api.post('/ingredients/from-url', { url });
      if (!form.name.value.trim()) form.name.value = d.name;
      if (form.category && d.category) form.category.value = d.category;
      for (const k of NUTRIENTS) if (d[k] != null && form[k]) form[k].value = d[k];
      if (d.unit_weight_g != null && form.unit_weight_g) form.unit_weight_g.value = d.unit_weight_g;
      if (d.package_grams != null && form.package_grams) form.package_grams.value = d.package_grams;
      if (d.package_label && form.package_label) form.package_label.value = d.package_label;
      if (d.price_cents != null && form.price) form.price.value = (d.price_cents / 100).toFixed(2);
      if (form.pantry) form.pantry.checked = !!d.pantry;
      if (d.image_url && !form.image_url.value) { form.image_url.value = d.image_url; preview(); }
      form.shopData = d;
      const parts = [
        `${d.product_name}${d.brand ? ` (${d.brand})` : ''}`,
        d.kcal != null ? 'voedingswaarden' : 'geen voedingswaarden gevonden',
        d.price_cents != null ? `prijs € ${(d.price_cents / 100).toFixed(2).replace('.', ',')}` : 'geen prijs gevonden',
      ];
      status.className = 'small good';
      status.textContent = `✔ Opgehaald van ${d.shop_host}: ${parts.join(' · ')}. Controleer de waarden en sla op.`;
    } catch (err) {
      status.className = 'small bad';
      status.textContent = `✖ ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Gegevens ophalen';
    }
  });
}

/** Bron en prijsnotitie toevoegen als de gegevens uit een webwinkel komen. */
export function applyShopSource(form, data) {
  const d = form.shopData;
  if (!d) return data;
  const out = { ...data };
  if (d.nutrition_source && d.kcal != null && Number(out.kcal) === Number(d.kcal)) {
    out.nutrition_source = d.nutrition_source;
    if (d.off_code) out.off_code = d.off_code;
  }
  if (d.price_cents != null && out.price_cents === d.price_cents) {
    // Een prijs uit de winkel geldt als zelf ingevoerd: Open Prices overschrijft hem niet
    out.price_source = 'handmatig';
    out.price_updated_at = new Date().toISOString().slice(0, 10);
    out.price_note = `Uit webwinkel ${d.shop_host}`;
    out.price_count = null;
  }
  return out;
}
