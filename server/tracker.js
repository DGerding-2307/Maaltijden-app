// Calorieëndagboek en gewichtslog per persoon in het huishouden.
// Elke regel bewaart een momentopname van de voedingswaarden, zodat het dagboek klopt
// ook als je later een recept of ingrediënt aanpast.
import { getDb, tx } from './db.js';
import { NUTRIENTS } from './calc.js';
import { addDays } from './seed.js';
import * as repo from './repo.js';

export const MEALS = ['ontbijt', 'lunch', 'diner', 'tussendoor'];
export const ACTIVITY = [
  [1.2, 'Weinig beweging (zittend werk)'],
  [1.375, 'Licht actief (1–3× per week sporten)'],
  [1.55, 'Gemiddeld actief (3–5× per week)'],
  [1.725, 'Zeer actief (6–7× per week)'],
  [1.9, 'Extreem actief (zwaar werk + sport)'],
];
const GOAL_DELTA = { afvallen: -500, onderhoud: 0, aankomen: 300 };

const round = (n, d = 1) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;

// ---------- Personen ----------

export function listPeople() {
  const db = getDb();
  let people = db.prepare('SELECT * FROM people ORDER BY id').all();
  if (!people.length) {
    db.prepare("INSERT INTO people (name) VALUES ('Ik')").run();
    people = db.prepare('SELECT * FROM people ORDER BY id').all();
  }
  return people.map(withTargets);
}

export function getPerson(id) {
  const p = getDb().prepare('SELECT * FROM people WHERE id = ?').get(id);
  return p ? withTargets(p) : null;
}

const PERSON_FIELDS = ['name', 'sex', 'birth_year', 'height_cm', 'activity', 'goal', 'start_weight_kg', 'target_weight_kg', 'kcal_target_override'];

export function savePerson(data, id = null) {
  const db = getDb();
  const val = (f) => {
    const v = data[f];
    if (v === undefined) return undefined;
    if (v === '' || v === null) return null;
    return ['name', 'sex', 'goal'].includes(f) ? String(v) : Number(v);
  };
  if (id) {
    const existing = db.prepare('SELECT * FROM people WHERE id = ?').get(id);
    if (!existing) return null;
    const merged = PERSON_FIELDS.map((f) => (val(f) === undefined ? existing[f] : val(f)));
    db.prepare(`UPDATE people SET ${PERSON_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`).run(...merged, id);
    return getPerson(id);
  }
  const values = PERSON_FIELDS.map((f) => val(f) ?? null);
  values[0] = values[0] || 'Nieuwe persoon';
  const { lastInsertRowid } = db.prepare(`INSERT INTO people (${PERSON_FIELDS.join(', ')}) VALUES (${PERSON_FIELDS.map(() => '?').join(', ')})`).run(...values);
  return getPerson(Number(lastInsertRowid));
}

export function deletePerson(id) {
  const db = getDb();
  if (db.prepare('SELECT COUNT(*) c FROM people').get().c <= 1) throw Object.assign(new Error('Er moet minstens één persoon blijven'), { status: 400 });
  db.prepare('DELETE FROM people WHERE id = ?').run(id);
}

function latestWeight(personId) {
  return getDb().prepare('SELECT weight_kg, date FROM weight_log WHERE person_id = ? ORDER BY date DESC LIMIT 1').get(personId) || null;
}

/**
 * Dagelijkse doelen: rustverbranding volgens Mifflin-St Jeor × activiteit, plus of min voor het doel.
 * Zonder gegevens een standaard van 2000 kcal (referentie-inname).
 */
