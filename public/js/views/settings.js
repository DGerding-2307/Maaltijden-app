import { api, meta } from '../api.js';
import { $, esc, toast, confirmDialog } from '../util.js';
import { updateStatus, startUpdate, shortVersion } from '../update.js';

// Voorbeeld van de Home Assistant-kaart (dezelfde Markdown die de kaart laat zien, eenvoudig weergegeven)
function haPreview(md) {
  return esc(md)
    .replace(/&lt;span[^&]*&gt;(.*?)&lt;\/span&gt;/g, '<span class="muted">$1</span>')
    .replace(/&lt;br&gt;/g, '<br>')
    .replace(/^### (.*)$/gm, '<strong class="ha-h">$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, t, u) => (/^https?:/.test(u.replace(/&amp;/g, '&')) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : t))
    .replace(/ {2}\n/g, '<br>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

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

// $0,084 → "0,08"; $0,0021 → "0,002"
const price = (usd) => (Number.isInteger(usd) ? String(usd) : usd.toFixed(2).replace('.', ','));
const costLabel = (usd) => (usd >= 0.01 ? usd.toFixed(2) : usd.toFixed(3)).replace('.', ',');

export async function render(root) {
  const m = await meta(true);
  const [{ people, activity }, cal, ha] = await Promise.all([api.get('/people'), api.get('/calendar').catch(() => null),
    api.get('/homeassistant').catch(() => null)]);
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
      <p>Status: ${m.claude.configured ? `<strong class="good">✔ ingesteld</strong>${m.claude.from_env ? ' (via ANTHROPIC_API_KEY)' : ''}` : '<strong class="bad">niet ingesteld</strong>'}</p>
      ${m.claude.models?.length ? `<fieldset class="model-choice">
        <legend>Model</legend>
        ${m.claude.model_from_env ? `<p class="muted small">Het model is vastgezet met CLAUDE_MODEL (<code>${esc(m.claude.model)}</code>). Haal die variabele weg om hier te kiezen.</p>` : ''}
        ${m.claude.models.map((x) => `<label class="model-option">
          <input type="radio" name="claude_model" value="${esc(x.id)}" ${x.id === m.claude.model ? 'checked' : ''} ${m.claude.model_from_env ? 'disabled' : ''}>
          <span><strong>${esc(x.label)}</strong> <span class="muted small">≈ $${costLabel(x.cost_per_action_usd)} per recept of weekmenu · $${price(x.input)} / $${price(x.output)} per miljoen tokens</span><br>
            <span class="small">${esc(x.note)}</span></span>
        </label>`).join('')}
      </fieldset>` : `<p class="muted small">Model: <code>${esc(m.claude.model)}</code></p>`}
      ${m.claude.configured ? `<div class="row wrap"><button type="button" class="btn" data-test-claude>🔌 Verbinding testen</button>
        <span class="small" data-test-result role="status"></span></div>` : ''}
      ${m.claude.from_env ? '' : `<label>Anthropic API-sleutel <input class="input" type="password" name="anthropic_api_key" autocomplete="off" placeholder="${m.claude.configured ? '•••••••• (laat leeg om te behouden)' : 'sk-ant-…'}"></label>`}

      <label class="check"><input type="checkbox" name="buddy_ai" ${m.buddy_ai ? 'checked' : ''}>
        🐶 Persoonlijke berichtjes van je maatje met Claude <span class="muted small">(anders de ingebouwde zinnen; kost een fractie van een cent per log)</span></label>

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

    ${ha ? `<section class="card" data-ha-card>
      <h2>🏠 Home Assistant</h2>
      <p class="muted">Na het koppelen stuurt de app alles als sensoren naar Home Assistant: vandaag, morgen, de week met kosten,
        de boodschappen en per persoon de calorieën van vandaag en het gewicht (na elke wijziging en elke 5 minuten).
        Daarmee maak je zelf de kaarten die je wilt; voorbeelden staan hieronder. Foto's zet de app in Home Assistant zelf,
        zodat ze ook via https (bv. Nabu Casa) te zien zijn. De app past je dashboards niet aan.</p>
      ${ha.link ? `<p class="ha-status good">✔ Gekoppeld met <a href="${esc(ha.link.url)}" target="_blank" rel="noopener">${esc(ha.link.url)}</a></p>
        ${ha.link.error ? `<p class="small bad">Laatste keer bijwerken mislukt: ${esc(ha.link.error)}</p>` : ''}
        <div class="row wrap">
          <button class="btn" type="button" data-ha-sync>🔄 Nu bijwerken</button>
          <button class="btn btn-ghost" type="button" data-ha-disconnect>Ontkoppelen</button>
        </div>` : `<form class="form ha-connect" data-ha-connect>
        <label>Adres van Home Assistant
          <input class="input" name="url" inputmode="url" autocomplete="off" placeholder="bv. http://192.168.1.10:8123 of http://homeassistant.local:8123" required></label>
        <label>Langlevend toegangstoken
          <input class="input" name="token" type="password" autocomplete="off" placeholder="plak hier het token" required></label>
        <details class="small help-list"><summary>Waar vind ik het token?</summary>
          <ol>
            <li>Open Home Assistant en klik linksonder op <strong>je naam</strong> (je profiel).</li>
            <li>Ga naar het tabblad <strong>Beveiliging</strong> en scrol naar <strong>Langlevende toegangstokens</strong>.</li>
            <li>Klik op <strong>Token aanmaken</strong>, noem het <em>Maaltijden</em>, en kopieer het token (je ziet het maar één keer).</li>
          </ol>
        </details>
        <div class="row end"><button class="btn btn-primary" type="submit">🔗 Koppelen</button></div>
        <p class="small" data-ha-result></p>
      </form>`}
      <h3 class="ha-sub">Kaarten voor je dashboard</h3>
      <p class="small muted">Dashboard → ✏️ Bewerken → <em>Kaart toevoegen</em> → <em>Handmatig</em>, plak een voorbeeld en pas het aan zoals je wilt.</p>
      <div class="ha-examples" data-ha-examples>
        ${ha.examples.map((x, i) => `<details class="ha-example"${i === 0 ? ' open' : ''}>
          <summary>${esc(x.title)}</summary>
          ${x.description ? `<p class="small muted">${esc(x.description)}</p>` : ''}
          <pre class="code-block" data-ha-example="${i}">${esc(x.yaml)}</pre>
          <button class="btn small" type="button" data-copy-ha>📋 Kopiëren</button>
        </details>`).join('')}
      </div>
      <details class="small help-list" data-ha-sensors><summary>Alle sensoren en attributen (${ha.sensors.length})</summary>
        <ul class="ha-sensor-list">
          ${ha.sensors.map((x) => `<li><code>${esc(x.entity_id)}</code> <span class="muted">${esc(x.name)}</span>
            – nu: <strong>${esc(x.state)}${x.unit ? ` ${esc(x.unit)}` : ''}</strong>
            <div class="muted">Attributen: ${x.attributes.map((a) => `<code>${esc(a)}</code>`).join(' ')}</div></li>`).join('')}
        </ul>
        <p class="muted">Een attribuut gebruik je met <code>{{ state_attr('sensor.maaltijden_vandaag', 'kosten') }}</code>.
          Wil je de hele week als agenda in Home Assistant? Voeg de integratie <em>Remote calendar</em> toe met de agenda-link hierboven.</p>
      </details>
      <details class="small help-list"><summary>Voorbeeld van vandaag</summary>
        <div class="ha-preview">${haPreview(ha.preview.markdown)}</div>
      </details>
      <details class="small help-list"><summary>Liever zonder token, met YAML in configuration.yaml</summary>
        <p>Open in Home Assistant je <code>configuration.yaml</code> (bv. met de add-on <em>File editor</em>),
          plak deze regels onderaan en herstart Home Assistant. Je krijgt dezelfde sensoren. Gebruik in de link het IP-adres van je server als daar nu <code>localhost</code> staat.</p>
        <pre class="code-block" data-ha-sensor>${esc(ha.sensor)}</pre>
        <button class="btn small" type="button" data-copy-ha>📋 Kopiëren</button>
        <p class="muted">Foto's komen bij deze manier van het adres van de app. Open je Home Assistant via https (bv. Nabu Casa),
          dan toont hij alleen foto's als de app ook via https bereikbaar is (zet <code>APP_URL</code> op dat adres). Met koppelen hoeft dat niet.</p>
        <p class="muted">De link bevat een geheime code; met de link kan iemand je planning lezen.
          <button class="btn btn-ghost small" type="button" data-new-ha>Nieuwe code maken</button></p>
      </details>
    </section>` : ''}

    <section class="card">
      <h2>Back-up</h2>
      <p class="muted">Download al je recepten, ingrediënten, planning en instellingen als één bestand (zonder API-sleutel), of zet een back-up terug.</p>
      <div class="row wrap">
        <a class="btn" href="/api/backup" download>⬇️ Back-up downloaden</a>
        <label class="btn">⬆️ Back-up terugzetten<input type="file" accept="application/json,.json" data-restore hidden></label>
      </div>
    </section>

    ${m.builtin_missing ? `<section class="card">
      <h2>Standaardrecepten</h2>
      <p class="muted">Je hebt ${m.builtin_missing} van de meegeleverde recepten verwijderd. Ze komen bij updates niet vanzelf terug.</p>
      <button class="btn" data-restore-builtins>↩️ Verwijderde standaardrecepten terugzetten</button>
    </section>` : ''}

    <section class="card">
      <h2>Ingrediënten & prijzen</h2>
      <p class="muted">Beheer voedingswaarden, verpakkingen en prijzen van alle ingrediënten.</p>
      <a class="btn" href="#/ingredienten">🥕 Naar ingrediënten</a>
    </section>

    ${m.app_version ? `<section class="card" data-update-card>
      <h2>Versie en updates</h2>
      <p>Je gebruikt versie <strong>${esc(shortVersion(m.app_version))}</strong> <span class="muted small">(${esc(m.app_version)})</span>.</p>
      ${m.builtin_sync?.recipes && !m.builtin_sync.fresh ? `<p class="muted">Deze versie heeft ${m.builtin_sync.recipes} nieuwe recepten toegevoegd aan je receptenboek.</p>` : ''}
      <p data-update-status class="muted">Controleren op updates…</p>
      <div class="row wrap">
        <button class="btn btn-primary" type="button" data-update-now hidden>⬇️ Nu updaten</button>
        <button class="btn" type="button" data-update-check>🔄 Opnieuw controleren</button>
      </div>
      <details data-update-howto hidden>
        <summary>Direct updaten instellen</summary>
        <p class="small">Voeg in Portainer (Stacks → maaltijden → Editor) bij de twee diensten deze regels toe en klik op <em>Update the stack</em>:</p>
        <pre class="code-block">  maaltijden:
    environment:
      UPDATER_URL: http://updater:8080
      UPDATER_TOKEN: \${UPDATE_TOKEN:-maaltijden-update}

  updater:
    environment:
      WATCHTOWER_HTTP_API_ENDPOINTS: update
      WATCHTOWER_HTTP_API_TOKEN: \${UPDATE_TOKEN:-maaltijden-update}
      WATCHTOWER_HTTP_API_PERIODIC_POLLS: "true"</pre>
        <p class="muted small">Of neem de nieuwe stack uit de README over. De nachtelijke automatische update blijft werken.
          Tot die tijd: in Portainer de stack openen en <em>Update the stack</em> met <em>Re-pull image</em> aan.</p>
      </details>
      <p class="muted small">Nieuwe versies worden ook elke nacht om 04:00 automatisch geïnstalleerd. Vóór elke update wordt een back-up
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

  // Versie en updates
  const updCard = $('[data-update-card]', root);
  let updInfo = null;
  const checkUpdate = async (refresh = false) => {
    const out = $('[data-update-status]', updCard);
    out.className = 'muted';
    out.textContent = 'Controleren op updates…';
    try {
      updInfo = await updateStatus(refresh);
    } catch (err) {
      out.textContent = `Controleren lukte niet: ${err.message}`;
      return;
    }
    const nowBtn = $('[data-update-now]', updCard);
    $('[data-update-howto]', updCard).hidden = updInfo.can_update;
    nowBtn.hidden = !updInfo.can_update;
    if (updInfo.update_available) {
      out.className = 'good';
      out.innerHTML = `✨ Nieuwe versie <strong>${esc(shortVersion(updInfo.latest))}</strong> beschikbaar.`;
      nowBtn.textContent = '⬇️ Nu updaten';
    } else if (updInfo.latest) {
      out.textContent = '✔ Je hebt de nieuwste versie.';
      nowBtn.textContent = '⬇️ Toch zoeken en installeren';
    } else {
      out.textContent = `Kon de nieuwste versie niet opvragen bij GitHub.${updInfo.can_update ? ' Je kunt wel direct updaten: de updater kijkt dan zelf of er iets nieuws is.' : ''}`;
      nowBtn.textContent = '⬇️ Zoeken en installeren';
    }
    if (!updInfo.can_update) out.textContent += ' Direct updaten vanuit de app is nog niet ingesteld (zie hieronder).';
  };
  if (updCard) {
    checkUpdate();
    $('[data-update-check]', updCard).addEventListener('click', () => checkUpdate(true));
    $('[data-update-now]', updCard).addEventListener('click', () => startUpdate({ expected: !!updInfo?.update_available }));
  }

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
      if (e.target.closest('[data-restore-builtins]')) {
        const { restored } = await api.post('/builtins/restore');
        toast(`${restored} recept${restored === 1 ? '' : 'en'} teruggezet`, 'success');
        return render(root);
      }
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
      if (e.target.closest('[data-ha-sync]')) {
        await api.post('/homeassistant/sync');
        return toast('Home Assistant bijgewerkt', 'success');
      }
      if (e.target.closest('[data-ha-disconnect]')) {
        if (!(await confirmDialog('Home Assistant ontkoppelen? De sensoren worden dan niet meer bijgewerkt. Verwijder in Home Assistant ook het token.', 'Ontkoppelen'))) return;
        await api.post('/homeassistant/disconnect');
        return render(root);
      }
      const copyHa = e.target.closest('[data-copy-ha]');
      if (copyHa) {
        const text = copyHa.parentElement.querySelector('pre').textContent;
        try { await navigator.clipboard.writeText(text); } catch { /* geen klembord: tekst is te selecteren */ }
        return toast('Gekopieerd – plak het in Home Assistant', 'success');
      }
      if (e.target.closest('[data-new-ha]')) {
        if (!(await confirmDialog('Een nieuwe code maken? Home Assistant met de oude link krijgt dan geen gegevens meer.', 'Nieuwe code'))) return;
        const fresh = await api.post('/homeassistant/new-link');
        $('[data-ha-sensor]', root).textContent = fresh.sensor;
        return toast('Nieuwe code gemaakt – vervang de regels in configuration.yaml', 'success');
      }
      if (e.target.closest('[data-new-cal]')) {
        if (!(await confirmDialog('Een nieuwe link maken? Agenda\'s met de oude link worden niet meer bijgewerkt.', 'Nieuwe link'))) return;
        const { url } = await api.post('/calendar/new-link');
        $('[data-cal-url]', root).value = url;
        toast('Nieuwe link gemaakt', 'success');
      }
    } catch (err) { toast(err.message, 'error'); }
  });
  $('[data-ha-connect]', root)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const haForm = e.currentTarget;
    const out = $('[data-ha-result]', haForm);
    const btn = $('button[type=submit]', haForm);
    const fd = new FormData(haForm);
    btn.disabled = true;
    out.className = 'small';
    out.textContent = 'Bezig met koppelen…';
    try {
      await api.post('/homeassistant/connect', { url: fd.get('url'), token: fd.get('token') });
      toast('Gekoppeld – de sensoren staan in Home Assistant. Zet nu de kaart op je dashboard.', 'success');
      await render(root);
      $('[data-ha-examples]', root)?.scrollIntoView({ block: 'start' });
    } catch (err) {
      out.className = 'small bad';
      out.textContent = err.message;
      btn.disabled = false;
    }
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
      buddy_ai: fd.has('buddy_ai'),
    };
    if (fd.get('claude_model')) body.claude_model = fd.get('claude_model');
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
