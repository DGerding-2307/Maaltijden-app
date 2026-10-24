// Account (v4): inloggen, je eerste account maken, wachtwoord wijzigen, herinneringen, en (beheerder) accounts beheren.
import { api } from '../api.js';
import { $, $$, esc, toast, confirmDialog, savedPerson } from '../util.js';
import { buddySvg } from '../buddy.js';
import { reminderCard } from '../reminders.js';

/** Inlogscherm (de app toont dit als er accounts zijn en je niet bent ingelogd). */
export function renderLogin(root, { onLoggedIn }) {
  document.body.classList.add('auth-only');
  root.innerHTML = `<div class="auth"><div class="auth-box">
    <div class="buddy-blob">${buddySvg({ mood: 'blij' })}</div>
    <h1>Welkom terug!</h1>
    <p class="muted">Log in om verder te gaan met je maatje.</p>
    <form data-login>
      <label>Gebruikersnaam <input class="input" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
      <label>Wachtwoord <input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <p class="err" data-err role="alert"></p>
      <button class="btn btn-primary cta">Inloggen</button>
    </form>
    <p class="muted small">Wachtwoord vergeten? Vraag de beheerder van jullie huishouden om het opnieuw in te stellen.</p>
  </div></div>`;
  const f = $('[data-login]', root);
  f.username.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('[data-err]', f).textContent = '';
    try {
      const { user } = await api.post('/auth/login', { username: f.username.value, password: f.password.value });
      document.body.classList.remove('auth-only');
      onLoggedIn(user);
    } catch (err) { $('[data-err]', f).textContent = err.message; f.password.select(); }
  });
}

