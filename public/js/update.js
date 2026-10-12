// Direct updaten: de server geeft de updater-container opdracht; daarna herstart de app met de nieuwe versie.
import { api } from './api.js';
import { esc, toast } from './util.js';

export const updateStatus = (refresh = false) => api.get(`/update${refresh ? '?vernieuw=1' : ''}`);

/** Korte versie voor mensen: "3.2.3+fe4de15" → "3.2.3". */
export const shortVersion = (v) => String(v || '').split('+')[0];

async function currentVersion() {
  const res = await fetch('/api/changes', { cache: 'no-store' });
  return (await res.json()).app_version;
}

/**
 * Update starten en wachten tot de nieuwe versie draait (max. 8 minuten), dan de pagina vernieuwen.
 * Tijdens het herstarten is de server even niet bereikbaar; dat is normaal.
 */
export async function startUpdate({ expected = true } = {}) {
  const before = await currentVersion().catch(() => null);
  const overlay = document.createElement('div');
  overlay.className = 'update-progress';
  overlay.setAttribute('role', 'status');
  overlay.innerHTML = `<div class="update-progress-box">
      <div class="spinner" aria-hidden="true"></div>
      <h2>Bezig met updaten…</h2>
      <p data-step>De nieuwe versie wordt gedownload.</p>
      <p class="muted small">Dit duurt meestal 1 à 2 minuten. Vóór de update wordt een back-up van je gegevens gemaakt.</p>
    </div>`;
  document.body.append(overlay);
  const step = (t) => { overlay.querySelector('[data-step]').textContent = t; };
  try {
    const r = await api.post('/update');
    if (r.already_running) step('Er loopt al een update; even wachten…');
  } catch (err) {
    overlay.remove();
    toast(err.message, 'error');
    return false;
  }
  const t0 = Date.now();
  let wasDown = false;
  while (Date.now() - t0 < 8 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 3000));
    let v = null;
    try { v = await currentVersion(); } catch { wasDown = true; step('De app wordt herstart…'); continue; }
    if (v && before && v !== before) {
      step(`Klaar! Versie ${shortVersion(v)} is geïnstalleerd.`);
      setTimeout(() => location.reload(), 1200);
      return true;
    }
    // Weer bereikbaar met dezelfde versie na een herstart, of lange tijd geen herstart terwijl er (voor zover bekend)
    // niets nieuws was: dan viel er niets te installeren. Bij een bekende nieuwe versie kan het downloaden even duren.
    if ((wasDown && v === before) || (!wasDown && !expected && Date.now() - t0 > 2 * 60 * 1000)) {
      overlay.remove();
      toast('Er was geen nieuwere versie om te installeren. Je hebt de nieuwste versie.', 'success');
      return false;
    }
  }
  overlay.remove();
  toast('De update duurt langer dan verwacht. Kijk in Portainer of de container ‘maaltijden-updater’ draait.', 'error');
  return false;
}

/** Melding bovenin als er een nieuwe versie klaarstaat (één keer per versie, ‘Later’ verbergt hem). */
export async function checkForUpdateBanner() {
  let s;
  try { s = await updateStatus(); } catch { return; }
  if (!s.update_available || !s.can_update || document.querySelector('.update-bar')) return;
  const key = 'maaltijden-update-later';
  try { if (localStorage.getItem(key) === s.latest) return; } catch { /* geen opslag */ }
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = `<span>Nieuwe versie ${esc(shortVersion(s.latest))} beschikbaar.</span>
    <button class="btn btn-primary" type="button" data-now>Nu updaten</button>
    <button class="btn btn-ghost" type="button" data-later>Later</button>`;
  bar.querySelector('[data-now]').addEventListener('click', () => { bar.remove(); startUpdate({ expected: true }); });
  bar.querySelector('[data-later]').addEventListener('click', () => {
    try { localStorage.setItem(key, s.latest); } catch { /* geen opslag */ }
    bar.remove();
  });
  document.body.append(bar);
}
