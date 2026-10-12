// Gedeelde formulierdelen voor ingrediënten: foto en webwinkel-link (Claude haalt de productgegevens op).
import { api } from './api.js';
import { $, esc, toast, readImageFile } from './util.js';

const NUTRIENTS = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'sat_fat', 'fiber', 'salt'];

/** Kleine foto van een ingrediënt (of niets als er geen foto is). */
export function ingThumb(ing, size = '') {
  const url = ing?.image_url;
  return url ? `<img class="ing-thumb ${size}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
}

function creditLine(ing) {
  let c;
  try { c = ing.image_credit ? JSON.parse(ing.image_credit) : null; } catch { c = null; }
  return c ? `<small class="photo-credit"><a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.author)}</a>, ${esc(c.license)}</small>` : '';
}

export function mediaFields(ing = {}, { claude = false } = {}) {
  return `
    <div class="ing-media">
      <div class="ing-photo-wrap">
        <div class="ing-photo" data-photo-box>${ing.image_url ? `<img src="${esc(ing.image_url)}" alt="" referrerpolicy="no-referrer">` : '<span>🥕</span>'}</div>
        ${creditLine(ing)}
      </div>
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
    ${claude ? '<div class="row wrap"><button type="button" class="btn btn-ai" data-jumbo-search>🛒 Zoek bij Jumbo</button></div>' : ''}
    <p class="muted small" data-shop-status>${claude ? 'Plak een productlink en klik op ‘Gegevens ophalen’, of klik op ‘Zoek bij Jumbo’: Claude zoekt het product op jumbo.com en vult naam, voedingswaarden, verpakking, prijs en foto in.' : ''}</p>`;
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

  const fill = (d) => {
    if (!form.name.value.trim()) form.name.value = d.name;
    if (form.category && d.category) form.category.value = d.category;
    for (const k of NUTRIENTS) if (d[k] != null && form[k]) form[k].value = d[k];
    if (d.unit_weight_g != null && form.unit_weight_g) form.unit_weight_g.value = d.unit_weight_g;
    if (d.package_grams != null && form.package_grams) form.package_grams.value = d.package_grams;
    if (d.package_label && form.package_label) form.package_label.value = d.package_label;
    if (d.price_cents != null && form.price) form.price.value = (d.price_cents / 100).toFixed(2);
    if (form.pantry) form.pantry.checked = !!d.pantry;
    if (d.image_url && !form.image_url.value) { form.image_url.value = d.image_url; preview(); }
    if (d.shop_url && form.shop_url && !form.shop_url.value.trim()) form.shop_url.value = d.shop_url;
    form.shopData = d;
    const parts = [
      `${d.product_name}${d.brand ? ` (${d.brand})` : ''}`,
      d.kcal != null ? 'voedingswaarden' : 'geen voedingswaarden gevonden',
      d.price_cents != null ? `prijs € ${(d.price_cents / 100).toFixed(2).replace('.', ',')}` : 'geen prijs gevonden',
    ];
    return parts;
  };
  // Eén knop bezig tegelijk; status onder het formulier
  const run = async (btn, busyLabel, statusText, call) => {
    const status = $('[data-shop-status]', form);
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyLabel;
    status.className = 'muted small';
    status.textContent = statusText;
    try {
      const d = await call();
      const parts = fill(d);
      status.className = 'small good';
      status.textContent = `✔ Gevonden bij ${d.shop_host}: ${parts.join(' · ')}. Controleer de waarden en sla op.`;
    } catch (err) {
      status.className = 'small bad';
      status.textContent = `✖ ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  };

  $('[data-shop-fetch]', form)?.addEventListener('click', (e) => {
    const url = form.shop_url.value.trim();
    if (!url) { form.shop_url.focus(); return toast('Plak eerst een link naar het product', 'error'); }
    run(e.target, 'Claude leest de pagina…', 'Pagina ophalen en uitlezen (kan 10–30 seconden duren)…', () => api.post('/ingredients/from-url', { url }));
  });
  $('[data-jumbo-search]', form)?.addEventListener('click', (e) => {
    const name = form.name.value.trim();
    if (!name) { form.name.focus(); return toast('Vul eerst de naam van het ingrediënt in', 'error'); }
    run(e.target, 'Claude zoekt bij Jumbo…', `“${name}” opzoeken op jumbo.com (kan 20–60 seconden duren)…`, () => api.post('/ingredients/from-jumbo', { name }));
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
