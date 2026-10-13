// Hulpfuncties voor de frontend.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const euroFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
export const euro = (cents) => (cents == null ? '–' : euroFmt.format(cents / 100));

export function num(n, d = 1) {
  if (n == null || Number.isNaN(Number(n))) return '–';
  return Number(n).toLocaleString('nl-NL', { maximumFractionDigits: d });
}

/** Mooie weergave van een hoeveelheid: 0.5 → ½, 1.25 → 1¼ */
export function qty(n) {
  if (n == null || n === '') return '';
  const v = Number(n);
  if (v >= 20) return num(Math.round(v / 5) * 5, 0);
  const whole = Math.floor(v);
  const frac = v - whole;
  const fracs = [[0.25, '¼'], [0.333, '⅓'], [0.5, '½'], [0.667, '⅔'], [0.75, '¾']];
  for (const [f, s] of fracs) if (Math.abs(frac - f) < 0.04) return (whole ? whole : '') + s;
  return num(v, v < 10 ? 1 : 0);
}

export const DAY_NAMES = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function mondayOf(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
}

export const todayISO = () => toISO(new Date());

export function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
  return parseISO(iso).toLocaleDateString('nl-NL', opts);
}

export function weekNumber(iso) {
  const d = parseISO(iso);
  const target = new Date(d.valueOf());
  target.setDate(target.getDate() - ((d.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  return 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}

export function minutes(m) {
  if (!m) return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} u ${r} min` : `${h} uur`;
}

// ---------- Toasts ----------
export function toast(message, type = 'info') {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  box.append(t);
  setTimeout(() => t.classList.add('hide'), 3500);
  setTimeout(() => t.remove(), 4000);
}

// ---------- Modaal venster ----------
const openModals = new Set();

/** Alle open vensters sluiten (bij wisselen van pagina, zodat er niets blijft hangen). */
export function closeAllModals() {
  for (const close of [...openModals]) close();
}

/** Is er een open venster met ingevulde, nog niet opgeslagen gegevens? */
export function hasDirtyModal() {
  return [...openModals].some((close) => close.isDirty?.());
}

export function modal(html, { wide = false, onClose, autosave = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
    <button class="modal-close icon-btn" aria-label="Sluiten">✕</button>${html}</div>`;
  const box = wrap.querySelector('.modal');
  const close = () => {
    if (!openModals.has(close)) return;
    openModals.delete(close);
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  // Heb je al iets ingevuld of gewijzigd, dan sluit het venster niet per ongeluk
  close.isDirty = () => wrap.isConnected && wrap.dataset.dirty === '1';
  // Zoekvelden en vensters die elke wijziging meteen opslaan (autosave) tellen niet als ‘niet opgeslagen’
  const markDirty = (e) => {
    if (!autosave && !(e.target instanceof HTMLInputElement && e.target.type === 'search')) wrap.dataset.dirty = '1';
  };
  wrap.addEventListener('input', markDirty);
  wrap.addEventListener('change', markDirty);
  // Escape sluit alleen het bovenste venster (er kan een scanner boven een ander venster openstaan)
  const onKey = (e) => {
    if (e.key !== 'Escape' || [...document.querySelectorAll('.modal-backdrop')].at(-1) !== wrap) return;
    if (close.isDirty() && !window.confirm('Je hebt iets ingevuld dat nog niet is opgeslagen. Venster toch sluiten?')) return;
    close();
  };
  // Naast het venster tikken sluit het alleen als je daar ook begon (niet na tekst selecteren of slepen)
  // en alleen bij vensters zonder invulvelden. Een formulier sluit je met ✕, Annuleren of Opslaan.
  let downOnBackdrop = false;
  wrap.addEventListener('pointerdown', (e) => { downOnBackdrop = e.target === wrap; });
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.modal-close')) return close();
    if (e.target !== wrap) return;
    const hasFields = !!box.querySelector('input:not([type=hidden]):not([type=search]), textarea, select');
    if (downOnBackdrop && !hasFields) return close();
    box.classList.remove('nudge');
    void box.offsetWidth; // animatie opnieuw starten
    box.classList.add('nudge');
  });
  // Enter in een formulier met meerdere velden: naar het volgende veld in plaats van meteen opslaan
  // (de ‘Ga’-toets op een telefoontoetsenbord verstuurde anders het halve formulier)
  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || ['submit', 'button', 'checkbox', 'radio', 'file', 'search'].includes(el.type)) return;
    const form = el.form;
    if (!form) return;
    const fields = [...form.querySelectorAll('input, select, textarea')]
      .filter((f) => !f.disabled && f.type !== 'hidden' && !f.closest('[hidden]') && f.offsetParent !== null);
    if (fields.length < 3) return; // kleine formulieren (één zoekveld of één regel) mogen met Enter
    e.preventDefault();
    const next = fields[fields.indexOf(el) + 1];
    if (next) next.focus();
    else form.querySelector('button[type=submit], button:not([type])')?.focus();
  });
  document.addEventListener('keydown', onKey);
  openModals.add(close);
  document.body.append(wrap);
  const first = wrap.querySelector('input, select, textarea');
  first?.focus();
  return { el: box, close };
}

