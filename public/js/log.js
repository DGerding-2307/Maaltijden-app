// Eten loggen (v4): één paneel met Foto, Zoeken, Barcode en Snel; daarna de ingrediënten aanpassen
// en een reactie van het maatje. Ook gebruikt om een gelogde maaltijd achteraf aan te passen.
import { api } from './api.js';
import { $, $$, esc, num, toast, modal, debounce, todayISO, readImageFile, guessMeal } from './util.js';
import { buddySvg, setMood } from './buddy.js';
import { scanProduct } from './scan-flow.js';

export const MEALS = ['ontbijt', 'lunch', 'diner', 'tussendoor'];
const MEAL_ICONS = { ontbijt: '🥣', lunch: '🥪', diner: '🍽️', tussendoor: '🍎' };
const NUTR = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'sat_fat', 'fiber', 'salt'];

// Korte zinnetjes terwijl je ingrediënten aanpast (de echte reactie komt na het loggen van de server)
const LIVE = {
  super: 'Wauw, wat een goede keuze! Mijn staart kwispelt al 🐾',
  goed: 'Lekker bezig! Nog wat groente erbij en het is perfect 🥬',
  oke: 'Prima! Misschien een handje groente erbij? 🥕',
  letop: 'Mmm, smullen! Een beetje minder hiervan of wat groente erbij? 💛',
};

let buddyCache = null;
async function buddyName(personId) {
  if (buddyCache?.personId !== personId) {
    buddyCache = { personId, name: (await api.get(`/buddy?persoon=${personId}`).catch(() => ({}))).name || 'Bolletje' };
  }
  return buddyCache.name;
}
export function forgetBuddy() { buddyCache = null; }

export function itemsTotals(items) {
  const t = Object.fromEntries(NUTR.map((k) => [k, 0]));
  for (const x of items) for (const k of NUTR) t[k] += ((Number(x.per100?.[k]) || 0) * (Number(x.grams) || 0)) / 100;
  return t;
}

const itemIcon = (x) => (x.image_url ? `<img src="${esc(x.image_url)}" alt="" loading="lazy">` : x.veg ? '🥦' : '🍽️');

