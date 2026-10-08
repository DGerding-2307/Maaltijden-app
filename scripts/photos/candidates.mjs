// Zoekt per standaardrecept kandidaatfoto's met een vrije licentie (Wikimedia Commons en Openverse)
// en slaat ze op met bronvermelding. Wordt gedraaid door de workflow "Foto-kandidaten";
// daarna wordt per recept de beste foto gekozen en in public/img/recipes gezet.
// Gebruik: node scripts/photos/candidates.mjs <uitvoermap>
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || 'out';
const UA = 'Maaltijden-app/2.6 (https://github.com/DGerding-2307/Maaltijden-app; zelfgehoste maaltijdplanner)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [sleutel, zoektermen Commons (meerdere), zoekterm Openverse]
const QUERIES = [
  ['boerenkoolstamppot-met-rookworst', ['boerenkool stamppot', 'stamppot rookworst'], 'stamppot boerenkool'],
  ['hutspot-met-klapstuk', ['hutspot', 'hutspot klapstuk'], 'hutspot'],
  ['erwtensoep-snert', ['erwtensoep', 'snert soup'], 'erwtensoep'],
  ['andijviestamppot-met-spekjes', ['andijviestamppot', 'stamppot andijvie'], 'andijviestamppot'],
  ['zuurkoolstamppot-met-rookworst', ['zuurkoolstamppot', 'zuurkool stamppot'], 'zuurkool stamppot'],
  ['hachee-met-rode-kool', ['hachee', 'hachee rode kool'], 'hachee stew'],
  ['hollandse-pannenkoeken', ['pannenkoek', 'Dutch pancakes'], 'pannenkoeken'],
  ['nasi-goreng', ['nasi goreng'], 'nasi goreng'],
  ['macaroni-met-gehakt-en-kaas', ['macaroni gehakt', 'macaroni casserole cheese'], 'macaroni minced meat cheese'],
  ['spruitjes-met-gehaktballen-en-aardappelen', ['spruitjes', 'brussels sprouts dish', 'gehaktbal aardappelen'], 'brussels sprouts potatoes'],
  ['zalm-uit-de-oven-met-broccoli-en-krieltjes', ['baked salmon broccoli potatoes', 'salmon broccoli'], 'baked salmon broccoli potatoes'],
  ['kip-kerrie-met-rijst', ['kip kerrie', 'chicken curry rice'], 'chicken curry rice'],
  ['wraps-met-kip-en-groenten', ['chicken wrap', 'tortilla wrap chicken vegetables'], 'chicken wrap vegetables'],
  ['groentesoep-met-balletjes', ['groentesoep balletjes', 'vegetable soup meatballs'], 'vegetable soup meatballs'],
  ['havermout-met-banaan-en-pindakaas', ['oatmeal banana peanut butter', 'porridge banana'], 'oatmeal banana peanut butter'],
  ['uitsmijter-met-kaas', ['uitsmijter'], 'uitsmijter'],
  ['butter-chicken-met-pandanrijst', ['butter chicken', 'murgh makhani'], 'butter chicken rice'],
  ['bami-goreng', ['bami goreng', 'bakmi goreng'], 'bami goreng'],
  ['chili-con-carne', ['chili con carne'], 'chili con carne'],
  ['spaghetti-bolognese', ['spaghetti bolognese'], 'spaghetti bolognese'],
  ['lasagne', ['lasagne', 'lasagna'], 'lasagna'],
  ['pasta-pesto-met-kip-en-spinazie', ['pesto pasta chicken', 'pasta pesto'], 'pesto pasta chicken spinach'],
  ['penne-arrabbiata', ['penne arrabbiata', 'penne all arrabbiata'], 'penne arrabbiata'],
  ['pasta-carbonara', ['spaghetti carbonara', 'pasta carbonara'], 'spaghetti carbonara'],
  ['pasta-met-zalm-en-spinazie', ['salmon pasta', 'pasta salmon spinach'], 'salmon pasta spinach'],
  ['shakshuka', ['shakshuka'], 'shakshuka'],
  ['kapsalon-met-kip', ['kapsalon'], 'kapsalon'],
  ['broccoli-ovenschotel-met-kip', ['broccoli casserole', 'chicken broccoli casserole'], 'chicken broccoli casserole'],
  ['kipsate-met-pindasaus-en-rijst', ['sate ayam', 'chicken satay peanut sauce'], 'chicken satay peanut sauce'],
  ['kip-ketjap-met-sperziebonen', ['ayam kecap', 'ayam masak kecap'], 'ayam kecap'],
  ['thaise-groene-curry-met-kip', ['green curry chicken', 'Thai green curry'], 'thai green curry chicken'],
  ['gado-gado', ['gado-gado', 'gado gado'], 'gado gado'],
  ['tomatensoep-met-balletjes', ['tomatensoep', 'tomato soup meatballs'], 'tomato soup'],
  ['pompoensoep', ['pumpkin soup', 'pompoensoep'], 'pumpkin soup'],
  ['champignonsoep', ['mushroom soup', 'cream of mushroom soup'], 'mushroom soup'],
  ['kippensoep-met-vermicelli', ['chicken soup vermicelli', 'chicken noodle soup'], 'chicken noodle soup'],
  ['vegetarische-burrito-s', ['burrito', 'vegetarian burrito'], 'vegetarian burrito'],
  ['kabeljauw-uit-de-oven-met-groenten', ['baked cod', 'cod fillet vegetables'], 'baked cod vegetables'],
  ['spinaziestamppot-met-gebakken-ei', ['stamppot spinazie', 'stamppot egg'], 'spinach mashed potatoes fried egg'],
  ['speklapjes-met-sperziebonen-en-krieltjes', ['speklap', 'sperziebonen aardappelen', 'pork belly slices fried'], 'fried pork belly potatoes'],
  ['varkenshaas-met-champignonroomsaus', ['pork tenderloin mushroom sauce', 'varkenshaas'], 'pork tenderloin mushroom sauce'],
  ['draadjesvlees-met-sperziebonen', ['draadjesvlees', 'beef stew potatoes green beans'], 'braised beef stew'],
  ['risotto-met-champignons', ['mushroom risotto', 'risotto ai funghi'], 'mushroom risotto'],
  ['griekse-salade-met-feta', ['greek salad', 'horiatiki'], 'greek salad feta'],
  ['couscoussalade-met-kip', ['couscous salad', 'couscous chicken salad'], 'couscous salad chicken'],
  ['wentelteefjes', ['wentelteefjes', 'french toast'], 'french toast'],
  ['overnight-oats-met-appel-en-kaneel', ['overnight oats', 'overnight oats apple'], 'overnight oats apple cinnamon'],
  ['omelet-met-groenten-en-kaas', ['vegetable omelette', 'omelette cheese vegetables'], 'vegetable omelette'],
  ['tosti-ham-kaas', ['tosti', 'ham and cheese toastie'], 'ham cheese toastie'],
  ['appelcrumble', ['apple crumble'], 'apple crumble'],
];