export function withTargets(p) {
  const weight = latestWeight(p.id)?.weight_kg ?? p.start_weight_kg;
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;
  let bmr = null;
  if (weight && p.height_cm && age && p.sex) {
    bmr = 10 * weight + 6.25 * p.height_cm - 5 * age + (p.sex === 'v' ? -161 : 5);
  }
  const tdee = bmr ? bmr * (p.activity || 1.375) : null;
  let kcal = tdee ? tdee + (GOAL_DELTA[p.goal] ?? 0) : 2000;
  if (tdee) kcal = Math.max(kcal, p.sex === 'v' ? 1200 : 1500); // niet onder een veilige ondergrens
  if (p.kcal_target_override) kcal = p.kcal_target_override;
  kcal = Math.round(kcal / 10) * 10;
  const targets = {
    kcal,
    protein: Math.round(weight ? Math.max(weight * 1.2, (kcal * 0.15) / 4) : (kcal * 0.15) / 4),
    carbs: Math.round((kcal * 0.5) / 4),
    fat: Math.round((kcal * 0.3) / 9),
    sat_fat: Math.round((kcal * 0.1) / 9),
    sugar: Math.round((kcal * 0.1) / 4),
    fiber: 30,
    salt: 6,
  };
  return {
    ...p,
    current_weight_kg: weight ?? null,
    bmi: weight && p.height_cm ? round(weight / (p.height_cm / 100) ** 2, 1) : null,
    bmr: bmr ? Math.round(bmr) : null,
    tdee: tdee ? Math.round(tdee) : null,
    targets,
    target_source: p.kcal_target_override ? 'handmatig' : tdee ? 'berekend' : 'standaard',
  };
}

// ---------- Dagboek ----------

function nutritionFor({ type, recipe_id, servings, ingredient_id, grams, values }) {
  if (type === 'recipe') {
    const r = repo.getRecipe(Number(recipe_id));
    if (!r) throw Object.assign(new Error('Recept niet gevonden'), { status: 404 });
    const n = Object.fromEntries(NUTRIENTS.map((k) => [k, (r.nutrition_per_serving[k] || 0) * (Number(servings) || 1)]));
    return { name: r.title, nutrition: n };
  }
  if (type === 'ingredient') {
    const ing = repo.getIngredient(Number(ingredient_id));
    if (!ing) throw Object.assign(new Error('Ingrediënt niet gevonden'), { status: 404 });
    const g = Number(grams) || 0;
    const n = Object.fromEntries(NUTRIENTS.map((k) => [k, ((Number(ing[k]) || 0) * g) / 100]));
    return { name: ing.name, nutrition: n };
  }
  // Vrije invoer (bv. "appeltaart bij oma") of een gescand product
  return { name: null, nutrition: Object.fromEntries(NUTRIENTS.map((k) => [k, Number(values?.[k]) || 0])) };
}

export function addLogEntry(data) {
  const type = ['recipe', 'ingredient', 'free'].includes(data.type) ? data.type : 'free';
  const meal = MEALS.includes(data.meal) ? data.meal : 'tussendoor';
  const { name, nutrition } = nutritionFor({ ...data, type });
  const entryName = String(data.name || name || 'Iets gegeten').slice(0, 120);
  if (type === 'free' && !nutrition.kcal) throw Object.assign(new Error('Vul het aantal kcal in'), { status: 400 });
  const { lastInsertRowid } = getDb().prepare(`INSERT INTO food_log
    (person_id, date, meal, type, recipe_id, ingredient_id, plan_entry_id, servings, grams, name, ${NUTRIENTS.join(', ')})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${NUTRIENTS.map(() => '?').join(', ')})`).run(
    Number(data.person_id), data.date, meal, type,
    type === 'recipe' ? Number(data.recipe_id) : null,
    type === 'ingredient' ? Number(data.ingredient_id) : null,
    data.plan_entry_id ? Number(data.plan_entry_id) : null,
    type === 'recipe' ? Number(data.servings) || 1 : null,
    type === 'ingredient' ? Number(data.grams) || 0 : null,
    entryName,
    ...NUTRIENTS.map((k) => round(nutrition[k], 2)),
  );
  return Number(lastInsertRowid);
}

