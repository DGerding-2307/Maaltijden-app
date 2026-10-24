// Het maatje: gezondheidsscore per maaltijd, stemming en een aanmoedigend berichtje.
// Het maatje is nooit boos of streng: bij minder gezond eten is het hooguit een beetje bezorgd.
import { getDb } from './db.js';
import { NUTRIENTS } from './calc.js';
import { addDays } from './seed.js';

export const DEFAULT_NAME = 'Bolletje';
export const NAME_SUGGESTIONS = ['Bolletje', 'Koekje', 'Pip', 'Sjors', 'Dropje', 'Moppie', 'Pluk', 'Bikkel'];

// Deel van het dagdoel dat bij een maaltijd past
const MEAL_SHARE = { ontbijt: 0.25, lunch: 0.3, diner: 0.35, tussendoor: 0.12 };

/**
 * Gezondheidsscore 0–100 uit de voedingswaarden van één maaltijd.
 * Pluspunten: eiwit, vezels, groente/fruit. Minpunten: veel suiker, verzadigd vet, zout, of veel meer kcal dan bij de maaltijd past.
 * @param n          voedingswaarden (kcal, protein, …)
 * @param vegGrams   gram groente en fruit (als bekend, uit de ingrediënten)
 */
export function healthScore(n, { meal = 'tussendoor', kcalTarget = 2000, vegGrams = 0 } = {}) {
  const kcal = Number(n.kcal) || 0;
  if (kcal < 30) return 70; // water, thee, koffie zwart: prima
  const pct = (g, kcalPerG) => ((Number(g) || 0) * kcalPerG) / kcal;
  const per100 = (g) => (Number(g) || 0) / (kcal / 100);
  let s = 50;
  const protein = pct(n.protein, 4);
  if (protein >= 0.25) s += 15; else if (protein >= 0.15) s += 8; else if (protein < 0.08) s -= 5;
  const fiber = per100(n.fiber);
  if (fiber >= 2.5) s += 15; else if (fiber >= 1.5) s += 8; else if (fiber < 0.5) s -= 5;
  // Suiker uit fruit (veel vezels erbij) telt maar half
  const sugar = pct(n.sugar, 4);
  const sugarWeight = fiber >= 2 || vegGrams >= 100 ? 0.5 : 1;
  if (sugar > 0.25) s -= 15 * sugarWeight; else if (sugar > 0.15) s -= 7 * sugarWeight;
  const sat = pct(n.sat_fat, 9);
  if (sat > 0.15) s -= 12; else if (sat > 0.1) s -= 5;
  const salt = per100(n.salt);
  if (salt > 0.5) s -= 10; else if (salt > 0.3) s -= 4;
  if (vegGrams >= 150) s += 15; else if (vegGrams >= 80) s += 8;
  const expected = (MEAL_SHARE[meal] ?? MEAL_SHARE.tussendoor) * kcalTarget;
  const ratio = kcal / expected;
  if (ratio > 1.6) s -= 12; else if (ratio > 1.3) s -= 6;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Score → niveau (voor de label) en stemming van het hondje. */
export function levelFor(score) {
  if (score >= 75) return { level: 'super', label: 'super', mood: 'blij' };
  if (score >= 55) return { level: 'goed', label: 'goed', mood: 'blij' };
  if (score >= 35) return { level: 'oke', label: 'oké', mood: 'rust' };
  return { level: 'letop', label: 'let op', mood: 'bezorgd' };
}

/** Gram groente en fruit in een lijst ingrediënten (aardappelen tellen niet mee). */
export function vegGramsOf(items) {
  return (items || []).filter((x) => x.veg).reduce((s, x) => s + (Number(x.grams) || 0), 0);
}

// ---------- Berichtjes ----------
// {naam} = naam van het maatje. Per niveau een titel en een tekst; nooit twee keer achter elkaar dezelfde.

const LINES = {
  super: [
    ['Wauw, wat een kleurrijk bord!', 'Mijn staart kwispelt ervan! 🐾'],
    ['Topkeuze!', 'Daar word ik nou blij van. Zo gezond en zo lekker!'],
    ['Woef woef, hoera!', 'Dit is precies wat je lijf fijn vindt. Ik ben trots op je!'],
    ['Smullen én gezond!', 'Jij bent echt goed bezig. Pootje? 🐾'],
    ['Wat een feestmaal!', 'Vol goede dingen. {naam} doet een vreugdedansje!'],
    ['Perfect gebalanceerd!', 'Eiwit, vezels, alles erop en eraan. Knap hoor!'],
  ],
  goed: [
    ['Lekker bezig!', 'Nog een handje groente erbij en het is perfect 🥬'],
    ['Goed gedaan!', 'Een prima maaltijd. {naam} kwispelt mee!'],
    ['Mooi zo!', 'Dat is een fijne keuze. Zo houden we het samen vol!'],
    ['Lekker!', 'Je eet gevarieerd, daar word ik vrolijk van.'],
    ['Netjes!', 'Een stukje fruit later vandaag maakt het helemaal af 🍎'],
  ],
  oke: [
    ['Prima!', 'Misschien straks wat extra groente? Dat vind ik zo knap van je 🥕'],
    ['Lekker gegeten?', 'Een glas water en wat fruit erbij en we zitten weer goed.'],
    ['Oké, genoteerd!', 'Fijn dat je het logt. Volgende maaltijd samen iets kleurrijks?'],
    ['Smakelijk!', 'Nog een beetje groen erbij en dan is het helemaal top.'],
  ],
  letop: [
    ['Mmm, dat was smullen!', 'Wel veel vet of zout. Zullen we vanavond extra groente eten? 💛'],
    ['Af en toe mag het!', 'Genieten hoort erbij. Morgen samen weer een gezonde dag?'],
    ['Lekker hè?', 'Ik vind het knap dat je het eerlijk logt. Volgende keer iets met groente? 🥦'],
    ['Een traktatie!', 'Geeft niks hoor. Een wandelingetje samen straks? 🐾'],
  ],
};

const lastLine = new Map();
function pick(level, personId = 0) {
  const pool = LINES[level];
  const prev = lastLine.get(`${personId}:${level}`);
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === prev) i = (i + 1) % pool.length;
  lastLine.set(`${personId}:${level}`, i);
  return pool[i];
}

