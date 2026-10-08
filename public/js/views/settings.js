import { api, meta } from '../api.js';
import { $, esc, toast } from '../util.js';

export async function render(root) {
  const m = await meta(true);
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
      ${m.claude.from_env ? '' : `<label>Anthropic API-sleutel <input class="input" type="password" name="anthropic_api_key" autocomplete="off" placeholder="${m.claude.configured ? '•••••••• (laat leeg om te behouden)' : 'sk-ant-…'}"></label>`}

      <div class="row end"><button class="btn btn-primary">Opslaan</button></div>
    </form>

    <section class="card">
      <h2>Ingrediënten & prijzen</h2>
      <p class="muted">Beheer voedingswaarden, verpakkingen en Jumbo-koppelingen van alle ingrediënten.</p>
      <a class="btn" href="#/ingredienten">🥕 Naar ingrediënten</a>
    </section>

    <section class="card">
      <h2>Over</h2>
      <p class="muted small">Voedingswaarden zijn benaderingen op basis van NEVO-gemiddelden (RIVM) en schattingen van Claude.
        Jumbo-prijzen worden opgehaald via de onofficiële app-API van Jumbo en kunnen afwijken van de prijs in de winkel.
        Deze app is niet verbonden aan Jumbo of Anthropic.</p>
    </section>
  </div>`;
  const form = $('[data-form]', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      default_servings: Math.max(1, Number(fd.get('default_servings')) || 4),
      weekly_budget_cents: fd.get('budget') ? Math.round(Number(fd.get('budget')) * 100) : null,
      meals: String(fd.get('meals')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      household: fd.get('household'),
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