/** Portie of hoeveelheid aanpassen: voedingswaarden schalen mee. */
export function updateLogEntry(id, data) {
  const db = getDb();
  const e = db.prepare('SELECT * FROM food_log WHERE id = ?').get(id);
  if (!e) return false;
  let factor = 1;
  const upd = {};
  if (data.servings != null && e.type === 'recipe' && e.servings) {
    factor = Number(data.servings) / e.servings;
    upd.servings = Number(data.servings);
  }
  if (data.grams != null && e.type === 'ingredient' && e.grams) {
    factor = Number(data.grams) / e.grams;
    upd.grams = Number(data.grams);
  }
  if (data.meal && MEALS.includes(data.meal)) upd.meal = data.meal;
  if (data.date) upd.date = data.date;
  if (e.type === 'free' && data.kcal != null) {
    for (const k of NUTRIENTS) if (data[k] != null) upd[k] = Number(data[k]) || 0;
    if (data.name) upd.name = String(data.name).slice(0, 120);
  } else if (factor !== 1) {
    for (const k of NUTRIENTS) upd[k] = round(e[k] * factor, 2);
  }
  const keys = Object.keys(upd);
  if (keys.length) db.prepare(`UPDATE food_log SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(upd), id);
  return true;
}

export function deleteLogEntry(id) {
  getDb().prepare('DELETE FROM food_log WHERE id = ?').run(id);
}

function totalsOf(rows) {
  const t = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
  for (const r of rows) for (const k of NUTRIENTS) t[k] += Number(r[k]) || 0;
  for (const k of NUTRIENTS) t[k] = round(t[k], k === 'kcal' ? 0 : 1);
  return t;
}

export function getDay(personId, date) {
  const person = getPerson(personId);
  if (!person) throw Object.assign(new Error('Persoon niet gevonden'), { status: 404 });
  const entries = getDb().prepare('SELECT * FROM food_log WHERE person_id = ? AND date = ? ORDER BY id').all(personId, date);
  const byMeal = Object.fromEntries(MEALS.map((m) => [m, entries.filter((e) => e.meal === m)]));
  // Geplande maaltijden: recepten en maaltijden van losse ingrediënten
  const planned = repo.getPlan(date, 1).days[0].entries.filter((p) => p.recipe_id || p.extras?.length);
  const loggedPlan = new Set(entries.map((e) => e.plan_entry_id).filter(Boolean));
  const weight = getDb().prepare('SELECT * FROM weight_log WHERE person_id = ? AND date = ?').get(personId, date) || null;
  return {
    date,
    person,
    targets: person.targets,
    totals: totalsOf(entries),
    meals: MEALS.map((m) => ({ meal: m, entries: byMeal[m], totals: totalsOf(byMeal[m]) })),
    planned: planned.map((p) => ({
      id: p.id, meal: p.meal, recipe_id: p.recipe_id, kcal_per_serving: p.kcal_per_serving, logged: loggedPlan.has(p.id),
      title: [p.recipe_title || p.title, ...(p.extras || []).map((x) => x.name)].filter(Boolean).join(' + '),
    })),
    weight,
  };
}

/** Planmoment → dagboekmoment ("extra" en eigen momenten tellen als tussendoor). */
export const mealForPlan = (meal) => (MEALS.includes(meal) ? meal : 'tussendoor');

/** Wat er voor vandaag gepland stond als gegeten registreren (1 portie per maaltijd). */
export function logPlannedDay(personId, date, onlyId = null) {
  const day = getDay(personId, date);
  let added = 0;
  tx(() => {
    for (const p of day.planned) {
      if (p.logged || (onlyId && p.id !== Number(onlyId))) continue;
      if (p.recipe_id) addLogEntry({ person_id: personId, date, meal: mealForPlan(p.meal), type: 'recipe', recipe_id: p.recipe_id, servings: 1, plan_entry_id: p.id });
      // Vlees, vis of losse ingrediënten die bij deze maaltijd gekozen is (1 portie)
      for (const x of repo.extrasFor(p.id)) {
        if (x.recipe_id) {
          addLogEntry({ person_id: personId, date, meal: mealForPlan(p.meal), type: 'recipe', recipe_id: x.recipe_id, servings: Number(x.quantity) || 1, plan_entry_id: p.id });
          continue;
        }
        if (!x.ingredient_id || !x.grams_per_person) continue;
        addLogEntry({ person_id: personId, date, meal: mealForPlan(p.meal), type: 'ingredient', ingredient_id: x.ingredient_id, grams: x.grams_per_person, plan_entry_id: p.id });
      }
      added++;
    }
  });
  return added;
}

/** Recent gebruikt: de laatste verschillende regels, om met één tik opnieuw toe te voegen. */
export function recentEntries(personId, limit = 12) {
  const rows = getDb().prepare(`SELECT * FROM food_log WHERE person_id = ? ORDER BY date DESC, id DESC LIMIT 200`).all(personId);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = r.type === 'recipe' ? `r${r.recipe_id}` : r.type === 'ingredient' ? `i${r.ingredient_id}` : `f${r.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: r.type, recipe_id: r.recipe_id, ingredient_id: r.ingredient_id, servings: r.servings, grams: r.grams, name: r.name, kcal: Math.round(r.kcal),
      values: r.type === 'free' ? Object.fromEntries(NUTRIENTS.map((k) => [k, r[k]])) : undefined });
    if (out.length >= limit) break;
  }
  return out;
}

