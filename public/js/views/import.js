// Recepten toevoegen met Claude: via link, tekst, foto/PDF of laten bedenken.
import { api, meta } from '../api.js';
import { $, $$, esc, toast } from '../util.js';
import { DRAFT_KEY } from './editor.js';

export async function render(root, params) {
  const m = await meta(true);
  let tab = params.idee ? 'generate' : params.tab || 'url';

  root.innerHTML = `<div class="view import">
    <div class="page-head">
      <h1>✨ Recept toevoegen</h1>
      <p class="muted">Claude zet elk recept om naar een Nederlands recept met metrische hoeveelheden, koppelt ingrediënten aan de database
        en schat voedingswaarden en Jumbo-prijzen voor onbekende ingrediënten. Je kunt alles nakijken voordat je opslaat.</p>
    </div>
    ${m.claude.configured ? '' : `<div class="notice">Claude is nog niet ingesteld. <a href="#/instellingen">Voeg je Anthropic API-sleutel toe</a> of <a href="#/recept/nieuw">voer een recept zelf in</a>.</div>`}
    <div class="tabs" role="tablist">
      <button data-tab="url">🔗 Van website</button>
      <button data-tab="text">📝 Tekst plakken</button>
      <button data-tab="photo">📷 Foto / PDF</button>
      <button data-tab="generate">💡 Laat Claude bedenken</button>
    </div>
    <form class="card form" data-form></form>
    <p class="muted small">Liever alles zelf invullen? <a href="#/recept/nieuw">Recept handmatig invoeren</a>.</p>
  </div>`;
  const view = $('.view', root);
  const form = $('[data-form]', view);
  let file = null;

  function drawTab() {
    $$('[data-tab]', view).forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const forms = {
      url: `<label>Link naar het recept
          <input class="input" type="url" name="url" required placeholder="https://www.ah.nl/allerhande/recept/… of een andere receptensite"></label>
        <p class="muted small">Werkt met de meeste receptensites (Allerhande, Jumbo, 24Kitchen, Leukerecepten, buitenlandse sites…).</p>`,
      text: `<label>Plak het recept (ingrediënten + bereiding), in elke taal
          <textarea class="input" name="text" rows="12" required placeholder="Bijv. een recept uit een e-mail, WhatsApp of een kookboek"></textarea></label>`,
      photo: `<label class="dropzone" data-drop>
          <input type="file" name="file" accept="image/*,application/pdf" capture="environment" hidden>
          <span data-drop-label>📷 Maak een foto van een kookboek of kies een afbeelding/PDF</span>
          <img data-preview alt="" hidden>
        </label>
        <label>Extra toelichting (optioneel) <input class="input" name="text" placeholder="bv. ‘alleen het recept rechts op de pagina’"></label>`,
      generate: `<label>Waar heb je zin in?
          <textarea class="input" name="prompt" rows="4" required placeholder="Bijv. ‘iets met de kip en prei die nog in de koelkast liggen’, ‘vegetarische stamppot’, ‘snelle pasta onder €2 p.p.’">${esc(params.idee || '')}</textarea></label>
        <label>Personen <input class="input narrow" type="number" min="1" name="servings" value="${m.default_servings}"></label>`,
    };
    form.innerHTML = `${forms[tab]}
      <div class="row end"><button class="btn btn-ai" type="submit" ${m.claude.configured ? '' : 'disabled'}>${tab === 'generate' ? 'Bedenk recept' : 'Importeer recept'}</button></div>
      <div class="progress-msg" hidden></div>`;
    file = null;
    if (tab === 'photo') bindPhoto();
  }

  function bindPhoto() {
    const input = $('input[type=file]', form);
    const drop = $('[data-drop]', form);
    const setFile = (f) => {
      if (!f) return;
      if (f.size > 20 * 1024 * 1024) return toast('Bestand is te groot (max 20 MB)', 'error');
      const reader = new FileReader();
      reader.onload = () => {
        const [, data] = String(reader.result).split(',');
        file = { media_type: f.type, data };
        $('[data-drop-label]', form).textContent = `✔ ${f.name}`;
        if (f.type.startsWith('image/')) {
          const img = $('[data-preview]', form);
          img.src = reader.result;
          img.hidden = false;
        }
      };
      reader.readAsDataURL(f);
    };
    input.addEventListener('change', () => setFile(input.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drop'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drop'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drop'); setFile(e.dataTransfer.files[0]); });
  }

  view.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; drawTab(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = $('button[type=submit]', form);
    const msg = $('.progress-msg', form);
    const steps = tab === 'generate'
      ? ['Claude bedenkt een recept…', 'Hoeveelheden en ingrediënten uitwerken…', 'Voedingswaarden schatten…']
      : ['Recept lezen…', 'Omzetten naar Nederlandse maten…', 'Ingrediënten koppelen…', 'Voedingswaarden en prijzen schatten…'];
    let s = 0;
    msg.hidden = false;
    msg.textContent = steps[0];
    const timer = setInterval(() => { s = Math.min(steps.length - 1, s + 1); msg.textContent = steps[s]; }, 6000);
    btn.disabled = true;
    try {
      let draft;
      if (tab === 'generate') draft = await api.post('/ai/generate', { prompt: fd.get('prompt'), servings: Number(fd.get('servings')) });
      else if (tab === 'url') draft = await api.post('/ai/import', { url: fd.get('url') });
      else if (tab === 'text') draft = await api.post('/ai/import', { text: fd.get('text') });
      else {
        if (!file) throw new Error('Kies eerst een foto of PDF');
        draft = await api.post('/ai/import', { image: file, text: fd.get('text') || '' });
      }
      if (draft.truncated) toast('Let op: de pagina was erg lang en is ingekort voor Claude', 'info');
      // Bekende ingrediënten hebben geen schatting nodig.
      draft.ingredients = draft.ingredients.map(({ known, ...row }) => ({ ...row, estimate: known ? null : row.estimate }));
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      location.hash = '#/recept/nieuw?concept=1';
    } catch (err) {
      toast(err.message, 'error');
      msg.textContent = err.message;
    } finally {
      clearInterval(timer);
      btn.disabled = false;
    }
  });

  drawTab();
}
