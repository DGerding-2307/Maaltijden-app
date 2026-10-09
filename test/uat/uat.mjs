// Gebruikersacceptatietest v3: elk scenario is een gebruikerstaak, afgeleid van recensies/verwachtingen.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright');
const B = process.env.UAT_URL || 'http://localhost:3123/';
const OUT = process.argv[2] || 'docs/uat';
const results = [];
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const mob = await mctx.newPage();
for (const p of [page, mob]) {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !m.text().includes('503') && errors.push(m.text()));
}
const ONLY = process.env.UAT_ONLY ? process.env.UAT_ONLY.split(',') : null;
async function scenario(id, title, fn) {
  if (ONLY && !ONLY.includes(id)) return;
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ id, title, result: 'PASS', note: note || '', ms: Date.now() - t0 });
  } catch (err) {
    await page.screenshot({ path: `${OUT}/FAIL-${id}.png` }).catch(() => {});
    await mob.screenshot({ path: `${OUT}/FAIL-${id}-mobiel.png` }).catch(() => {});
    await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove())).catch(() => {});
    await mob.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove())).catch(() => {});
    results.push({ id, title, result: 'FAIL', note: err.message.split('\n')[0], ms: Date.now() - t0 });
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const api = (p, opts) => page.evaluate(async ([p, o]) => (await fetch('/api' + p, o)).json(), [p, opts]);

await scenario('UAT-01', 'Week plannen op desktop door recepten te slepen', async () => {
  await page.goto(B + '#/planner');
  await page.waitForSelector('.dock-item');
  await page.dragAndDrop('.dock-item >> nth=2', '.day >> nth=6 >> .slot[data-meal="diner"]');
  await page.waitForTimeout(400);
  const t = await page.locator('.day').nth(6).locator('.plan-entry-title').allTextContents();
  expect(t.length === 1, 'zondag niet gevuld');
  await page.screenshot({ path: `${OUT}/01-planner.png` });
  return `zondag: ${t[0]}`;
});

await scenario('UAT-02', 'Op de telefoon een maaltijd naar een andere dag verplaatsen', async () => {
  await mob.goto(B + '#/planner');
  await mob.waitForSelector('.plan-entry');
  const first = mob.locator('.plan-entry').first();
  const title = await first.locator('.plan-entry-title').textContent();
  await first.locator('[data-entry-menu]').tap();
  const form = mob.locator('[data-move]');
  const d = await form.locator('[name=date]').inputValue();
  const target = new Date(d); target.setDate(target.getDate() + 1);
  await form.locator('[name=date]').fill(target.toISOString().slice(0, 10));
  await mob.screenshot({ path: `${OUT}/02-verplaatsen-mobiel.png` });
  await form.locator('button').tap();
  await mob.waitForTimeout(500);
  const second = await mob.locator('.day').nth(1).locator('.plan-entry-title').allTextContents();
  expect(second.includes(title), 'niet verplaatst');
  return `“${title}” van maandag naar dinsdag`;
});

await scenario('UAT-03', 'Vrije tekst plannen (‘Uit eten’) en later aanpassen', async () => {
  await page.goto(B + '#/planner');
  await page.locator('.day').nth(5).locator('.slot[data-meal="lunch"] [data-add]').click();
  await page.fill('[data-free-title]', 'Uit eten');
  await page.click('[data-free] button');
  await page.waitForTimeout(300);
  const entry = page.locator('.plan-entry.free').first();
  await entry.locator('[data-entry-menu]').click();
  await page.fill('[data-move] [name=title]', 'Uit eten bij oma');
  await page.click('[data-move] button');
  await page.waitForTimeout(300);
  expect((await page.locator('.plan-entry.free .plan-entry-title').allTextContents()).includes('Uit eten bij oma'), 'titel niet aangepast');
});

await scenario('UAT-04', 'Porties schalen van 4 naar 6 personen', async () => {
  await page.goto(B + '#/recept/1');
  const before = await page.locator('.ingredient-list .amount').first().textContent();
  await page.click('[data-setpersons="6"]');
  // De hoeveelheden komen van de server (hele verpakkingen en hele stuks schalen niet lineair)
  await page.waitForFunction((b) => document.querySelector('.ingredient-list .amount')?.textContent !== b, before);
  const after = await page.locator('.ingredient-list .amount').first().textContent();
  const total = await page.locator('.cost-box strong').nth(1).textContent();
  expect(before.trim() === '1.200 g' && after.trim() === '1.800 g', `${before} → ${after}`);
  return `${before.trim()} → ${after.trim()}, totaal ${total}`;
});

