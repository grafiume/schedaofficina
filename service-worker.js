const CACHE = 'officina-cache-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './service-worker.js',
  './config.js',
  './app-supabase-bridge.js',
  './logo-elip.jpg'
];
self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e)=>{
  e.respondWith(
    caches.match(e.request).then(resp=> resp || fetch(e.request).catch(()=>caches.match('./index.html')))
  );
});
