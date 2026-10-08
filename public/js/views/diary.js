// Calorieëndagboek en gewichtslog.
import { api, liveSync } from '../api.js';
import {
  $, $$, esc, num, addDays, mondayOf, todayISO, fmtDate, toast, modal, confirmDialog, debounce, savedPerson, rememberPerson,
} from '../util.js';
import { scanBarcode } from '../scanner.js';
import { ingThumb } from '../ingredient-form.js';

const MEAL_ICONS = { ontbijt: '🌅', lunch: '🥪', diner: '🍽️', tussendoor: '🍎' };
const MACROS = [
  ['protein', 'Eiwit', '--m-p'],
  ['carbs', 'Koolhydraten', '--m-c'],
  ['fat', 'Vet', '--m-f'],
  ['fiber', 'Vezels', '--m-p'],
];
// Bovengrenzen: hier is "meer" niet beter
const LIMITS = [['sugar', 'Suikers'], ['sat_fat', 'Verzadigd vet'], ['salt', 'Zout']];
const SVG = 'http://www.w3.org/2000/svg';

export async function render(root, params) {
  const { people } = await api.get('/people');
  let person = people.find((p) => p.id === Number(params.persoon)) || people.find((p) => p.id === savedPerson()) || people[0];
  rememberPerson(person.id);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.datum || '') ? params.datum : todayISO();
  const tab = params.tab === 'gewicht' ? 'gewicht' : 'eten';
  const range = Number(params.dagen) || 90;
  const link = (over = {}) => {
    const q = new URLSearchParams({ datum: date, persoon: person.id, ...(tab === 'gewicht' ? { tab } : {}), ...over });
    for (const [k, v] of [...q]) if (v === '' || v == null) q.delete(k);
    return `#/dagboek?${q}`;
  };
  let resizeObs = null;

  async function load() {
    if (tab === 'gewicht') {
      const h = await api.get(`/weight?persoon=${person.id}&dagen=${range}`);
      person = h.person;
      drawWeight(h);
    } else {
      const ws = mondayOf(date);
      const [day, week] = await Promise.all([
        api.get(`/diary?persoon=${person.id}&datum=${date}`),
        api.get(`/diary/summary?persoon=${person.id}&van=${ws}&tot=${addDays(ws, 6)}`),
      ]);
      person = day.person;
      drawDay(day, week);
    }
  }

  function head() {
    const today = todayISO();
    return `<div class="page-head">
      <h1>Dagboek</h1>
      <div class="actions">
        <label class="inline person-pick">👤
          <select class="input" data-person aria-label="Persoon">
            ${people.map((p) => `<option value="${p.id}" ${p.id === person.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </label>
        <a class="btn btn-ghost small" href="#/instellingen" title="Personen, doelen en agenda-koppeling">⚙️ Doelen</a>
      </div>
    </div>
    <div class="seg" role="tablist">
      <a role="tab" href="${link({ tab: '' })}" class="${tab === 'eten' ? 'active' : ''}" aria-selected="${tab === 'eten'}">🔥 Calorieën</a>
      <a role="tab" href="${link({ tab: 'gewicht' })}" class="${tab === 'gewicht' ? 'active' : ''}" aria-selected="${tab === 'gewicht'}">⚖️ Gewicht</a>
    </div>
    ${tab === 'eten' ? `<div class="week-nav day-nav">
      <a class="btn icon-btn" href="${link({ datum: addDays(date, -1) })}" aria-label="Vorige dag">‹</a>
      <div class="week-title">
        <h2>${date === today ? 'Vandaag' : date === addDays(today, -1) ? 'Gisteren' : esc(fmtDate(date, { weekday: 'long' }))}</h2>
        <span class="muted">${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </div>
      <a class="btn icon-btn" href="${link({ datum: addDays(date, 1) })}" aria-label="Volgende dag">›</a>
      ${date !== today ? `<a class="btn btn-ghost" href="${link({ datum: today })}">Vandaag</a>` : ''}
    </div>` : ''}`;
  }

  // ---------- Calorieën ----------

  function bar(value, target, cssVar, over = false) {
    const pct = target ? Math.min(100, (value / target) * 100) : 0;
    return `<div class="meter ${over ? 'over' : ''}"><span style="width:${pct}%;background:var(${over ? '--bad' : cssVar})"></span></div>`;
  }

  function drawDay(day, week) {
    const t = day.targets;
    const left = t.kcal - day.totals.kcal;
    const pct = Math.min(100, (day.totals.kcal / t.kcal) * 100);
    const notLogged = day.planned.filter((p) => !p.logged);
    root.innerHTML = `<div class="view diary">
      ${head()}
      <section class="card kcal-card">
        <div class="kcal-hero">
          <div>
            <span class="kcal-big">${num(day.totals.kcal, 0)}</span>
            <span class="muted">van ${num(t.kcal, 0)} kcal</span>
          </div>
          <div class="kcal-left ${left < 0 ? 'bad' : ''}">
            ${left >= 0 ? `<strong>${num(left, 0)}</strong> kcal over` : `⚠️ <strong>${num(-left, 0)}</strong> kcal boven je doel`}
          </div>
        </div>
        <div class="meter big ${left < 0 ? 'over' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="${t.kcal}" aria-valuenow="${day.totals.kcal}">
          <span style="width:${pct}%"></span></div>
        <div class="macro-grid">
          ${MACROS.map(([k, label, c]) => `<div class="macro">
            <div class="macro-head"><span>${label}</span><span class="muted">${num(day.totals[k], 0)} / ${num(t[k], 0)} g</span></div>
            ${bar(day.totals[k], t[k], c)}</div>`).join('')}
        </div>
        <p class="limits small muted">Max. per dag:
          ${LIMITS.map(([k, label]) => {
            const over = day.totals[k] > t[k];
            return `<span class="${over ? 'bad' : ''}">${over ? '⚠️ ' : ''}${label} ${num(day.totals[k], 1)}/${num(t[k], 0)} g</span>`;
          }).join(' · ')}</p>
        <p class="muted small target-src">Doel ${t.kcal} kcal (${esc(person.target_source)}${person.goal && person.goal !== 'onderhoud' && person.target_source === 'berekend' ? `, ${esc(person.goal)}` : ''}).
          ${person.target_source === 'standaard' ? '<a href="#/instellingen">Vul je lengte, leeftijd en gewicht in</a> voor een persoonlijk doel.' : ''}</p>
      </section>

      ${day.planned.length ? `<section class="card planned-card">
        <div class="card-head"><h3>📅 Gepland voor deze dag</h3>
          ${notLogged.length > 1 ? '<button class="btn small" data-action="plan-all">✓ Alles gegeten</button>' : ''}</div>
        ${day.planned.map((p) => `<div class="planned-item">
          <span><span>${MEAL_ICONS[p.meal] || '🍽️'} <a href="#/recept/${p.recipe_id}">${esc(p.title)}</a></span>
            <span class="muted small">${esc(p.meal)} · ${num(p.kcal_per_serving, 0)} kcal per portie</span></span>
          ${p.logged ? '<span class="good small">✓ in dagboek</span>' : `<button class="btn small" data-plan="${p.id}">✓ Gegeten</button>`}
        </div>`).join('')}
      </section>` : ''}

      <div class="meals">
        ${day.meals.map((m) => `<section class="card meal-block">
          <div class="meal-head">
            <h3>${MEAL_ICONS[m.meal]} ${m.meal[0].toUpperCase()}${m.meal.slice(1)}</h3>
            <span class="muted">${m.entries.length ? `${num(m.totals.kcal, 0)} kcal` : ''}</span>
          </div>
          ${m.entries.map((e) => `<button class="log-item" data-entry="${e.id}">
            <span class="log-name">${esc(e.name)}</span>
            <span class="muted small">${e.type === 'recipe' ? `${num(e.servings, 2)} portie${e.servings === 1 ? '' : 's'}` : e.type === 'ingredient' ? `${num(e.grams, 0)} g` : ''}</span>
            <span class="log-kcal">${num(e.kcal, 0)}</span>
          </button>`).join('')}
          <button class="slot-add log-add" data-add="${m.meal}">+ Toevoegen</button>
        </section>`).join('')}
      </div>

      <div class="row wrap diary-tools">
        <button class="btn" data-action="copy-yesterday">📋 Kopieer gisteren</button>
        <form class="row weight-quick" data-weight-quick>
          <label class="inline">⚖️ Gewicht <input class="input narrow" name="w" inputmode="decimal" placeholder="kg"
            value="${day.weight ? String(day.weight.weight_kg).replace('.', ',') : ''}" aria-label="Gewicht in kg"></label>
          <button class="btn">${day.weight ? 'Bijwerken' : 'Opslaan'}</button>
        </form>
      </div>

      <section class="card">
        <div class="card-head"><h3>Deze week</h3>
          <span class="muted small">${week.logged_days ? `gemiddeld ${num(week.average_kcal, 0)} kcal op ${week.logged_days} ${week.logged_days === 1 ? 'dag' : 'dagen'}` : 'nog niets geregistreerd'}</span></div>
        <div class="chart" data-chart="week"></div>
        <details class="chart-table"><summary>Als tabel</summary>
          <table class="nutrition"><thead><tr><th>Dag</th><th>kcal</th><th>Eiwit</th><th>Koolh.</th><th>Vet</th></tr></thead><tbody>
          ${week.days.map((d) => `<tr><td>${fmtDate(d.date, { weekday: 'short', day: 'numeric' })}</td><td>${d.entries ? num(d.kcal, 0) : '–'}</td>
            <td>${d.entries ? `${num(d.protein, 0)} g` : '–'}</td><td>${d.entries ? `${num(d.carbs, 0)} g` : '–'}</td><td>${d.entries ? `${num(d.fat, 0)} g` : '–'}</td></tr>`).join('')}
          </tbody></table></details>
      </section>
    </div>`;
    const chartEl = $('[data-chart="week"]', root);
    const drawChart = () => weekChart(chartEl, week.days, week.target_kcal, date);
    drawChart();
    watchResize(chartEl, drawChart);

    $('[data-weight-quick]', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.put('/weight', { person_id: person.id, date, weight_kg: e.target.w.value });
        toast('Gewicht opgeslagen', 'success');
        load();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Staafdiagram kcal per dag met een doellijn. Eén reeks: geen legenda nodig, de titel benoemt hem.
  function weekChart(el, days, target, selected) {
    const W = Math.max(280, el.clientWidth || 600);
    const H = 190;
    const pad = { l: 44, r: 10, t: 16, b: 26 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const step = Math.max(target, ...days.map((d) => d.kcal)) > 3200 ? 1000 : 500;
    const top = Math.ceil((Math.max(target * 1.1, ...days.map((d) => d.kcal)) + 1) / step) * step;
    const y = (v) => pad.t + ih - (v / top) * ih;
    const col = iw / days.length;
    const bw = Math.min(40, col * 0.56);
    let s = `<svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calorieën per dag deze week, doel ${target} kcal">`;
    for (let v = 0; v <= top; v += step) {
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
      s += `<text x="${pad.l - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${num(v, 0)}</text>`;
    }
    days.forEach((d, i) => {
      const cx = pad.l + col * i + col / 2;
      if (d.kcal > 0) {
        const h = Math.max(2, ih - (y(d.kcal) - pad.t));
        const x = cx - bw / 2;
        const yt = pad.t + ih - h;
        const r = Math.min(4, h, bw / 2);
        s += `<path class="bar" d="M${x},${pad.t + ih} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${pad.t + ih} Z"/>`;
      }
      s += `<text x="${cx}" y="${H - 8}" class="axis ${d.date === selected ? 'strong' : ''}" text-anchor="middle">${fmtDate(d.date, { weekday: 'short' })}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${pad.l + col * i}" y="${pad.t}" width="${col}" height="${ih}" tabindex="0" role="link"
        aria-label="${fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${d.entries ? `${d.kcal} kcal` : 'niets geregistreerd'}"/>`;
    });
    s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(target)}" y2="${y(target)}" class="ref"/>`;
    s += `<text x="${W - pad.r}" y="${y(target) - 5}" class="axis" text-anchor="end">doel ${num(target, 0)}</text>`;
    s += '</svg><div class="chart-tip" hidden></div>';
    el.innerHTML = s;
    const tip = $('.chart-tip', el);
    const show = (rect) => {
      const d = days[Number(rect.dataset.i)];
      tip.hidden = false;
      tip.innerHTML = `<strong>${fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'short' })}</strong><br>
        ${d.entries ? `${num(d.kcal, 0)} kcal · ${d.kcal > target ? `${num(d.kcal - target, 0)} boven doel` : `${num(target - d.kcal, 0)} onder doel`}<br>
        <span class="muted">E ${num(d.protein, 0)} · K ${num(d.carbs, 0)} · V ${num(d.fat, 0)} g</span>` : '<span class="muted">Niets geregistreerd</span>'}`;
      const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2;
      tip.style.left = `${Math.min(Math.max(x, 70), W - 70)}px`;
      tip.style.top = `${Math.max(0, y(Math.max(d.kcal, 0)) - 8)}px`;
    };
    $$('.hit', el).forEach((rect) => {
      rect.addEventListener('pointerenter', () => show(rect));
      rect.addEventListener('focus', () => show(rect));
      rect.addEventListener('pointerleave', () => { tip.hidden = true; });
      rect.addEventListener('blur', () => { tip.hidden = true; });
      const go = () => { location.hash = link({ datum: days[Number(rect.dataset.i)].date }); };
      rect.addEventListener('click', go);
      rect.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    });
  }

  // ---------- Toevoegen en bewerken ----------

  function addDialog(meal) {
    const md = modal(`
      <h2>${MEAL_ICONS[meal]} Toevoegen aan ${esc(meal)}</h2>
      <div class="seg small" role="tablist">
        <button type="button" class="active" data-pane="zoek">🔎 Zoeken</button>
        <button type="button" data-pane="scan">📷 Barcode</button>
        <button type="button" data-pane="snel">⚡ Snel</button>
      </div>
      <div data-body></div>`);
    const body = $('[data-body]', md.el);
    const done = async (entry) => {
      try {
        await api.post('/diary', { person_id: person.id, date, meal, ...entry });
        toast(`${entry.name || 'Toegevoegd'} toegevoegd`, 'success');
        md.close();
        load();
      } catch (err) { toast(err.message, 'error'); }
    };

    const panes = {
      zoek() {
        body.innerHTML = `<input type="search" class="input" placeholder="Zoek recept of ingrediënt, bv. ‘banaan’" data-q>
          <div class="pick-list" data-results><p class="muted small">Typ minstens 2 letters. Recepten tellen per portie, ingrediënten per gram.</p></div>`;
        const q = $('[data-q]', body);
        q.focus();
        const search = debounce(async () => {
          if (q.value.trim().length < 2) return;
          const r = await api.get(`/foods?q=${encodeURIComponent(q.value.trim())}`);
          $('[data-results]', body).innerHTML = [
            ...r.recipes.map((x) => `<button class="pick-item" data-recipe="${x.id}"><span>📖 ${esc(x.title)}</span>
              <span class="muted small">recept · ${num(x.kcal_per_serving, 0)} kcal per portie</span></button>`),
            ...r.ingredients.map((x) => `<button class="pick-item" data-ing="${x.id}"><span>${ingThumb(x, 'sm') || '🥕 '}${esc(x.name)}</span>
              <span class="muted small">${num(x.kcal, 0)} kcal per 100 g${x.unit_weight_g ? ` · 1 stuk ≈ ${num(x.unit_weight_g, 0)} g` : ''}</span></button>`),
          ].join('') || '<p class="muted">Niets gevonden. Probeer ‘Snel’ om zelf kcal in te vullen.</p>';
          $$('[data-recipe]', body).forEach((b) => b.addEventListener('click', () => amount(r.recipes.find((x) => x.id === Number(b.dataset.recipe)), 'recipe')));
          $$('[data-ing]', body).forEach((b) => b.addEventListener('click', () => amount(r.ingredients.find((x) => x.id === Number(b.dataset.ing)), 'ingredient')));
        }, 200);
        q.addEventListener('input', search);
      },
      async scan() {
        body.innerHTML = '<p class="muted">Scan de barcode van een verpakt product. De voedingswaarden komen uit Open Food Facts.</p>';
        const code = await scanBarcode({ title: 'Product scannen' });
        if (!code) return panes.zoek();
        body.innerHTML = '<p class="muted">Product opzoeken…</p>';
        try {
          const p = await api.get(`/off/product/${code}`);
          if (!p.nutrition?.kcal) throw new Error('Dit product heeft geen voedingswaarden in Open Food Facts');
          amount({ name: `${p.name}${p.brands ? ` (${p.brands.split(',')[0]})` : ''}`, kcal: p.nutrition.kcal, nutrition: p.nutrition, unit_weight_g: null }, 'product');
        } catch (err) {
          body.innerHTML = `<p class="bad">${esc(err.message)}</p><button class="btn" data-again>Opnieuw scannen</button>`;
          $('[data-again]', body).addEventListener('click', panes.scan);
        }
      },
      snel() {
        body.innerHTML = `<form class="form" data-free>
          <div class="grid-2">
            <label class="span-2">Wat heb je gegeten? <input class="input" name="name" placeholder="bv. Stuk appeltaart" required></label>
            <label>kcal <input class="input" name="kcal" type="number" min="1" inputmode="numeric" required></label>
            <label>Eiwit (g) <input class="input" name="protein" type="number" min="0" step="0.1" inputmode="decimal"></label>
            <label>Koolhydraten (g) <input class="input" name="carbs" type="number" min="0" step="0.1" inputmode="decimal"></label>
            <label>Vet (g) <input class="input" name="fat" type="number" min="0" step="0.1" inputmode="decimal"></label>
          </div>
          <div class="row end"><button class="btn btn-primary">Toevoegen</button></div></form>`;
        $('[name=name]', body).focus();
        $('[data-free]', body).addEventListener('submit', (e) => {
          e.preventDefault();
          const f = e.target;
          done({ type: 'free', name: f.name.value, values: { kcal: f.kcal.value, protein: f.protein.value, carbs: f.carbs.value, fat: f.fat.value } });
        });
      },
    };

    function amount(item, kind) {
      const isRecipe = kind === 'recipe';
      const perUnit = isRecipe ? item.kcal_per_serving : item.kcal / 100;
      const start = isRecipe ? 1 : item.unit_weight_g || 100;
      body.innerHTML = `<form class="form" data-amount>
        <h3>${esc(item.title || item.name)}</h3>
        <label>${isRecipe ? 'Porties' : 'Gram'}
          <input class="input" name="n" type="number" min="${isRecipe ? 0.25 : 1}" step="${isRecipe ? 0.25 : 1}" value="${start}" inputmode="decimal" required></label>
        <div class="row wrap quick-amounts">
          ${(isRecipe ? [0.5, 1, 1.5, 2] : [item.unit_weight_g, 50, 100, 150, 250].filter(Boolean))
            .map((v, i) => `<button type="button" class="chip-toggle" data-v="${v}">${isRecipe ? `${num(v, 2)}×` : !isRecipe && i === 0 && item.unit_weight_g ? `1 stuk (${num(v, 0)} g)` : `${v} g`}</button>`).join('')}
        </div>
        <p class="kcal-preview"><strong data-kcal></strong> kcal</p>
        <div class="row end"><button type="button" class="btn" data-back>Terug</button><button class="btn btn-primary">Toevoegen</button></div>
      </form>`;
      const f = $('[data-amount]', body);
      const upd = () => { $('[data-kcal]', f).textContent = num((Number(f.n.value) || 0) * perUnit, 0); };
      f.n.addEventListener('input', upd);
      $$('[data-v]', f).forEach((b) => b.addEventListener('click', () => { f.n.value = b.dataset.v; upd(); }));
      $('[data-back]', f).addEventListener('click', () => panes.zoek());
      upd();
      f.n.select();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const n = Number(f.n.value);
        if (kind === 'recipe') return done({ type: 'recipe', recipe_id: item.id, servings: n, name: item.title });
        if (kind === 'ingredient') return done({ type: 'ingredient', ingredient_id: item.id, grams: n, name: item.name });
        // Gescand product: waarden per 100 g omrekenen naar de gegeten hoeveelheid
        const values = Object.fromEntries(Object.entries(item.nutrition).map(([k, v]) => [k, ((Number(v) || 0) * n) / 100]));
        return done({ type: 'free', name: `${item.name}, ${num(n, 0)} g`, values });
      });
    }

    $$('[data-pane]', md.el).forEach((b) => b.addEventListener('click', () => {
      $$('[data-pane]', md.el).forEach((x) => x.classList.toggle('active', x === b));
      panes[b.dataset.pane]();
    }));
    panes.zoek();
  }

  async function editDialog(id) {
    const day = await api.get(`/diary?persoon=${person.id}&datum=${date}`);
    const e = day.meals.flatMap((m) => m.entries).find((x) => x.id === id);
    if (!e) return;
    const md = modal(`<h2>${esc(e.name)}</h2>
      <form class="form" data-edit>
        <div class="grid-2">
          ${e.type === 'recipe' ? `<label>Porties <input class="input" name="servings" type="number" min="0.25" step="0.25" value="${e.servings}"></label>` : ''}
          ${e.type === 'ingredient' ? `<label>Gram <input class="input" name="grams" type="number" min="1" value="${e.grams}"></label>` : ''}
          ${e.type === 'free' ? `<label class="span-2">Naam <input class="input" name="name" value="${esc(e.name)}"></label>
            <label>kcal <input class="input" name="kcal" type="number" min="1" value="${Math.round(e.kcal)}"></label>
            <label>Eiwit (g) <input class="input" name="protein" type="number" min="0" step="0.1" value="${e.protein}"></label>
            <label>Koolhydraten (g) <input class="input" name="carbs" type="number" min="0" step="0.1" value="${e.carbs}"></label>
            <label>Vet (g) <input class="input" name="fat" type="number" min="0" step="0.1" value="${e.fat}"></label>` : ''}
          <label>Moment <select class="input" name="meal">${Object.keys(MEAL_ICONS).map((m) => `<option ${m === e.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          <label>Datum <input class="input" type="date" name="date" value="${e.date}"></label>
        </div>
        <p class="muted small">${num(e.kcal, 0)} kcal · eiwit ${num(e.protein, 1)} g · koolhydraten ${num(e.carbs, 1)} g · vet ${num(e.fat, 1)} g</p>
        <div class="row end"><button type="button" class="btn btn-danger" data-del>Verwijderen</button><button class="btn btn-primary">Opslaan</button></div>
      </form>`);
    const f = $('[data-edit]', md.el);
    $('[data-del]', f).addEventListener('click', async () => {
      await api.del(`/diary/${id}`);
      md.close();
      load();
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = Object.fromEntries(new FormData(f));
      try {
        await api.put(`/diary/${id}`, body);
        md.close();
        load();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // ---------- Gewicht ----------

  function drawWeight(h) {
    const last = h.entries.at(-1);
    const goal = person.target_weight_kg;
    const kg = (v, d = 1) => (v == null ? '–' : `${num(v, d)} kg`);
    const signed = (v, d = 1) => (v == null ? '–' : `${v > 0 ? '+' : ''}${num(v, d)} kg`);
    root.innerHTML = `<div class="view diary">
      ${head()}
      <div class="stats">
        <div class="stat"><span class="stat-label">Huidig gewicht</span><span class="stat-value">${kg(last?.weight_kg)}</span>
          <span class="stat-sub">${last ? `trend ${kg(last.trend_kg)} · ${fmtDate(last.date)}` : 'nog geen meting'}</span></div>
        <div class="stat"><span class="stat-label">Verandering</span><span class="stat-value">${signed(h.change_kg)}</span>
          <span class="stat-sub">laatste ${range} dagen</span></div>
        <div class="stat"><span class="stat-label">Per week</span><span class="stat-value">${signed(h.per_week_kg, 2)}</span>
          <span class="stat-sub">volgens de trend</span></div>
        <div class="stat"><span class="stat-label">Tot je doel</span><span class="stat-value">${goal ? kg(h.to_goal_kg != null ? Math.abs(h.to_goal_kg) : null) : '–'}</span>
          <span class="stat-sub">${goal ? `doel ${kg(goal)}` : '<a href="#/instellingen">doelgewicht instellen</a>'}${person.bmi ? ` · BMI ${num(person.bmi, 1)}` : ''}</span></div>
      </div>

      <section class="card">
        <form class="row wrap weight-form" data-weight>
          <label>Datum <input class="input" type="date" name="date" value="${todayISO()}" max="${todayISO()}"></label>
          <label>Gewicht (kg) <input class="input narrow" name="weight_kg" inputmode="decimal" placeholder="bv. 78,4" required></label>
          <label class="grow">Notitie <input class="input" name="note" placeholder="optioneel"></label>
          <button class="btn btn-primary">Opslaan</button>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h3>Gewicht</h3>
          <select class="input narrow-auto" data-range aria-label="Periode">
            ${[[30, '30 dagen'], [90, '3 maanden'], [180, '6 maanden'], [365, '1 jaar']].map(([v, l]) => `<option value="${v}" ${v === range ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        ${h.entries.length ? `<div class="legend">
            <span><i class="sw sw-dot"></i>Meting</span>
            <span><i class="sw sw-line"></i>Trend (gemiddelde 7 dagen)</span>
            ${goal ? '<span><i class="sw sw-ref"></i>Doel</span>' : ''}
          </div>
          <div class="chart" data-chart="weight"></div>
          <details class="chart-table"><summary>Als tabel</summary>
            <table class="nutrition"><thead><tr><th>Datum</th><th>Gewicht</th><th>Trend</th><th>Notitie</th><th></th></tr></thead><tbody>
            ${[...h.entries].reverse().map((e) => `<tr><td>${fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
              <td>${kg(e.weight_kg)}</td><td>${kg(e.trend_kg)}</td><td>${esc(e.note || '')}</td>
              <td><button class="mini danger" data-del-weight="${e.id}" aria-label="Meting verwijderen">✕</button></td></tr>`).join('')}
            </tbody></table></details>`
        : '<p class="muted">Nog geen metingen in deze periode. Weeg jezelf bij voorkeur ’s ochtends, voor het ontbijt; de trendlijn vlakt dagelijkse schommelingen af.</p>'}
      </section>
    </div>`;
    const chartEl = $('[data-chart="weight"]', root);
    if (chartEl) {
      const drawChart = () => weightChart(chartEl, h.entries, goal);
      drawChart();
      watchResize(chartEl, drawChart);
    }
    $('[data-range]', root).addEventListener('change', (e) => { location.hash = link({ dagen: e.target.value }); });
    $('[data-weight]', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.put('/weight', { person_id: person.id, ...Object.fromEntries(new FormData(e.target)) });
        toast('Gewicht opgeslagen', 'success');
        load();
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Lijngrafiek: metingen als stippen, trend als lijn, doel als stippellijn. Crosshair met tooltip.
  function weightChart(el, entries, goal) {
    const W = Math.max(280, el.clientWidth || 600);
    const H = 240;
    const pad = { l: 44, r: 62, t: 14, b: 28 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const ts = entries.map((e) => Date.parse(e.date));
    let t0 = ts[0];
    let t1 = ts.at(-1);
    if (t1 - t0 < 6 * 86400000) { t0 -= 3 * 86400000; t1 += 3 * 86400000; }
    const vals = entries.flatMap((e) => [e.weight_kg, e.trend_kg]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const goalInView = goal && goal >= lo - 6 && goal <= hi + 6;
    if (goalInView) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
    const spanKg = Math.max(1, hi - lo);
    const step = [0.5, 1, 2, 5, 10].find((s) => spanKg / s <= 6) || 10;
    lo = Math.floor((lo - 0.3) / step) * step;
    hi = Math.ceil((hi + 0.3) / step) * step;
    const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
    let s = `<svg class="chart-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gewichtsverloop, ${entries.length} metingen">`;
    for (let v = lo; v <= hi + 1e-9; v += step) {
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
      s += `<text x="${pad.l - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${num(v, 1)}</text>`;
    }
    const ticks = Math.min(5, Math.max(2, Math.floor(iw / 110)));
    for (let i = 0; i <= ticks; i++) {
      const t = t0 + ((t1 - t0) * i) / ticks;
      const iso = new Date(t).toISOString().slice(0, 10);
      s += `<text x="${x(t)}" y="${H - 8}" class="axis" text-anchor="${i === 0 ? 'start' : i === ticks ? 'end' : 'middle'}">${fmtDate(iso)}</text>`;
    }
    if (goalInView) {
      s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(goal)}" y2="${y(goal)}" class="ref"/>`;
      s += `<text x="${W - pad.r + 6}" y="${y(goal) + 4}" class="axis">doel ${num(goal, 1)}</text>`;
    }
    s += `<path class="trend" d="${entries.map((e, i) => `${i ? 'L' : 'M'}${x(ts[i]).toFixed(1)},${y(e.trend_kg).toFixed(1)}`).join(' ')}"/>`;
    entries.forEach((e, i) => { s += `<circle class="dot" cx="${x(ts[i])}" cy="${y(e.weight_kg)}" r="4"/>`; });
    const last = entries.at(-1);
    s += `<text x="${x(ts.at(-1)) + 8}" y="${y(last.trend_kg) + 4}" class="label">${num(last.trend_kg, 1)}</text>`;
    s += `<line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>
      <circle class="dot focus" r="6" visibility="hidden"/>
      <rect class="overlay" x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" tabindex="0" aria-label="Gebruik de pijltjestoetsen om metingen te bekijken"/>`;
    s += '</svg><div class="chart-tip" hidden></div>';
    el.innerHTML = s;
    const svg = $('svg', el);
    const tip = $('.chart-tip', el);
    const cross = $('.cross', svg);
    const focusDot = $('.focus', svg);
    let idx = entries.length - 1;
    const show = (i) => {
      idx = Math.max(0, Math.min(entries.length - 1, i));
      const e = entries[idx];
      const cx = x(ts[idx]);
      cross.setAttribute('x1', cx);
      cross.setAttribute('x2', cx);
      cross.setAttribute('visibility', 'visible');
      focusDot.setAttribute('cx', cx);
      focusDot.setAttribute('cy', y(e.weight_kg));
      focusDot.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.innerHTML = `<strong>${fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}</strong><br>
        Meting ${num(e.weight_kg, 1)} kg<br><span class="muted">Trend ${num(e.trend_kg, 1)} kg</span>${e.note ? `<br><span class="muted">${esc(e.note)}</span>` : ''}`;
      tip.style.left = `${Math.min(Math.max(cx, 70), W - 70)}px`;
      tip.style.top = `${Math.max(0, Math.min(y(e.weight_kg), y(e.trend_kg)) - 12)}px`;
    };
    const hide = () => {
      tip.hidden = true;
      cross.setAttribute('visibility', 'hidden');
      focusDot.setAttribute('visibility', 'hidden');
    };
    const overlay = $('.overlay', svg);
    overlay.addEventListener('pointermove', (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      let best = 0;
      ts.forEach((t, i) => { if (Math.abs(x(t) - px) < Math.abs(x(ts[best]) - px)) best = i; });
      show(best);
    });
    overlay.addEventListener('pointerleave', hide);
    overlay.addEventListener('focus', () => show(idx));
    overlay.addEventListener('blur', hide);
    overlay.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(idx - 1); }
      if (ev.key === 'ArrowRight') { ev.preventDefault(); show(idx + 1); }
    });
  }

  function watchResize(el, redraw) {
    resizeObs?.disconnect();
    let lastW = el.clientWidth;
    resizeObs = new ResizeObserver(debounce(() => {
      if (Math.abs(el.clientWidth - lastW) > 8) { lastW = el.clientWidth; redraw(); }
    }, 120));
    resizeObs.observe(el);
  }

  // ---------- Acties ----------

  async function onClick(e) {
    try {
      const add = e.target.closest('[data-add]');
      if (add) return addDialog(add.dataset.add);
      const entry = e.target.closest('[data-entry]');
      if (entry) return editDialog(Number(entry.dataset.entry));
      const plan = e.target.closest('[data-plan]');
      if (plan) {
        await api.post('/diary/from-plan', { person_id: person.id, date, plan_entry_id: Number(plan.dataset.plan) });
        return load();
      }
      const delW = e.target.closest('[data-del-weight]');
      if (delW) {
        if (!(await confirmDialog('Deze meting verwijderen?'))) return;
        await api.del(`/weight/${delW.dataset.delWeight}`);
        return load();
      }
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'plan-all') {
        const { added } = await api.post('/diary/from-plan', { person_id: person.id, date });
        toast(`${added} maaltijd${added === 1 ? '' : 'en'} toegevoegd`, 'success');
        return load();
      }
      if (action === 'copy-yesterday') {
        const { copied } = await api.post('/diary/copy', { person_id: person.id, from: addDays(date, -1), to: date });
        toast(copied ? `${copied} regels van gisteren gekopieerd` : 'Gisteren is nog niets geregistreerd', copied ? 'success' : 'info');
        return load();
      }
    } catch (err) { toast(err.message, 'error'); }
  }

  function onChange(e) {
    if (e.target.matches('[data-person]')) {
      rememberPerson(Number(e.target.value));
      location.hash = link({ persoon: e.target.value });
    }
  }

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  await load();
  const stopSync = liveSync(load);
  return () => {
    stopSync();
    resizeObs?.disconnect();
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
  };
}
