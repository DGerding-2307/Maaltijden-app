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
export function modal(html, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
    <button class="modal-close icon-btn" aria-label="Sluiten">✕</button>${html}</div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('.modal-close')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  const first = wrap.querySelector('input, select, textarea');
  first?.focus();
  return { el: wrap.querySelector('.modal'), close };
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
