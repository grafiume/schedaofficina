const CACHE='officina-cache-v6';
const ASSETS=['./','./index.html','./manifest.json','./js/db.js','./js/app.js','./js/cloud-sync.js','./config.js','./icons/icon-192.png','./icons/icon-512.png','./logo-elip.jpg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(h=>h||fetch(e.request).catch(()=>caches.match('./index.html'))));});
