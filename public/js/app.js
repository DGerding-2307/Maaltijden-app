// Eenvoudige hash-router.
import { $, $$, esc, closeAllModals } from './util.js';

const routes = [
  [/^\/planner$/, () => import('./views/planner.js')],
  [/^\/recepten$/, () => import('./views/recipes.js')],
  [/^\/recept\/nieuw$/, () => import('./views/editor.js')],
  [/^\/recept\/(\d+)\/bewerken$/, () => import('./views/editor.js')],
  [/^\/recept\/(\d+)\/koken$/, () => import('./views/cook.js')],
  [/^\/recept\/(\d+)$/, () => import('./views/recipe.js')],
  [/^\/importeren$/, () => import('./views/import.js')],
  [/^\/boodschappen$/, () => import('./views/shopping.js')],
  [/^\/dagboek$/, () => import('./views/diary.js')],
  [/^\/ingredienten$/, () => import('./views/ingredients.js')],
  [/^\/instellingen$/, () => import('./views/settings.js')],
];

let cleanup = null;

async function router() {
  const hash = location.hash.slice(1) || '/planner';
  const [path, query = ''] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const main = $('#app');
  for (const [re, load] of routes) {
    const m = path.match(re);
    if (!m) continue;
    closeAllModals();
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    const section = path.split('/')[1];
    const navKey = section === 'recept' ? (path.endsWith('nieuw') ? 'importeren' : 'recepten') : section;
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
    main.innerHTML = '<div class="loading">Laden…</div>';
    try {
      const view = await load();
      cleanup = await view.render(main, { id: m[1] ? Number(m[1]) : null, ...params });
    } catch (err) {
      console.error(err);
      main.innerHTML = `<div class="empty"><h2>Er ging iets mis</h2><p>${esc(err.message)}</p></div>`;
    }
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/planner';
}

window.addEventListener('hashchange', router);
router();

// Na een automatische update draait de server een nieuwe versie: vraag om de pagina te vernieuwen.
let loadedVersion = null;
async function checkVersion() {
  try {
    const res = await fetch('/api/changes', { cache: 'no-store' });
    const { app_version: v } = await res.json();
    if (!v) return;
    loadedVersion ??= v;
    if (v !== loadedVersion && !document.querySelector('.update-bar')) {
      const bar = document.createElement('div');
      bar.className = 'update-bar';
      bar.innerHTML = `<span>Er is een nieuwe versie (${v}) geïnstalleerd.</span><button class="btn btn-primary" type="button">Vernieuwen</button>`;
      bar.querySelector('button').addEventListener('click', () => location.reload());
      document.body.append(bar);
    }
  } catch { /* offline */ }
}
checkVersion();
setInterval(() => !document.hidden && checkVersion(), 60000);
document.addEventListener('visibilitychange', () => !document.hidden && checkVersion());

// Offline-melding
const offlineBar = document.createElement('div');
offlineBar.className = 'offline-bar';
offlineBar.textContent = 'Offline – je ziet de laatst opgehaalde gegevens. Wijzigingen lukken pas weer met verbinding.';
const updateOnline = () => offlineBar.classList.toggle('show', !navigator.onLine);
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
document.body.append(offlineBar);
updateOnline();

if (!window.__MAALTIJDEN_DEMO && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