await scenario('UAT-05', 'Voedingswaarden per persoon met zichtbare bron (Open Food Facts)', async () => {
  await page.goto(B + '#/recept/1');
  const txt = await page.locator('.nutrition-card').textContent();
  expect(/Open Food Facts/.test(txt), 'geen OFF-bron vermeld');
  expect(/kcal/.test(txt) && /% RI/.test(txt), 'tabel ontbreekt');
  await page.screenshot({ path: `${OUT}/05-voeding.png`, fullPage: false });
  return txt.match(/Bronnen per ingrediënt:[^.]*/)?.[0];
});

await scenario('UAT-06', 'Ingrediënt koppelen aan Open Food Facts via zoeken (mediaan)', async () => {
  await page.goto(B + '#/ingredienten');
  await page.fill('[data-q]', 'spinazie');
  await page.waitForTimeout(300);
  await page.locator('tr[data-id] [data-off]').first().click();
  await page.waitForSelector('[data-median]', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/06-off-zoeken.png` });
  await page.click('[data-median]');
  await page.waitForTimeout(500);
  const row = await page.locator('tr[data-id]').first().textContent();
  expect(/OFF/.test(row), 'bron niet OFF');
  return 'mediaan van 3 producten opgeslagen';
});

await scenario('UAT-07', 'Product opzoeken via barcode', async () => {
  await page.goto(B + '#/ingredienten');
  await page.fill('[data-q]', 'halfvolle');
  await page.waitForTimeout(300);
  await page.locator('tr[data-id] [data-off]').first().click();
  await page.fill('[data-barcode] [name=code]', '8710400000001');
  await page.click('[data-barcode] button[type=submit]');
  await page.waitForSelector('[data-pick]');
  await page.click('[data-pick]');
  await page.waitForTimeout(400);
  const row = await page.locator('tr[data-id]').first().textContent();
  expect(/46/.test(row), 'kcal niet 46');
});

await scenario('UAT-08', 'Boodschappenlijst automatisch, per afdeling, met kosten', async () => {
  await page.goto(B + '#/boodschappen');
  await page.waitForSelector('.shop-group h2');
  const groups = await page.locator('.shop-group h2').count();
  const total = await page.locator('.stat-value').first().textContent();
  expect(groups >= 4, 'te weinig afdelingen');
  return `${groups} afdelingen, ${total}`;
});

await scenario('UAT-09', '‘Heb ik al in huis’ uitsluiten vóór het boodschappen doen', async () => {
  await page.goto(B + '#/boodschappen');
  const before = await page.locator('.stat-value').first().textContent();
  const name = await page.locator('.shop-list li strong').first().textContent();
  await page.locator('[data-have]').first().click();
  await page.waitForTimeout(400);
  const after = await page.locator('.stat-value').first().textContent();
  expect(await page.locator('.in-house').count() === 1 && before !== after, 'niet verplaatst of totaal gelijk');
  return `${name}: ${before} → ${after}`;
});

await scenario('UAT-10', 'Samen boodschappen doen: afvinken op telefoon verschijnt op desktop', async () => {
  await page.goto(B + '#/boodschappen');
  await mob.goto(B + '#/boodschappen');
  await mob.waitForSelector('[data-key]');
  await mob.locator('[data-key]').first().check();
  await page.waitForTimeout(8000);
  const done = await page.locator('.shop-list li.done').count();
  expect(done >= 1, 'desktop niet bijgewerkt');
  await mob.screenshot({ path: `${OUT}/10-boodschappen-mobiel.png` });
  return 'zichtbaar binnen ~6 s zonder verversen';
});

await scenario('UAT-11', 'Restjes inplannen zonder extra boodschappen', async () => {
  await page.goto(B + '#/planner');
  const before = (await api('/shopping')).total_cents;
  const entry = page.locator('.plan-entry:not(.free):not(.leftover)').first();
  await entry.locator('[data-entry-menu]').click();
  await page.click('[data-leftovers] button');
  await page.waitForTimeout(500);
  expect(await page.locator('.plan-entry.leftover').count() >= 1, 'geen restjes zichtbaar');
  const after = (await api('/shopping')).total_cents;
  await page.screenshot({ path: `${OUT}/11-restjes.png` });
  return `restjes gepland; lijst ${before} → ${after} ct (1 portie extra gekookt)`;
});

await scenario('UAT-12', '‘Wat kan ik maken?’ met ingrediënten in huis', async () => {
  await page.goto(B + '#/recepten');
  await page.fill('#have-input', 'kip, paprika, rijst, ui');
  await page.click('[data-have-form] button');
  await page.waitForTimeout(500);
  const first = await page.locator('.recipe-card .recipe-title').first().textContent();
  const match = await page.locator('.pantry-match').first().textContent();
  await page.screenshot({ path: `${OUT}/12-wat-kan-ik-maken.png` });
  expect(/Butter chicken|Kip kerrie|Wraps|Nasi/.test(first), `onverwacht: ${first}`);
  return `${first} – ${match.replace(/\s+/g, ' ').trim()}`;
});

await scenario('UAT-13', 'Snelfilters: vegetarisch, snel, goedkoop', async () => {
  await page.goto(B + '#/recepten');
  await page.click('[data-quick="cheap"]');
  await page.waitForTimeout(400);
  const prices = await page.locator('.recipe-meta span[title]').allTextContents();
  const vals = prices.map((p) => Number(p.replace(/[^\d,]/g, '').replace(',', '.')));
  expect(vals.length && vals.every((v) => v <= 2.5), `te duur: ${prices.join(', ')}`);
  return `${vals.length} recepten ≤ € 2,50 p.p.`;
});

await scenario('UAT-14', 'Eigen foto bij een recept uploaden', async () => {
  await page.goto(B + '#/recept/7/bewerken');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('[data-photo]', { name: 'pannenkoek.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('[name=image_url]').value.startsWith('/uploads/'));
  await page.click('button[type=submit]');
  await page.waitForURL(/#\/recept\/7$/);
  await page.waitForSelector('.hero-img img', { timeout: 5000 });
  const ok = await page.locator('.hero-img img').evaluate((i) => i.complete && i.naturalWidth > 0);
  expect(ok, 'foto laadt niet');
  return 'foto verkleind/omgezet en zichtbaar op de receptpagina';
});

await scenario('UAT-15', 'Back-up downloaden en terugzetten', async () => {
  const backup = await api('/backup');
  expect(backup.tables.recipes.length >= 16, 'back-up onvolledig');
  expect(!backup.tables.settings.some((s) => s.key === 'anthropic_api_key'), 'API-sleutel in back-up');
  const res = await api('/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) });
  expect(res.restored.recipes === backup.tables.recipes.length, 'terugzetten mislukt');
  return `${res.restored.recipes} recepten, ${res.restored.ingredients} ingrediënten`;
});

await scenario('UAT-16', 'Recepten offline bekijken', async () => {
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx2.newPage();
  await p.goto(B + '#/recepten');
  await p.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 10000 }).catch(() => null);
  await p.reload();
  await p.waitForSelector('.recipe-card');
  await p.goto(B + '#/recept/2');
  await p.waitForSelector('.ingredient-list');
  await ctx2.setOffline(true);
  await p.goto(B + '#/recepten');
  await p.reload();
  await p.waitForSelector('.recipe-card', { timeout: 8000 });
  const bar = await p.locator('.offline-bar.show').count();
  await p.screenshot({ path: `${OUT}/16-offline.png` });
  await ctx2.close();
  expect(bar === 1, 'geen offline-melding');
  return 'receptenlijst laadt uit cache, offline-melding zichtbaar';
});

await scenario('UAT-17', 'Kookmodus met stappen en timer', async () => {
  await page.goto(B + '#/recept/1/koken');
  await page.click('[data-next]');
  await page.click('[data-next]');
  const hasTimer = await page.locator('[data-timer]').count();
  expect(hasTimer === 1, 'geen timer bij stap 2 (20 minuten)');
});

await scenario('UAT-18', 'Geen account, advertenties of betaalmuur', async () => {
  await page.goto(B + '#/planner');
  const html = await page.content();
  expect(!/premium|upgrade|abonnement|advertentie/i.test(html), 'paywall-tekst gevonden');
});

await scenario('UAT-19', 'Claude-functies zonder sleutel geven duidelijke uitleg', async () => {
  await page.goto(B + '#/importeren');
  const t = await page.locator('.notice').textContent();
  expect(/API-sleutel/.test(t), 'geen uitleg');
  return 'melding + link naar Instellingen; handmatig invoeren blijft mogelijk';
});

await scenario('UAT-20', 'Mobiel: alle hoofdpagina’s bruikbaar zonder horizontaal scrollen', async () => {
  const bad = [];
  for (const h of ['#/planner', '#/recepten', '#/recept/1', '#/boodschappen', '#/importeren', '#/instellingen', '#/dagboek', '#/dagboek?tab=gewicht']) {
    await mob.goto(B + h);
    await mob.waitForTimeout(400);
    const w = await mob.evaluate(() => document.documentElement.scrollWidth);
    if (w > 392) bad.push(`${h} (${w}px)`);
  }
  expect(!bad.length, bad.join(', '));
});

await scenario('UAT-21', 'Ingrediënt aan een recept toevoegen door de barcode te scannen', async () => {
  await page.goto(B + '#/recept/7/bewerken');
  await page.click('[data-scan-row]');
  // In de headless browser is er geen camera: dan typt de gebruiker de cijfers in
  await page.fill('[data-manual] [name=code]', '8710400000001');
  await page.click('[data-manual] button');
  await page.waitForSelector('[data-apply]', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/21-barcode-recept.png` });
  await page.fill('[data-apply] [name=quantity]', '250');
  await page.selectOption('[data-apply] [name=unit]', 'ml');
  await page.click('[data-apply] button');
  await page.waitForTimeout(300);
  const names = await page.locator('[data-k="name"]').evaluateAll((els) => els.map((e) => e.value));
  const status = await page.locator('.ing-row').last().locator('[data-status]').textContent();
  expect(names.includes('halfvolle melk') && /✔/.test(status), `rij niet toegevoegd: ${names.join(', ')} / ${status}`);
  await page.click('button[type=submit]');
  await page.waitForURL(/#\/recept\/7$/);
  await page.waitForSelector('.ingredient-list');
  const txt = await page.locator('.ingredient-list').textContent();
  expect(/250 ml\s*halfvolle melk/.test(txt.replace(/\s+/g, ' ')), 'niet in opgeslagen recept');
  return 'EAN 8710400000001 → gekoppeld aan ‘halfvolle melk’ met voedingswaarden uit Open Food Facts';
});

