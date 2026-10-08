// Kookmodus: grote letters, stap voor stap, scherm blijft aan, timers uit de tekst.
import { api } from '../api.js';
import { $, esc, toast } from '../util.js';
import { scaledLine } from './recipe.js';

export async function render(root, params) {
  const r = await api.get(`/recipes/${params.id}`);
  const persons = Number(params.personen) || r.servings;
  const factor = persons / r.servings;
  let step = -1; // -1 = ingrediëntenoverzicht
  let wakeLock = null;
  const timers = [];

  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* niet ondersteund */ }

  root.innerHTML = '<div class="view cook-mode"></div>';
  const view = $('.view', root);

  function findMinutes(text) {
    const m = text.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*(minuten|minuut|min|uur)/i);
    if (!m) return null;
    const n = Number(m[2] || m[1]);
    return /uur/i.test(m[3]) ? n * 60 : n;
  }

  function draw() {
    const total = r.steps.length;
    let body;
    if (step < 0) {
      body = `<h2>Klaarzetten voor ${persons} ${persons === 1 ? 'persoon' : 'personen'}</h2>
        <ul class="cook-ingredients">${r.ingredients.map((row) => `<li><label><input type="checkbox"> <strong>${scaledLine(row, factor)}</strong> ${esc(row.name)} ${row.note ? `<span class="muted">${esc(row.note)}</span>` : ''}</label></li>`).join('')}</ul>`;
    } else {
      const text = r.steps[step];
      const mins = findMinutes(text);
      body = `<div class="cook-step-num">Stap ${step + 1} van ${total}</div>
        <p class="cook-step">${esc(text)}</p>
        ${mins ? `<button class="btn btn-ai big" data-timer="${mins}">⏲ Start timer ${mins} min</button>` : ''}`;
    }
    view.innerHTML = `
      <div class="cook-top">
        <a class="btn btn-ghost" href="#/recept/${r.id}?personen=${persons}">✕ Sluiten</a>
        <strong>${esc(r.title)}</strong>
        <span class="muted">${wakeLock ? '💡 scherm blijft aan' : ''}</span>
      </div>
      <div class="progress"><span style="width:${((step + 1) / total) * 100}%"></span></div>
      <div class="cook-body">${body}</div>
      <div class="cook-timers">${timers.map((t, i) => `<div class="timer ${t.left <= 0 ? 'done' : ''}" data-tidx="${i}">⏲ ${fmt(t.left)} <span class="muted">${esc(t.label)}</span> <button class="mini" data-stop="${i}">✕</button></div>`).join('')}</div>
      <div class="cook-nav">
        <button class="btn big" data-prev ${step < 0 ? 'disabled' : ''}>← Vorige</button>
        ${step < total - 1 ? '<button class="btn btn-primary big" data-next>Volgende →</button>' : `<a class="btn btn-primary big" href="#/recept/${r.id}">Eet smakelijk! 🎉</a>`}
      </div>`;
  }

  function fmt(sec) {
    const s = Math.max(0, sec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const tick = setInterval(() => {
    if (!timers.length) return;
    for (const t of timers) {
      t.left--;
      if (t.left === 0) {
        toast(`⏰ Timer klaar: ${t.label}`, 'success');
        try {
          const ctx = new AudioContext();
          const o = ctx.createOscillator();
          o.connect(ctx.destination);
          o.frequency.value = 880;
          o.start();
          o.stop(ctx.currentTime + 0.8);
        } catch { /* geen geluid */ }
        navigator.vibrate?.([300, 100, 300]);
      }
    }
    const box = $('.cook-timers', view);
    if (box) box.innerHTML = timers.map((t, i) => `<div class="timer ${t.left <= 0 ? 'done' : ''}">⏲ ${fmt(t.left)} <span class="muted">${esc(t.label)}</span> <button class="mini" data-stop="${i}">✕</button></div>`).join('');
  }, 1000);

  view.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) { step = Math.min(r.steps.length - 1, step + 1); draw(); }
    if (e.target.closest('[data-prev]')) { step = Math.max(-1, step - 1); draw(); }
    const timer = e.target.closest('[data-timer]');
    if (timer) {
      timers.push({ left: Number(timer.dataset.timer) * 60, label: `stap ${step + 1}` });
      draw();
    }
    const stop = e.target.closest('[data-stop]');
    if (stop) { timers.splice(Number(stop.dataset.stop), 1); draw(); }
  });
  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); step = Math.min(r.steps.length - 1, step + 1); draw(); }
    if (e.key === 'ArrowLeft') { step = Math.max(-1, step - 1); draw(); }
  };
  document.addEventListener('keydown', onKey);
  document.body.classList.add('cooking');
  draw();

  return () => {
    clearInterval(tick);
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('cooking');
    wakeLock?.release?.();
  };
}
