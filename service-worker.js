// sw.js — Officina PWA (2025-10-17)
const VERSION = '2025-10-17-1';
const CACHE_NAME = `officina-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // aggiungi qui i tuoi file statici (css/js/img) con query ver es. ?v=20251017
  // './app-core.js?v=20251017',
  // './app-supabase.js?v=20251017',
];

const SUPABASE_HOST = 'pedmdiljgjgswhfwedno.supabase.co';
const STATIC_EXT = /\.(?:css|js|mjs|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS))
  );
  self.skipWaiting(); // attiva subito la nuova versione
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // cancella cache vecchie
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()));
    await self.clients.claim(); // prendi controllo subito
  })());
});

// helper: network-first con fallback cache (per HTML navigations)
async function networkFirstHTML(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) return res;
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('./index.html');
    return cached || res;
  } catch (_) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('./index.html');
    return cached || new Response('Offline', { status: 503 });
  }
}

// helper: stale-while-revalidate per statici
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => undefined);
  return cached || networkPromise || fetch(req);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // mai cache per metodi non-GET
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  const url = new URL(request.url);

  // 1) Chiamate Supabase: sempre network-first (niente cache)
  if (url.hostname === SUPABASE_HOST) {
    event.respondWith(fetch(request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // 2) Navigazioni HTML (SPA): network-first con fallback index.html
  if (request.mode === 'navigate' || (request.destination === 'document')) {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // 3) Statici same-origin: stale-while-revalidate
  if (url.origin === location.origin && STATIC_EXT.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 4) Default: tenta rete, poi cache
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch (_) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      return cached || new Response('Offline', { status: 503 });
    }
  })());
});

// supporta messaggio SKIP_WAITING dal client
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