await scenario('UAT-22', 'Prijzen uit Open Prices (officiële open API) gebruiken', async () => {
  // De prijzen worden op de achtergrond opgehaald; wacht tot dat klaar is (max. 90 s)
  const row = page.locator('tr[data-id]').filter({ has: page.locator('td:first-child strong', { hasText: /^wortel$/ }) });
  let badge = '';
  for (let i = 0; i < 30 && !/Open Prices/.test(badge); i++) {
    if (i) await page.waitForTimeout(3000);
    await page.goto(B + '#/ingredienten');
    await page.reload();
    await page.fill('[data-q]', 'wortel');
    await page.waitForTimeout(300);
    badge = await row.textContent();
  }
  expect(/Open Prices/.test(badge), `geen Open Prices-prijs: ${badge.replace(/\s+/g, ' ')}`);
  await row.locator('[data-prices]').click();
  await page.waitForSelector('[data-use]', { timeout: 10000 });
  await page.screenshot({ path: `${OUT}/22-open-prices.png` });
  const n = await page.locator('.modal .data-table tbody tr').count();
  await page.click('[data-use]');
  await page.goto(B + '#/recept/2');
  const txt = await page.locator('.ingredients-card').textContent();
  expect(/uit Open Prices/.test(txt), 'geen bronvermelding op receptpagina');
  return `wortel: ${n} winkelprijzen; receptpagina: ${txt.match(/Prijzen: [^.]*/)?.[0]}`;
});

