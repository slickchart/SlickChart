// SlickChart service worker — makes the app installable + resilient offline.
// Safe by design: only same-origin GETs are handled, API + cross-origin always
// go straight to the network (never cached), so data stays fresh and private.
const CACHE = 'slickchart-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // never touch POST/PUT (login, saves)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // leave CDN & external calls alone
  if (url.pathname.startsWith('/api/')) return;      // never cache API / auth responses
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});
