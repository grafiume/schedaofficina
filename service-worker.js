const CACHE = 'officina-cache-v8-sameorigin';
const ASSETS = ['./','./index.html','./manifest.json','./service-worker.js','./config.js'];
const isSameOrigin = (url) => { try{ return new URL(url).origin === self.location.origin; }catch(e){ return false; } };
self.addEventListener('install', (e)=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e)=>{
  if(!isSameOrigin(e.request.url)) return;
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request).catch(()=>caches.match('./index.html'))));
});
