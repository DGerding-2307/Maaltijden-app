#!/usr/bin/env node
// Driver voor de Maaltijden-app: start de server met een lege, tijdelijke database en praat er via HTTP mee.
//
//   node .claude/skills/run-maaltijden/driver.mjs smoke          start, loop een echte flow door, stop
//   node .claude/skills/run-maaltijden/driver.mjs serve [poort]  start en blijf draaien (Ctrl-C stopt); voor de browser
//   node .claude/skills/run-maaltijden/driver.mjs call GET /api/stock [json]   één verzoek naar een draaiende server
//
// Alles draait tegen een tijdelijke map (DB_FILE + uploads), nooit tegen data/maaltijden.db.
// Externe diensten staan uit: OFF_DISABLED=1 (Open Food Facts/Open Prices), REMINDERS_DISABLED=1.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const unit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const [cmd = 'smoke', ...args] = process.argv.slice(2);

const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function start(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maaltijden-run-'));
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    cwd: unit,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DB_FILE: path.join(dir, 'maaltijden.db'), UPLOAD_DIR: path.join(dir, 'uploads'), OFF_DISABLED: '1', REMINDERS_DISABLED: '1', ANTHROPIC_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode != null) throw new Error(`Server stopte meteen:\n${log}`);
    try { if ((await fetch(`${base}/health`)).ok) return { child, base, dir, log: () => log }; } catch { /* nog niet klaar */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`Server kwam niet op binnen 20 s:\n${log}`);
}

async function call(base, method, url, body) {
  const res = await fetch(base + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

// Windows: de database blijft vergrendeld tot het proces echt weg is, dus eerst wachten en dan pas opruimen.
async function stopServer(s) {
  if (s.child.exitCode == null) { const gone = new Promise((r) => s.child.once('exit', r)); s.child.kill(); await gone; }
  fs.rmSync(s.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

const ok = (label, value) => console.log(`✔ ${label}${value === undefined ? '' : `: ${value}`}`);

async function smoke() {
  const s = await start(await freePort());
  try {
    const health = await call(s.base, 'GET', '/health');
    ok('health', `versie ${health.version}`);
    const html = await (await fetch(s.base + '/')).text();
    if (!html.includes('<html')) throw new Error('/ geeft geen HTML');
    ok('voorpagina', `${html.length} tekens HTML`);

    const recipes = await call(s.base, 'GET', '/api/recipes');
    ok('ingebouwde recepten', recipes.length);
    const pasta = recipes.find((r) => /pasta|spaghetti/i.test(r.title)) || recipes[0];
    const today = new Date().toISOString().slice(0, 10);

    const plan = await call(s.base, 'POST', '/api/plan', { date: today, meal: 'diner', recipe_id: pasta.id, servings: 2 });
    ok('gepland', `${pasta.title} (plan-id ${plan.id})`);

    let shop = await call(s.base, 'GET', `/api/shopping?week=${today}`);
    const item = shop.items.find((i) => i.ingredient_id && !i.pantry);
    ok('boodschappenlijst', `${shop.items.length} artikelen, bv. ${item.name} ${Math.round(item.grams)} g`);

    // Voorraad: product in huis zetten en zien dat de lijst het meeneemt
    const added = await call(s.base, 'POST', '/api/stock', { ingredient_id: item.ingredient_id, grams: Math.ceil(item.grams), best_before: today });
    ok('voorraad toegevoegd', `${item.name} ${added[0].grams_left} g, tht ${added[0].best_before}`);
    shop = await call(s.base, 'GET', `/api/shopping?week=${today}`);
    const after = shop.items.find((i) => i.key === item.key);
    if (!(after.in_stock_g > 0)) throw new Error(`in_stock_g bleef 0 voor ${item.name}`);
    ok('lijst ziet voorraad', `${item.name} in_stock_g=${after.in_stock_g}`);

    await call(s.base, 'DELETE', `/api/plan/${plan.id}`);
    ok('planning weer leeg');
    console.log('\nSMOKE OK');
  } finally {
    await stopServer(s);
  }
}

if (cmd === 'smoke') {
  smoke().catch((e) => { console.error('✘', e.message); process.exit(1); });
} else if (cmd === 'serve') {
  const s = await start(Number(args[0]) || 3000);
  console.log(`Draait op ${s.base} (tijdelijke data in ${s.dir}). Ctrl-C stopt.`);
  const stop = () => { s.child.removeAllListeners('exit'); stopServer(s).then(() => process.exit(0)); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  s.child.on('exit', () => { console.log(s.log()); process.exit(1); });
} else if (cmd === 'call') {
  const [method, url, body, base = process.env.MAALTIJDEN_URL || 'http://127.0.0.1:3000'] = args;
  // Git Bash maakt van '/api/x' een Windows-pad; daarom mag het pad ook zonder voorloop-slash.
  call(base, method, '/' + url.replace(/^.*?(?=api\/|health)/, ''), body ? JSON.parse(body) : undefined)
    .then((d) => console.log(JSON.stringify(d, null, 2)))
    .catch((e) => { console.error('✘', e.message); process.exit(1); });
} else {
  console.error('Gebruik: driver.mjs smoke | serve [poort] | call METHOD /pad [json]');
  process.exit(2);
}
