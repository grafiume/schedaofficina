
const STATIC_CACHE = 'so-static-v7';
const IMG_CACHE = 'so-img-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll([
      './',
      './index.html',
      './record.html',
      './record.js',
      './preventivi.html',
      './preventivi.js',
      './preventivo.html',
      './preventivo.js',
      './preventivo-phone-patch.js',
      './config.js',
      './styles.css',
      './app-core.js',
      './app-supabase.js',
      './app.v25.js',
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

/** Cache-first for images (including Supabase storage) with stale-while-revalidate */
function isImageRequest(req) {
  const dest = req.destination;
  const url = new URL(req.url);
  if (dest === 'image') return true;
  // Supabase storage/public buckets or images paths
  return /storage\/v1\/object|supabase\.co.*(jpg|jpeg|png|webp|gif)$/i.test(url.href);
}

function patchQuotePhoneText(text) {
  return String(text || '').replace(/080\s*887\s*675(?!6)/g, '080 887 6756');
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
  const fresh = await fetch(req);
  if (!fresh || !fresh.ok) return fresh;

  const url = new URL(req.url);
  if (/\/preventivo\.js$/i.test(url.pathname)) {
    const patched = patchQuotePhoneText(await fresh.clone().text());
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

  // Static assets: network first, fallback to cache. This avoids stale app code after updates.
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

  // Default: network first, fallback to cache
  event.respondWith((async () => {
    try { return await fetch(req); }
    catch(e) { return await caches.match(req); }
  })());
});
