self.addEventListener('install', e=>{
  e.waitUntil(caches.open('scheda-officina-v1').then(c=>c.addAll([
    './','./index.html','./manifest.json','./config.js','./supabase-singleton.js','./app-supabase.v6.3.3.js',
    './filters-exact-guard.js','./icons/icon-192.png','./icons/icon-512.png','./logo-elip.jpg','./favicon.ico'
  ])));
});
self.addEventListener('fetch', e=>{
  e.respondWith(
    caches.match(e.request).then(r=>r || fetch(e.request).then(resp=>{
      const copy = resp.clone();
      caches.open('scheda-officina-v1').then(c=>c.put(e.request, copy)).catch(()=>{});
      return resp;
    }).catch(()=>r))
  );
});