export async function render(root) {
  const me = await api.get('/auth/me');
  const user = me.user;
  const { people } = await api.get('/people');
  const personId = user?.id || savedPerson() || people[0].id;

  // Nog geen accounts: het eerste account maken (wordt beheerder)
  if (!me.accounts_enabled) {
    root.innerHTML = `<div class="view"><div class="page-head"><h1>Account</h1></div>
      <div class="card"><h2>Maak je account</h2>
        <p class="muted">Met accounts heeft iedereen in huis een eigen dagboek, maatje en herinneringen, en is de app beveiligd met een wachtwoord.
          Recepten, de planner en de boodschappenlijst blijven van het hele huishouden. Het eerste account wordt <strong>beheerder</strong> en kan anderen toevoegen.</p>
        <form class="form" data-first>
          <div class="grid-2">
            <label class="span-2">Wie ben jij? <select class="input" name="person_id">${people.map((p) => `<option value="${p.id}" ${p.id === personId ? 'selected' : ''}>${esc(p.name)} (houdt dagboek en gewicht)</option>`).join('')}</select></label>
            <label>Naam <input class="input" name="name" value="${esc(people.find((p) => p.id === personId)?.name || '')}" required autocomplete="name"></label>
            <label>Gebruikersnaam <input class="input" name="username" required autocapitalize="off" spellcheck="false" autocomplete="username" placeholder="bv. dennis"></label>
            <label class="span-2">Wachtwoord (minstens 8 tekens) <input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"></label>
          </div>
          <p class="muted small">Let op: daarna moet iedereen die de app gebruikt inloggen. Voeg je huisgenoten toe nadat je account klaar is.</p>
          <div class="row end"><button class="btn btn-primary">Account maken</button></div>
        </form></div>
      <div data-rem></div></div>`;
    const f = $('[data-first]', root);
    f.person_id.addEventListener('change', () => { f.name.value = people.find((p) => p.id === Number(f.person_id.value))?.name || ''; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const r = await api.post('/auth/accounts', Object.fromEntries(new FormData(f)));
        toast(`Welkom, ${r.user.name}! Je bent beheerder.`, 'success');
        location.reload();
      } catch (err) { toast(err.message, 'error'); }
    });
    reminderCard($('[data-rem]', root), personId).catch(() => {});
    return;
  }

  root.innerHTML = `<div class="view"><div class="page-head"><h1>Account</h1></div>
    <div class="card"><div class="card-head"><h2>👤 ${esc(user.name)}</h2><span class="muted">@${esc(user.username)}${user.is_admin ? ' · beheerder' : ''}</span></div>
      <form class="form" data-pw>
        <h3>Wachtwoord wijzigen</h3>
        <div class="grid-2">
          <label>Huidig wachtwoord <input class="input" name="current" type="password" required autocomplete="current-password"></label>
          <label>Nieuw wachtwoord <input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"></label>
        </div>
        <div class="row end"><button type="button" class="btn" data-logout>Uitloggen</button><button class="btn btn-primary">Wachtwoord opslaan</button></div>
      </form></div>
    <div data-rem></div>
    ${user.is_admin ? '<div class="card" data-admin></div>' : ''}
  </div>`;
  $('[data-logout]', root).addEventListener('click', async () => { await api.post('/auth/logout'); location.hash = '#/vandaag'; location.reload(); });
  $('[data-pw]', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put('/auth/password', Object.fromEntries(new FormData(e.target)));
      e.target.reset();
      toast('Wachtwoord gewijzigd. Op andere apparaten moet je opnieuw inloggen.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });
  reminderCard($('[data-rem]', root), user.id).catch(() => {});
  if (user.is_admin) drawAdmin();

  async function drawAdmin() {
    const list = await api.get('/auth/accounts');
    const box = $('[data-admin]', root);
    box.innerHTML = `<h2>👨‍👩‍👧 Accounts in het huishouden</h2>
      <div class="account-list">${list.map((a) => `<div class="account-row"><span class="grow"><strong>${esc(a.name)}</strong>
        <span class="muted small">${a.has_account ? `@${esc(a.username)}${a.is_admin ? ' · beheerder' : ''}` : 'geen account (alleen dagboek)'}</span></span>
        ${a.has_account && a.id !== user.id ? `<button class="btn small" data-reset="${a.id}">Nieuw wachtwoord</button><button class="btn small btn-ghost danger-text" data-remove="${a.id}">Account opheffen</button>` : ''}
      </div>`).join('')}</div>
      <form class="form" data-add style="margin-top:1rem">
        <h3>Huisgenoot toevoegen</h3>
        <div class="grid-2">
          <label class="span-2">Persoon <select class="input" name="person_id"><option value="">Nieuwe persoon</option>
            ${list.filter((a) => !a.has_account).map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
          <label>Naam <input class="input" name="name" autocomplete="off"></label>
          <label>Gebruikersnaam <input class="input" name="username" required autocapitalize="off" spellcheck="false" autocomplete="off"></label>
          <label>Wachtwoord (min. 8) <input class="input" name="password" type="password" minlength="8" required autocomplete="new-password"></label>
          <label class="check"><input type="checkbox" name="is_admin"> Ook beheerder</label>
        </div>
        <div class="row end"><button class="btn btn-primary">Toevoegen</button></div>
      </form>`;
    $('[data-add]', box).addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      data.is_admin = e.target.is_admin.checked;
      if (!data.person_id && !data.name) return toast('Vul een naam in', 'error');
      try { await api.post('/auth/accounts', data); toast('Account toegevoegd', 'success'); drawAdmin(); } catch (err) { toast(err.message, 'error'); }
    });
    $$('[data-reset]', box).forEach((b) => b.addEventListener('click', async () => {
      const pw = window.prompt('Nieuw wachtwoord (minstens 8 tekens):');
      if (!pw) return;
      try { await api.put(`/auth/accounts/${b.dataset.reset}`, { password: pw }); toast('Wachtwoord ingesteld', 'success'); } catch (err) { toast(err.message, 'error'); }
    }));
    $$('[data-remove]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!await confirmDialog('Account opheffen? De persoon, het dagboek en het gewicht blijven bewaard; alleen inloggen kan niet meer.', 'Opheffen')) return;
      try { await api.put(`/auth/accounts/${b.dataset.remove}`, { remove: true }); drawAdmin(); } catch (err) { toast(err.message, 'error'); }
    }));
  }
}
