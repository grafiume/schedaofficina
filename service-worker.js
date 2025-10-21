self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open('so-light-v1').then(c=>c.addAll([
    './','./index.html','./styles.css','./app-core.js','./app-supabase.js','./supabase-singleton.js','./manifest.json'
  ])));
});
self.addEventListener('fetch', (e)=>{
  e.respondWith(caches.match(e.request).then(r=>r || fetch(e.request)));
});