// Start van de browserdemo: SQLite (sql.js) laden, database uit de browseropslag halen,
// /api-verzoeken in de browser afhandelen en daarna de gewone app starten.
globalThis.process = { env: {} };
window.__MAALTIJDEN_DEMO = true; // geen service worker in de demo

const STORE_KEY = 'maaltijden-demo-db';
const status = document.getElementById('demo-status');

function loadSaved() {
  try {
    const b64 = localStorage.getItem(STORE_KEY);
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const bytes = globalThis.__DEMO_DB.export();
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      localStorage.setItem(STORE_KEY, btoa(bin));
    } catch { /* opslag niet beschikbaar: de demo werkt dan alleen tot je de pagina sluit */ }
  }, 300);
}

try {
  globalThis.__SQL = await window.initSqlJs();
  globalThis.__SAVED_DB = loadSaved();
  const { openDatabase } = await import('./server/db.js');
  openDatabase(':memory:');
  const demoApi = await import('./api.js');

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      return demoApi.handle(String(init.method || 'GET').toUpperCase(), url, init.body, persist);
    }
    return realFetch(input, init);
  };

  document.querySelector('[data-demo-reset]')?.addEventListener('click', () => {
    try { localStorage.removeItem(STORE_KEY); } catch { /* niets */ }
    location.hash = '#/planner';
    location.reload();
  });
  status?.remove();
  await import('./app.js');
} catch (err) {
  console.error(err);
  if (status) status.textContent = `De demo kon niet starten: ${err.message}`;
}