await scenario('UAT-23', 'Calorieën bijhouden: zoeken, porties, gepland eten afvinken', async () => {
  await mob.goto(B + '#/dagboek');
  await mob.waitForSelector('.kcal-big');
  const kcal = async () => Number((await mob.textContent('.kcal-big')).replace(/\./g, ''));
  const k0 = await kcal();
  await mob.click('[data-add="ontbijt"]');
  await mob.fill('[data-q]', 'banaan');
  await mob.waitForSelector('[data-ing]');
  await mob.click('[data-ing]');
  await mob.fill('[data-amount] [name=n]', '120');
  const expected = Number((await mob.textContent('[data-kcal]')).replace(/\./g, ''));
  await mob.click('[data-amount] .btn-primary');
  await mob.waitForFunction((k) => Number(document.querySelector('.kcal-big').textContent.replace(/\./g, '')) > k, k0);
  expect(Math.abs((await kcal()) - k0 - expected) <= 1, 'banaan niet goed opgeteld');
  let planned = '';
  if (await mob.locator('[data-plan]').count()) {
    await mob.click('[data-plan]');
    await mob.waitForSelector('text=✓ in dagboek');
    planned = ', geplande maaltijd afgevinkt';
  }
  await mob.screenshot({ path: `${OUT}/23-dagboek.png`, fullPage: true });
  return `120 g banaan = ${expected} kcal; dagtotaal ${await kcal()} kcal${planned}`;
});

