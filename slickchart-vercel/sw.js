// SlickChart service worker — makes the app installable + resilient offline.
// Safe by design: only same-origin GETs are handled, API + cross-origin always
// go straight to the network (never cached), so data stays fresh and private.
const CACHE = 'slickchart-v7';
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
      // Only cache a full, successful, basic (same-origin) response. Skip 206 partials
      // (range requests from audio/media seeking — cache.put() throws on those), redirects,
      // and 4xx/5xx error pages so we never serve a stale error offline. Caching is
      // best-effort: a put failure must never break the live response we return.
      if (res && res.ok && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});

// Web Push: show the notification the server sent. This is what lets a reminder or a
// new message reach the client's phone even when the app isn't open.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { try { d = { body: e.data && e.data.text() }; } catch (__) { d = {}; } }
  const title = d.title || 'SlickChart';
  const options = {
    body: d.body || '',
    icon: d.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'slickchart',
    renotify: !!d.renotify,
    data: { url: d.url || '/client' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a push focuses an existing tab (navigating it) or opens a new one.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/client';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { if (c.navigate) await c.navigate(target); } catch (_) {} return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
