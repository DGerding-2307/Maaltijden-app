import { api, liveSync } from '../api.js';
import { $, esc, euro, num, qty, addDays, mondayOf, todayISO, fmtDate, weekNumber, toast, modal } from '../util.js';

const COUNT_UNITS = ['stuk', 'teen', 'blik', 'pak', 'zakje', 'bos', 'plak'];

function amount(item) {
  if (COUNT_UNITS.includes(item.unit) && item.quantity > 0) {
    const label = item.quantity === 1 || item.unit !== 'stuk' ? item.unit : 'stuks';
    return `${qty(item.quantity)} ${esc(label)}${item.grams > 0 ? ` (${num(item.grams, 0)} g)` : ''}`;
  }
  if (item.grams > 0 && item.ingredient_id) {
    const isLiquid = ['ml', 'l', 'el', 'tl'].includes(item.unit);
    const v = isLiquid ? item.grams / (item.density || 1) : item.grams;
    if (v >= 1000) return `${num(v / 1000, 2)} ${isLiquid ? 'l' : 'kg'}`;
    return `${num(v, 0)} ${isLiquid ? 'ml' : 'g'}`;
  }
  return `${qty(item.quantity)} ${esc(item.unit)}`;
}

export async function render(root, params) {
  const start = mondayOf(params.week || todayISO());
  let showPantry = localStorage.getItem('showPantry') === '1';
  let data;

  root.innerHTML = '<div class="view shopping"></div>';
  const view = $('.view', root);

  async function load() {
    data = await api.get(`/shopping?week=${start}`);
    draw();
  }

  function draw() {
    const inHouse = data.items.filter((i) => i.have && (showPantry || !i.pantry));
    const items = data.items.filter((i) => (showPantry || !i.pantry) && !i.have);
    const pantryCount = data.items.filter((i) => i.pantry).length;
    const groups = new Map();
    for (const item of items) {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }
    const open = items.filter((i) => !i.checked);
    const openCost = open.reduce((s, i) => s + (i.cost_cents || 0), 0);
    view.innerHTML = `
      <div class="page-head">
        <div class="week-nav">
          <a class="btn icon-btn" href="#/boodschappen?week=${addDays(start, -7)}" aria-label="Vorige week">‹</a>
          <div class="week-title"><h1>Boodschappen week ${weekNumber(start)}</h1>
            <span class="muted">${fmtDate(start)} – ${fmtDate(addDays(start, 6))} · ${data.meals} maaltijden</span></div>
          <a class="btn icon-btn" href="#/boodschappen?week=${addDays(start, 7)}" aria-label="Volgende week">›</a>
        </div>
        <div class="actions">
          <button class="btn btn-jumbo" data-to-jumbo>🟡 Naar Jumbo-app</button>
          <button class="btn" data-copy>📋 Kopieer lijst</button>
          <button class="btn" data-print>🖨️ Afdrukken</button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span class="stat-label">Geschat bij Jumbo</span><span class="stat-value">${euro(data.total_cents)}</span><span class="stat-sub">hele verpakkingen, excl. voorraadkast</span></div>
        <div class="stat"><span class="stat-label">Nog te halen</span><span class="stat-value">${open.length}</span><span class="stat-sub">${euro(openCost)}</span></div>
      </div>
      <div class="row wrap no-print">
        <label class="chip-toggle"><input type="checkbox" data-pantry ${showPantry ? 'checked' : ''}> Toon voorraadkast (${pantryCount}: zout, olie, kruiden…)</label>
        <span class="muted small">Tik 🏠 bij wat je al in huis hebt. Wijzigingen van huisgenoten verschijnen vanzelf.</span>
      </div>

      ${!data.items.length && !data.extras.length ? `<div class="empty"><p>Nog niets op de lijst. Plan eerst maaltijden in.</p><a class="btn btn-primary" href="#/planner?week=${start}">Naar de planner</a></div>` : ''}

      ${[...groups.entries()].map(([cat, list]) => `
        <section class="shop-group">
          <h2>${esc(cat)}</h2>
          <ul class="shop-list">
            ${list.map((i) => `
              <li class="${i.checked ? 'done' : ''} ${i.pantry ? 'pantry' : ''}">
                <label>
                  <input type="checkbox" data-key="${esc(i.key)}" ${i.checked ? 'checked' : ''}>
                  <span class="shop-name"><strong>${esc(i.name)}</strong> <span class="muted">${amount(i)}</span>
                    <small class="muted shop-for" title="${esc(i.recipes.join(', '))}">voor ${esc(i.recipes.slice(0, 2).join(', '))}${i.recipes.length > 2 ? ` +${i.recipes.length - 2}` : ''}</small></span>
                  <span class="shop-pack">${i.packages ? `${i.packages}× ${esc(i.package_label || '')}` : ''}</span>
                  <span class="shop-cost">${i.cost_cents != null ? euro(i.cost_cents) : ''}</span>
                </label>
                <button class="mini no-print have-btn" data-have="${esc(i.key)}" title="Heb ik al in huis – niet kopen">🏠</button>
                <a class="jumbo-link no-print" href="${esc(i.jumbo_url)}" target="_blank" rel="noopener" title="${esc(i.product_name || 'Zoek bij Jumbo')}">Jumbo ↗</a>
              </li>`).join('')}
          </ul>
        </section>`).join('')}

      ${inHouse.length ? `<details class="shop-group in-house no-print">
        <summary><h2>🏠 Al in huis (${inHouse.length})</h2></summary>
        <ul class="shop-list">${inHouse.map((i) => `<li>
          <span class="shop-name"><strong>${esc(i.name)}</strong> <span class="muted">${amount(i)}</span></span>
          ${i.ingredient_id ? `<button class="mini" data-always="${i.ingredient_id}" title="Nooit meer op de lijst zetten (voorraadkast)">altijd in huis</button>` : ''}
          <button class="mini" data-unhave="${esc(i.key)}">toch kopen</button></li>`).join('')}</ul>
      </details>` : ''}

      <section class="shop-group">
        <h2>Extra boodschappen</h2>
        <ul class="shop-list">
          ${data.extras.map((x) => `<li class="${x.checked ? 'done' : ''}"><label><input type="checkbox" data-extra="${x.id}" ${x.checked ? 'checked' : ''}><span class="shop-name">${esc(x.name)}</span></label>
            <button class="mini danger no-print" data-del-extra="${x.id}" aria-label="Verwijderen">✕</button></li>`).join('')}
        </ul>
        <form class="row no-print" data-add-extra>
          <input class="input grow" placeholder="Bijv. wc-papier, koffie, fruit…" name="name">
          <button class="btn">Toevoegen</button>
        </form>
      </section>`;
  }

  view.addEventListener('change', async (e) => {
    const t = e.target;
    try {
      if (t.matches('[data-key]')) {
        const item = data.items.find((i) => i.key === t.dataset.key);
        item.checked = t.checked;
        await api.put('/shopping/check', { week: start, key: item.key, checked: t.checked });
        draw();
      } else if (t.matches('[data-extra]')) {
        await api.put(`/shopping/extras/${t.dataset.extra}`, { checked: t.checked });
        await load();
      } else if (t.matches('[data-pantry]')) {
        showPantry = t.checked;
        try { localStorage.setItem('showPantry', showPantry ? '1' : '0'); } catch { /* opslag niet beschikbaar */ }
        draw();
      }
    } catch (err) { toast(err.message, 'error'); }
  });
  view.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    await api.post('/shopping/extras', { week: start, name });
    load();
  });
  view.addEventListener('click', async (e) => {
    const have = e.target.closest('[data-have], [data-unhave]');
    if (have) {
      const key = have.dataset.have || have.dataset.unhave;
      await api.put('/shopping/have', { week: start, key, have: !!have.dataset.have });
      return load();
    }
    const always = e.target.closest('[data-always]');
    if (always) {
      await api.put(`/ingredients/${always.dataset.always}`, { pantry: true });
      toast('Staat voortaan bij de voorraadkast', 'success');
      return load();
    }
    if (e.target.closest('[data-del-extra]')) {
      await api.del(`/shopping/extras/${e.target.closest('[data-del-extra]').dataset.delExtra}`);
      load();
    }
    if (e.target.closest('[data-print]')) window.print();
    if (e.target.closest('[data-to-jumbo]')) jumboDialog();
    if (e.target.closest('[data-copy]')) {
      const lines = [`Boodschappen week ${weekNumber(start)}`];
      const items = data.items.filter((i) => !i.checked && !i.have && (showPantry || !i.pantry));
      let cat = '';
      for (const i of items) {
        if (i.category !== cat) { cat = i.category; lines.push('', `*${cat}*`); }
        lines.push(`- ${i.name} (${amount(i)}${i.packages ? `, ${i.packages}× ${i.package_label || ''}` : ''})`);
      }
      const extras = data.extras.filter((x) => !x.checked);
      if (extras.length) lines.push('', '*Extra*', ...extras.map((x) => `- ${x.name}`));
      try {
        await navigator.clipboard.writeText(lines.join('\n'));
        toast('Lijst gekopieerd – plak hem in WhatsApp of je notities', 'success');
      } catch {
        toast('Kopiëren lukte niet in deze browser', 'error');
      }
    }
  });

  // ---- Boodschappenlijst naar de Jumbo-app ----
  function jumboDialog() {
    const md = modal('<h2>🟡 Naar je Jumbo-app</h2><div data-body><p class="muted">Laden…</p></div>', { wide: true });
    const body = $('[data-body]', md.el);
    let preview = null;

    function loginForm(account) {
      body.innerHTML = `
        <p>Log één keer in met je Jumbo-account. De producten van je lijst komen dan in de <strong>boodschappenlijst van je Jumbo-app</strong>
          (wat er al in stond, blijft staan). Je wachtwoord wordt niet bewaard, alleen de sessie.</p>
        <form class="form" data-login>
          <label>E-mailadres Jumbo-account <input class="input" type="email" name="email" autocomplete="username" required value="${esc(account?.email && account.email !== 'via token' ? account.email : '')}"></label>
          <label>Wachtwoord <input class="input" type="password" name="password" autocomplete="current-password" required></label>
          <div class="row end"><button class="btn btn-primary">Inloggen bij Jumbo</button></div>
        </form>
        <details class="small"><summary>Inloggen lukt niet? Gebruik een sessietoken</summary>
          <p class="muted">Jumbo heeft geen officiële koppeling; deze functie gebruikt de API van de Jumbo-app (via jumbo-wrapper).
            Als Jumbo het inloggen heeft gewijzigd, kun je een <code>x-jumbo-token</code> uit de app of website plakken.</p>
          <form class="row" data-token><input class="input grow" name="token" placeholder="x-jumbo-token" autocomplete="off"><button class="btn">Gebruiken</button></form>
        </details>`;
      $('[data-login]', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('button', e.target);
        btn.disabled = true;
        btn.textContent = 'Inloggen…';
        try {
          await api.post('/jumbo/account', { email: e.target.email.value, password: e.target.password.value });
          toast('Ingelogd bij Jumbo', 'success');
          loadPreview();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Inloggen bij Jumbo';
        }
      });
      $('[data-token]', body).addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api.post('/jumbo/account', { token: e.target.token.value });
          loadPreview();
        } catch (err) { toast(err.message, 'error'); }
      });
    }

    function drawPreview() {
      const { linked, unlinked, account } = preview;
      body.innerHTML = `
        <p class="muted small">Ingelogd als ${esc(account.email)} · <button class="mini" data-logout>uitloggen</button></p>
        ${linked.length ? `<form data-send>
          <ul class="jumbo-cart">${linked.map((it, i) => `
            <li><label>
              <input type="checkbox" name="pick" value="${i}" checked>
              ${it.image ? `<img src="${esc(it.image)}" alt="" referrerpolicy="no-referrer">` : '<span class="thumb-emoji">🛒</span>'}
              <span><strong>${esc(it.title || it.name)}</strong><br><span class="muted small">voor: ${esc(it.name)}</span></span>
            </label>
            <input class="input narrow" type="number" min="1" name="qty${i}" value="${it.quantity}" aria-label="Aantal">
            <span class="num">${euro((it.price_cents || 0) * it.quantity)}</span></li>`).join('')}</ul>
          <div class="row end"><button class="btn btn-jumbo">🟡 Zet in mijn Jumbo-lijst</button></div>
        </form>` : '<p>Er staan nog geen artikelen op je lijst die aan een Jumbo-product gekoppeld zijn.</p>'}
        ${unlinked.length ? `<h3>Nog niet gekoppeld aan een Jumbo-product (${unlinked.length})</h3>
          <p class="muted small">${unlinked.map((u) => `<a href="${esc(u.jumbo_url)}" target="_blank" rel="noopener">${esc(u.name)}</a>`).join(' · ')}</p>
          <button class="btn" data-autolink>🔎 Zoek automatisch het best passende Jumbo-product</button>
          <p class="muted small">Of koppel zelf een product via Ingrediënten → 🟡.</p>` : ''}`;
      $('[data-logout]', body).addEventListener('click', async () => { await api.del('/jumbo/account'); loginForm(null); });
      $('[data-autolink]', body)?.addEventListener('click', (e) => { e.target.disabled = true; e.target.textContent = 'Zoeken bij Jumbo…'; loadPreview(true); });
      $('[data-send]', body)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = e.target;
        const items = [...f.querySelectorAll('[name=pick]:checked')].map((c) => {
          const it = linked[Number(c.value)];
          return { sku: it.sku, quantity: Number(f[`qty${c.value}`].value) || 1 };
        });
        const btn = $('button.btn-jumbo', f);
        btn.disabled = true;
        btn.textContent = 'Bezig…';
        try {
          const res = await api.post('/jumbo/cart', { items });
          body.innerHTML = `<div class="jumbo-done"><p class="big">✅ ${res.products} producten (${res.pieces} stuks) staan in je Jumbo-lijst.</p>
            <p>Open de Jumbo-app → <strong>Boodschappenlijst</strong>. Daar staan nu ${res.total_products} producten.</p>
            <a class="btn btn-jumbo" href="https://www.jumbo.com/" target="_blank" rel="noopener">Naar jumbo.com</a></div>`;
        } catch (err) {
          toast(err.message, 'error');
          if (/opnieuw in|Log eerst/.test(err.message)) return loginForm(preview.account);
          btn.disabled = false;
          btn.textContent = '🟡 Zet in mijn Jumbo-lijst';
        }
      });
    }

    async function loadPreview(autolink = false) {
      try {
        preview = await api.post('/jumbo/cart/preview', { week: start, autolink, include_pantry: showPantry });
        if (!preview.account.connected) return loginForm(preview.account);
        drawPreview();
      } catch (err) {
        body.innerHTML = `<p class="error">${esc(err.message)}</p>`;
      }
    }
    loadPreview();
  }

  await load();
  return liveSync(load);
}