/** Melding met een knop (bv. ‘Ongedaan maken’). */
export function toastAction(message, label, action) {
  let box = $('#toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast toast-action';
  t.innerHTML = `<span>${esc(message)}</span> <button class="btn small" type="button">${esc(label)}</button>`;
  t.querySelector('button').addEventListener('click', () => { action(); t.remove(); });
  box.append(t);
  setTimeout(() => t.classList.add('hide'), 6000);
  setTimeout(() => t.remove(), 6500);
}

// ---------- Paneel ‘Eten loggen’ ----------

/**
 * @param personId  voor wie (verplicht)
 * @param meal      voorgekozen maaltijd (anders geraden op tijd)
 * @param date      dag (standaard vandaag)
 * @param start     'foto' | 'zoek' | 'scan' om meteen te beginnen
 * @param onDone    na loggen (met de reactie)
 */
export function openLog({ personId, meal = guessMeal(), date = todayISO(), start = null, onDone = () => {} }) {
  let chosenMeal = MEALS.includes(meal) ? meal : guessMeal();
  const md = modal(`<div class="sheet">
    <h2>Wat heb je gegeten?</h2>
    <div class="meal-chips" role="radiogroup" aria-label="Maaltijd">${MEALS.map((m) => `<button type="button" role="radio" data-meal="${m}" class="${m === chosenMeal ? 'on' : ''}" aria-checked="${m === chosenMeal}">${MEAL_ICONS[m]} ${m}</button>`).join('')}</div>
    <div data-body></div>
    <input type="file" accept="image/*" data-photo hidden>
  </div>`);
  const body = $('[data-body]', md.el);
  const photoInput = $('[data-photo]', md.el);
  $$('[data-meal]', md.el).forEach((b) => b.addEventListener('click', () => {
    chosenMeal = b.dataset.meal;
    $$('[data-meal]', md.el).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    md.el.dispatchEvent(new CustomEvent('meal-change'));
  }));

  const ctx = { personId, date, get meal() { return chosenMeal; }, close: () => md.close(), onDone };

  async function home() {
    body.innerHTML = `<div class="log-choices">
        <button type="button" class="log-choice main" data-go="foto"><span class="ico">📷</span><b>Foto</b><small>AI ziet wat je eet</small></button>
        <button type="button" class="log-choice" data-go="zoek"><span class="ico">🔎</span><b>Zoeken</b><small>recept of ingrediënt</small></button>
        <button type="button" class="log-choice" data-go="scan"><span class="ico">▦</span><b>Barcode</b><small>verpakt product</small></button>
      </div>
      <div class="quick-list" data-quick></div>`;
    $$('[data-go]', body).forEach((b) => b.addEventListener('click', () => panes[b.dataset.go]()));
    // Snel: wat er gepland staat en wat je vaak eet
    const [day, recent] = await Promise.all([
      api.get(`/diary?persoon=${personId}&datum=${date}`).catch(() => null),
      api.get(`/diary/recent?persoon=${personId}`).catch(() => []),
    ]);
    const quick = $('[data-quick]', body);
    if (!quick) return;
    const planned = (day?.planned || []).filter((p) => !p.logged);
    quick.innerHTML = `${planned.length ? `<h3>📅 Gepland voor vandaag</h3>${planned.map((p) => `<button class="quick-item" data-plan="${p.id}"><span>${esc(p.title)}</span><span>${esc(p.meal)} · ${num(p.kcal_per_serving, 0)} kcal</span></button>`).join('')}` : ''}
      ${recent.length ? `<h3>⚡ Vaak gegeten</h3>${recent.slice(0, 6).map((x, i) => `<button class="quick-item" data-recent="${i}"><span>↺ ${esc(x.name)}</span><span>${num(x.kcal, 0)} kcal</span></button>`).join('')}` : ''}
      <button class="quick-item" data-free><span>✍️ Zelf kcal invullen</span><span>bv. stuk taart</span></button>`;
    $$('[data-plan]', quick).forEach((b) => b.addEventListener('click', async () => {
      const p = planned.find((x) => x.id === Number(b.dataset.plan));
      if (p.recipe_id) return editItems({ ...ctx, title: p.title, recipeId: p.recipe_id, planEntryId: p.id, items: await api.get(`/recipes/${p.recipe_id}/items?porties=1`) });
      await api.post('/diary/from-plan', { person_id: personId, date, plan_entry_id: p.id });
      toast(`${p.title} gelogd`, 'success');
      md.close();
      onDone(null);
    }));
    $$('[data-recent]', quick).forEach((b) => b.addEventListener('click', () => {
      const x = recent[Number(b.dataset.recent)];
      logEntry(ctx, { type: x.type, recipe_id: x.recipe_id, ingredient_id: x.ingredient_id, servings: x.servings, grams: x.grams, name: x.name, values: x.values });
    }));
    $('[data-free]', quick).addEventListener('click', () => panes.free());
  }

  const panes = {
    foto() {
      photoInput.value = '';
      photoInput.click();
    },
    zoek() {
      body.innerHTML = `<input type="search" class="input" placeholder="Zoek recept of ingrediënt, bv. ‘banaan’" data-q aria-label="Zoeken">
        <div class="pick-list" data-results><p class="muted small">Typ minstens 2 letters.</p></div>
        <div class="row end"><button type="button" class="btn" data-back>‹ Terug</button></div>`;
      const q = $('[data-q]', body);
      q.focus();
      $('[data-back]', body).addEventListener('click', home);
      q.addEventListener('input', debounce(async () => {
        if (q.value.trim().length < 2) return;
        const r = await api.get(`/foods?q=${encodeURIComponent(q.value.trim())}`);
        const res = $('[data-results]', body);
        if (!res) return;
        res.innerHTML = [
          ...r.recipes.map((x) => `<button class="pick-item" data-recipe="${x.id}"><span>📖 ${esc(x.title)}</span><span class="muted small">recept · ${num(x.kcal_per_serving, 0)} kcal per portie</span></button>`),
          ...r.ingredients.map((x) => `<button class="pick-item" data-ing="${x.id}"><span>🥕 ${esc(x.name)}</span><span class="muted small">${num(x.kcal, 0)} kcal per 100 g${x.unit_weight_g ? ` · 1 stuk ≈ ${num(x.unit_weight_g, 0)} g` : ''}</span></button>`),
        ].join('') || '<p class="muted">Niets gevonden. Probeer een foto of ‘Zelf kcal invullen’.</p>';
        $$('[data-recipe]', res).forEach((b) => b.addEventListener('click', async () => {
          const rec = r.recipes.find((x) => x.id === Number(b.dataset.recipe));
          editItems({ ...ctx, title: rec.title, recipeId: rec.id, items: await api.get(`/recipes/${rec.id}/items?porties=1`) });
        }));
        $$('[data-ing]', res).forEach((b) => b.addEventListener('click', async () => {
          const ing = (await api.get(`/ingredients?q=${encodeURIComponent(r.ingredients.find((x) => x.id === Number(b.dataset.ing)).name)}`)).find((x) => x.id === Number(b.dataset.ing));
          editItems({ ...ctx, title: ing.name, items: [ingredientItem(ing)] });
        }));
      }, 200));
    },
    async scan() {
      const ing = await scanProduct({ purpose: 'log' });
      if (!ing) return;
      editItems({ ...ctx, title: ing.name, items: [ingredientItem(ing, ing.package_grams && ing.package_grams <= 100 ? ing.package_grams : null)] });
    },
    free() {
      body.innerHTML = `<form class="form" data-free>
        <div class="grid-2">
          <label class="span-2">Wat heb je gegeten? <input class="input" name="name" placeholder="bv. Stuk appeltaart" required></label>
          <label>kcal <input class="input" name="kcal" type="number" min="1" inputmode="numeric" required></label>
          <label>Eiwit (g) <input class="input" name="protein" type="number" min="0" step="0.1" inputmode="decimal"></label>
          <label>Koolhydraten (g) <input class="input" name="carbs" type="number" min="0" step="0.1" inputmode="decimal"></label>
          <label>Vet (g) <input class="input" name="fat" type="number" min="0" step="0.1" inputmode="decimal"></label>
        </div>
        <div class="row end"><button type="button" class="btn" data-back>‹ Terug</button><button class="btn btn-primary">Loggen</button></div></form>`;
      $('[data-back]', body).addEventListener('click', home);
      $('[data-free]', body).addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        logEntry(ctx, { type: 'free', name: f.name.value, values: { kcal: f.kcal.value, protein: f.protein.value, carbs: f.carbs.value, fat: f.fat.value } });
      });
    },
  };

  // Foto gekozen of gemaakt: Claude kijkt wat erop staat
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    const name = await buddyName(personId);
    body.innerHTML = `<div class="analyzing">${buddySvg({ mood: 'hongerig' })}<p>${esc(name)} snuffelt aan je bord<span class="dots"></span></p>
      <p class="muted small">Claude bekijkt de foto en schat de ingrediënten.</p></div>`;
    try {
      const image = await readImageFile(file, 1280);
      const [upload, result] = await Promise.all([
        api.post('/uploads', { media_type: image.media_type, data: image.data }).catch(() => null),
        api.post('/ai/photo', { image: { media_type: image.media_type, data: image.data }, meal: chosenMeal, person_id: personId }),
      ]);
      if (!result.is_food) {
        body.innerHTML = `<div class="analyzing">${buddySvg({ mood: 'bezorgd' })}<p>Hmm, ik zie geen eten op deze foto.</p>
          <p class="muted small">${esc(result.note || 'Probeer het nog eens, met je bord goed in beeld.')}</p>
          <div class="row end"><button class="btn" data-back>‹ Terug</button><button class="btn btn-primary" data-again>📷 Nieuwe foto</button></div></div>`;
        $('[data-back]', body).addEventListener('click', home);
        $('[data-again]', body).addEventListener('click', panes.foto);
        return;
      }
      editItems({ ...ctx, title: result.title, items: result.items, photo: upload?.url || null, preview: image.preview, ai: { confidence: result.confidence, note: result.note } });
    } catch (err) {
      const noClaude = /nog niet ingesteld/i.test(err.message);
      body.innerHTML = `<div class="analyzing">${buddySvg({ mood: 'bezorgd' })}<p>${noClaude ? 'Voor foto’s heb ik Claude nodig' : 'Dat lukte even niet'}</p>
        <p class="muted small">${noClaude ? 'Zet Claude aan bij <a href="#/instellingen">Instellingen</a> met je Anthropic API-sleutel. Tot die tijd kun je zoeken of scannen.' : esc(err.message)}</p>
        <div class="row end"><button class="btn" data-back>‹ Terug</button><button class="btn btn-primary" data-zoek>🔎 Zoeken</button></div></div>`;
      $('[data-back]', body).addEventListener('click', home);
      $('[data-zoek]', body).addEventListener('click', panes.zoek);
    }
  });

  // Ingrediënten aanpassen in hetzelfde paneel
  function editItems(opts) {
    itemsEditor(body, { ...opts, meal: () => chosenMeal, onBack: home, onSaved: (reaction) => { md.close(); showReaction(reaction, personId); onDone(reaction); } });
  }

  if (start && panes[start]) panes[start]();
  else home();
  return md;
}

