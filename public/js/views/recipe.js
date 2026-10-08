import { api, meta, askClaude } from '../api.js';
import {
  $, $$, esc, euro, num, qty, minutes, toast, modal, confirmDialog, miniMarkdown, todayISO, fmtDate, addDays,
  NUTRIENT_LABELS, REFERENCE_INTAKE,
} from '../util.js';
import { recipeThumb } from './recipes.js';

export function scaledLine(row, factor) {
  if (row.unit === 'naar smaak' || row.quantity == null) return `${esc(row.unit === 'naar smaak' ? '' : row.unit)}`;
  return `${qty(row.quantity * factor)} ${esc(row.unit)}`;
}

export async function render(root, params) {
  const m = await meta();
  const r = await api.get(`/recipes/${params.id}`);
  let persons = Number(params.personen) || r.servings;
  let nutritionMode = 'pp';
  const history = [];

  root.innerHTML = `<div class="view recipe-page"></div>`;
  const view = $('.view', root);

  function draw() {
    const factor = persons / r.servings;
    const n = nutritionMode === 'pp' ? r.nutrition_per_serving : Object.fromEntries(Object.entries(r.nutrition_per_serving).map(([k, v]) => [k, v * persons]));
    view.innerHTML = `
      <div class="recipe-hero">
        <div class="hero-img">${recipeThumb(r)}</div>
        <div class="hero-info">
          <div class="crumbs"><a href="#/recepten">← Receptenboek</a></div>
          <h1>${esc(r.title)} <button class="fav-big ${r.favorite ? 'on' : ''}" data-fav aria-label="Favoriet">${r.favorite ? '★' : '☆'}</button></h1>
          ${r.description ? `<p class="lead">${esc(r.description)}</p>` : ''}
          <div class="recipe-meta big">
            ${r.prep_minutes ? `<span>🔪 ${minutes(r.prep_minutes)} voorbereiden</span>` : ''}
            ${r.cook_minutes ? `<span>🔥 ${minutes(r.cook_minutes)} koken</span>` : ''}
            <span>🍽️ ${esc(r.category)}</span>
            <span>🌍 ${esc(r.cuisine)}</span>
          </div>
          <div class="recipe-tags">${r.tags.map((t) => `<a class="tag" href="#/recepten?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
          <div class="rating" aria-label="Waardering">
            ${[1, 2, 3, 4, 5].map((i) => `<button data-rate="${i}" class="${(r.rating || 0) >= i ? 'on' : ''}" aria-label="${i} sterren">★</button>`).join('')}
          </div>
          <div class="actions">
            <a class="btn btn-primary" href="#/recept/${r.id}/koken?personen=${persons}">👩‍🍳 Kookmodus</a>
            <button class="btn" data-plan>📅 Inplannen</button>
            <a class="btn" href="#/recept/${r.id}/bewerken">✏️ Bewerken</a>
            <details class="menu">
              <summary class="btn btn-ghost" aria-label="Meer">⋯</summary>
              <div class="menu-items">
                <button data-dup>Dupliceren</button>
                <button data-print>Afdrukken</button>
                ${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">Originele bron ↗</a>` : ''}
                <button data-delete class="danger">Verwijderen</button>
              </div>
            </details>
          </div>
        </div>
      </div>

      <div class="recipe-columns">
        <section class="card ingredients-card">
          <div class="card-head">
            <h2>Ingrediënten</h2>
            <div class="portion-ctl" role="group" aria-label="Aantal personen">
              <button class="btn icon-btn" data-persons="-1" aria-label="Minder personen">−</button>
              <span class="persons"><strong>${persons}</strong> ${persons === 1 ? 'persoon' : 'personen'}</span>
              <button class="btn icon-btn" data-persons="1" aria-label="Meer personen">+</button>
            </div>
          </div>
          <div class="quick-persons">${[1, 2, 3, 4, 6, 8, 10].map((p) => `<button class="tag ${p === persons ? 'active' : ''}" data-setpersons="${p}">${p}</button>`).join('')}</div>
          ${persons !== r.servings ? `<p class="muted small">Origineel recept voor ${r.servings} personen – hoeveelheden ×${num(factor, 2)}.</p>` : ''}
          <ul class="ingredient-list">
            ${r.ingredients.map((row) => `
              <li class="${row.optional ? 'optional' : ''}">
                <label>
                  <input type="checkbox">
                  <span class="amount">${scaledLine(row, factor)}</span>
                  <span class="name">${esc(row.name)}${row.note ? ` <span class="muted">– ${esc(row.note)}</span>` : ''}${row.optional ? ' <span class="badge">optioneel</span>' : ''}
                  ${!row.ingredient_id ? ' <span class="badge warn" title="Niet gekoppeld aan de ingrediëntendatabase: geen voedingswaarden/prijs">?</span>' : ''}</span>
                  <span class="line-cost muted">${row.cost_cents != null ? euro(row.cost_cents * factor) : ''}</span>
                </label>
              </li>`).join('')}
          </ul>
          <div class="cost-box">
            <div><span class="muted">Prijs per persoon</span><strong>${euro(r.cost_per_serving_cents)}</strong></div>
            <div><span class="muted">Totaal voor ${persons}</span><strong>${euro((r.cost_total_cents * persons) / r.servings)}</strong></div>
          </div>
          <p class="muted small">Prijzen naar verhouding van Jumbo-verpakkingen.${r.missing_price ? ` ${r.missing_price} ingrediënt(en) zonder prijs.` : ''}
            <a href="#/ingredienten">Prijzen beheren</a></p>
          <button class="btn btn-ghost full" data-add-shopping>🛒 Op boodschappenlijst (deze week)</button>
        </section>

        <section class="card nutrition-card">
          <div class="card-head">
            <h2>Voedingswaarden</h2>
            <div class="seg">
              <button class="${nutritionMode === 'pp' ? 'active' : ''}" data-nmode="pp">Per persoon</button>
              <button class="${nutritionMode === 'total' ? 'active' : ''}" data-nmode="total">Totaal (${persons})</button>
            </div>
          </div>
          <table class="nutrition">
            <thead><tr><th></th><th>Hoeveelheid</th>${nutritionMode === 'pp' ? '<th>% RI*</th>' : ''}</tr></thead>
            <tbody>
              ${Object.entries(NUTRIENT_LABELS).map(([k, [label, unit]]) => `
                <tr class="${label.startsWith(' ') ? 'sub' : ''}">
                  <td>${esc(label.trim())}</td>
                  <td>${num(n[k], k === 'kcal' ? 0 : 1)} ${unit}</td>
                  ${nutritionMode === 'pp' ? `<td><div class="ri-bar"><span style="width:${Math.min(100, (n[k] / REFERENCE_INTAKE[k]) * 100)}%"></span></div>${num((n[k] / REFERENCE_INTAKE[k]) * 100, 0)}%</td>` : ''}
                </tr>`).join('')}
            </tbody>
          </table>
          <p class="muted small">*Referentie-inname van een gemiddelde volwassene (2000 kcal). Berekend op basis van NEVO-gemiddelden.
            ${r.missing_nutrition ? `<br>⚠️ ${r.missing_nutrition} ingrediënt(en) konden niet worden meegeteld.` : ''}</p>
          ${macroBar(r.nutrition_per_serving)}
        </section>
      </div>

      <section class="card steps-card">
        <h2>Bereiding</h2>
        <ol class="steps">${r.steps.map((s) => `<li><p>${esc(s)}</p></li>`).join('')}</ol>
        ${r.notes ? `<div class="notes"><h3>Notities</h3><p>${esc(r.notes)}</p></div>` : ''}
      </section>

      <section class="card chat-card">
        <h2>✨ Vraag Claude over dit recept</h2>
        <div class="chat-suggestions">
          ${['Kan ik dit vegetarisch maken?', 'Hoe lang kan ik dit bewaren?', 'Waarmee kan ik ingrediënten vervangen?', 'Welke groente past hierbij?', 'Kan dit gezonder?']
            .map((q) => `<button class="tag" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
        </div>
        <div class="chat-log">${history.map((h) => `<div class="msg ${h.role}">${h.role === 'assistant' ? miniMarkdown(h.content) : esc(h.content)}</div>`).join('')}</div>
        <form class="row" data-chat>
          <input class="input grow" placeholder="${m.claude.configured ? 'Stel een vraag…' : 'Stel eerst je API-sleutel in bij Instellingen'}" ${m.claude.configured ? '' : 'disabled'} data-question>
          <button class="btn btn-ai" ${m.claude.configured ? '' : 'disabled'}>Vraag</button>
        </form>
      </section>`;
  }

  function macroBar(n) {
    const p = n.protein * 4;
    const c = n.carbs * 4;
    const f = n.fat * 9;
    const t = p + c + f || 1;
    return `<div class="macro">
      <div class="macro-bar"><span class="m-p" style="width:${(p / t) * 100}%"></span><span class="m-c" style="width:${(c / t) * 100}%"></span><span class="m-f" style="width:${(f / t) * 100}%"></span></div>
      <div class="macro-legend"><span><i class="m-p"></i>Eiwit ${num((p / t) * 100, 0)}%</span><span><i class="m-c"></i>Koolhydraten ${num((c / t) * 100, 0)}%</span><span><i class="m-f"></i>Vet ${num((f / t) * 100, 0)}%</span></div>
    </div>`;
  }

  async function ask(question) {
    const log = $('.chat-log', view);
    history.push({ role: 'user', content: question });
    log.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(question)}</div><div class="msg assistant typing"></div>`);
    const out = log.lastElementChild;
    let text = '';
    try {
      await askClaude({ recipe_id: r.id, question, history: history.slice(0, -1) }, (t) => {
        text += t;
        out.innerHTML = miniMarkdown(text);
        out.scrollIntoView({ block: 'nearest' });
      });
      history.push({ role: 'assistant', content: text });
    } catch (err) {
      out.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      history.pop();
    }
    out.classList.remove('typing');
  }

  function planDialog() {
    const md = modal(`
      <h2>📅 ${esc(r.title)} inplannen</h2>
      <form class="form" data-form>
        <label>Datum <input type="date" class="input" name="date" value="${todayISO()}" required></label>
        <div class="quick-dates">${Array.from({ length: 7 }, (_, i) => addDays(todayISO(), i)).map((d) => `<button type="button" class="tag" data-date="${d}">${fmtDate(d, { weekday: 'short', day: 'numeric' })}</button>`).join('')}</div>
        <label>Moment <select class="input" name="meal">${m.meals.map((x) => `<option ${x === (r.category === 'Ontbijt' ? 'ontbijt' : r.category === 'Lunch' ? 'lunch' : 'diner') ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label>Personen <input type="number" class="input narrow" min="1" name="servings" value="${persons}"></label>
        <div class="row end"><button class="btn btn-primary">Inplannen</button></div>
      </form>`);
    const form = $('[data-form]', md.el);
    md.el.addEventListener('click', (e) => {
      const d = e.target.closest('[data-date]');
      if (d) form.date.value = d.dataset.date;
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await api.post('/plan', { date: form.date.value, meal: form.meal.value, recipe_id: r.id, servings: Number(form.servings.value) });
      toast(`Ingepland op ${fmtDate(form.date.value, { weekday: 'long', day: 'numeric', month: 'long' })}`, 'success');
      md.close();
    });
  }

  view.addEventListener('click', async (e) => {
    const t = e.target;
    try {
      if (t.closest('[data-persons]')) { persons = Math.max(1, persons + Number(t.closest('[data-persons]').dataset.persons)); return draw(); }
      if (t.closest('[data-setpersons]')) { persons = Number(t.closest('[data-setpersons]').dataset.setpersons); return draw(); }
      if (t.closest('[data-nmode]')) { nutritionMode = t.closest('[data-nmode]').dataset.nmode; return draw(); }
      if (t.closest('[data-fav]')) { r.favorite = !r.favorite; await api.patch(`/recipes/${r.id}`, { favorite: r.favorite }); return draw(); }
      if (t.closest('[data-rate]')) {
        const v = Number(t.closest('[data-rate]').dataset.rate);
        r.rating = r.rating === v ? null : v;
        await api.patch(`/recipes/${r.id}`, { rating: r.rating });
        return draw();
      }
      if (t.closest('[data-plan]')) return planDialog();
      if (t.closest('[data-q]')) return ask(t.closest('[data-q]').dataset.q);
      if (t.closest('[data-print]')) return window.print();
      if (t.closest('[data-dup]')) {
        const copy = await api.post(`/recipes/${r.id}/duplicate`);
        location.hash = `#/recept/${copy.id}/bewerken`;
        return;
      }
      if (t.closest('[data-add-shopping]')) {
        // Plan het recept vandaag in zonder moment, zodat het op de boodschappenlijst van deze week komt.
        await api.post('/plan', { date: todayISO(), meal: 'extra', recipe_id: r.id, servings: persons });
        toast('Toegevoegd aan de boodschappenlijst van deze week', 'success');
        return;
      }
      if (t.closest('[data-delete]')) {
        if (!(await confirmDialog(`“${r.title}” verwijderen? Het verdwijnt ook uit de planning.`))) return;
        await api.del(`/recipes/${r.id}`);
        toast('Recept verwijderd');
        location.hash = '#/recepten';
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  view.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-chat]')) return;
    e.preventDefault();
    const input = $('[data-question]', view);
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    ask(q);
  });
  view.addEventListener('change', (e) => {
    if (e.target.matches('.ingredient-list input')) e.target.closest('li').classList.toggle('done', e.target.checked);
  });

  draw();
}
