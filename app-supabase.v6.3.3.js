/* ===== HOTFIX VISIBILITÀ MULTI-DEVICE (runtime, senza toccare index.html) =====
   - Disinstalla *tutti* i Service Worker del dominio
   - Svuota *tutte* le cache (inclusi vecchi 'officina-cache-v4', ecc.)
   - Ricarica la pagina con ?v=<timestamp> per bustare la cache dei file
   - Esegue una sola volta per sessione (usa sessionStorage)
*/
(async function hotfixPWAOnce() {
  try {
    if (sessionStorage.getItem('officina_hotfix_done')) return;

    // 1) Unregister SW (se presenti)
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try { await reg.unregister(); } catch (e) { /* ignore */ }
      }
      // cerca anche un solo registration “default”
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.unregister();
      } catch (e) { /* ignore */ }
    }

    // 2) Svuota tutte le cache
    if (window.caches && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => {
        // elimina tutto; se vuoi tenere qualcosa, filtra qui
        return caches.delete(k);
      }));
    }

    // 3) Forza reload con query version per rompere qualsiasi cache residua
    const url = new URL(location.href);
    if (!url.searchParams.has('v')) {
      url.searchParams.set('v', String(Date.now()));
      sessionStorage.setItem('officina_hotfix_done', '1');
      location.replace(url.toString());
      return; // stop qui: dopo reload non riesegue
    } else {
      sessionStorage.setItem('officina_hotfix_done', '1');
    }
  } catch (err) {
    console.warn('[officina hotfix] errore durante la pulizia cache/SW:', err);
  }
})();

(function(){ if(!window.sb){ console.warn("[supabase] client assente"); return; } console.log("[supabase] Bridge attivo (v6.3.3)"); window.sbbridge = { async syncRecord(r){ try{ await window.sb.from("records").upsert(r).select(); }catch(e){} } }; })();
