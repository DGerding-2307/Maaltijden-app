// Eenvoudige hash-router.
import { $, $$, esc, closeAllModals, hasDirtyModal, savedPerson, toast } from './util.js';
import { checkForUpdateBanner } from './update.js';
import { api } from './api.js';
import { buddySvg } from './buddy.js';
import { pageSay } from './say.js';

const routes = [
  [/^\/vandaag$/, () => import('./views/vandaag.js')],
  [/^\/meer$/, () => import('./views/meer.js')],
  [/^\/account$/, () => import('./views/account.js')],
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

let currentHash = location.hash;
async function router() {
  // Terugknop/-veeggebaar terwijl je iets aan het invullen bent: eerst vragen, anders blijft het venster staan
  if (location.hash !== currentHash && hasDirtyModal()
    && !window.confirm('Je hebt iets ingevuld dat nog niet is opgeslagen. Weggooien en verdergaan?')) {
    history.replaceState(null, '', currentHash || location.pathname);
    return;
  }
  currentHash = location.hash;
  const hash = location.hash.slice(1) || '/vandaag';
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
      $('#page-say').innerHTML = pageSay(section);
      cleanup = await view.render(main, { id: m[1] ? Number(m[1]) : null, ...params });
    } catch (err) {
      console.error(err);
      main.innerHTML = `<div class="empty"><h2>Er ging iets mis</h2><p>${esc(err.message)}</p></div>`;
    }
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/vandaag';
}

// ---------- Opstarten (v4): eerst kijken of je moet inloggen ----------
$('[data-brand-buddy]').innerHTML = buddySvg({ mood: 'rust', label: 'Maaltijden' });

function drawAccountChip(me) {
  const chip = $('[data-account]');
  const u = me.user;
  chip.hidden = false;
  chip.innerHTML = u ? `<span class="av">${esc(u.name.charAt(0).toUpperCase())}</span><span class="nm">${esc(u.name)}</span>` : '<span class="av">👤</span><span class="nm">Account</span>';
  chip.title = u ? `Ingelogd als ${u.name}` : 'Account maken';
}

// ‘Eten loggen’: de grote + op de telefoon en de knop bovenin op de computer
$$('[data-log-open]').forEach((b) => b.addEventListener('click', async () => {
  const { openLog } = await import('./log.js');
  let personId = savedPerson();
  if (!personId) personId = (await api.get('/people')).people[0].id;
  // Schermen die het dagboek tonen verversen zelf (de router zou ook de reactie van het maatje sluiten)
  openLog({ personId, onDone: () => window.dispatchEvent(new Event('maaltijden-logged')) });
}));

async function start() {
  let me = { accounts_enabled: false, user: null };
  try { me = await api.get('/auth/me'); } catch { /* offline: verder zonder */ }
  window.__maaltijdenUser = me.user;
  drawAccountChip(me);
  if (me.accounts_enabled && !me.user) {
    const { renderLogin } = await import('./views/account.js');
    renderLogin($('#app'), { onLoggedIn: () => location.reload() });
    return;
  }
  window.addEventListener('hashchange', router);
  // Terug uit het beginscherm van de Android-app na ‘meldingen aanzetten’
  const { reminderResultFromHash } = await import('./reminders.js');
  const result = reminderResultFromHash();
  router();
  if (result) setTimeout(() => toast(result.text, result.ok ? 'success' : 'error'), 600);
}
// Sessie verlopen of uitgelogd op een ander apparaat
window.addEventListener('login-required', () => { if (!document.body.classList.contains('auth-only')) location.reload(); });
start();

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
// Pas na het inloggen (op het inlogscherm geeft de server toch geen antwoord)
const loggedOut = () => document.body.classList.contains('auth-only');
setTimeout(() => !loggedOut() && checkVersion(), 1500);
setInterval(() => !document.hidden && !loggedOut() && checkVersion(), 60000);
// Nieuwe versie beschikbaar? Dan een melding met ‘Nu updaten’ (kort na het openen en daarna elke 6 uur)
setTimeout(() => !loggedOut() && checkForUpdateBanner(), 4000);
setInterval(() => !document.hidden && !loggedOut() && checkForUpdateBanner(), 6 * 60 * 60 * 1000);
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
