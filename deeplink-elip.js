// ELIP Scheda Officina – Deep link by ?id=<UUID>
(function(){
  try {
    const params = new URLSearchParams(window.location.search);
    let id = params.get('id');
    if (!id && window.location.hash) {
      const m = window.location.hash.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) id = m[0];
    }
    if (!id) return;
    try { localStorage.setItem('elip_deeplink_id', id); } catch {}
    window.ELIP_RECORD_ID = id;
    function tryOpen(){
      if (typeof window.openRecordById === 'function') { window.openRecordById(id); return true; }
      if (typeof window.showDetail === 'function')    { window.showDetail(id);    return true; }
      if (typeof window.openDetail === 'function')    { window.openDetail(id);    return true; }
      if (window.app && typeof window.app.open === 'function') { window.app.open(id); return true; }
      return false;
    }
    if (!tryOpen()){
      let n = 0, max = 20;
      const t = setInterval(()=>{ n++; if (tryOpen() || n>=max) clearInterval(t); },250);
      document.addEventListener('DOMContentLoaded', tryOpen, { once:true });
    }
  } catch(e){}
})();