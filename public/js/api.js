// Kleine wrapper rond fetch voor de JSON-API.

async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Bijv. een inlogpagina van een reverse proxy, of een afgebroken antwoord
      throw new Error(res.ok ? 'Onverwacht antwoord van de server. Herlaad de pagina.' : `Fout ${res.status}`);
    }
  }
  if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};

/**
 * Huisgenoten zien elkaars wijzigingen: elke paar seconden controleren of er op de server iets is veranderd.
 * Niet verversen terwijl iemand aan het typen is of een venster open heeft.
 */
export function liveSync(reload, interval = 5000) {
  let version = null;
  // Direct een beginstand vastleggen, zodat ook de eerste wijziging van een huisgenoot opvalt.
  request('GET', '/changes').then((r) => { version ??= r.version; }).catch(() => {});
  const timer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const { version: v } = await request('GET', '/changes');
      const el = document.activeElement;
      const typing = ['TEXTAREA', 'SELECT'].includes(el?.tagName) || (el?.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(el.type));
      const busy = document.querySelector('.modal-backdrop, details.menu[open]') || typing;
      if (version != null && v !== version && !busy) await reload();
      if (!busy) version = v;
    } catch { /* offline: later opnieuw */ }
  }, interval);
  return () => clearInterval(timer);
}

let metaCache = null;
export async function meta(refresh = false) {
  if (!metaCache || refresh) metaCache = await api.get('/meta');
  return metaCache;
}

/** Stel een vraag aan Claude en ontvang het antwoord in stukjes (server-sent events). */
export async function askClaude(body, onText) {
  const res = await fetch('/api/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const event = chunk.match(/^event: (.*)$/m)?.[1];
      const data = chunk.match(/^data: (.*)$/m)?.[1];
      if (!event || data == null) continue;
      const parsed = JSON.parse(data);
      if (event === 'text') onText(parsed);
      if (event === 'error') throw new Error(parsed);
    }
  }
}
