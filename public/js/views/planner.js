import { api, meta, liveSync } from '../api.js';
import { meatDialog, extrasDialog, meatOptions, defaultPortion } from '../meat.js';
import { say } from '../say.js';
import {
  $, $$, esc, euro, num, addDays, mondayOf, todayISO, fmtDate, weekNumber, DAY_NAMES, toast, modal, confirmDialog, debounce, minutes, meatOffered, PLAN_LINK_KEY,
  savedPerson, rememberPerson,
} from '../util.js';

export async function render(root, params) {
  const m = await meta();
  const start = mondayOf(params.week || todayISO());
  const meals = m.meals;
  let recipes = [];
  let plan;
  // Gekozen dag (standaard vandaag, of de maandag van een andere week)
  let selected = /^\d{4}-\d{2}-\d{2}$/.test(params.dag || '') ? params.dag : todayISO();
  // Dagboek: wie heeft wat gegeten (per apparaat onthouden)
  const { people } = await api.get('/people');
  let person = people.find((p) => p.id === savedPerson()) || people[0];

  async function load() {
    [plan, recipes] = await Promise.all([api.get(`/plan?week=${start}&persoon=${person.id}`), recipes.length ? recipes : api.get('/recipes?sort=title')]);
    draw();
  }

  // Een geplande maaltijd met alleen een naam (bv. ‘Lasagne van oma’) kan een recept worden
  const NOT_A_RECIPE = /^(uit eten|restjes|afhaal|bezorg|pizza bestellen)/i;
  const canBecomeRecipe = (e) => !e.recipe_id && !e.leftover_of && !e.extras?.length && e.title && !NOT_A_RECIPE.test(e.title.trim());

  // Dagboekregels die niet gepland waren, bij het juiste moment in de planner
  function diaryItems(d, meal) {
    const items = (d.diary?.items || []).filter((x) => (meal == null ? !meals.some((m) => m.toLowerCase() === x.meal.toLowerCase()) : x.meal.toLowerCase() === meal.toLowerCase()));
    if (!items.length) return '';
    return `<a class="diary-items" href="#/dagboek?datum=${d.date}&persoon=${person.id}" title="Uit het dagboek van ${esc(person.name)}">
      ${items.map((x) => `<span class="diary-item"><span>📓 ${esc(x.name)}</span>${x.kcal != null ? `<span class="muted">${num(x.kcal, 0)} kcal</span>` : ''}</span>`).join('')}
    </a>`;
  }

  // v4 ‘Foto's & bubbels’: één dag tegelijk, met grote foto-tegels; de rest van de week als kleine foto's
  const MEAL_EMOJI = { ontbijt: '🥣', lunch: '🥪', diner: '🍽️' };
  const titleOf = (e) => (e.recipe_id ? e.recipe_title : (e.title || (e.extras?.length ? e.extras.map((x) => x.name).join(', ') : 'Losse ingrediënten')));

  function tile(e) {
    const rest = e.leftover_of || e.no_shopping;
    const title = titleOf(e);
    const href = e.recipe_id ? `href="#/recept/${e.recipe_id}?personen=${e.servings}"` : canBecomeRecipe(e) ? 'href="#" data-make-recipe role="button"' : '';
    const figures = [e.kcal_per_serving != null ? `${num(e.kcal_per_serving, 0)} kcal p.p.` : '', (e.recipe_id || e.extras?.length) && !rest ? euro(e.cost_cents) : ''].filter(Boolean).join(' · ');
    return `<article class="tile ${rest ? 'leftover' : ''}" draggable="true" data-entry="${e.id}">
      <a class="tile-photo ${e.image_url ? '' : 'noimg'}" ${href}>
        ${e.image_url ? `<img src="${esc(e.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
        <span class="tile-ov"><span class="k">${esc(e.meal)}</span><b>${esc(title)}</b>${figures ? `<small>${figures}</small>` : ''}</span>
      </a>
      <div class="tile-tools">
        <button class="mini" data-entry-menu aria-label="Verplaatsen, restjes, bewerken" title="Verplaatsen, restjes, bewerken">⋯</button>
        <button class="mini danger" data-remove aria-label="Verwijderen" title="Verwijderen">✕</button>
      </div>
      <div class="tile-bar">
        <span class="servings-ctl">
          <button class="mini" data-serv="-1" aria-label="Minder personen">−</button>
          <span title="personen">👤 ${e.servings}</span>
          <button class="mini" data-serv="1" aria-label="Meer personen">+</button>
        </span>
        ${canBecomeRecipe(e) ? '<button class="plan-extras add" data-make-recipe title="Er een recept van maken of een bestaand recept kiezen">📖 Recept maken</button>' : ''}
        ${!e.recipe_id && e.extras?.length ? '<button class="plan-extras" data-ingredients title="Ingrediënten en hoeveelheden wijzigen">🥕 ingrediënten</button>'
          : e.extras?.length ? `<button class="plan-extras" data-meat title="Vlees of vis wijzigen">🥩 + ${e.extras.map((x) => esc(x.name)).join(', ')}</button>`
          : e.recipe_id && !e.has_meat && !rest && meatOffered(e.meal) ? '<button class="plan-extras add" data-meat title="Vlees of vis bij dit gerecht kiezen">🥩 + Vlees of vis</button>' : ''}
        ${e.note && !rest ? `<span class="muted small">${esc(e.note)}</span>` : ''}
        ${e.recipe_id && e.date <= todayISO() ? `<button class="eat-toggle ${e.eaten ? 'on' : ''}" data-eat aria-pressed="${!!e.eaten}"
          title="${e.eaten ? `Staat in het dagboek van ${esc(person.name)}` : `Als gegeten in het dagboek van ${esc(person.name)} zetten`}">${e.eaten ? '✓ gegeten' : 'gegeten?'}</button>` : ''}
      </div>
    </article>`;
  }

  function slotHtml(d, meal) {
    const list = d.entries.filter((e) => e.meal === meal);
    return `<div class="mslot" data-date="${d.date}" data-meal="${esc(meal)}">
      ${list.map(tile).join('')}
      ${diaryItems(d, meal)}
      ${list.length ? `<button class="mslot-more" data-add>+ nog iets bij ${esc(meal)}</button>`
        : `<button class="mslot-add" data-add aria-label="Toevoegen aan ${esc(meal)}"><span>${MEAL_EMOJI[meal.toLowerCase()] || '🍽️'}</span>+ ${esc(meal)}</button>`}
    </div>`;
  }

  // Wat zegt het maatje over deze dag?
  function buddyLine(d) {
    const today = todayISO();
    const dayName = DAY_NAMES[(new Date(`${d.date}T12:00`).getDay() + 6) % 7];
    const when = d.date === today ? 'Vandaag' : d.date === addDays(today, 1) ? 'Morgen' : dayName.charAt(0).toUpperCase() + dayName.slice(1);
    const dinner = d.entries.find((e) => e.meal === 'diner');
    const empty = meals.filter((meal) => !d.entries.some((e) => e.meal === meal));
    const emptyWeek = plan.days.filter((x) => x.date >= today && !x.entries.length).length;
    if (!plan.days.some((x) => x.entries.length)) return { mood: 'hongerig', text: 'Deze week is nog leeg… zal Claude een weekmenu voor je maken? ✨' };
    if (dinner) return { mood: 'blij', text: `${when} ${esc(titleOf(dinner))}, mmm! 🐾${empty.length ? ` ${esc(empty.join(' en '))} ${empty.length === 1 ? 'is' : 'zijn'} nog leeg.` : ''}` };
    if (emptyWeek > 1) return { mood: 'hongerig', text: `${when} is er nog niets gepland, en nog ${emptyWeek} dagen deze week. Zal ik helpen? ✨` };
    return { mood: 'rust', text: `${when} is er nog geen diner gepland. Tik op een tegel om iets te kiezen.` };
  }

  function draw() {
    const today = todayISO();
    const daysWithFood = plan.days.filter((d) => d.entries.some((e) => e.recipe_id || e.extras?.length));
    const avgKcal = daysWithFood.length ? daysWithFood.reduce((s, d) => s + d.nutrition_per_person.kcal, 0) / daysWithFood.length : 0;
    const budget = m.weekly_budget_cents;
    if (!plan.days.some((d) => d.date === selected)) selected = plan.days.some((d) => d.date === today) ? today : plan.days[0].date;
    const d = plan.days.find((x) => x.date === selected);
    const i = plan.days.indexOf(d);
    const line = buddyLine(d);
    const bubble = say({ mood: line.mood, html: line.text, action: line.mood === 'hongerig' && m.claude.configured ? '<br><button class="btn small btn-primary" data-action="ai">✨ Weekmenu voorstellen</button>' : '' });
    const extraMeals = d.entries.filter((e) => !meals.includes(e.meal));
    root.innerHTML = `
      <div class="head-row">
        <div class="row">
          <a class="round-btn" href="#/planner?week=${addDays(start, -7)}" aria-label="Vorige week">‹</a>
          <div><h1 class="page-title">Week ${weekNumber(start)}</h1>
            <p class="page-sub">${fmtDate(start)} – ${fmtDate(addDays(start, 6))} · ${euro(plan.total_cost_cents)}${budget ? ` <span class="${plan.total_cost_cents > budget ? 'bad' : 'good'}">(budget ${euro(budget)})</span>` : ''} · gem. ${num(avgKcal, 0)} kcal</p></div>
          <a class="round-btn" href="#/planner?week=${addDays(start, 7)}" aria-label="Volgende week">›</a>
          ${start !== mondayOf(today) ? '<a class="btn btn-ghost small" href="#/planner">Deze week</a>' : ''}
        </div>
        <div class="actions">
          ${people.length > 1 ? `<label class="plan-person" title="Dagboek van">👤 <select class="input" data-person aria-label="Dagboek van">
            ${people.map((p) => `<option value="${p.id}" ${p.id === person.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
          <button class="btn btn-ai" data-action="ai">✨ Weekmenu</button>
          <a class="btn" href="#/boodschappen?week=${start}">🛒 Boodschappen</a>
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

      <div class="planner-c">
        <aside class="planner-side">
          ${bubble}
          <div class="recipe-dock">
            <h3>Sleep een recept naar een moment</h3>
            <input type="search" class="input" placeholder="Zoek recept…" data-dock-search>
            <div class="dock-filters"><label><input type="checkbox" data-dock-fav> Alleen favorieten</label></div>
            <div class="dock-list"></div>
          </div>
        </aside>
        <div class="planner-main">
          ${bubble}
          <nav class="daychips" aria-label="Kies een dag">
            ${plan.days.map((x, n) => `<button class="daychip ${x.date === selected ? 'on' : ''} ${x.date === today ? 'is-today' : ''} ${x.entries.length ? '' : 'empty'}" data-day="${x.date}" aria-pressed="${x.date === selected}">
              <small>${DAY_NAMES[n].slice(0, 2)}</small><b>${Number(x.date.slice(8))}</b><i></i></button>`).join('')}
          </nav>
          <h2 class="sr-day" style="margin:0 0 .6rem">${DAY_NAMES[i].charAt(0).toUpperCase()}${DAY_NAMES[i].slice(1)} ${fmtDate(d.date, { day: 'numeric', month: 'long' })}${d.date === today ? ' · vandaag' : ''}</h2>
          <div class="meal-tiles" style="--meals:${meals.length}">
            ${meals.map((meal) => slotHtml(d, meal)).join('')}
          </div>
          ${extraMeals.length ? `<div class="mslot" data-date="${d.date}" data-meal="${esc(extraMeals[0].meal)}" style="margin-top:.8rem">${extraMeals.map(tile).join('')}</div>` : ''}
          ${diaryItems(d, null)}
          <div class="day-sum">
            ${d.entries.length ? `<span title="per persoon">🔥 ${num(d.nutrition_per_person.kcal, 0)} kcal p.p.</span><span>💶 ${euro(d.cost_cents)}</span>` : ''}
            ${d.diary && (d.diary.entries || d.date <= today) ? `<a href="#/dagboek?datum=${d.date}&persoon=${person.id}" title="Dagboek ${esc(person.name)}">📓 ${d.diary.entries ? `${num(d.diary.kcal, 0)} / ${num(d.diary.target_kcal, 0)} gegeten` : 'dagboek'}</a>` : ''}
          </div>
          <section class="rest-week" style="margin-top:1.4rem">
            <h3>Rest van de week</h3>
            <div class="rest-row">
              ${plan.days.filter((x) => x.date !== selected).map((x) => {
                const pic = [...x.entries].reverse().find((e) => e.image_url);
                const n = plan.days.indexOf(x);
                return `<button class="rest-day" data-day="${x.date}"><span class="ph">${pic ? `<img src="${esc(pic.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : x.entries.length ? '🍽️' : '＋'}</span>
                  <small>${DAY_NAMES[n].slice(0, 2)} ${Number(x.date.slice(8))}${x.entries.length ? '' : ' · leeg'}</small></button>`;
              }).join('')}
            </div>
          </section>
        </div>
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
    $$('.mslot', root).forEach((slot) => {
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
    const day = e.target.closest('[data-day]');
    if (day) {
      selected = day.dataset.day;
      history.replaceState(null, '', `#/planner?week=${start}&dag=${selected}`);
      draw();
      if (day.classList.contains('rest-day')) $('.daychips', root)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      if (e.target.closest('[data-make-recipe]') && entry) { e.preventDefault(); return makeRecipeDialog(entry); }
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
        const slot = e.target.closest('[data-date][data-meal]');
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
      ${entry.extras?.length || meatOffered(entry.meal) ? `<div class="row wrap">
        <button type="button" class="btn" data-menu-meat>🥩 ${entry.extras?.length ? 'Vlees, vis of extra’s wijzigen' : 'Vlees of vis erbij'}</button>
      </div>` : ''}
      <form class="form" data-move>
        <h3>Verplaatsen of aanpassen</h3>
        <div class="grid-2">
          <label>Dag <input type="date" class="input" name="date" value="${entry.date}" required></label>
          <label>Moment <select class="input" name="meal">${allMeals.map((x) => `<option ${x === entry.meal ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>Personen <input type="number" class="input" min="1" name="servings" value="${entry.servings}"></label>
          ${entry.recipe_id ? '' : `<label>Titel <input class="input" name="title" value="${esc(entry.title || '')}"></label>`}
          <label class="span-2">Notitie <input class="input" name="note" value="${esc(entry.note || '')}" placeholder="bv. ‘dubbele portie koken’"></label>
          ${entry.recipe_id && !entry.leftover_of ? `<label class="check span-2"><input type="checkbox" name="no_shopping" ${entry.no_shopping ? 'checked' : ''}> ♻️ Restjes: niet op de boodschappenlijst</label>` : ''}
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
    $('[data-menu-meat]', md.el)?.addEventListener('click', () => { md.close(); meatDialog(entry, load); });
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
        ...(f.no_shopping ? { no_shopping: f.no_shopping.checked ? 1 : 0 } : {}),
      });
      md.close();
      load();
    });
  }

  // Van een geplande naam een recept maken: zelf invullen, door Claude laten bedenken, of een bestaand recept kiezen
  function makeRecipeDialog(entry) {
    const title = entry.title.trim();
    // Vergelijkbare recepten: op hele woorden (≥ 4 letters), zonder vulwoorden
    const STOP = new Set(['van', 'met', 'een', 'het', 'den', 'der', 'voor', 'zonder', 'en', 'de', 'in', 'uit', 'oma', 'opa', 'mama', 'papa']);
    const wordsOf = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    const words = wordsOf(title);
    const similar = recipes.filter((r) => wordsOf(r.title).some((rw) => words.some((w) => rw.startsWith(w) || w.startsWith(rw)))).slice(0, 5);
    const md = modal(`
      <h2>📖 ${esc(title)}</h2>
      <p class="muted">Dit staat nog niet in je receptenboek. Maak er een recept van, dan kun je het later weer plannen en komt het op de boodschappenlijst.</p>
      <div class="make-recipe-choices">
        <button class="btn btn-primary" type="button" data-new>📖 Recept maken</button>
        ${m.claude.configured ? '<button class="btn btn-ai" type="button" data-claude>✨ Laat Claude het recept maken</button>' : ''}
      </div>
      <h3>Of kies een bestaand recept</h3>
      <input type="search" class="input" placeholder="Zoek recept…" data-link-q>
      <div class="pick-list" data-link-list></div>`);
    const draw = () => {
      const q = $('[data-link-q]', md.el).value.toLowerCase().trim();
      const list = q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : similar;
      $('[data-link-list]', md.el).innerHTML = list.slice(0, 20).map((r) => `<button class="pick-item" data-link="${r.id}">
          <span>${esc(r.title)}</span><span class="muted small">${esc(r.category)} · ${minutes(r.total_minutes)}</span></button>`).join('')
        || `<p class="muted small">${q ? 'Geen recepten gevonden.' : 'Typ om te zoeken.'}</p>`;
    };
    draw();
    $('[data-link-q]', md.el).addEventListener('input', draw);
    const remember = () => {
      try { sessionStorage.setItem(PLAN_LINK_KEY, JSON.stringify({ id: entry.id, title, date: entry.date, meal: entry.meal, at: Date.now() })); } catch { /* geen opslag */ }
    };
    md.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-new]')) {
        remember();
        md.close();
        location.hash = `#/recept/nieuw?titel=${encodeURIComponent(title)}`;
        return;
      }
      if (e.target.closest('[data-claude]')) {
        remember();
        md.close();
        location.hash = `#/importeren?idee=${encodeURIComponent(title)}`;
        return;
      }
      const link = e.target.closest('[data-link]');
      if (link) {
        await api.put(`/plan/${entry.id}`, { recipe_id: Number(link.dataset.link), title: '' });
        md.close();
        toast('Recept gekoppeld aan je planning', 'success');
        load();
      }
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
      <div class="row wrap quick-plan">
        <button class="btn" type="button" data-eat-out>🍴 Uit eten</button>
        <button class="btn" type="button" data-loose>🥕 Losse ingrediënten</button>
      </div>
      ${meatOffered(meal) ? `<label class="meat-pick">🥩 Vlees of vis erbij <span class="muted small">(optioneel)</span>
        <select class="input" data-meat-pick><option value="">– niets extra –</option>
          ${sides.length ? `<optgroup label="Gerechten">${sides.map((x) => `<option value="r${x.id}">${esc(x.title)}</option>`).join('')}</optgroup>` : ''}
          <optgroup label="Vlees, vis & vega">${meats.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</optgroup>
        </select></label>` : ''}
      <div class="pick-list"></div>
      <hr>
      <form class="row" data-free>
        <input class="input grow" placeholder="Of vrije tekst, bv. ‘Bij oma’ of ‘Restjes’" data-free-title>
        <button class="btn">Toevoegen</button>
      </form>`);
    const drawList = () => {
      const q = $('[data-q]', md.el).value.toLowerCase();
      const list = recipes.filter((r) => !q || r.title.toLowerCase().includes(q) || r.tags.join(' ').includes(q));
      $('.pick-list', md.el).innerHTML = list.map((r) => `
        <button class="pick-item" data-pick="${r.id}">
          <span>${r.favorite ? '★ ' : ''}${esc(r.title)}</span>
          <span class="muted small">${esc(r.category)} · ${minutes(r.total_minutes)} · ${num(r.kcal_per_serving, 0)} kcal · ${euro(r.cost_per_serving_cents)} p.p.</span>
        </button>`).join('') || '<p class="muted">Geen recepten gevonden.</p>';
      // Nog niet in je receptenboek? Plan het toch; later kun je er een recept van maken
      const raw = $('[data-q]', md.el).value.trim();
      if (raw && !recipes.some((r) => r.title.toLowerCase() === raw.toLowerCase())) {
        $('.pick-list', md.el).insertAdjacentHTML('beforeend', `<button class="pick-item new-dish" data-plan-new>
          <span>📝 ‘${esc(raw)}’ plannen</span>
          <span class="muted small">Nog geen recept – tik later op de maaltijd om er een recept van te maken</span>
        </button>`);
      }
    };
    drawList();
    $('[data-q]', md.el).addEventListener('input', drawList);
    const servings = () => Number($('[data-servings]', md.el).value) || m.default_servings;
    md.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-eat-out]')) {
        await api.post('/plan', { date, meal, title: 'Uit eten', servings: servings() });
        md.close();
        toast('🍴 Uit eten gepland');
        return load();
      }
      if (e.target.closest('[data-loose]')) {
        const { id } = await api.post('/plan', { date, meal, title: '', servings: servings() });
        md.close();
        const entry = { id, date, meal, servings: servings(), extras: [] };
        // Niets gekozen? Dan de lege maaltijd weer weghalen.
        return extrasDialog(entry, load, { mode: 'all', onClose: async (extras) => { if (!extras.length) await api.del(`/plan/${id}`); load(); } });
      }
      if (e.target.closest('[data-plan-new]')) {
        const title = $('[data-q]', md.el).value.trim();
        await api.post('/plan', { date, meal, title, servings: servings() });
        md.close();
        toast(`‘${title}’ gepland. Tik erop om er een recept van te maken.`, 'success');
        return load();
      }
      const pick = e.target.closest('[data-pick]');
      if (!pick) return;
      const v = $('[data-meat-pick]', md.el)?.value || '';
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
  const stopSync = liveSync(load);
  return () => {
    stopSync();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('dragstart', onDragStart);
  };
}
