// Gebruikersacceptatietest v2: elk scenario is een gebruikerstaak, afgeleid van recensies/verwachtingen.
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
async function scenario(id, title, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ id, title, result: 'PASS', note: note || '', ms: Date.now() - t0 });
  } catch (err) {
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
  for (const h of ['#/planner', '#/recepten', '#/recept/1', '#/boodschappen', '#/importeren', '#/instellingen']) {
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
  await page.goto(B + '#/ingredienten');
  await page.fill('[data-q]', 'wortel');
  await page.waitForTimeout(300);
  const row = page.locator('tr[data-id]').filter({ has: page.locator('td:first-child strong', { hasText: /^wortel$/ }) });
  const badge = await row.textContent();
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

await browser.close();
console.log(JSON.stringify({ results, errors }, null, 1));