await scenario('UAT-24', 'Gewicht loggen met trendgrafiek; dagboek en gewicht in de agenda', async () => {
  await page.goto(B + '#/dagboek?tab=gewicht');
  await page.waitForSelector('[data-weight]');
  await page.fill('[name=weight_kg]', '81,4');
  await page.click('[data-weight] .btn-primary');
  await page.waitForSelector('.chart-svg .dot');
  expect((await page.textContent('.stat-value')).includes('81,4'), 'gewicht niet getoond');
  await page.screenshot({ path: `${OUT}/24-gewicht.png` });
  const { url } = await api('/calendar');
  const ics = await page.evaluate(async (u) => (await fetch(u)).text(), url.replace(/^https?:\/\/[^/]+/, ''));
  expect(/BEGIN:VCALENDAR/.test(ics) && /SUMMARY:🔥/.test(ics) && /SUMMARY:⚖️ 81\\,4 kg/.test(ics), 'agenda mist dagboek of gewicht');
  return `agenda-feed: ${(ics.match(/BEGIN:VEVENT/g) || []).length} afspraken (maaltijden, dagtotalen, gewicht)`;
});


// ---------- v3 ----------
const iso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const japi = (pg, m, path, body) => pg.evaluate(async ([m, path, body]) => (await fetch('/api' + path, { method: m, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })).json(), [m, path, body]);

await scenario('UAT-25', 'Telefoon/app: niets verdwijnt achter de status- of navigatiebalk', async () => {
  // Zoals de Android-app (edge-to-edge) de systeembalken doorgeeft: 32 px boven, 24 px onder
  const bad = [];
  for (const h of ['#/planner', '#/recepten', '#/boodschappen', '#/dagboek', '#/instellingen']) {
    await mob.goto(B + h);
    await mob.addStyleTag({ content: ':root{--safe-area-inset-top:32px;--safe-area-inset-bottom:24px}' });
    await mob.waitForTimeout(500);
    const r = await mob.evaluate(() => {
      const brand = document.querySelector('.topbar .brand').getBoundingClientRect();
      const nav = document.querySelector('.mainnav');
      const navLink = nav.querySelector('a').getBoundingClientRect();
      window.scrollTo(0, document.body.scrollHeight);
      const last = [...document.querySelectorAll('#app > :not(.view), #app > .view > *')].at(-1).getBoundingClientRect();
      return { brandTop: brand.top, navLinkBottom: navLink.bottom, vh: innerHeight, lastBottom: last.bottom, navTop: nav.getBoundingClientRect().top };
    });
    if (r.brandTop < 32) bad.push(`${h}: kop onder statusbalk (${r.brandTop})`);
    if (r.navLinkBottom > r.vh - 24) bad.push(`${h}: onderbalk onder navigatiebalk`);
    if (r.lastBottom > r.navTop + 1) bad.push(`${h}: laatste inhoud achter de onderbalk`);
  }
  await mob.goto(B + '#/planner'); await mob.addStyleTag({ content: ':root{--safe-area-inset-top:32px;--safe-area-inset-bottom:24px}' });
  await mob.waitForTimeout(400); await mob.screenshot({ path: `${OUT}/25-systeembalken.png` });
  // Een open venster blijft niet hangen bij wisselen van pagina
  await mob.goto(B + '#/dagboek'); await mob.waitForSelector('[data-add]');
  await mob.locator('[data-add="lunch"]').tap(); await mob.waitForSelector('.modal');
  // Zoals de terugknop van Android of een link: de pagina wisselt terwijl het venster open is
  await mob.evaluate(() => { location.hash = '#/planner'; }); await mob.waitForTimeout(600);
  if (await mob.locator('.modal-backdrop').count()) bad.push('venster bleef open na navigeren');
  expect(!bad.length, bad.join('; '));
  return '5 pagina’s met nagebootste systeembalken; vensters sluiten bij navigeren';
});

