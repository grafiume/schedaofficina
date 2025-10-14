const CACHE = 'officina-cache-v7-public';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './service-worker.js',
  './config.js',
  './app-supabase-bridge.js',
  './app-photos.js',
  './logo-elip.jpg'
];
const isStorageURL = (url) => url.includes('/storage/v1/object/public/');

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e)=>{
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e)=>{
  const url = e.request.url;
  if (isStorageURL(url) || e.request.destination === 'image') {
    e.respondWith(
      fetch(e.request).then(resp => resp).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(resp=> resp || fetch(e.request).catch(()=>caches.match('./index.html')))
  );
});
