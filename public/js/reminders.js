// Herinneringen van het maatje (v4): instellingen, pushmeldingen in de browser en meldingen in de Android-app.
import { api } from './api.js';
import { $, $$, esc, toast } from './util.js';

const SLOTS = [['ontbijt', '🥣 Ontbijt'], ['lunch', '🥪 Lunch'], ['diner', '🍽️ Diner'], ['avond', '🌙 Avondoverzicht']];
const inApp = () => /MaaltijdenApp/.test(navigator.userAgent);
const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** Pushmeldingen op dit apparaat aanzetten (vraagt toestemming). */
export async function enablePush(personId, publicKey) {
  if (!pushPossible()) throw new Error('Dit apparaat of deze browser kan geen meldingen ontvangen via de website. Gebruik de Android-app, zet de app op je beginscherm (iPhone), of kies Home Assistant.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Je hebt meldingen niet toegestaan. Zet ze aan in de instellingen van je browser.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  await api.post('/push/subscribe', { person_id: personId, subscription: sub.toJSON() });
}

/** Android-app: het lokale beginscherm van de app plant de meldingen in (daar werkt de meldingen-plug-in). */
function enableInApp(scheduleUrl) {
  const back = location.href;
  location.href = `http://localhost/?meldingen=${encodeURIComponent(scheduleUrl)}&terug=${encodeURIComponent(back)}`;
}

/** Kaart met herinneringen; past in Vandaag (zijkant) en in Account. */
export async function reminderCard(el, personId, { compact = false } = {}) {
  const r = await api.get(`/reminders?persoon=${personId}`);
  const s = r.settings;
  el.innerHTML = `<div class="card reminders-card">
    <div class="card-head"><h2>🔔 Herinneringen</h2><label class="switch" title="Herinneringen aan/uit"><input type="checkbox" data-enabled ${s.enabled ? 'checked' : ''} aria-label="Herinneringen aan"><span></span></label></div>
    <p class="muted small">Je maatje herinnert je eraan om te loggen – alleen als je dat moment nog niets gelogd hebt.</p>
    <div data-slots ${s.enabled ? '' : 'hidden'}>
      ${SLOTS.map(([k, l]) => `<div class="rem-row"><span class="grow">${l}</span>
        <input type="time" class="input" data-time="${k}" value="${esc(s[k].time)}" aria-label="Tijd ${l}" step="300">
        <label class="switch"><input type="checkbox" data-on="${k}" ${s[k].on ? 'checked' : ''} aria-label="${l} aan"><span></span></label></div>`).join('')}
      ${compact ? '' : `<h3 style="margin-top:1rem">Hoe wil je ze krijgen?</h3>
      <div class="rem-row"><span class="grow">📱 Op dit apparaat <span class="muted small">${r.push_devices ? `(${r.push_devices} apparaat${r.push_devices > 1 ? 'en' : ''} aangemeld)` : ''}</span></span>
        <button class="btn small" data-push>${inApp() ? 'Aanzetten in de app' : 'Aanzetten'}</button></div>
      <div class="rem-row"><span class="grow">🏡 Home Assistant ${r.home_assistant ? '' : '<span class="muted small">(eerst koppelen bij Instellingen)</span>'}<br>
        <input class="input" data-ha placeholder="bv. mobile_app_pixel_8" value="${esc(s.ha_service)}" ${r.home_assistant ? '' : 'disabled'} aria-label="Home Assistant-meldingsdienst"></span></div>
      <div class="row end"><button class="btn" data-test>Stuur een testmelding</button></div>`}
    </div></div>`;
  const card = $('.reminders-card', el);
  const save = async (body) => {
    try { await api.put('/reminders', { person_id: personId, ...body }); } catch (err) { toast(err.message, 'error'); reminderCard(el, personId, { compact }); }
  };
  $('[data-enabled]', card).addEventListener('change', async (e) => {
    $('[data-slots]', card).hidden = !e.target.checked;
    await save({ enabled: e.target.checked });
    if (e.target.checked && !r.push_devices && !compact) toast('Zet ook ‘Op dit apparaat’ aan om meldingen te krijgen', 'info');
  });
  $$('[data-time]', card).forEach((i) => i.addEventListener('change', () => save({ [i.dataset.time]: { time: i.value } })));
  $$('[data-on]', card).forEach((i) => i.addEventListener('change', () => save({ [i.dataset.on]: { on: i.checked } })));
  $('[data-ha]', card)?.addEventListener('change', (e) => save({ ha_service: e.target.value }));
  $('[data-push]', card)?.addEventListener('click', async (e) => {
    if (inApp()) return enableInApp(r.schedule_url);
    e.target.disabled = true;
    try {
      await enablePush(personId, r.push_public_key);
      toast('Meldingen staan aan op dit apparaat', 'success');
      reminderCard(el, personId, { compact });
    } catch (err) { toast(err.message, 'error'); e.target.disabled = false; }
  });
  $('[data-test]', card)?.addEventListener('click', async () => {
    try {
      const t = await api.post('/reminders/test', { person_id: personId });
      toast(t.sent ? 'Testmelding verstuurd 🐶' : 'Nog geen apparaat of Home Assistant aangemeld', t.sent ? 'success' : 'error');
    } catch (err) { toast(err.message, 'error'); }
  });
}

/** In de Android-app: na het loggen de melding van die maaltijd voor vandaag laten vallen (als de plug-in beschikbaar is). */
export async function cancelTodayReminder(meal) {
  const ln = window.Capacitor?.Plugins?.LocalNotifications;
  if (!ln) return;
  try {
    const { notifications } = await ln.getPending();
    const today = new Date().toISOString().slice(2, 10).replaceAll('-', '');
    const drop = notifications.filter((n) => n.extra?.slot === meal && String(n.extra?.date || '').replaceAll('-', '').slice(2) === today);
    if (drop.length) await ln.cancel({ notifications: drop.map((n) => ({ id: n.id })) });
  } catch { /* geen plug-in */ }
}
