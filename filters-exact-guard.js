// Forza corrispondenza esatta per i filtri tecnici
(function(){
  function eq(a,b){ return String(a??'').trim().toLowerCase() === String(b??'').trim().toLowerCase(); }
  const patch = ()=>{
    if(typeof window.matchTechFilters === 'function'){
      window.matchTechFilters = function(r){
        const want = window.techFilters || {};
        if(want.battCollettore && !eq(r.battCollettore, want.battCollettore)) return false;
        if(want.lunghezzaAsse && !eq(r.lunghezzaAsse, want.lunghezzaAsse)) return false;
        if(want.lunghezzaPacco && !eq(r.lunghezzaPacco, want.lunghezzaPacco)) return false;
        if(want.larghezzaPacco && !eq(r.larghezzaPacco, want.larghezzaPacco)) return false;
        if(want.punta && !eq(r.punta, want.punta)) return false;
        if(want.numPunte && !eq(r.numPunte, want.numPunte)) return false;
        return true;
      };
      console.log('[filters-exact-guard] override attivo');
    }
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', patch);
  else patch();
})();