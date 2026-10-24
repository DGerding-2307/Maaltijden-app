// Vandaag (v4): het maatje, je calorieën van vandaag en wat je at. Startscherm van de app.
import { api, liveSync } from '../api.js';
import { $, $$, esc, num, todayISO, addDays, mondayOf, modal, toast, savedPerson, rememberPerson } from '../util.js';
import { buddySvg, setMood, pet } from '../buddy.js';
import { openLog, editEntry, showReaction, MEALS, forgetBuddy } from '../log.js';
import { reminderCard, enablePush } from '../reminders.js';

const MEAL_ICONS = { ontbijt: '🥣', lunch: '🥪', diner: '🍽️', tussendoor: '🍎' };
const PET_LINES = ['Woef! 🐾', 'Hihi, dat kriebelt!', 'Nog een aai? 💛', 'Jij bent mijn favoriete mens!', 'Kwispel kwispel!'];
const timeOf = (created) => {
  const d = new Date(`${String(created).replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
};

function ring(eaten, target) {
  const size = 140; const r = 58; const c = 2 * Math.PI * r;
  const f = Math.min(eaten / (target || 1), 1);
  return `<svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="ring-bg" cx="70" cy="70" r="${r}" fill="none" stroke-width="13"/>
    <circle class="ring-fg" cx="70" cy="70" r="${r}" fill="none" stroke-width="13" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" ${f > 0 ? '' : 'opacity="0"'}/></svg>`;
}
const hearts = (n) => `<span class="hearts" aria-label="${n} van 5 hartjes">${'♥'.repeat(n)}<i>${'♥'.repeat(5 - n)}</i></span>`;

export async function render(root, params) {
  const { people } = await api.get('/people');
  const me = window.__maaltijdenUser;
  let person = people.find((p) => p.id === Number(params.persoon)) || people.find((p) => p.id === savedPerson()) || people[0];
  rememberPerson(person.id);
  const date = todayISO();
  const canSwitch = people.length > 1 && (!me || me.is_admin);

  root.innerHTML = `<div class="today">
    <div data-buddy></div>
    <div>
      <div class="card day-card" data-day></div>
      <div class="sec-head"><h2>Vandaag gegeten</h2>
        ${canSwitch ? `<select class="input" data-person style="width:auto" aria-label="Wie">${people.map((p) => `<option value="${p.id}" ${p.id === person.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
        <button class="btn small btn-primary" data-log>+ Loggen</button></div>
      <div class="card" data-meals style="padding:.4rem 1rem"></div>
    </div>
    <div class="side">
      <div class="card"><div class="card-head"><h2>Deze week</h2><a class="small" href="#/dagboek?persoon=${person.id}">Dagboek & gewicht ›</a></div><div class="weekbars" data-week></div></div>
      <div data-reminders></div>
    </div>
  </div>`;

  const after = () => { forgetBuddy(); load(); };
  const log = (opts = {}) => openLog({ personId: person.id, date, onDone: after, ...opts });
  $('[data-log]', root).addEventListener('click', () => log());
  $('[data-person]', root)?.addEventListener('change', (e) => { location.hash = `#/vandaag?persoon=${e.target.value}`; });

  async function load() {
    const ws = mondayOf(date);
    const [day, buddy, week] = await Promise.all([
      api.get(`/diary?persoon=${person.id}&datum=${date}`),
      api.get(`/buddy?persoon=${person.id}`),
      api.get(`/diary/summary?persoon=${person.id}&van=${ws}&tot=${addDays(ws, 6)}`),
    ]);
    drawBuddy(buddy);
    drawDay(day);
    drawMeals(day);
    drawWeek(week);
    return buddy;
  }

  function drawBuddy(b) {
    const box = $('[data-buddy]', root);
    box.innerHTML = `<div class="buddy-card">
      <div class="buddy-top"><div><div class="buddy-name">${esc(b.name)} <button type="button" data-rename title="Naam wijzigen" aria-label="Naam van je maatje wijzigen">✏️</button></div>${hearts(b.hearts)}</div>
        ${b.streak ? `<span class="streak" title="Dagen achter elkaar gelogd">🔥 ${b.streak} ${b.streak === 1 ? 'dag' : 'dagen'}</span>` : ''}</div>
      <div class="buddy-blob" data-pet title="Aai ${esc(b.name)}">${buddySvg({ mood: b.mood, label: `${b.name}, je maatje` })}</div>
      <div class="bubble" data-say aria-live="polite">${esc(b.text)}</div>
    </div>`;
    $('[data-pet]', box).addEventListener('click', () => {
      pet($('[data-pet]', box));
      const say = $('[data-say]', box);
      say.textContent = PET_LINES[Math.floor(Math.random() * PET_LINES.length)];
      say.classList.remove('pop'); void say.offsetWidth; say.classList.add('pop');
    });
    $('[data-rename]', box).addEventListener('click', () => onboarding(b, { only: 'name' }));
  }

  function drawDay(day) {
    const t = day.targets; const n = day.totals;
    const left = Math.round(t.kcal - n.kcal);
    const mac = (label, v, target, color) => `<div class="mac"><div class="t">${label} <span>${num(v, 0)} / ${num(target, 0)} g</span></div>
      <div class="bar"><i style="width:${Math.min(100, (v / (target || 1)) * 100)}%;background:var(${color})"></i></div></div>`;
    $('[data-day]', root).innerHTML = `<div class="ring ${left < 0 ? 'over' : ''}">${ring(n.kcal, t.kcal)}
        <div class="v"><b>${num(Math.abs(left), 0)}</b><small>${left >= 0 ? 'kcal over' : 'kcal te veel'}</small></div></div>
      <div>${mac('Eiwit', n.protein, t.protein, '--m-p')}${mac('Koolhydraten', n.carbs, t.carbs, '--m-c')}${mac('Vet', n.fat, t.fat, '--m-f')}
        <p class="muted small" style="margin:.3rem 0 0">${num(n.kcal, 0)} van ${num(t.kcal, 0)} kcal gegeten</p></div>`;
  }

  function drawMeals(day) {
    const rows = [];
    for (const m of MEALS) {
      const block = day.meals.find((x) => x.meal === m);
      for (const e of block.entries) {
        rows.push(`<button type="button" class="meal-row" data-entry="${e.id}">
          <span class="meal-thumb">${e.photo ? `<img src="${esc(e.photo)}" alt="">` : MEAL_ICONS[m]}</span>
          <span class="m"><span class="k">${m}${timeOf(e.created_at) ? ` · ${timeOf(e.created_at)}` : ''}</span><span class="n">${esc(e.name)}</span>
            <span class="score s-${esc(e.level)}">🐾 ${esc(e.label)}</span></span>
          <span class="kc">${num(e.kcal, 0)}</span></button>`);
      }
      const planned = day.planned.filter((p) => !p.logged && (p.meal === m || (m === 'tussendoor' && !MEALS.includes(p.meal))));
      for (const p of planned) {
        rows.push(`<div class="meal-row"><span class="meal-thumb">${MEAL_ICONS[m]}</span>
          <span class="m"><span class="k">${m} · gepland</span><span class="n">${esc(p.title)}</span></span>
          <button type="button" class="planned-chip" data-eaten="${p.id}">✓ Gegeten</button></div>`);
      }
      if (!block.entries.length && !planned.length && m !== 'tussendoor') {
        rows.push(`<button type="button" class="meal-row add" data-add="${m}"><span class="meal-thumb">＋</span>
          <span class="m"><span class="k">${m}</span><span class="n">${m.charAt(0).toUpperCase() + m.slice(1)} toevoegen</span></span></button>`);
      }
    }
    rows.push('<button type="button" class="meal-row add" data-add="tussendoor"><span class="meal-thumb">＋</span><span class="m"><span class="k">tussendoor</span><span class="n">Iets tussendoor toevoegen</span></span></button>');
    const box = $('[data-meals]', root);
    box.innerHTML = rows.join('');
    $$('[data-add]', box).forEach((b) => b.addEventListener('click', () => log({ meal: b.dataset.add })));
    $$('[data-entry]', box).forEach((b) => b.addEventListener('click', () => editEntry(Number(b.dataset.entry), { personId: person.id, onDone: after })));
    $$('[data-eaten]', box).forEach((b) => b.addEventListener('click', async () => {
      const p = day.planned.find((x) => x.id === Number(b.dataset.eaten));
      b.disabled = true;
      try {
        if (p.recipe_id) {
          const r = await api.post('/diary', { person_id: person.id, date, meal: MEALS.includes(p.meal) ? p.meal : 'tussendoor', type: 'recipe', recipe_id: p.recipe_id, servings: 1, plan_entry_id: p.id });
          showReaction(r.reaction, person.id);
        } else await api.post('/diary/from-plan', { person_id: person.id, date, plan_entry_id: p.id });
        after();
      } catch (err) { toast(err.message, 'error'); b.disabled = false; }
    }));
  }

  function drawWeek(week) {
    const max = Math.max(week.target_kcal * 1.2, ...week.days.map((d) => d.kcal));
    $('[data-week]', root).innerHTML = week.days.map((d) => `<a href="#/dagboek?persoon=${person.id}&datum=${d.date}" class="${d.date === date ? 'on' : ''}" title="${num(d.kcal, 0)} kcal">
      <i style="height:${Math.max(4, (d.kcal / max) * 90)}px"></i>${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'][(new Date(`${d.date}T12:00`).getDay() + 6) % 7]}</a>`).join('');
  }

  // ---------- Kennismaking (eerste keer) ----------
  function onboarding(b, { only = null } = {}) {
    let name = b.name;
    let step = 1;
    const md = modal('<div class="onboard" data-ob></div>');
    const box = $('[data-ob]', md.el);
    const dots = () => (only ? '' : `<div class="steps-dots">${[1, 2, 3].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`);
    const finish = async () => {
      await api.put('/buddy', { person_id: person.id, name, onboarded: true });
      md.close();
      after();
    };
    function stepName() {
      box.innerHTML = `${dots()}<div class="buddy-blob">${buddySvg({ mood: 'blij' })}</div>
        <h2>${only ? 'Hoe zal ik heten?' : 'Hoi! Ik ben je nieuwe maatje'}</h2>
        <p>${only ? 'Kies een naam of typ zelf iets.' : 'Ik help je gezond te eten en juich voor elke maaltijd die je logt. Hoe zal ik heten?'}</p>
        <input class="input" data-name value="${esc(name)}" maxlength="24" aria-label="Naam van je maatje">
        <div class="name-chips">${b.suggestions.map((n) => `<button type="button" class="${n === name ? 'on' : ''}" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <button class="btn btn-primary cta" data-next>${only ? 'Opslaan' : 'Verder'}</button>`;
      const input = $('[data-name]', box);
      input.addEventListener('input', () => { name = input.value; $$('[data-n]', box).forEach((x) => x.classList.toggle('on', x.dataset.n === name)); });
      $$('[data-n]', box).forEach((x) => x.addEventListener('click', () => { name = x.dataset.n; input.value = name; $$('[data-n]', box).forEach((y) => y.classList.toggle('on', y === x)); }));
      $('[data-next]', box).addEventListener('click', async () => {
        name = input.value.trim() || 'Bolletje';
        if (only) { await api.put('/buddy', { person_id: person.id, name }); md.close(); after(); return; }
        step = 2; stepGoal();
      });
    }
    function stepGoal() {
      box.innerHTML = `${dots()}<div class="buddy-blob">${buddySvg({ mood: 'trots' })}</div>
        <h2>Wat is je doel?</h2><p>Dan weet ${esc(name)} hoeveel je per dag ongeveer nodig hebt.</p>
        <div class="goal-choices">
          ${[['afvallen', '⬇️ Afvallen', 'rustig, ± 500 kcal per dag minder'], ['onderhoud', '⚖️ Op gewicht blijven', 'gezond en gevarieerd eten'], ['aankomen', '⬆️ Aankomen', '± 300 kcal per dag extra']]
            .map(([v, l, s]) => `<label><input type="radio" name="goal" value="${v}" ${(person.goal || 'onderhoud') === v ? 'checked' : ''}><span>${l}<small>${s}</small></span></label>`).join('')}
        </div>
        <p class="small">Lengte, gewicht en leeftijd invullen voor een persoonlijk doel kan later bij <a href="#/instellingen">Instellingen</a>.</p>
        <button class="btn btn-primary cta" data-next>Verder</button>`;
      $('[data-next]', box).addEventListener('click', async () => {
        const goal = $('[name=goal]:checked', box)?.value || 'onderhoud';
        await api.put(`/people/${person.id}`, { goal }).catch(() => {});
        step = 3; stepRemind();
      });
    }
    async function stepRemind() {
      const r = await api.get(`/reminders?persoon=${person.id}`);
      box.innerHTML = `${dots()}<div class="buddy-blob">${buddySvg({ mood: 'hongerig' })}</div>
        <h2>Zal ik je herinneren?</h2><p>Ik stuur een berichtje rond ontbijt, lunch en diner – alleen als je nog niets gelogd hebt.</p>
        <button class="btn btn-primary cta" data-yes>🔔 Ja, graag!</button>
        <div class="save-own"><button class="btn btn-ghost" data-no>Nu niet</button></div>`;
      $('[data-no]', box).addEventListener('click', finish);
      $('[data-yes]', box).addEventListener('click', async () => {
        await api.put('/reminders', { person_id: person.id, enabled: true });
        try {
          if (/MaaltijdenApp/.test(navigator.userAgent)) {
            await api.put('/buddy', { person_id: person.id, name, onboarded: true });
            location.href = `http://localhost/?meldingen=${encodeURIComponent(r.schedule_url)}&terug=${encodeURIComponent(location.href)}`;
            return;
          }
          await enablePush(person.id, r.push_public_key);
          toast(`${name} stuurt je herinneringen 🐶`, 'success');
        } catch (err) { toast(err.message, 'error'); }
        finish();
      });
    }
    stepName();
  }

  const buddy = await load();
  reminderCard($('[data-reminders]', root), person.id).catch(() => {});
  if (!buddy.onboarded) onboarding(buddy);
  else if (params.log) log({ meal: params.log });
  // Even later nog eens kijken: stemming hangt van het uur af (hongerig, slaperig)
  const moodTimer = setInterval(async () => {
    if (document.hidden) return;
    const b = await api.get(`/buddy?persoon=${person.id}`).catch(() => null);
    const el = $('[data-pet]', root);
    if (b && el) { setMood(el, b.mood); }
  }, 5 * 60 * 1000);
  const stop = liveSync(load);
  window.addEventListener('maaltijden-logged', after);
  return () => { stop(); clearInterval(moodTimer); window.removeEventListener('maaltijden-logged', after); };
}
