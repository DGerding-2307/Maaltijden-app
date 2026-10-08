import { api, meta, liveSync } from '../api.js';
import { meatDialog, extrasDialog, meatOptions, defaultPortion } from '../meat.js';
import {
  $, $$, esc, euro, num, addDays, mondayOf, todayISO, fmtDate, weekNumber, DAY_NAMES, toast, modal, confirmDialog, debounce, minutes,
  savedPerson, rememberPerson,
} from '../util.js';

export async function render(root, params) {
  const m = await meta();
  const start = mondayOf(params.week || todayISO());
  const meals = m.meals;
  let recipes = [];
  let plan;
  // Dagboek: wie heeft wat gegeten (per apparaat onthouden)
  const { people } = await api.get('/people');
  let person = people.find((p) => p.id === savedPerson()) || people[0];

  async function load() {
    [plan, recipes] = await Promise.all([api.get(`/plan?week=${start}&persoon=${person.id}`), recipes.length ? recipes : api.get('/recipes?sort=title')]);
    draw();
  }

  function entryCard(e) {
    const title = e.recipe_id ? e.recipe_title : (e.title || (e.extras?.length ? e.extras.map((x) => x.name).join(', ') : 'Losse ingrediënten'));
    return `<div class="plan-entry ${e.recipe_id ? '' : 'free'} ${e.leftover_of ? 'leftover' : ''}" draggable="true" data-entry="${e.id}">
      <a class="plan-entry-title" ${e.recipe_id ? `href="#/recept/${e.recipe_id}?personen=${e.servings}"` : ''}>${e.leftover_of ? '♻️ ' : ''}${esc(title)}</a>
      ${e.leftover_of ? '<span class="muted small">restjes – geen boodschappen</span>' : ''}
      ${!e.recipe_id && e.extras?.length ? '<button class="plan-extras" data-ingredients title="Ingrediënten en hoeveelheden wijzigen">🥕 ingrediënten wijzigen</button>'
        : e.extras?.length ? `<button class="plan-extras" data-meat title="Vlees of vis wijzigen">🥩 + ${e.extras.map((x) => esc(x.name)).join(', ')}</button>`
        : e.recipe_id && !e.has_meat && !e.leftover_of ? '<button class="plan-extras add" data-meat title="Vlees of vis bij dit gerecht kiezen">🥩 + Vlees of vis</button>' : ''}
      ${e.note && !e.leftover_of ? `<span class="muted small">${esc(e.note)}</span>` : ''}
      <div class="plan-entry-meta">
        <span class="servings-ctl">
          <button class="mini" data-serv="-1" aria-label="Minder personen">−</button>
          <span title="personen">👤 ${e.servings}</span>
          <button class="mini" data-serv="1" aria-label="Meer personen">+</button>
        </span>
        ${e.recipe_id && !e.leftover_of ? `<span class="muted">${euro(e.cost_cents)}</span>` : ''}
        ${e.recipe_id && e.date <= todayISO() ? `<button class="eat-toggle ${e.eaten ? 'on' : ''}" data-eat aria-pressed="${!!e.eaten}"
          title="${e.eaten ? `Staat in het dagboek van ${esc(person.name)}` : `Als gegeten in het dagboek van ${esc(person.name)} zetten`}">${e.eaten ? '✓ gegeten' : 'gegeten?'}</button>` : ''}
      </div>
      <div class="entry-actions">
        <button class="mini" data-entry-menu aria-label="Verplaatsen, restjes, bewerken" title="Verplaatsen, restjes, bewerken">⋯</button>
        <button class="mini danger" data-remove aria-label="Verwijderen" title="Verwijderen">✕</button>
      </div>
    </div>`;
  }

  function draw() {
    const today = todayISO();
    const daysWithFood = plan.days.filter((d) => d.entries.some((e) => e.recipe_id));
    const avgKcal = daysWithFood.length ? daysWithFood.reduce((s, d) => s + d.nutrition_per_person.kcal, 0) / daysWithFood.length : 0;
    const planned = plan.days.reduce((s, d) => s + d.entries.length, 0);
    const budget = m.weekly_budget_cents;
    root.innerHTML = `
      <div class="page-head">
        <div class="week-nav">
          <a class="btn icon-btn" href="#/planner?week=${addDays(start, -7)}" aria-label="Vorige week">‹</a>
          <div class="week-title">
            <h1>Week ${weekNumber(start)}</h1>
            <span class="muted">${fmtDate(start)} – ${fmtDate(addDays(start, 6), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <a class="btn icon-btn" href="#/planner?week=${addDays(start, 7)}" aria-label="Volgende week">›</a>
          ${start !== mondayOf(today) ? '<a class="btn btn-ghost" href="#/planner">Vandaag</a>' : ''}
        </div>
        <div class="actions">
          ${people.length > 1 ? `<label class="plan-person" title="Dagboek van">👤 <select class="input" data-person aria-label="Dagboek van">
            ${people.map((p) => `<option value="${p.id}" ${p.id === person.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
          <button class="btn btn-ai" data-action="ai">✨ Weekmenu met Claude</button>
          <a class="btn" href="#/boodschappen?week=${start}">🛒 Boodschappenlijst</a>
          <details class="menu">
            <summary class="btn btn-ghost" aria-label="Meer acties">⋯</summary>
            <div class="menu-items">
              <button data-action="copy-prev">Kopieer vorige week hierheen</button>
              <button data-action="copy-next">Kopieer deze week naar volgende week</button>
              <button data-action="print">Weekmenu afdrukken</button>
              <button data-action="clear" class="danger">Week leegmaken</button>
            </div>
          </details>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><span class="stat-label">Weekkosten (geschat)</span><span class="stat-value">${euro(plan.total_cost_cents)}</span>
          ${budget ? `<span class="stat-sub ${plan.total_cost_cents > budget ? 'bad' : 'good'}">budget ${euro(budget)}</span>` : ''}</div>
        <div class="stat"><span class="stat-label">Gem. per dag p.p.</span><span class="stat-value">${num(avgKcal, 0)} kcal</span>
          <span class="stat-sub">van geplande maaltijden</span></div>
        <div class="stat"><span class="stat-label">Ingepland</span><span class="stat-value">${planned}</span><span class="stat-sub">maaltijden</span></div>
      </div>

      <nav class="day-jump" aria-label="Ga naar dag">
        ${plan.days.map((d, i) => `<a href="#day-${d.date}" data-jump="${d.date}" class="${d.date === today ? 'today' : ''} ${d.entries.length ? '' : 'empty'}">
          ${DAY_NAMES[i].slice(0, 2)}<strong>${Number(d.date.slice(8))}</strong><span class="dot"></span></a>`).join('')}
      </nav>
      <div class="planner-layout">
        <div class="week-grid" style="--meals:${meals.length}">
          ${plan.days.map((d, i) => `
            <section class="day ${d.date === today ? 'today' : ''} ${d.date < today ? 'past' : ''}" id="day-${d.date}">
              <header class="day-head">
                <strong>${DAY_NAMES[i]}</strong> <span class="muted">${fmtDate(d.date)}</span>
              </header>
              ${meals.map((meal) => `
                <div class="slot" data-date="${d.date}" data-meal="${esc(meal)}">
                  <div class="slot-label">${esc(meal)}</div>
                  ${d.entries.filter((e) => e.meal === meal).map(entryCard).join('')}
                  <button class="slot-add" data-add aria-label="Toevoegen aan ${esc(meal)} op ${DAY_NAMES[i]}">+</button>
                </div>`).join('')}
              ${d.entries.some((e) => !meals.includes(e.meal)) ? `<div class="slot"><div class="slot-label">extra</div>${d.entries.filter((e) => !meals.includes(e.meal)).map(entryCard).join('')}</div>` : ''}
              <footer class="day-foot">
                ${d.entries.length ? `<span title="per persoon">${num(d.nutrition_per_person.kcal, 0)} kcal p.p.</span><span>${euro(d.cost_cents)}</span>` : '<span class="muted">Nog niets gepland</span>'}
              </footer>
              ${d.diary && (d.diary.entries || d.date <= today) ? `<a class="day-diary" href="#/dagboek?datum=${d.date}&persoon=${person.id}" title="Dagboek ${esc(person.name)}">
                <span class="${d.diary.kcal > d.diary.target_kcal ? 'bad' : ''}">🔥 ${d.diary.entries ? `${num(d.diary.kcal, 0)}/${num(d.diary.target_kcal, 0)}` : '–'}</span>
                ${d.diary.weight_kg ? `<span>⚖️ ${num(d.diary.weight_kg, 1)} kg</span>` : ''}</a>` : ''}
            </section>`).join('')}
        </div>

        <aside class="recipe-dock">
          <h3>Sleep een recept naar een dag</h3>
          <input type="search" class="input" placeholder="Zoek recept…" data-dock-search>
          <div class="dock-filters">
            <label><input type="checkbox" data-dock-fav> Alleen favorieten</label>
          </div>
          <div class="dock-list"></div>
        </aside>
      </div>`;
    drawDock();
    bind();
  }

  function drawDock() {
    const q = ($('[data-dock-search]', root)?.value || '').toLowerCase();
    const fav = $('[data-dock-fav]', root)?.checked;
    const list = recipes.filter((r) => (!fav || r.favorite) && (!q || r.title.toLowerCase().includes(q) || r.tags.join(' ').includes(q)));
    $('.dock-list', root).innerHTML = list.map((r) => `
      <div class="dock-item" draggable="true" data-recipe="${r.id}">
        <span>${r.favorite ? '★ ' : ''}${esc(r.title)}</span>
        <span class="muted small">${minutes(r.total_minutes)} · ${euro(r.cost_per_serving_cents)} p.p.</span>
      </div>`).join('') || '<p class="muted">Geen recepten gevonden.</p>';
  }

  function bind() {
    $('[data-dock-search]', root).addEventListener('input', debounce(drawDock, 150));
    $('[data-dock-fav]', root).addEventListener('change', drawDock);


    // Drag & drop naar dagvakken
    $$('.slot', root).forEach((slot) => {
      slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drop'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drop'));
      slot.addEventListener('drop', async (e) => {
        e.preventDefault();
        slot.classList.remove('drop');
        const { date, meal } = slot.dataset;
        const entryId = e.dataTransfer.getData('text/entry');
        const recipeId = e.dataTransfer.getData('text/recipe');
        try {
          if (entryId) {
            if (e.ctrlKey || e.altKey) {
              const src = plan.days.flatMap((d) => d.entries).find((x) => String(x.id) === entryId);
              await api.post('/plan', { date, meal, recipe_id: src.recipe_id, title: src.title, servings: src.servings });
            } else await api.put(`/plan/${entryId}`, { date, meal });
          } else if (recipeId) {
            await api.post('/plan', { date, meal, recipe_id: Number(recipeId), servings: m.default_servings });
          }
          await load();
        } catch (err) { toast(err.message, 'error'); }
      });
    });
  }

  async function onClick(e) {
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      e.preventDefault(); // geen hash-navigatie: alleen naar de dag scrollen
      document.getElementById(`day-${jump.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const entryEl = e.target.closest('[data-entry]');
    const entry = entryEl && plan.days.flatMap((d) => d.entries).find((x) => String(x.id) === entryEl.dataset.entry);
    try {
      if (e.target.closest('[data-serv]') && entry) {
        const servings = Math.max(1, entry.servings + Number(e.target.closest('[data-serv]').dataset.serv));
        await api.put(`/plan/${entry.id}`, { servings });
        return load();
      }
      if (e.target.closest('[data-entry-menu]') && entry) return entryMenu(entry);
      if (e.target.closest('[data-meat]') && entry) return meatDialog(entry, load);
      if (e.target.closest('[data-ingredients]') && entry) return extrasDialog(entry, load, { mode: 'all' });
      if (e.target.closest('[data-eat]') && entry) {
        if (entry.eaten) {
          const day = await api.get(`/diary?persoon=${person.id}&datum=${entry.date}`);
          for (const x of day.meals.flatMap((m) => m.entries).filter((x) => x.plan_entry_id === entry.id)) await api.del(`/diary/${x.id}`);
        } else {
          await api.post('/diary/from-plan', { person_id: person.id, date: entry.date, plan_entry_id: entry.id });
          toast(`In het dagboek van ${person.name} gezet (1 portie)`, 'success');
        }
        return load();
      }
      if (e.target.closest('[data-remove]') && entry) {
        await api.del(`/plan/${entry.id}`);
        return load();
      }
      if (e.target.closest('[data-add]')) {
        const slot = e.target.closest('.slot');
        return pickRecipe(slot.dataset.date, slot.dataset.meal);
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      e.target.closest('details')?.removeAttribute('open');
      if (action === 'ai') return aiWeekMenu();
      if (action === 'copy-prev') {
        const { copied } = await api.post('/plan/copy-week', { from: addDays(start, -7), to: start });
        toast(`${copied} maaltijden gekopieerd`);
        return load();
      }
      if (action === 'copy-next') {
        const { copied } = await api.post('/plan/copy-week', { from: start, to: addDays(start, 7) });
        toast(`${copied} maaltijden gekopieerd naar volgende week`);
        return;
      }
      if (action === 'clear') {
        if (!(await confirmDialog('Alle maaltijden van deze week verwijderen?', 'Leegmaken'))) return;
        await api.post('/plan/clear-week', { week: start });
        return load();
      }
      if (action === 'print') window.print();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // Werkt ook op telefoon (waar slepen niet kan): verplaatsen, restjes inplannen, titel/notitie bewerken.
  function entryMenu(entry) {
    const title = entry.recipe_id ? entry.recipe_title : entry.title;
    const nextDay = addDays(entry.date, 1);
    const allMeals = [...new Set([...meals, entry.meal])];
    const md = modal(`
      <h2>${esc(title)}</h2>
      <div class="row wrap">
        <button type="button" class="btn" data-menu-meat>🥩 ${entry.extras?.length ? 'Vlees, vis of extra’s wijzigen' : 'Vlees of vis erbij'}</button>
      </div>
      <form class="form" data-move>
        <h3>Verplaatsen of aanpassen</h3>
        <div class="grid-2">
          <label>Dag <input type="date" class="input" name="date" value="${entry.date}" required></label>
          <label>Moment <select class="input" name="meal">${allMeals.map((x) => `<option ${x === entry.meal ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>Personen <input type="number" class="input" min="1" name="servings" value="${entry.servings}"></label>
          ${entry.recipe_id ? '' : `<label>Titel <input class="input" name="title" value="${esc(entry.title || '')}"></label>`}
          <label class="span-2">Notitie <input class="input" name="note" value="${esc(entry.note || '')}" placeholder="bv. ‘dubbele portie koken’"></label>
        </div>
        <div class="row end"><button class="btn btn-primary">Opslaan</button></div>
      </form>
      ${entry.recipe_id && !entry.leftover_of ? `<hr>
      <form class="form" data-leftovers>
        <h3>♻️ Restjes inplannen</h3>
        <p class="muted small">Kook je meer dan je opeet? Plan de restjes in: ze tellen mee voor de voedingswaarden, maar niet voor de boodschappen.</p>
        <div class="grid-2">
          <label>Dag <input type="date" class="input" name="date" value="${nextDay}"></label>
          <label>Moment <select class="input" name="meal">${meals.map((x) => `<option ${x === 'lunch' ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>Porties restjes <input type="number" class="input" min="1" name="servings" value="1"></label>
          <label class="check"><input type="checkbox" name="extra" checked> Kook ${'${n}'} porties extra</label>
        </div>
        <div class="row end"><button class="btn">Restjes inplannen</button></div>
      </form>` : ''}`);
    $('[data-menu-meat]', md.el).addEventListener('click', () => { md.close(); meatDialog(entry, load); });
    const lf = $('[data-leftovers]', md.el);
    if (lf) {
      const label = lf.extra.closest('label');
      const upd = () => { label.lastChild.textContent = ` Kook ${lf.servings.value} portie(s) extra bij deze maaltijd`; };
      lf.servings.addEventListener('input', upd);
      upd();
      lf.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const n = Number(lf.servings.value) || 1;
        await api.post(`/plan/${entry.id}/leftovers`, { date: lf.date.value, meal: lf.meal.value, servings: n });
        if (lf.extra.checked) await api.put(`/plan/${entry.id}`, { servings: entry.servings + n });
        toast('Restjes ingepland', 'success');
        md.close();
        load();
      });
    }
    $('[data-move]', md.el).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      await api.put(`/plan/${entry.id}`, {
        date: f.date.value, meal: f.meal.value, servings: Number(f.servings.value) || 1, note: f.note.value,
        ...(f.title ? { title: f.title.value } : {}),
      });
      md.close();
      load();
    });
  }

  async function pickRecipe(date, meal) {
    const meats = await meatOptions();
    const sides = recipes.filter((r) => r.is_side);
    const md = modal(`
      <h2>Toevoegen: ${esc(meal)} op ${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
      <div class="row">
        <input type="search" class="input grow" placeholder="Zoek recept…" data-q>
        <label class="inline">👤 <input type="number" class="input narrow" min="1" value="${m.default_servings}" data-servings></label>
      </div>
      <label class="meat-pick">🥩 Vlees of vis erbij <span class="muted small">(optioneel)</span>
        <select class="input" data-meat-pick><option value="">– niets extra –</option>
          ${sides.length ? `<optgroup label="Gerechten">${sides.map((x) => `<option value="r${x.id}">${esc(x.title)}</option>`).join('')}</optgroup>` : ''}
          <optgroup label="Vlees, vis & vega">${meats.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</optgroup>
        </select></label>
      <div class="pick-list"></div>
      <hr>
      <form class="row" data-free>
        <input class="input grow" placeholder="Of vrije tekst, bv. ‘Uit eten’ of ‘Restjes’" data-free-title>
        <button class="btn">Toevoegen</button>
      </form>
      <div class="row wrap"><button class="btn" type="button" data-loose>🥕 Losse ingrediënten (zonder recept)</button>
        <span class="muted small">bv. kipschnitzel met friet en sla</span></div>`);
    const drawList = () => {
      const q = $('[data-q]', md.el).value.toLowerCase();
      const list = recipes.filter((r) => !q || r.title.toLowerCase().includes(q) || r.tags.join(' ').includes(q));
      $('.pick-list', md.el).innerHTML = list.map((r) => `
        <button class="pick-item" data-pick="${r.id}">
          <span>${r.favorite ? '★ ' : ''}${esc(r.title)}</span>
          <span class="muted small">${esc(r.category)} · ${minutes(r.total_minutes)} · ${num(r.kcal_per_serving, 0)} kcal · ${euro(r.cost_per_serving_cents)} p.p.</span>
        </button>`).join('') || '<p class="muted">Geen recepten gevonden.</p>';
    };
    drawList();
    $('[data-q]', md.el).addEventListener('input', drawList);
    const servings = () => Number($('[data-servings]', md.el).value) || m.default_servings;
    md.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-loose]')) {
        const { id } = await api.post('/plan', { date, meal, title: '', servings: servings() });
        md.close();
        const entry = { id, date, meal, servings: servings(), extras: [] };
        // Niets gekozen? Dan de lege maaltijd weer weghalen.
        return extrasDialog(entry, load, { mode: 'all', onClose: async (extras) => { if (!extras.length) await api.del(`/plan/${id}`); load(); } });
      }
      const pick = e.target.closest('[data-pick]');
      if (!pick) return;
      const v = $('[data-meat-pick]', md.el).value;
      const meat = meats.find((i) => i.id === Number(v));
      const extras = v.startsWith('r') ? [{ recipe_id: Number(v.slice(1)), quantity: 1 }] : meat ? [{ ingredient_id: meat.id, ...defaultPortion(meat) }] : [];
      await api.post('/plan', { date, meal, recipe_id: Number(pick.dataset.pick), servings: servings(), extras });
      md.close();
      load();
    });
    $('[data-free]', md.el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('[data-free-title]', md.el).value.trim();
      if (!title) return;
      await api.post('/plan', { date, meal, title, servings: servings() });
      md.close();
      load();
    });
  }

  function aiWeekMenu() {
    if (!m.claude.configured) {
      toast('Stel eerst je Claude API-sleutel in bij Instellingen', 'error');
      location.hash = '#/instellingen';
      return;
    }
    const md = modal(`
      <h2>✨ Weekmenu laten maken door Claude</h2>
      <p class="muted">Claude kiest uit je receptenboek en houdt rekening met je wensen, kooktijd, afwisseling en budget. Bestaande planning blijft staan.</p>
      <form class="form" data-form>
        <label>Wensen
          <textarea class="input" rows="3" name="preferences" placeholder="Bijv. 2x vegetarisch, maandag en woensdag snel klaar, vrijdag iets feestelijks, geen vis"></textarea>
        </label>
        <div class="row wrap">
          <fieldset class="inline-group"><legend>Momenten</legend>
            ${m.meals.map((meal) => `<label><input type="checkbox" name="meals" value="${esc(meal)}" ${meal === 'diner' ? 'checked' : ''}> ${esc(meal)}</label>`).join('')}
          </fieldset>
          <label>Personen <input class="input narrow" type="number" min="1" name="servings" value="${m.default_servings}"></label>
          <label>Budget week (€) <input class="input narrow" type="number" min="0" step="1" name="budget" value="${m.weekly_budget_cents ? m.weekly_budget_cents / 100 : ''}"></label>
        </div>
        <div class="row end"><button class="btn btn-ai" type="submit">Menu voorstellen</button></div>
      </form>
      <div data-result></div>`, { wide: true });
    const form = $('[data-form]', md.el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      btn.textContent = 'Claude denkt na…';
      const servingsVal = Number(fd.get('servings')) || m.default_servings;
      try {
        const result = await api.post('/ai/week-menu', {
          week: start,
          preferences: fd.get('preferences'),
          meals: fd.getAll('meals'),
          servings: servingsVal,
          budget_cents: fd.get('budget') ? Math.round(Number(fd.get('budget')) * 100) : null,
        });
        showSuggestions(md, result, servingsVal);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Opnieuw voorstellen';
      }
    });
  }

  function showSuggestions(md, result, servings) {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const box = $('[data-result]', md.el);
    box.innerHTML = `
      <div class="ai-summary">${esc(result.summary)}</div>
      <div class="suggestions">
        ${result.entries.map((s, i) => `
          <label class="suggestion">
            <input type="checkbox" data-sugg="${i}" ${s.recipe_id ? 'checked' : ''} ${s.recipe_id ? '' : 'disabled'}>
            <span class="sugg-day">${fmtDate(s.date, { weekday: 'short', day: 'numeric' })} · ${esc(s.meal)}</span>
            <span class="sugg-title">${s.recipe_id ? esc(byId.get(s.recipe_id)?.title) : `💡 ${esc(s.new_recipe_idea)}`}</span>
            <span class="muted small">${esc(s.reason)}</span>
            ${s.recipe_id ? '' : `<a class="small" href="#/importeren?idee=${encodeURIComponent(s.new_recipe_idea || '')}">Recept laten maken →</a>`}
          </label>`).join('')}
      </div>
      <div class="row end"><button class="btn btn-primary" data-apply>Geselecteerde inplannen</button></div>`;
    $('[data-apply]', box).addEventListener('click', async () => {
      const chosen = $$('[data-sugg]:checked', box).map((c) => result.entries[Number(c.dataset.sugg)]);
      for (const s of chosen) await api.post('/plan', { date: s.date, meal: s.meal, recipe_id: s.recipe_id, servings });
      toast(`${chosen.length} maaltijden ingepland`, 'success');
      md.close();
      load();
    });
  }

  function onDragStart(e) {
    const entry = e.target.closest('[data-entry]');
    const recipe = e.target.closest('[data-recipe]');
    if (entry) e.dataTransfer.setData('text/entry', entry.dataset.entry);
    if (recipe) e.dataTransfer.setData('text/recipe', recipe.dataset.recipe);
    e.dataTransfer.effectAllowed = entry ? 'copyMove' : 'copy';
  }

  function onChange(e) {
    if (!e.target.matches('[data-person]')) return;
    person = people.find((p) => p.id === Number(e.target.value)) || person;
    rememberPerson(person.id);
    load();
  }

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('dragstart', onDragStart);
  await load();
  // Op de telefoon staat de week onder elkaar: spring meteen naar vandaag
  if (window.matchMedia('(max-width: 720px)').matches && start === mondayOf(todayISO()) && !params.week) {
    document.getElementById(`day-${todayISO()}`)?.scrollIntoView({ block: 'start' });
  }
  const stopSync = liveSync(load);
  return () => {
    stopSync();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('dragstart', onDragStart);
  };
}
