// Ingrediënten controleren: staat elk ingrediënt in de goede afdeling, en zijn er dubbele?
// De afdeling wordt geraden uit de (Nederlandse) naam. Het blijft een suggestie: je past hem zelf aan.
import { getDb } from './db.js';
import { CATEGORIES, BUILTIN_INGREDIENT_CATEGORY } from './seed.js';

const AGF = 'Aardappelen, groente & fruit';
const VV = 'Vlees, vis & vega';
const ZU = 'Zuivel, eieren & kaas';
const BR = 'Brood, ontbijt & beleg';
const WK = 'Pasta, rijst & wereldkeuken';
const CO = 'Conserven, soepen & sauzen';
const KR = 'Kruiden, specerijen & bakken';
const OL = 'Olie, azijn & smaakmakers';
const DV = 'Diepvries';
const DR = 'Dranken & overig';

// Eerste treffer wint, dus specifiek vóór algemeen (‘kipkruiden’ is kruiden, ‘pindakaas’ is beleg, ‘olijfolie’ is olie).
// Korte stammen staan tussen woordgrenzen (\b), zodat ‘ham’ niet in ‘champignon’ en ‘ui’ niet in ‘fruit’ wordt gevonden.
const RULES = [
  // Bake-off en gebak (‘kaneelbroodje’, ‘appelflap’, ‘pizzabroodje’) en verse groentemixen eerst
  [BR, /broodje|flap$|beignet|ovaaltje|croqui|b(o|ö)rek|kaneelknoop|focaccia|croissant|krentenbol/],
  [AGF, /soepgroente|roerbakgroente|wokgroente|groentemix|stamppotgroente/],
  // Verse pepers en verse kruiden vóór de gedroogde kruiden
  [AGF, /verse? (kruiden|basilicum|peterselie|koriander|munt|dille|bieslook|rozemarijn|tijm|salie|gember|kurkuma|chilipeper|peper)|\brode pepers?\b|\bgroene pepers?\b|chilipeper|jalapeno|\bpaprika'?s?\b/],
  [DV, /\b(diepvries|bevroren)|diepvries|roomijs|\bijsjes?\b|frites|\bfriet\b|patat|kroketten?\b|bitterballen|loempia|pizza/],
  [KR, /kruiden|kruidenmix|seasoning|specerij|poeder|gedroogde? (oregano|tijm|basilicum|peterselie|rozemarijn|dille|bieslook|munt|koriander|salie|majoraan|chilipeper)|\bpeper\b|zwarte peper|witte peper|peperkorrels|\bzout\b|zeezout|kaneel|nootmuskaat|komijn|kurkuma|kerrie|cayenne|chilivlokken|pepervlokken|laurier|kruidnagel|paprikapoeder|oregano|\btijm\b|rozemarijn gedroogd|\bsuiker\b|suiker$|basterdsuiker|kristalsuiker|poedersuiker|rietsuiker|\bbloem\b|tarwebloem|\bmeel\b|volkorenmeel|maizena|maïzena|zetmeel|bakpoeder|baksoda|\bgist\b|vanille|paneermeel|garam masala|ras el hanout|za'atar|sumak|korianderzaad|venkelzaad|mosterdzaad|sesamzaad|cacao|gelatine|amandelmeel|kokosrasp/],
  [WK, /sojasaus|ketjap|kokosmelk|kokosroom|sambal|currypasta|gochujang|miso|vissaus|oestersaus|hoisin|sriracha|teriyaki|sweet chili|tahin|kroepoek|rijstvel|nori|wasabi/],
  [OL, /\bolie\b|olijfolie|zonnebloemolie|sesamolie|arachideolie|kokosolie|frituurolie|bakolie|azijn|balsamico|worcester|\bliquid smoke\b/],
  [CO, /saus\b|sausen?\b|ketchup|mayonaise|\bmayo\b|mosterd|pesto|tomatenpuree|passata|gepelde tomaten|tomatenblokjes|gezeefde tomaten|tomatenfrito|bouillon|\bfond\b|soep|\bin blik\b|uit blik|kikkererwten|linzen|kidneybonen|bruine bonen|witte bonen|zwarte bonen|borlottibonen|appelmoes|augurk|olijven|kappertjes|piccalilly|chutney|\bjus\b|zilveruitjes|tonijn in|ansjovis|mais in|maiskorrels|knakworst/],
  [BR, /brood|broodje|bolletje|beschuit|cracker|knäckebröd|\btoast\b|croissant|pistolet|ciabatta|baguette|focaccia|krentenbol|havermout|muesli|granola|cornflakes|ontbijtkoek|pindakaas|hagelslag|\bjam\b|confiture|honing|stroop|rijstwafel|\bbeleg\b|smeerkaas|appelstroop|vlokken\b/],
  [ZU, /\bmelk\b|melk$|karnemelk|yoghurt|kwark|skyr|\bvla\b|\bkaas\b|kaas$|geitenkaas|roomkaas|mozzarella|parmezaan|parmigiano|pecorino|feta|halloumi|ricotta|mascarpone|burrata|cheddar|gouda|brie|camembert|\broom\b|slagroom|kookroom|zure room|creme fraiche|crème fraîche|\bboter\b|roomboter|margarine|halvarine|\beieren\b|\bei\b|eidooier|eiwit\b|zuivel/],
  [VV, /\bkip\b|^kip|kippen|kalkoen|\beend\b|eendenborst|rund|runder|biefstuk|ossenhaas|entrecote|rosbief|varken|gehakt|hamburger|\bham\b|hamlappen|spek|ontbijtspek|bacon|pancetta|chorizo|salami|worst|rookworst|braadworst|shoarma|gyros|schnitzel|\bsaté\b|speklap|karbonade|riblap|sukade|stoofvlees|\blam\b|lamsvlees|lamsrack|\bvlees\b|vlees$|\bvis\b|zalm|tonijn|kabeljauw|koolvis|pangasius|tilapia|makreel|haring|forel|garnalen|scampi|mosselen|inktvis|kibbeling|lekkerbek|tofu|tempeh|seitan|vegetarisch|\bvega\b|vegan|falafel|filet\b|filet$|drumstick|vleugel/],
  [WK, /pasta|spaghetti|macaroni|penne|fusilli|farfalle|rigatoni|tagliatelle|linguine|lasagne|orzo|gnocchi|ravioli|tortellini|\brijst\b|rijst$|basmati|jasmijnrijst|risotto|noedels|\bmie\b|mienestjes|udon|ramen|\bbami\b|\bnasi\b|couscous|bulgur|quinoa|tortilla|\bwraps?\b|taco|nachos|tortillachips|pitabroodje|naanbrood|\bnaan\b/],
  [DR, /(?<!citroen|limoen)sap\b|frisdrank|\bcola\b|limonade|siroop|\bwater\b|spa\b|\bbier\b|\bwijn\b|\bkoffie\b|\bthee\b|noten|notenmix|cashew|walnoot|walnoten|amandelen|hazelnoten|pinda's|pindas|\bpinda\b|pistache|chips|zoutjes|snoep|koekjes?\b|\bkoek\b|drop\b|energiedrank|smoothie/],
  [AGF, /aardappel|krieltjes|zoete aardappel|groente|\bfruit\b|appel|\bpeer\b|peren|banaan|bananen|citroen|limoen|sinaasappel|mandarijn|grapefruit|aardbei|framboos|frambozen|blauwe bes|bessen|\bdruif|druiven|kiwi|mango|ananas|meloen|watermeloen|perzik|nectarine|pruim|kers|\bvijg|granaatappel|avocado|tomaat|tomaten|cherrytomaat|komkommer|paprika|courgette|aubergine|pompoen|broccoli|bloemkool|\bkool\b|spitskool|witte kool|rode kool|savooiekool|boerenkool|zuurkool|spruit|andijvie|\bsla\b|ijsbergsla|rucola|veldsla|spinazie|snijbiet|wortel|\bpeen\b|winterpeen|pastinaak|knolselderij|selderij|bleekselderij|venkel|\bui\b|uien|sjalot|lente-?ui|bosui|knoflook|\bprei\b|champignon|paddenstoel|kastanjechampignon|shiitake|oesterzwam|sperziebonen|snijbonen|tuinbonen|doperwten|peultjes|sugarsnaps|\bmais\b|maiskolf|radijs|biet|bietjes|asperge|artisjok|gember|taugé|tauge|paksoi|chinese kool|rabarber/],
];

export function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Raad de afdeling uit de naam. null = geen idee. */
export function guessCategory(name) {
  const n = String(name || '').toLowerCase();
  const plain = normalize(name);
  for (const [cat, re] of RULES) if (re.test(n) || re.test(plain)) return cat;
  return null;
}

/** Een afdeling die niet in de lijst staat (bv. ‘groente’ of ‘vlees’) naar de juiste afdeling. */
export function canonicalCategory(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const exact = CATEGORIES.find((c) => c.toLowerCase() === v.toLowerCase());
  if (exact) return exact;
  const n = normalize(v);
  const loose = CATEGORIES.find((c) => normalize(c).split(/ |,|&/).filter((w) => w.length >= 4).some((w) => n.includes(w) || w.includes(n)));
  return loose || guessCategory(v) || null;
}

// Sleutel om dubbele namen te vinden: zonder hoofdletters, accenten, spaties en streepjes, en enkelvoud.
function key(s) {
  let k = normalize(s).replace(/[\s'-]/g, '');
  for (const suf of ['tjes', 'jes', 'en', 's']) {
    if (k.length - suf.length >= 3 && k.endsWith(suf)) { k = k.slice(0, -suf.length); break; }
  }
  // tomaten → tomat ≈ tomaat: dubbele klinker vóór de laatste medeklinker gelijktrekken
  return k.replace(/([aeou])\1(?=[^aeiou]$)/, '$1');
}

const names = (ing) => [ing.name, ...String(ing.aliases || '').split(',')].map((s) => s.trim()).filter(Boolean);

/** Controleer alle ingrediënten. */
export function checkIngredients() {
  const all = getDb().prepare('SELECT id, name, aliases, category, nutrition_source FROM ingredients ORDER BY name').all();
  const usage = usageCounts();

  // 1. Afdelingen
  const categorie = [];
  for (const ing of all) {
    const valid = CATEGORIES.includes(ing.category);
    const builtin = BUILTIN_INGREDIENT_CATEGORY.get(ing.name.toLowerCase());
    const guess = guessCategory(ing.name);
    let suggestion = null;
    let reden = null;
    if (!valid) { suggestion = canonicalCategory(ing.category) || guess; reden = `‘${ing.category}’ is geen afdeling`; }
    else if (builtin && ing.category === builtin) continue; // standaardingrediënt in zijn standaardafdeling
    else if (ing.category === 'Overig' && (guess || builtin)) { suggestion = builtin || guess; reden = 'staat bij Overig'; }
    else if (builtin && builtin !== ing.category) { suggestion = builtin; reden = 'standaardafdeling is anders'; }
    else if (guess && guess !== ing.category) { suggestion = guess; reden = 'naam past bij een andere afdeling'; }
    if (reden) categorie.push({ id: ing.id, naam: ing.name, afdeling: ing.category, voorstel: suggestion, reden });
  }

  // 2. Dubbele ingrediënten: dezelfde naam (enkelvoud/meervoud, spelling), of de naam van het één is een alias van het ander
  const parent = new Map(all.map((i) => [i.id, i.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const why = new Map();
  const builtinIds = new Set(all.filter((i) => BUILTIN_INGREDIENT_CATEGORY.has(i.name.toLowerCase())).map((i) => i.id));
  const union = (a, b, reason) => {
    // Twee standaardingrediënten zijn bewust verschillend (bv. ‘pistolet wit’ en ‘pistolet wit belgisch’)
    if (builtinIds.has(a) && builtinIds.has(b)) return;
    const ra = find(a); const rb = find(b);
    if (ra === rb) return;
    parent.set(rb, ra);
    why.set(`${Math.min(a, b)}-${Math.max(a, b)}`, reason);
  };
  const byKey = new Map();
  for (const ing of all) {
    const k = key(ing.name);
    if (byKey.has(k)) union(byKey.get(k).id, ing.id, `‘${byKey.get(k).name}’ en ‘${ing.name}’ zijn dezelfde naam`);
    else byKey.set(k, ing);
  }
  for (const ing of all) {
    for (const alias of names(ing).slice(1)) {
      const other = byKey.get(key(alias));
      if (other && other.id !== ing.id) union(other.id, ing.id, `‘${other.name}’ staat als alias bij ‘${ing.name}’`);
    }
  }
  const groups = new Map();
  for (const ing of all) {
    const r = find(ing.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(ing);
  }
  const dubbel = [...groups.values()].filter((g) => g.length > 1).map((g) => {
    const ids = g.map((i) => i.id);
    const redenen = [...why.entries()].filter(([k]) => { const [a, b] = k.split('-').map(Number); return ids.includes(a) && ids.includes(b); }).map(([, v]) => v);
    // Bewaar het ingrediënt dat het meest gebruikt wordt (bij gelijkspel: het oudste)
    const sorted = [...g].sort((a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0) || a.id - b.id);
    return {
      ingredienten: g.map((i) => ({ id: i.id, naam: i.name, afdeling: i.category, gebruikt: usage.get(i.id) || 0 })),
      bewaren: sorted[0].id,
      redenen,
    };
  });

  return { categorie, dubbel };
}

function usageCounts() {
  const db = getDb();
  const counts = new Map();
  for (const sql of [
    'SELECT ingredient_id AS id, COUNT(*) AS c FROM recipe_ingredients WHERE ingredient_id IS NOT NULL GROUP BY ingredient_id',
    'SELECT ingredient_id AS id, COUNT(*) AS c FROM plan_extras WHERE ingredient_id IS NOT NULL GROUP BY ingredient_id',
    'SELECT ingredient_id AS id, COUNT(*) AS c FROM food_log WHERE ingredient_id IS NOT NULL GROUP BY ingredient_id',
    'SELECT ingredient_id AS id, COUNT(*) AS c FROM stock_items GROUP BY ingredient_id',
  ]) {
    for (const r of db.prepare(sql).all()) counts.set(r.id, (counts.get(r.id) || 0) + r.c);
  }
  return counts;
}

// Velden die van het samengevoegde ingrediënt worden overgenomen als het bewaarde ingrediënt ze mist
const FILL_FIELDS = ['unit_weight_g', 'price_cents', 'package_grams', 'package_label', 'jumbo_id', 'jumbo_name', 'jumbo_url', 'jumbo_query',
  'jumbo_image', 'off_code', 'nutriscore', 'off_category', 'image_url', 'image_credit', 'shop_url', 'amount_rule', 'allergens'];

/**
 * Voeg ingrediënt `dropId` samen in `keepId`: recepten, planning, dagboek, voorraad, verpakkingen en barcodes
 * gaan naar het bewaarde ingrediënt; de naam en aliassen worden aliassen. Daarna wordt `dropId` verwijderd.
 */
export function mergeIngredients(keepId, dropId) {
  const db = getDb();
  keepId = Number(keepId); dropId = Number(dropId);
  if (!keepId || !dropId || keepId === dropId) throw Object.assign(new Error('Kies twee verschillende ingrediënten.'), { status: 400 });
  const keep = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(keepId);
  const drop = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(dropId);
  if (!keep || !drop) throw Object.assign(new Error('Ingrediënt niet gevonden.'), { status: 404 });

  db.exec('BEGIN');
  try {
    for (const table of ['recipe_ingredients', 'plan_extras', 'food_log', 'stock_items', 'ingredient_barcodes']) {
      db.prepare(`UPDATE ${table} SET ingredient_id = ? WHERE ingredient_id = ?`).run(keepId, dropId);
    }
    // Verpakkingen: dezelfde grootte bestaat misschien al bij het bewaarde ingrediënt
    for (const p of db.prepare('SELECT * FROM ingredient_packages WHERE ingredient_id = ?').all(dropId)) {
      const exists = db.prepare('SELECT 1 FROM ingredient_packages WHERE ingredient_id = ? AND grams = ?').get(keepId, p.grams);
      if (exists) db.prepare('DELETE FROM ingredient_packages WHERE id = ?').run(p.id);
      else db.prepare('UPDATE ingredient_packages SET ingredient_id = ? WHERE id = ?').run(keepId, p.id);
    }
    const lower = keep.name.toLowerCase();
    const aliases = [];
    for (const a of [...String(keep.aliases || '').split(','), drop.name, ...String(drop.aliases || '').split(',')]) {
      const v = a.trim().toLowerCase();
      if (v && v !== lower && !aliases.includes(v)) aliases.push(v);
    }
    const fill = FILL_FIELDS.filter((f) => (keep[f] == null || keep[f] === '') && drop[f] != null && drop[f] !== '');
    const category = keep.category === 'Overig' || !CATEGORIES.includes(keep.category) ? (CATEGORIES.includes(drop.category) ? drop.category : keep.category) : keep.category;
    db.prepare(`UPDATE ingredients SET aliases = ?, category = ?${fill.map((f) => `, ${f} = ?`).join('')} WHERE id = ?`)
      .run(aliases.join(','), category, ...fill.map((f) => drop[f]), keepId);
    db.prepare('DELETE FROM ingredients WHERE id = ?').run(dropId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return db.prepare('SELECT * FROM ingredients WHERE id = ?').get(keepId);
}
