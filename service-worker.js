// sw.js — KILL SWITCH (2025-10-17)
// Scopo: niente cache, svuota tutte le cache, si de-registra, forza reload client.

self.addEventListener('install', (event) => {
  // attiva subito il nuovo SW
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1) elimina TUTTE le cache esistenti (qualsiasi nome)
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}

    // 2) prendi subito controllo delle pagine aperte
    await self.clients.claim();

    // 3) chiedi ai client di ricaricare con cache busting
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const stamp = Date.now();
    for (const client of clients) {
      try {
        const url = new URL(client.url);
        url.searchParams.set('v', String(stamp));
        // naviga forzando un reload (buca ogni SW cache residua)
        client.navigate(url.toString());
      } catch (_) {}
    }

    // 4) auto-unregister: questo SW si disinstalla da solo
    try {
      const reg = await self.registration.unregister();
      // opzionale: log su console SW
      // console.log('[sw] unregistered:', reg);
    } catch (_) {}
  })());
});

// 5) fetch pass-through: nessuna cache, sempre rete
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