export function copyDay(personId, from, to) {
  const rows = getDb().prepare('SELECT * FROM food_log WHERE person_id = ? AND date = ?').all(personId, from);
  tx((db) => {
    const cols = ['person_id', 'meal', 'type', 'recipe_id', 'ingredient_id', 'servings', 'grams', 'name', ...NUTRIENTS];
    const ins = db.prepare(`INSERT INTO food_log (date, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`);
    for (const r of rows) ins.run(to, ...cols.map((c) => r[c]));
  });
  return rows.length;
}

/** Totalen per dag over een periode (voor de week- en kalenderweergave). */
export function summary(personId, from, to) {
  const person = getPerson(personId);
  const rows = getDb().prepare(`SELECT date, ${NUTRIENTS.map((k) => `SUM(${k}) AS ${k}`).join(', ')}, COUNT(*) AS entries
    FROM food_log WHERE person_id = ? AND date BETWEEN ? AND ? GROUP BY date`).all(personId, from, to);
  const weights = getDb().prepare('SELECT date, weight_kg FROM weight_log WHERE person_id = ? AND date BETWEEN ? AND ?').all(personId, from, to);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const wByDate = new Map(weights.map((w) => [w.date, w.weight_kg]));
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = byDate.get(d);
    days.push({
      date: d,
      entries: r?.entries || 0,
      kcal: r ? Math.round(r.kcal) : 0,
      protein: r ? round(r.protein) : 0,
      carbs: r ? round(r.carbs) : 0,
      fat: r ? round(r.fat) : 0,
      weight_kg: wByDate.get(d) ?? null,
    });
  }
  const logged = days.filter((d) => d.entries);
  return {
    person_id: Number(personId),
    target_kcal: person?.targets.kcal ?? 2000,
    days,
    average_kcal: logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length) : null,
    logged_days: logged.length,
  };
}

// ---------- Gewicht ----------

export function logWeight({ person_id, date, weight_kg, note = '' }) {
  const w = Number(String(weight_kg).replace(',', '.'));
  if (!(w > 20 && w < 400)) throw Object.assign(new Error('Vul een gewicht in kilo in, bv. 78,4'), { status: 400 });
  getDb().prepare(`INSERT INTO weight_log (person_id, date, weight_kg, note) VALUES (?, ?, ?, ?)
    ON CONFLICT(person_id, date) DO UPDATE SET weight_kg = excluded.weight_kg, note = excluded.note`).run(Number(person_id), date, round(w, 1), note || '');
}

export function deleteWeight(id) {
  getDb().prepare('DELETE FROM weight_log WHERE id = ?').run(id);
}

/** Gewichtshistorie met een trendlijn (gemiddelde van de laatste 7 dagen met een meting). */
export function weightHistory(personId, days = 90) {
  const person = getPerson(personId);
  const from = addDays(new Date().toISOString().slice(0, 10), -days);
  const rows = getDb().prepare('SELECT * FROM weight_log WHERE person_id = ? AND date >= ? ORDER BY date').all(personId, from);
  const withTrend = rows.map((r) => {
    const window = rows.filter((x) => x.date <= r.date && x.date > addDays(r.date, -7));
    return { ...r, trend_kg: round(window.reduce((s, x) => s + x.weight_kg, 0) / window.length, 1) };
  });
  const first = withTrend[0];
  const last = withTrend.at(-1);
  // Verandering per week op basis van de trend van de laatste 4 weken
  const recent = withTrend.filter((r) => r.date >= addDays(last?.date || from, -28));
  let perWeek = null;
  if (recent.length >= 2) {
    const daysSpan = (Date.parse(recent.at(-1).date) - Date.parse(recent[0].date)) / 86400000;
    if (daysSpan >= 6) perWeek = round(((recent.at(-1).trend_kg - recent[0].trend_kg) / daysSpan) * 7, 2);
  }
  return {
    person,
    entries: withTrend,
    change_kg: first && last ? round(last.weight_kg - first.weight_kg, 1) : null,
    per_week_kg: perWeek,
    to_goal_kg: last && person.target_weight_kg ? round(last.weight_kg - person.target_weight_kg, 1) : null,
  };
}
