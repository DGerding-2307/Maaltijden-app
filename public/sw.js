// Service worker: app installeerbaar maken en recepten/boodschappenlijst offline beschikbaar houden.
// Altijd eerst het netwerk; zonder verbinding de laatst opgehaalde versie.
const CACHE = 'maaltijden-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

// API-antwoorden die offline nuttig zijn (lezen van recepten, planning, boodschappen)
const OFFLINE_API = /^\/api\/(recipes|plan|shopping|meta|ingredients)(\/|\?|$)/;

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') && !OFFLINE_API.test(url.pathname + url.search)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || (url.pathname.startsWith('/api/')
        ? new Response(JSON.stringify({ error: 'Je bent offline en dit is nog niet eerder bekeken.' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        : caches.match('/')))),
  );
});