export function ingredientItem(ing, grams = null) {
  return {
    ingredient_id: ing.id, name: ing.name, grams: grams || ing.unit_weight_g || 100, unit_weight_g: ing.unit_weight_g || null, image_url: ing.image_url || null,
    per100: Object.fromEntries(NUTR.map((k) => [k, Number(ing[k]) || 0])), veg: ing.category === 'Aardappelen, groente & fruit' && !/aardappel|friet|patat/i.test(ing.name),
  };
}

async function logEntry(ctx, entry) {
  try {
    const r = await api.post('/diary', { person_id: ctx.personId, date: ctx.date, meal: ctx.meal, ...entry });
    ctx.close();
    showReaction(r.reaction, ctx.personId);
    ctx.onDone(r.reaction);
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Ingrediënten-editor ----------

/**
 * Lijst ingrediënten met – / + per regel, weglaten en toevoegen; kcal en het maatje rekenen live mee.
 * Nieuw loggen (entryId leeg) of een bestaande regel aanpassen (entryId).
 */
export function itemsEditor(el, { personId, date, meal, title, items, recipeId = null, planEntryId = null, photo = null, preview = null, ai = null, entryId = null, onBack, onSaved }) {
  let list = items.map((x) => ({ ...x, grams: Math.round(Number(x.grams) || 0) }));
  const getMeal = () => (typeof meal === 'function' ? meal() : meal);
  const img = preview || photo;
  el.innerHTML = `
    ${img ? `<div class="items-photo"><img src="${esc(img)}" alt="Foto van je eten">${ai ? `<div class="ai-chip">✨ ${esc(title)} <span>${{ hoog: 'vrij zeker', gemiddeld: 'redelijk zeker', laag: 'onzeker – check even' }[ai.confidence] || ''}</span></div>` : ''}</div>` : ''}
    ${ai?.note ? `<p class="muted small">${esc(ai.note)}</p>` : ''}
    <input class="title-input" data-title value="${esc(title)}" aria-label="Naam van de maaltijd">
    <div class="totals" data-totals></div>
    <div class="item-list" data-items></div>
    <div class="add-item"><button type="button" class="btn small" data-add>+ Ingrediënt toevoegen</button><div data-add-box></div></div>
    <div class="mini-buddy"><span data-mini></span><div class="bubble" data-say>…</div></div>
    <button type="button" class="btn btn-primary cta" data-save></button>
    <div class="save-own">
      ${onBack ? '<button type="button" class="btn btn-ghost small" data-back>‹ Terug</button>' : ''}
      <button type="button" class="btn btn-ghost small" data-own title="Als recept bewaren met deze hoeveelheden">💾 Bewaar als mijn recept</button>
      ${entryId ? '<button type="button" class="btn btn-ghost small danger-text" data-del>🗑 Verwijderen</button>' : ''}
    </div>`;
  $('[data-mini]', el).innerHTML = buddySvg({ mood: 'rust' });
  const mini = $('[data-mini] .buddy', el);

  function drawItems() {
    $('[data-items]', el).innerHTML = list.map((x, i) => `<div class="item-row" data-i="${i}">
      <span class="ico">${itemIcon(x)}</span>
      <span class="nm">${esc(x.name)}<small>${num(((x.per100?.kcal || 0) * x.grams) / 100, 0)} kcal${x.estimated ? ' · geschat' : ''}</small></span>
      <span class="stepper"><button type="button" data-step="-1" aria-label="Minder ${esc(x.name)}">−</button>
        <input type="number" inputmode="numeric" min="0" value="${x.grams}" aria-label="Gram ${esc(x.name)}" data-g><span class="u">g</span>
        <button type="button" data-step="1" aria-label="Meer ${esc(x.name)}">+</button></span>
      <button type="button" class="item-del" data-del-item aria-label="${esc(x.name)} weglaten">✕</button>
    </div>`).join('') || '<p class="muted">Nog geen ingrediënten. Voeg er een toe.</p>';
    update();
  }
  const stepFor = (x) => (x.unit_weight_g && x.unit_weight_g <= 250 ? x.unit_weight_g : x.grams >= 100 ? 25 : x.grams >= 30 ? 10 : 5);

  function update() {
    const t = itemsTotals(list);
    $('[data-totals]', el).innerHTML = `<div><b>${num(t.kcal, 0)}</b><small>kcal</small></div><div><b>${num(t.protein, 0)}g</b><small>eiwit</small></div>
      <div><b>${num(t.carbs, 0)}g</b><small>koolh.</small></div><div><b>${num(t.fat, 0)}g</b><small>vet</small></div>`;
    $$('[data-i]', el).forEach((row) => {
      const x = list[Number(row.dataset.i)];
      row.querySelector('small').textContent = `${num(((x.per100?.kcal || 0) * x.grams) / 100, 0)} kcal${x.estimated ? ' · geschat' : ''}`;
    });
    $('[data-save]', el).textContent = entryId ? `Opslaan · ${num(t.kcal, 0)} kcal` : `Loggen als ${getMeal()} · ${num(t.kcal, 0)} kcal`;
    $('[data-save]', el).disabled = !list.length;
    say();
  }
  const say = debounce(async () => {
    if (!list.length) return;
    try {
      const p = await api.post('/diary/preview', { person_id: personId, meal: getMeal(), items: list });
      setMood(mini, p.mood);
      const bubble = $('[data-say]', el);
      if (bubble && bubble.textContent !== LIVE[p.level]) {
        bubble.textContent = LIVE[p.level];
        bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
      }
    } catch { /* offline */ }
  }, 350);

  const itemsBox = $('[data-items]', el);
  itemsBox.addEventListener('click', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const i = Number(row.dataset.i);
    if (e.target.closest('[data-step]')) {
      const x = list[i];
      x.grams = Math.max(0, Math.round(x.grams + Number(e.target.closest('[data-step]').dataset.step) * stepFor(x)));
      row.querySelector('[data-g]').value = x.grams;
      update();
    }
    if (e.target.closest('[data-del-item]')) {
      const removed = list.splice(i, 1)[0];
      drawItems();
      toastAction(`${removed.name} weggelaten`, 'Ongedaan maken', () => { list.splice(i, 0, removed); drawItems(); });
    }
  });
  itemsBox.addEventListener('input', (e) => {
    if (!e.target.matches('[data-g]')) return;
    list[Number(e.target.closest('[data-i]').dataset.i)].grams = Math.max(0, Number(e.target.value) || 0);
    update();
  });

  // Ingrediënt toevoegen
  $('[data-add]', el).addEventListener('click', () => {
    const box = $('[data-add-box]', el);
    box.innerHTML = `<input type="search" class="input" placeholder="Zoek ingrediënt, bv. ‘spinazie’" data-aq aria-label="Ingrediënt zoeken"><div class="pick-list" data-ares></div>`;
    const q = $('[data-aq]', box);
    q.focus();
    q.addEventListener('input', debounce(async () => {
      if (q.value.trim().length < 2) return;
      const found = (await api.get(`/ingredients?q=${encodeURIComponent(q.value.trim())}`)).slice(0, 10);
      $('[data-ares]', box).innerHTML = found.map((x, i) => `<button type="button" class="pick-item" data-pick="${i}"><span>🥕 ${esc(x.name)}</span><span class="muted small">${num(x.kcal, 0)} kcal per 100 g</span></button>`).join('')
        || '<p class="muted small">Niet gevonden. Scan het product of voeg het toe bij Ingrediënten.</p>';
      $$('[data-pick]', box).forEach((b) => b.addEventListener('click', () => {
        list.push(ingredientItem(found[Number(b.dataset.pick)]));
        box.innerHTML = '';
        drawItems();
      }));
    }, 200));
  });

  $('[data-back]', el)?.addEventListener('click', onBack);
  $('[data-own]', el).addEventListener('click', async () => {
    const name = $('[data-title]', el).value.trim() || title;
    try {
      const r = await api.post('/recipes', {
        title: name, servings: 1, category: getMeal() === 'ontbijt' ? 'Ontbijt' : getMeal() === 'lunch' ? 'Lunch' : getMeal() === 'tussendoor' ? 'Snack' : 'Hoofdgerecht',
        description: 'Mijn eigen versie, bewaard vanuit het dagboek.', steps: [], tags: ['mijn versie'], image_url: photo || null,
        ingredients: list.map((x) => ({ name: x.name, quantity: x.grams, unit: 'g', ingredient_id: x.ingredient_id || null,
          estimate: x.ingredient_id ? null : { category: 'Overig', ...x.per100, unit_weight_g: null, package_grams: 100, price_cents: 0, pantry: false } })),
      });
      recipeId = r.id;
      toast(`Bewaard als recept ‘${name}’`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  $('[data-del]', el)?.addEventListener('click', async () => {
    const entry = await api.get(`/diary/${entryId}`);
    await api.del(`/diary/${entryId}`);
    onSaved(null, { deleted: entry });
  });
  $('[data-save]', el).addEventListener('click', async (e) => {
    e.target.disabled = true;
    const name = $('[data-title]', el).value.trim() || title;
    try {
      let reaction;
      if (entryId) reaction = (await api.put(`/diary/${entryId}`, { items: list, name })).reaction;
      else {
        reaction = (await api.post('/diary', {
          person_id: personId, date, meal: getMeal(), type: recipeId ? 'recipe' : 'free', recipe_id: recipeId, servings: 1,
          plan_entry_id: planEntryId, items: list, name, photo,
        })).reaction;
      }
      onSaved(reaction);
    } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
  });
  el.closest('.modal')?.addEventListener('meal-change', update);
  drawItems();
}

// ---------- Reactie van het maatje ----------

export function showReaction(r, personId) {
  if (!r) return;
  const md = modal(`<div class="reaction">
    ${buddySvg({ mood: r.mood })}
    <span class="score s-${esc(r.level)}">🐾 ${esc(r.label)} · ${r.score}</span>
    <h2>${esc(r.title)}</h2>
    <p>${esc(r.text)}</p>
    <p class="left">+${num(r.kcal, 0)} kcal · ${r.kcal_left >= 0 ? `nog ${num(r.kcal_left, 0)} over vandaag` : `${num(-r.kcal_left, 0)} boven je dagdoel`}</p>
    <button class="btn btn-primary cta" data-ok>Top, dankjewel!</button></div>`);
  $('[data-ok]', md.el).addEventListener('click', () => md.close());
  $('[data-ok]', md.el).focus();
  void personId;
}

// ---------- Gelogde maaltijd openen ----------

export async function editEntry(id, { personId, onDone = () => {} }) {
  const e = await api.get(`/diary/${id}`);
  if (e.items?.length) {
    const md = modal(`<div class="sheet"><h2>${MEAL_ICONS[e.meal] || ''} ${esc(e.meal)} aanpassen</h2>
      <label class="row" style="margin-bottom:.6rem">Maaltijd <select class="input" data-meal style="width:auto">${MEALS.map((m) => `<option ${m === e.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <div data-body></div></div>`);
    $('[data-meal]', md.el).addEventListener('change', async (ev) => { await api.put(`/diary/${id}`, { meal: ev.target.value }); onDone(); });
    itemsEditor($('[data-body]', md.el), {
      personId, date: e.date, meal: e.meal, title: e.name, items: e.items, photo: e.photo, entryId: id,
      onSaved: (reaction, extra) => {
        md.close();
        if (extra?.deleted) undoDelete(extra.deleted, onDone);
        else if (reaction) showReaction(reaction, personId);
        onDone();
      },
    });
    return;
  }
  // Oude vrije invoer zonder ingrediënten: naam en kcal aanpassen
  const md = modal(`<div class="sheet"><h2>${esc(e.name)}</h2>
    <form class="form" data-edit><div class="grid-2">
      <label class="span-2">Naam <input class="input" name="name" value="${esc(e.name)}"></label>
      <label>kcal <input class="input" name="kcal" type="number" min="1" value="${Math.round(e.kcal)}"></label>
      <label>Maaltijd <select class="input" name="meal">${MEALS.map((m) => `<option ${m === e.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    </div>
    <div class="row end"><button type="button" class="btn btn-ghost danger-text" data-del>🗑 Verwijderen</button><button class="btn btn-primary">Opslaan</button></div></form></div>`);
  const f = $('[data-edit]', md.el);
  $('[data-del]', f).addEventListener('click', async () => { await api.del(`/diary/${id}`); md.close(); undoDelete(e, onDone); onDone(); });
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await api.put(`/diary/${id}`, { name: f.name.value, kcal: f.kcal.value, meal: f.meal.value });
    md.close();
    onDone();
  });
}

function undoDelete(entry, onDone) {
  toastAction(`${entry.name} verwijderd`, 'Ongedaan maken', async () => {
    const values = Object.fromEntries(NUTR.map((k) => [k, entry[k]]));
    await api.post('/diary', {
      person_id: entry.person_id, date: entry.date, meal: entry.meal, type: entry.items?.length ? (entry.recipe_id ? 'recipe' : 'free') : 'free',
      recipe_id: entry.recipe_id, servings: entry.servings || 1, items: entry.items, name: entry.name, values, photo: entry.photo, plan_entry_id: entry.plan_entry_id,
    });
    onDone();
  });
}
