/* Service worker : mode hors ligne.
 * - Pages et scripts de l'app : réseau d'abord (nouvelle version à chaque lancement), cache en secours.
 * - Données ESPN : réseau d'abord, dernière réponse en cache si hors ligne.
 * - Logos : cache d'abord, rafraîchis en arrière-plan.
 */
const V = 'v1';
const SHELL = `scores-shell-${V}`;
const DATA = `scores-data-${V}`;
const IMG = `scores-img-${V}`;
const KEEP = [SHELL, DATA, IMG];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
const cacheable = (res) => res && (res.ok || res.type === 'opaque');

// Réseau d'abord ; si la connexion est absente ou trop lente (timeoutMs), on sert la dernière réponse en cache.
async function networkFirst(req, cacheName, key, max, timeoutMs = 8000) {
  const cache = await caches.open(cacheName);
  const net = fetch(req).then((res) => {
    if (cacheable(res)) cache.put(key ?? req, res.clone()).then(() => max && trim(cache, max));
    return res;
  });
  try {
    return await Promise.race([net, new Promise((_, reject) => setTimeout(reject, timeoutMs))]);
  } catch {
    const hit = await cache.match(key ?? req);
    return hit ?? net; // pas de cache : on attend la vraie réponse (ou son échec)
  }
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (cacheable(res)) cache.put(req, res.clone()).then(() => max && trim(cache, max));
      return res;
    })
    .catch(() => undefined);
  return hit ?? (await refresh) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/version.json')) return; // toujours le réseau : sert à détecter les mises à jour
    if (req.mode === 'navigate') {
      // Toutes les URLs de l'app (avec ?day=…) partagent la même page en cache.
      const key = new URL('./', self.registration.scope).href;
      event.respondWith(networkFirst(new Request(req.url, { cache: 'no-store' }), SHELL, key, undefined, 4000));
    } else {
      event.respondWith(networkFirst(req, SHELL));
    }
    return;
  }
  if (url.hostname === 'site.api.espn.com') {
    event.respondWith(networkFirst(req, DATA, undefined, 150, 10000));
    return;
  }
  if (url.hostname === 'a.espncdn.com') {
    event.respondWith(cacheFirst(req, IMG, 500));
  }
});