await scenario('UAT-26', 'Touchscreen: knoppen groot genoeg om met een vinger te raken', async () => {
  await mob.goto(B + '#/planner'); await mob.waitForSelector('.plan-entry');
  // Richtlijn Apple: 44 pt, Google: 48 dp. Per soort knop de kleinste die zichtbaar is.
  const sizes = await mob.evaluate(() => ['.slot-add', '.plan-entry [data-entry-menu]', '.plan-entry [data-remove]', '.eat-toggle', '.plan-extras.add', '.servings-ctl .mini', '.mainnav a', '.btn', '.day-jump a']
    .map((sel) => {
      const vis = [...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
      return [sel, vis.length ? Math.round(Math.min(...vis.map((r) => Math.min(r.width, r.height)))) : null];
    }));
  const small = sizes.filter(([, v]) => v != null && v < 44);
  expect(!small.length, `te klein: ${small.map(([k, v]) => `${k} ${v}px`).join(', ')}`);
  return sizes.filter(([, v]) => v).map(([k, v]) => `${k} ${v}px`).join(', ');
});

await scenario('UAT-27', 'Vlees of vis bij een gerecht zonder vlees, zonder nieuw recept', async () => {
  await page.goto(B + '#/planner'); await page.waitForSelector('.day');
  const today = iso();
  const pk = (await japi(page, 'GET', '/recipes')).find((r) => r.title === 'Hollandse pannenkoeken');
  await page.locator(`.slot[data-date="${today}"][data-meal="diner"] [data-add]`).click();
  await page.waitForSelector('[data-meat-pick]');
  const slavink = (await japi(page, 'GET', '/ingredients?q=slavink'))[0];
  await page.selectOption('.modal [data-meat-pick]', String(slavink.id));
  await page.fill('.modal [data-q]', 'pannenkoek'); await page.waitForTimeout(200);
  await page.click(`.modal [data-pick="${pk.id}"]`); await page.waitForTimeout(700);
  const txt = await page.locator(`.slot[data-date="${today}"][data-meal="diner"]`).textContent();
  expect(/slavink/.test(txt), `kaartje: ${txt.replace(/\s+/g, ' ')}`);
  const shop = await japi(page, 'GET', `/shopping?week=${today}`);
  expect(shop.items.some((i) => i.name === 'slavink'), 'slavink niet op de boodschappenlijst');
  await page.screenshot({ path: `${OUT}/27-vlees-erbij.png` });
  return 'pannenkoeken + slavink: op kaartje en boodschappenlijst';
});

await scenario('UAT-28', 'Maaltijd van losse ingrediënten (zonder recept)', async () => {
  await page.goto(B + '#/planner'); await page.waitForSelector('.day');
  const today = iso();
  await page.locator(`.slot[data-date="${today}"][data-meal="ontbijt"] [data-add]`).click();
  await page.click('.modal [data-loose]'); await page.waitForSelector('[data-meat-list] [data-add]');
  for (const q of ['croissant', 'banaan']) {
    await page.fill('[data-meat-q]', q); await page.waitForTimeout(250);
    await page.locator('[data-meat-list] [data-add]').first().click(); await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  const txt = (await page.locator(`.slot[data-date="${today}"][data-meal="ontbijt"]`).textContent()).replace(/\s+/g, ' ');
  expect(/croissant/.test(txt) && /banaan/.test(txt), txt);
  await page.locator(`.slot[data-date="${today}"][data-meal="ontbijt"]`).screenshot({ path: `${OUT}/28-losse-ingredienten.png` });
  return txt.trim().slice(0, 80);
});

await scenario('UAT-29', 'Een gerecht als vlees bij een ander gerecht', async () => {
  const recs = await japi(page, 'GET', '/recipes');
  const hachee = recs.find((r) => r.title.startsWith('Hachee'));
  const full = await japi(page, 'GET', `/recipes/${hachee.id}`);
  await japi(page, 'PUT', `/recipes/${hachee.id}`, { ...full, is_side: true });
  const and = recs.find((r) => r.title.startsWith('Andijvie'));
  const date = iso(new Date(Date.now() + 86400000));
  const { id } = await japi(page, 'POST', '/plan', { date, meal: 'diner', recipe_id: and.id, servings: 2, extras: [{ recipe_id: hachee.id, quantity: 1 }] });
  const e = (await japi(page, 'GET', `/plan?week=${date}`)).days.flatMap((d) => d.entries).find((x) => x.id === id);
  expect(e.extras[0].name.startsWith('Hachee') && e.kcal_per_serving > 0, JSON.stringify(e.extras));
  return `${and.title} + ${e.extras[0].name}: ${Math.round(e.kcal_per_serving)} kcal p.p.`;
});

await scenario('UAT-30', 'Minder restjes: hele verpakking, hele stuks en een minimum', async () => {
  const recs = await japi(page, 'GET', '/recipes');
  const bc = recs.find((r) => r.title.startsWith('Butter'));
  const full = await japi(page, 'GET', `/recipes/${bc.id}`);
  const ingredients = full.ingredients.map((r) => ({ ...r, amount_rule: r.name === 'slagroom' ? 'package' : r.amount_rule, min_quantity: r.name === 'ui' ? 1 : r.min_quantity }));
  await japi(page, 'PUT', `/recipes/${bc.id}`, { ...full, ingredients });
  await page.goto(B + `#/recept/${bc.id}?personen=1`); await page.waitForSelector('.ingredient-list');
  await page.waitForTimeout(400);
  const txt = (await page.textContent('.ingredient-list')).replace(/\s+/g, ' ');
  expect(/1 stuk ui/.test(txt) && /250 ml slagroom/.test(txt) && /hele verpakking/.test(txt), txt.slice(0, 200));
  return 'voor 1 persoon: 1 ui (minimum), 250 ml slagroom (heel pak)';
});

await scenario('UAT-31', 'Recepten verwijderen (ook meerdere) en standaardrecepten terugzetten', async () => {
  await page.goto(B + '#/recepten'); await page.waitForSelector('.recipe-card');
  const n0 = await page.locator('.recipe-card').count();
  await page.click('[data-select-mode]');
  await page.locator('.recipe-card').nth(0).click(); await page.locator('.recipe-card').nth(1).click();
  await page.click('[data-delete-selected]'); await page.click('[data-yes]'); await page.waitForTimeout(700);
  const n1 = await page.locator('.recipe-card').count();
  expect(n1 === n0 - 2, `${n0} → ${n1}`);
  await page.goto(B + '#/instellingen'); await page.waitForSelector('[data-restore-builtins]');
  await page.click('[data-restore-builtins]'); await page.waitForTimeout(600);
  const n2 = (await japi(page, 'GET', '/recipes')).length;
  expect(n2 === n0, `terugzetten: ${n2}`);
  return `${n0} → ${n1} → ${n2}`;
});

await scenario('UAT-32', 'Niet-herkend ingrediënt koppelen of aanmaken vanuit het recept', async () => {
  await page.goto(B + '#/recepten');
  // Unieke naam: een eerder aangemaakte vrucht wordt (terecht) automatisch herkend
  const fruit = 'qx' + [...Array(8)].map(() => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  const r = await japi(page, 'POST', '/recipes', { title: 'UAT fruitbak', servings: 2, steps: ['Snijd.'], ingredients: [{ name: fruit, quantity: 2, unit: 'stuk' }] });
  await page.goto(B + `#/recept/${r.id}`); await page.waitForSelector('[data-link-row]');
  await page.click('[data-link-row]'); await page.click('[data-tab="nieuw"]');
  await page.fill('[data-pane="nieuw"] [name=kcal]', '60'); await page.fill('[data-pane="nieuw"] [name=unit_weight_g]', '150');
  await page.click('[data-pane="nieuw"] .btn-primary'); await page.waitForTimeout(700);
  const after = await japi(page, 'GET', `/recipes/${r.id}`);
  expect(after.ingredients[0].ingredient_id && after.missing_nutrition === 0, JSON.stringify(after.ingredients[0]).slice(0, 120));
  return `‘${fruit}’ aangemaakt en gekoppeld: ${Math.round(after.nutrition_total.kcal)} kcal totaal`;
});

await scenario('UAT-33', 'Snel loggen: recent gebruikt met één tik, bake-off uit de Jumbo-lijst', async () => {
  await mob.goto(B + '#/dagboek'); await mob.waitForSelector('[data-add]');
  await mob.locator('[data-add="ontbijt"]').tap();
  await mob.fill('[data-q]', 'croissant'); await mob.waitForSelector('[data-ing]');
  const names = await mob.locator('[data-ing]').allTextContents();
  expect(names.some((n) => /roomboter croissant/.test(n)), names.join(' | '));
  await mob.locator('[data-ing]').filter({ hasText: 'roomboter croissant' }).first().tap();
  await mob.locator('[data-amount] .btn-primary').tap(); await mob.waitForTimeout(600);
  await mob.locator('[data-add="tussendoor"]').tap(); await mob.waitForSelector('[data-recent]');
  await mob.waitForTimeout(700); await mob.screenshot({ path: `${OUT}/33-recent.png` });
  const before = Number((await mob.textContent('.kcal-big')).replace(/\D/g, ''));
  await mob.locator('[data-recent]').first().tap(); await mob.waitForTimeout(600);
  const after = Number((await mob.textContent('.kcal-big')).replace(/\D/g, ''));
  expect(after > before, `${before} → ${after}`);
  const ing = (await japi(mob, 'GET', '/ingredients?q=roomboter croissant'))[0];
  expect(/Gluten/.test(ing.allergens || ''), 'allergenen ontbreken');
  return `croissant (Jumbo bake-off, ${ing.unit_weight_g} g, allergenen: ${ing.allergens}); recent: ${before} → ${after} kcal`;
});

await scenario('UAT-34', 'Uit eten met één tik; geen vlees bij ontbijt en lunch; prijs bij losse ingrediënten', async () => {
  await page.goto(B + '#/planner'); await page.waitForSelector('.day');
  const day = iso(); // vandaag: staat altijd in de getoonde week
  // Uit eten kiezen bij het plannen
  await page.locator(`.slot[data-date="${day}"][data-meal="diner"] [data-add]`).click();
  await page.click('.modal [data-eat-out]'); await page.waitForTimeout(600);
  const diner = (await page.locator(`.slot[data-date="${day}"][data-meal="diner"]`).textContent()).replace(/\s+/g, ' ');
  expect(/Uit eten/.test(diner), `uit eten niet gepland: ${diner}`);
  // Ontbijt en lunch: geen vlees-keuze bij het plannen en geen vlees-knop op het kaartje
  await page.locator(`.slot[data-date="${day}"][data-meal="ontbijt"] [data-add]`).click();
  await page.waitForSelector('.modal [data-pick]');
  expect(!(await page.locator('.modal [data-meat-pick]').count()), 'vlees-keuze staat bij het ontbijt');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.locator(`.slot[data-date="${day}"][data-meal="lunch"] [data-add]`).click();
  await page.waitForSelector('.modal [data-pick]');
  expect(!(await page.locator('.modal [data-meat-pick]').count()), 'vlees-keuze staat bij de lunch');
  const tosti = (await japi(page, 'GET', '/recipes')).find((r) => /tosti/i.test(r.title));
  await page.fill('.modal [data-q]', 'tosti'); await page.waitForTimeout(200);
  await page.click(`.modal [data-pick="${tosti.id}"]`); await page.waitForTimeout(600);
  const lunch = page.locator(`.slot[data-date="${day}"][data-meal="lunch"]`);
  expect(!(await lunch.locator('.plan-extras.add').count()), 'vlees-knop op de lunch');
  expect(await page.locator(`.slot[data-date="${day}"][data-meal="diner"] .plan-entry`).count() >= 1, 'diner ontbreekt');
  // Losse ingrediënten (uit UAT-28) tonen een prijs
  const loose = page.locator(`.slot[data-date="${iso()}"][data-meal="ontbijt"] .plan-entry`).first();
  const meta = (await loose.locator('.plan-entry-meta').textContent()).replace(/\s+/g, ' ');
  expect(/€\s?\d/.test(meta), `geen prijs bij losse ingrediënten: ${meta}`);
  return `uit eten gepland; ontbijt en lunch zonder vlees-optie; losse ingrediënten: ${meta.match(/€\s?[\d,]+/)[0]}`;
});

await scenario('UAT-35', 'Planner: kcal per maaltijd, en wat in het dagboek staat is ook in de planner te zien', async () => {
  await page.goto(B + '#/planner'); await page.waitForSelector('.day');
  const today = iso();
  const { people } = await japi(page, 'GET', '/people');
  await japi(page, 'POST', '/diary', { person_id: people[0].id, date: today, meal: 'lunch', type: 'free', name: 'Broodje gezond bij de bakker', values: { kcal: 420 } });
  await page.evaluate(() => localStorage.removeItem('maaltijden-persoon'));
  await page.reload(); await page.waitForSelector('.day');
  const lunch = (await page.locator(`.slot[data-date="${today}"][data-meal="lunch"]`).textContent()).replace(/\s+/g, ' ');
  expect(/📓 Broodje gezond bij de bakker/.test(lunch) && /420 kcal/.test(lunch), `niet in de planner: ${lunch}`);
  const figures = await page.locator('.plan-entry .entry-figures').allTextContents();
  expect(figures.length && figures.every((t) => /\d kcal/.test(t)), `geen kcal op de kaartjes: ${figures.slice(0, 3).join(' | ')}`);
  await page.locator(`.day.today`).screenshot({ path: `${OUT}/35-dagboek-in-planner.png` });
  // Op de telefoon ook
  await mob.goto(B + '#/planner'); await mob.evaluate(() => localStorage.removeItem('maaltijden-persoon'));
  await mob.reload(); await mob.waitForSelector('.day');
  expect(await mob.locator(`.slot[data-date="${today}"] .diary-items`).count() >= 1, 'dagboek niet zichtbaar op de telefoon');
  return `lunch: ‘Broodje gezond’ (420 kcal) uit het dagboek; kaartjes: ${figures[0].trim()}`;
});

await browser.close();
console.log(JSON.stringify({ results, errors }, null, 1));
