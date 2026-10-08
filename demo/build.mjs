// Bouwt de browserdemo in dist-demo/: de echte frontend en datalaag, met SQLite in de browser (sql.js).
// Gebruik: node demo/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist-demo');
const SQLJS = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-asm-memory-growth.js';

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'js', 'server'), { recursive: true });

// Frontend (ongewijzigd)
fs.cpSync(path.join(root, 'public', 'js'), path.join(out, 'js'), { recursive: true });

// Datalaag van de server, met node-imports vervangen door browser-shims
for (const f of ['calc.js', 'repo.js', 'seed.js', 'db.js']) {
  let src = fs.readFileSync(path.join(root, 'server', f), 'utf8');
  src = src
    .replace("from 'node:sqlite'", "from './sqlite-shim.js'")
    .replace("import fs from 'node:fs';", "import fs from './node-shim.js';")
    .replace("import path from 'node:path';", "import path from './node-shim.js';");
  if (/from 'node:/.test(src)) throw new Error(`${f} gebruikt nog een node-module`);
  fs.writeFileSync(path.join(out, 'js', 'server', f), src);
}
fs.copyFileSync(path.join(root, 'demo', 'sqlite-shim.js'), path.join(out, 'js', 'server', 'sqlite-shim.js'));
fs.copyFileSync(path.join(root, 'demo', 'node-shim.js'), path.join(out, 'js', 'server', 'node-shim.js'));
fs.copyFileSync(path.join(root, 'demo', 'api.js'), path.join(out, 'js', 'api-demo.js'));
fs.writeFileSync(path.join(out, 'js', 'boot.js'), fs.readFileSync(path.join(root, 'demo', 'boot.js'), 'utf8').replace("import('./api.js')", "import('./api-demo.js')"));
// api-demo.js importeert ./server/...; dat pad klopt vanuit js/

// Pagina: titel, CSS inline, kop en navigatie uit public/index.html
const css = fs.readFileSync(path.join(root, 'public', 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const bodyMarkup = html.slice(html.indexOf('<header'), html.indexOf('<script'));
const page = `<title>Maaltijden</title>
<style>
${css}
.demo-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1rem; padding: .5rem 1.25rem; background: var(--surface-2); border-bottom: 1px solid var(--border); font-size: .85rem; color: var(--text); }
.demo-bar strong { color: var(--primary); }
.demo-bar button { margin-left: auto; }
#demo-status { padding: 3rem 1rem; text-align: center; color: var(--muted); }
body label:has(> input[name="anthropic_api_key"]), body a[href="/api/backup"] { display: none; }
@media (max-width: 720px) { .demo-bar { padding: .5rem .9rem; } }
</style>
<div class="demo-bar" role="note">
  <span><strong>Demo</strong> · draait helemaal in je browser; wat je wijzigt blijft alleen op dit apparaat bewaard.
  Claude, Open Food Facts en Open Prices werken alleen op je eigen server.</span>
  <button class="btn btn-ghost" type="button" data-demo-reset>Demo opnieuw beginnen</button>
</div>
${bodyMarkup.replace('<main id="app" tabindex="-1"></main>', '<main id="app" tabindex="-1"><div id="demo-status">Demo laden…</div></main>')}
<script src="${SQLJS}"></script>
<script type="module" src="js/boot.js"></script>
`;
fs.writeFileSync(path.join(out, 'index.html'), page);

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(path.relative(out, p));
  }
})(out);
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(files, null, 2));
console.log(`Demo gebouwd in ${path.relative(root, out)} (${files.length} scripts)`);
