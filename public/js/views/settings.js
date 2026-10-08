import { api, meta } from '../api.js';
import { $, esc, toast, confirmDialog } from '../util.js';

const GOALS = [['afvallen', 'Afvallen (−500 kcal per dag)'], ['onderhoud', 'Gewicht behouden'], ['aankomen', 'Aankomen (+300 kcal per dag)']];

function personForm(p, activity) {
  const v = (x) => (x == null ? '' : esc(x));
  return `<form class="person-form" data-person-form="${p.id}">
    <div class="card-head"><h3>👤 ${esc(p.name)}</h3>
      <span class="muted small">doel ${p.targets.kcal} kcal per dag (${esc(p.target_source)})${p.bmi ? ` · BMI ${String(p.bmi).replace('.', ',')}` : ''}</span></div>
    <div class="grid-4">
      <label>Naam <input class="input" name="name" value="${v(p.name)}" required></label>
      <label>Geslacht <select class="input" name="sex"><option value="">–</option>
        <option value="v" ${p.sex === 'v' ? 'selected' : ''}>vrouw</option><option value="m" ${p.sex === 'm' ? 'selected' : ''}>man</option></select></label>
      <label>Geboortejaar <input class="input" type="number" min="1900" max="${new Date().getFullYear()}" name="birth_year" value="${v(p.birth_year)}"></label>
      <label>Lengte (cm) <input class="input" type="number" min="100" max="250" name="height_cm" value="${v(p.height_cm)}"></label>
      <label class="span-2">Activiteit <select class="input" name="activity">${activity.map(([f, l]) => `<option value="${f}" ${(p.activity || 1.375) === f ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="span-2">Doel <select class="input" name="goal">${GOALS.map(([g, l]) => `<option value="${g}" ${(p.goal || 'onderhoud') === g ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Startgewicht (kg) <input class="input" type="number" step="0.1" min="20" max="400" name="start_weight_kg" value="${v(p.start_weight_kg)}"></label>
      <label>Doelgewicht (kg) <input class="input" type="number" step="0.1" min="20" max="400" name="target_weight_kg" value="${v(p.target_weight_kg)}"></label>
      <label class="span-2">Eigen kcal-doel <input class="input" type="number" min="800" max="6000" name="kcal_target_override" value="${v(p.kcal_target_override)}" placeholder="leeg = automatisch berekenen"></label>
    </div>
    <div class="row end">
      <button type="button" class="btn btn-ghost danger-text" data-del-person="${p.id}">Verwijderen</button>
      <button class="btn btn-primary">Opslaan</button>
    </div>
  </form>`;
}

export async function render(root) {
  const m = await meta(true);
  const [{ people, activity }, cal] = await Promise.all([api.get('/people'), api.get('/calendar').catch(() => null)]);
  root.innerHTML = `<div class="view settings">
    <div class="page-head"><h1>Instellingen</h1></div>
    <form class="card form" data-form>
      <h2>Huishouden</h2>
      <div class="grid-2">
        <label>Standaard aantal personen <input class="input" type="number" min="1" name="default_servings" value="${m.default_servings}"></label>
        <label>Weekbudget boodschappen (€) <input class="input" type="number" min="0" step="1" name="budget" value="${m.weekly_budget_cents ? m.weekly_budget_cents / 100 : ''}"></label>
        <label class="span-2">Maaltijdmomenten in de planner (komma's)
          <input class="input" name="meals" value="${esc(m.meals.join(', '))}"></label>
        <label class="span-2">Voorkeuren, allergieën en dieetwensen (gebruikt door Claude)
          <textarea class="input" name="household" rows="3" placeholder="Bijv. 2 volwassenen en 2 kinderen (6 en 9), geen champignons, 2x per week vegetarisch, notenallergie">${esc(m.household)}</textarea></label>
      </div>

      <h2>Claude AI</h2>
      <p class="muted">Claude wordt gebruikt voor het importeren en bedenken van recepten, weekmenu's, voedingswaarde-schattingen en vragen over recepten.
        Je hebt een API-sleutel nodig van <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a>.</p>
      <p>Status: ${m.claude.configured ? `<strong class="good">✔ ingesteld</strong>${m.claude.from_env ? ' (via ANTHROPIC_API_KEY)' : ''}` : '<strong class="bad">niet ingesteld</strong>'} · model <code>${esc(m.claude.model)}</code></p>
      ${m.claude.configured ? `<div class="row wrap"><button type="button" class="btn" data-test-claude>🔌 Verbinding testen</button>
        <span class="small" data-test-result role="status"></span></div>` : ''}
      ${m.claude.from_env ? '' : `<label>Anthropic API-sleutel <input class="input" type="password" name="anthropic_api_key" autocomplete="off" placeholder="${m.claude.configured ? '•••••••• (laat leeg om te behouden)' : 'sk-ant-…'}"></label>`}

      <h2>Voedingswaarden</h2>
      <label class="check"><input type="checkbox" name="off_auto" ${m.off_auto ? 'checked' : ''}>
        Nieuwe ingrediënten automatisch aanvullen met <a href="https://nl.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a></label>

      <h2>Prijzen</h2>
      <label class="check"><input type="checkbox" name="prices_auto" ${m.prices_auto ? 'checked' : ''}>
        Prijzen van nieuwe en gescande ingrediënten automatisch opzoeken in <a href="https://prices.openfoodfacts.org" target="_blank" rel="noopener">Open Prices</a></label>

      <div class="row end"><button class="btn btn-primary">Opslaan</button></div>
    </form>

    <section class="card" id="personen">
      <h2>Calorieën en doelen</h2>
      <p class="muted">Iedereen in huis kan een eigen dagboek en gewichtslog bijhouden. Het dagdoel wordt berekend met de formule van Mifflin-St Jeor
        (rustverbranding × activiteit), plus of min voor je doel. Zonder gegevens geldt 2000 kcal. Dit is een richtlijn, geen medisch advies.</p>
      ${people.map((p) => personForm(p, activity)).join('<hr>')}
      <div class="row"><button class="btn" data-add-person>+ Persoon toevoegen</button></div>
    </section>

    ${cal ? `<section class="card">
      <h2>Agenda-koppeling</h2>
      <p class="muted">Abonneer je in Google Agenda, Apple Agenda of Outlook op deze link. Je ziet dan je geplande maaltijden, per dag je gegeten
        calorieën en je gewichtsmetingen. De agenda werkt zichzelf ongeveer elk uur bij (Google kan er tot een dag over doen).</p>
      <div class="row">
        <input class="input grow" readonly value="${esc(cal.url)}" data-cal-url aria-label="Agenda-link">
        <button class="btn" type="button" data-copy-cal>Kopiëren</button>
      </div>
      <details class="small help-list"><summary>Zo voeg je hem toe</summary>
        <ul>
          <li><strong>Google Agenda</strong> (computer): Andere agenda's → + → Abonneren op agenda → plak de link.</li>
          <li><strong>iPhone/iPad</strong>: Instellingen → Agenda → Accounts → Voeg account toe → Andere → Voeg agenda-abonnement toe.</li>
          <li><strong>Outlook</strong>: Agenda toevoegen → Abonneren vanaf internet → plak de link.</li>
          <li>De server moet bereikbaar zijn voor de agenda-dienst. Google en Outlook halen de agenda op via internet,
            dus een adres dat alleen thuis werkt (zoals 192.168.…) werkt daar niet; Apple Agenda op je eigen wifi wel.</li>
        </ul>
      </details>
      <p class="muted small">Iedereen met deze link kan je agenda lezen. Gedeeld met iemand die hem niet meer mag hebben?
        <button class="btn btn-ghost small" type="button" data-new-cal>Nieuwe link maken</button> (de oude stopt dan).</p>
    </section>` : ''}

    <section class="card">
      <h2>Back-up</h2>
      <p class="muted">Download al je recepten, ingrediënten, planning en instellingen als één bestand (zonder API-sleutel), of zet een back-up terug.</p>
      <div class="row wrap">
        <a class="btn" href="/api/backup" download>⬇️ Back-up downloaden</a>
        <label class="btn">⬆️ Back-up terugzetten<input type="file" accept="application/json,.json" data-restore hidden></label>
      </div>
    </section>

    <section class="card">
      <h2>Ingrediënten & prijzen</h2>
      <p class="muted">Beheer voedingswaarden, verpakkingen en prijzen van alle ingrediënten.</p>
      <a class="btn" href="#/ingredienten">🥕 Naar ingrediënten</a>
    </section>

    ${m.app_version ? `<section class="card">
      <h2>Versie en updates</h2>
      <p>Je gebruikt versie <strong>${esc(m.app_version)}</strong>.</p>
      ${m.builtin_sync?.recipes && !m.builtin_sync.fresh ? `<p class="muted">Deze versie heeft ${m.builtin_sync.recipes} nieuwe recepten toegevoegd aan je receptenboek.</p>` : ''}
      <p class="muted small">Met de standaard-installatie (Docker) worden nieuwe versies automatisch geïnstalleerd. Vóór elke update wordt een back-up
        van je gegevens gemaakt in <code>data/backups</code>. Je recepten, planning en instellingen blijven bewaard.</p>
    </section>` : ''}

    ${/MaaltijdenApp/.test(navigator.userAgent) ? `<section class="card">
      <h2>App</h2>
      <p class="muted">De app is verbonden met <code>${esc(location.origin)}</code>.</p>
      <a class="btn" href="http://localhost/?wijzig=1">Andere server kiezen</a>
    </section>` : ''}

    <section class="card">
      <h2>Over</h2>
      <p class="muted small">Voedingswaarden zijn benaderingen op basis van NEVO-gemiddelden (RIVM) en schattingen van Claude.
        Prijzen komen uit Open Prices (© Open Prices-bijdragers, ODbL): de mediaan van recente prijzen in Nederlandse winkels.
        Waar die ontbreken staat een schatting. Prijzen kunnen afwijken van de prijs in jouw winkel.
        Deze app is niet verbonden aan Jumbo, Open Food Facts of Anthropic.</p>
    </section>
  </div>`;
  const form = $('[data-form]', root);
  $('[data-test-claude]', root)?.addEventListener('click', async (e) => {
    const out = $('[data-test-result]', root);
    e.target.disabled = true;
    out.className = 'small muted';
    out.textContent = 'Testen…';
    try {
      const r = await api.post('/ai/test');
      out.className = 'small good';
      out.textContent = `✔ Claude werkt (${r.model}, ${(r.ms / 1000).toFixed(1)} s)`;
    } catch (err) {
      out.className = 'small bad';
      out.textContent = `✖ ${err.message}`;
    } finally {
      e.target.disabled = false;
    }
  });
  root.querySelectorAll('[data-person-form]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const p = await api.put(`/people/${f.dataset.personForm}`, Object.fromEntries(new FormData(f)));
      toast(`${p.name}: doel ${p.targets.kcal} kcal per dag`, 'success');
      render(root);
    } catch (err) { toast(err.message, 'error'); }
  }));
  // Op het (telkens nieuwe) view-element, zodat opnieuw tekenen geen dubbele handlers geeft
  $('.view', root).addEventListener('click', async (e) => {
    try {
      if (e.target.closest('[data-add-person]')) {
        await api.post('/people', { name: 'Nieuwe persoon' });
        return render(root);
      }
      const del = e.target.closest('[data-del-person]');
      if (del) {
        if (!(await confirmDialog('Deze persoon met dagboek en gewichtslog verwijderen?'))) return;
        await api.del(`/people/${del.dataset.delPerson}`);
        return render(root);
      }
      if (e.target.closest('[data-copy-cal]')) {
        const input = $('[data-cal-url]', root);
        try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
        return toast('Link gekopieerd', 'success');
      }
      if (e.target.closest('[data-new-cal]')) {
        if (!(await confirmDialog('Een nieuwe link maken? Agenda\'s met de oude link worden niet meer bijgewerkt.', 'Nieuwe link'))) return;
        const { url } = await api.post('/calendar/new-link');
        $('[data-cal-url]', root).value = url;
        toast('Nieuwe link gemaakt', 'success');
      }
    } catch (err) { toast(err.message, 'error'); }
  });
  $('[data-restore]', root).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!(await confirmDialog('Alle huidige gegevens worden vervangen door de back-up. Doorgaan?', 'Terugzetten'))) return;
      const { restored } = await api.post('/restore', data);
      toast(`Teruggezet: ${restored.recipes} recepten, ${restored.ingredients} ingrediënten`, 'success');
      await meta(true);
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      default_servings: Math.max(1, Number(fd.get('default_servings')) || 4),
      weekly_budget_cents: fd.get('budget') ? Math.round(Number(fd.get('budget')) * 100) : null,
      meals: String(fd.get('meals')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      household: fd.get('household'),
      off_auto: fd.has('off_auto'),
      prices_auto: fd.has('prices_auto'),
    };
    const key = fd.get('anthropic_api_key');
    if (key) body.anthropic_api_key = String(key).trim();
    try {
      await api.put('/settings', body);
      await meta(true);
      toast('Instellingen opgeslagen', 'success');
      render(root);
    } catch (err) { toast(err.message, 'error'); }
  });
}
