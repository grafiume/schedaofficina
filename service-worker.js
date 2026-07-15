const STATIC_CACHE = 'so-static-v9';
const IMG_CACHE = 'so-img-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll([
      './',
      './index.html',
      './record.html',
      './record.js',
      './config.js',
      './styles.css',
      './app-core.js',
      './app-supabase.js',
      './app.v25.js',
      './auth-session-patch.js',
      './deep-open-edit.js',
      './scheda-only-preventivo.js',
      './cassetti-integration.js',
      './manifest.json'
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

function isImageRequest(req) {
  const dest = req.destination;
  const url = new URL(req.url);
  if (dest === 'image') return true;
  return /storage\/v1\/object|supabase\.co.*(jpg|jpeg|png|webp|gif)$/i.test(url.href);
}

function patchSearchEnterText(text) {
  const source = String(text || '');
  if (source.includes('__elipSearchEnterPatched')) return source;
  return source + `

// Patch: il tasto Invio nel campo Ricerca avvia il pulsante Cerca.
(function(){
  document.addEventListener('DOMContentLoaded', function(){
    var q = document.getElementById('q');
    if (!q || q.__elipSearchEnterPatched) return;
    q.__elipSearchEnterPatched = true;
    q.addEventListener('keydown', function(ev){
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var btn = document.getElementById('btnDoSearch');
      if (btn) btn.click();
    });
  });
})();
`;
}

async function fetchPatchedStatic(req, cache) {
  const noCacheReq = new Request(req, { cache: 'reload' });
  const fresh = await fetch(noCacheReq);
  if (!fresh || !fresh.ok) return fresh;

  const url = new URL(req.url);
  if (/\/app\.v25\.js$/i.test(url.pathname)) {
    const patched = patchSearchEnterText(await fresh.clone().text());
    const response = new Response(patched, {
      status: fresh.status,
      statusText: fresh.statusText,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache'
      }
    });
    cache.put(req, response.clone());
    return response;
  }

  cache.put(req, fresh.clone());
  return fresh;
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

  if (url.origin === location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        return await fetchPatchedStatic(req, cache);
      } catch(e) {
        return await caches.match(req) || new Response('', { status: 504 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try { return await fetch(req); }
    catch(e) { return await caches.match(req); }
  })());
});