export function confirmDialog(message, okLabel = 'Verwijderen') {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal(`<p class="confirm-msg">${esc(message)}</p>
      <div class="row end"><button class="btn" data-no>Annuleren</button><button class="btn btn-danger" data-yes>${esc(okLabel)}</button></div>`,
    { onClose: () => !answered && resolve(false) });
    m.el.querySelector('[data-no]').onclick = () => m.close();
    m.el.querySelector('[data-yes]').onclick = () => { answered = true; resolve(true); m.close(); };
  });
}

/** Eenvoudige markdown → HTML voor Claude-antwoorden (vet, lijstjes, alinea's). */
export function miniMarkdown(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<em>$2</em>');
    const li = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (li) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${li[1]}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^#{1,4}\s/.test(line)) html += `<h4>${line.replace(/^#+\s/, '')}</h4>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

/** Lees een bestand als { media_type, data (base64) }. Grote foto's worden verkleind tot max. 1600 px. */
export async function readImageFile(file, maxSize = 1600) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return { media_type: file.type, data: dataUrl.split(',')[1], preview: dataUrl };
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', 0.85);
  return { media_type: 'image/jpeg', data: out.split(',')[1], preview: out };
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const NUTRIENT_LABELS = {
  kcal: ['Energie', 'kcal'],
  protein: ['Eiwit', 'g'],
  carbs: ['Koolhydraten', 'g'],
  sugar: ['  waarvan suikers', 'g'],
  fat: ['Vet', 'g'],
  sat_fat: ['  waarvan verzadigd', 'g'],
  fiber: ['Vezels', 'g'],
  salt: ['Zout', 'g'],
};

// Referentie-inname volwassene (EU) voor %RI
export const REFERENCE_INTAKE = { kcal: 2000, protein: 50, carbs: 260, sugar: 90, fat: 70, sat_fat: 20, fiber: 30, salt: 6 };

// ---------- Gekozen persoon (dagboek) ----------
// Per apparaat onthouden wie het dagboek bijhoudt; werkt ook zonder opslag (privévenster).
const PERSON_KEY = 'maaltijden-persoon';
export function savedPerson() {
  try { return Number(localStorage.getItem(PERSON_KEY)) || null; } catch { return null; }
}
export function rememberPerson(id) {
  try { localStorage.setItem(PERSON_KEY, String(id)); } catch { /* geen opslag */ }
}

// Bij deze momenten geen optie om vlees of vis toe te voegen (wel aan te passen als er al iets bij staat)
export const NO_MEAT_MEALS = ['ontbijt', 'lunch'];
export const meatOffered = (meal) => !NO_MEAT_MEALS.includes(String(meal).toLowerCase());

// Planner → recepteditor: welke geplande maaltijd aan het nieuwe recept gekoppeld moet worden
export const PLAN_LINK_KEY = 'maaltijden-plan-koppeling';
export function pendingPlanLink() {
  try {
    const link = JSON.parse(sessionStorage.getItem(PLAN_LINK_KEY) || 'null');
    return link && Date.now() - link.at < 2 * 60 * 60 * 1000 ? link : null;
  } catch { return null; }
}
export function clearPlanLink() {
  try { sessionStorage.removeItem(PLAN_LINK_KEY); } catch { /* geen opslag */ }
}
