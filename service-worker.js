
const STATIC_CACHE = 'so-static-v3';
const IMG_CACHE = 'so-img-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll([
      './','./index.html','./styles.css','./app-core.js','./app-supabase.js','./app.js','./manifest.json'
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k!==STATIC_CACHE && k!==IMG_CACHE) ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

/** Cache-first for images (including Supabase storage) with stale-while-revalidate */
function isImageRequest(req) {
  const dest = req.destination;
  const url = new URL(req.url);
  if (dest === 'image') return true;
  // Supabase storage/public buckets or images paths
  return /storage\/v1\/object|supabase\.co.*(jpg|jpeg|png|webp|gif)$/i.test(url.href);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (isImageRequest(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(req, { ignoreVary: true });
      const net = fetch(req).then(resp => { if(resp && resp.ok) cache.put(req, resp.clone()); return resp; }).catch(()=>null);
      return cached || net || new Response('', { status: 504 });
    })());
    return;
  }

  // Static assets: try cache, then network
  if (url.origin === location.origin) {
    event.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }

  // Default: network first, fallback to cache
  event.respondWith((async () => {
    try { return await fetch(req); }
    catch(e) { return await caches.match(req); }
  })());
});