const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    } catch (err) { console.log(`  ${err.name} ${url}`); continue; }
    if (res.status === 429) { console.log(`  429 ${url}`); await sleep(5000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`rate limit ${url}`);
}

async function commons(query, limit = 8) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: String(limit),
    gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '960',
  });
  const json = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  const pages = Object.values(json.query?.pages || {}).sort((a, b) => a.index - b.index);
  return pages.flatMap((p) => {
    const ii = p.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime)) return [];
    const md = ii.extmetadata || {};
    const license = stripHtml(md.LicenseShortName?.value);
    if (!license || /^GFDL/i.test(license) && !/CC/i.test(license)) return [];
    if (/non-?commercial|\bNC\b|\bND\b/i.test(license)) return [];
    return [{
      source: 'Wikimedia Commons',
      title: p.title.replace(/^File:/, ''),
      download: ii.thumburl || ii.url,
      page: ii.descriptionurl,
      author: stripHtml(md.Artist?.value) || 'onbekend',
      license,
      license_url: md.LicenseUrl?.value || null,
      width: ii.width, height: ii.height,
    }];
  });
}

async function openverse(query, limit = 6) {
  const params = new URLSearchParams({ q: query, license_type: 'commercial,modification', page_size: String(limit), mature: 'false' });
  const json = await getJson(`https://api.openverse.org/v1/images/?${params}`);
  return (json.results || []).map((r) => ({
    source: `Openverse (${r.source || r.provider})`,
    title: r.title || '',
    download: r.url,
    page: r.foreign_landing_url,
    author: r.creator || 'onbekend',
    license: `${r.license === 'cc0' || r.license === 'pdm' ? r.license.toUpperCase() : `CC ${r.license.toUpperCase()}`} ${r.license_version || ''}`.trim(),
    license_url: r.license_url || null,
    width: r.width, height: r.height,
  }));
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 8_000_000) throw new Error('te groot');
  fs.writeFileSync(file, buf);
  return buf.length;
}

fs.mkdirSync(OUT, { recursive: true });
const meta = {};
// Met ONLY=sleutel1,sleutel2 alleen die recepten opnieuw zoeken.
// Met INGREDIENTS=1 de ingrediënten (scripts/photos/ingredient-queries.json): minder kandidaten per stuk.
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const forIngredients = process.env.INGREDIENTS === '1';
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const list = forIngredients
  ? Object.entries(JSON.parse(fs.readFileSync(new URL('./ingredient-queries.json', import.meta.url)))).map(([name, q]) => [slug(name), [q], q])
  : QUERIES;
// Openverse is traag bij veel zoekopdrachten: voor ingrediënten alleen Wikimedia Commons
const [MAX_COMMONS, MAX_OV] = forIngredients ? [6, 0] : [6, 4];
for (const [key, commonsQueries, ovQuery] of list.filter(([k]) => !only || only.includes(k))) {
  const found = [];
  const seenUrls = new Set();
  const add = (list, max) => {
    for (const c of list) {
      const group = (x) => (x.source.startsWith('Openverse') ? 'openverse' : 'commons');
      if (found.filter((f) => group(f) === group(c)).length >= max) break;
      if (seenUrls.has(c.page)) continue;
      seenUrls.add(c.page);
      found.push(c);
    }
  };
  for (const q of commonsQueries) {
    try { add(await commons(q), MAX_COMMONS); } catch (err) { console.log(`  commons ${q}: ${err.message}`); }
    await sleep(800);
  }
  if (MAX_OV) {
    try { add(await openverse(ovQuery), MAX_OV); } catch (err) { console.log(`  openverse ${ovQuery}: ${err.message}`); }
    await sleep(1500);
  }

  const dir = path.join(OUT, key);
  fs.mkdirSync(dir, { recursive: true });
  meta[key] = [];
  for (const c of found) {
    const n = meta[key].length + 1;
    const ext = (c.download.match(/\.(jpe?g|png|webp)(?:$|\?)/i)?.[1] || 'jpg').toLowerCase();
    const file = `${n}.${ext}`;
    try {
      await download(c.download, path.join(dir, file));
      meta[key].push({ n, file, ...c });
    } catch (err) {
      console.log(`  ${key}: download mislukt (${err.message}) ${c.download}`);
    }
    await sleep(300);
  }
  console.log(`${key}: ${meta[key].length} kandidaten`);
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