const fill = (s, name) => s.replaceAll('{naam}', name);

// ---------- Maatje per persoon ----------

export function buddyOf(person) {
  return { name: person.buddy_name || DEFAULT_NAME, onboarded: !!person.buddy_onboarded };
}

export function saveBuddy(personId, { name, onboarded }) {
  const db = getDb();
  if (name !== undefined) {
    const n = String(name || '').trim().slice(0, 24) || DEFAULT_NAME;
    db.prepare('UPDATE people SET buddy_name = ? WHERE id = ?').run(n, personId);
  }
  if (onboarded !== undefined) db.prepare('UPDATE people SET buddy_onboarded = ? WHERE id = ?').run(onboarded ? 1 : 0, personId);
}

/** Aantal dagen achter elkaar met minstens één log, tot en met vandaag (of gisteren als vandaag nog leeg is). */
export function streakOf(personId, today) {
  const dates = new Set(getDb().prepare('SELECT DISTINCT date FROM food_log WHERE person_id = ? AND date <= ? AND date >= ?')
    .all(personId, today, addDays(today, -400)).map((r) => r.date));
  let d = dates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (dates.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/** Hartjes van de dag (0–5): gemiddelde score van wat je vandaag at. Leeg = 0. */
export function heartsOf(entries) {
  const scored = entries.filter((e) => e.score != null);
  if (!scored.length) return 0;
  const avg = scored.reduce((s, e) => s + e.score, 0) / scored.length;
  return Math.max(1, Math.min(5, Math.round(avg / 20)));
}

const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100, 365];

/**
 * Reactie van het maatje op een net gelogde maaltijd.
 * @param entry  de nieuwe regel (met score en voedingswaarden)
 * @param day    dagboek van die dag (na het loggen)
 */
export function reactionFor({ entry, day, streak = 0, name = DEFAULT_NAME, personId = 0 }) {
  const { level, label, mood: baseMood } = levelFor(entry.score ?? 50);
  let [title, text] = pick(level, personId);
  let mood = baseMood;
  const target = day.targets.kcal;
  const eaten = day.totals.kcal;
  const left = Math.round(target - eaten);
  const firstToday = day.meals.flatMap((m) => m.entries).length === 1;
  // Bijzondere momenten gaan voor
  if (firstToday && streak > 1 && STREAK_MILESTONES.includes(streak)) {
    mood = 'trots';
    title = `${streak} dagen op rij! 🔥`;
    text = `Je logt al ${streak} dagen achter elkaar. ${name} is súper trots op je!`;
  } else if (entry.meal === 'diner' && Math.abs(left) <= target * 0.08 && level !== 'letop') {
    mood = 'trots';
    title = 'Dagdoel gehaald!';
    text = 'Precies goed gegeten vandaag. Daar krijg je een medaille voor 🏅';
  } else if (firstToday && level !== 'letop') {
    text = `Goedemorgen! ${text}`;
  } else if (left < -target * 0.1 && level !== 'super') {
    mood = 'bezorgd';
    text = `${text} Je zit nu wat boven je dagdoel, morgen gewoon weer verder 💛`;
  }
  return { score: entry.score, level, label, mood, title: fill(title, name), text: fill(text, name), kcal: Math.round(entry.kcal), kcal_left: left };
}

/**
 * Hoe het maatje er nu bij zit (voor het startscherm): naam, hartjes, reeks, stemming en een zinnetje.
 * @param hour  uur van de dag (voor slaperig/hongerig)
 */
export function buddyState(day, { streak, hour, personId }) {
  const buddy = buddyOf(day.person);
  const entries = day.meals.flatMap((m) => m.entries);
  const hearts = heartsOf(entries);
  const has = (meal) => day.meals.find((m) => m.meal === meal)?.entries.length > 0;
  let mood = 'rust';
  let text;
  const last = [...entries].sort((a, b) => b.id - a.id)[0];
  if (hour >= 22 || hour < 6) {
    mood = 'slaperig';
    text = entries.length ? `Wat een fijne dag samen. Slaap lekker! 💤` : 'Zzz… morgen loggen we samen weer 💤';
  } else if ((hour >= 9 && hour < 11 && !has('ontbijt')) || (hour >= 13 && hour < 15 && !has('lunch')) || (hour >= 19 && hour < 21 && !has('diner'))) {
    mood = 'hongerig';
    const meal = hour < 11 ? 'ontbijt' : hour < 15 ? 'lunch' : 'diner';
    text = `Woef! Ik heb honger… wat heb jij als ${meal} gegeten?`;
  } else if (last?.score != null) {
    const r = levelFor(last.score);
    mood = streak >= 3 && hearts >= 4 ? 'trots' : r.mood;
    text = hearts >= 4 ? `Je eet vandaag echt goed! ${streak > 1 ? `Al ${streak} dagen op rij 🔥` : ''}`.trim()
      : hearts >= 3 ? 'Lekker bezig vandaag! Nog wat groente en het is perfect 🥕'
        : 'Fijn dat je logt! Zullen we de volgende maaltijd iets kleurrijks kiezen?';
  } else {
    text = hour < 12 ? `Goedemorgen! Ik ben ${buddy.name}. Wat ga je vandaag lekkers eten?` : `Hoi! Wat heb je vandaag al gegeten? Ik ben benieuwd 🐾`;
  }
  return { ...buddy, hearts, streak, mood, text, suggestions: NAME_SUGGESTIONS };
}

/** Totale voedingswaarden van een lijst ingrediënten ({grams, per100}). */
export function itemsNutrition(items) {
  const n = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
  for (const x of items || []) {
    const g = Number(x.grams) || 0;
    for (const k of NUTRIENTS) n[k] += ((Number(x.per100?.[k]) || 0) * g) / 100;
  }
  return n;
}
