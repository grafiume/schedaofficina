
/*! reset-filters-addon.v1.js
 * Pulisce TUTTI i campi di filtro:
 * - ricerca generale #q
 * - Note (match esatto) #noteExact
 * - filtri tecnici singoli (per id e per name)
 * Dopo il reset azzera anche la tabella (renderPager(0) + drawListPage()).
 */
(function(){
  const LOG='[reset-filters-addon]';
  const $=(s,ctx=document)=>ctx.querySelector(s);
  const $$=(s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  function clearInputs(){
    try{
      const q = $('#q'); if(q) q.value='';
      const n = $('#noteExact'); if(n) n.value='';

      // per id noti
      ['#f_battCollettore','#f_lunghezzaAsse','#f_lunghezzaPacco','#f_larghezzaPacco','#f_punta','#f_numPunte']
        .forEach(sel=>{ const el=$(sel); if(el) el.value=''; });

      // per name, in caso i tuoi input usino name=...
      ['battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco','punta','numPunte']
        .forEach(name=>{ const el=document.querySelector(`[name="${name}"]`); if(el) el.value=''; });

      // eventuali select/input nella sezione #page-search
      $$('#page-search input, #page-search select, #page-search textarea').forEach(el=>{
        if (el.id==='btnDoSearch' || el.id==='btnClearFilter') return;
        if (el.type==='checkbox' || el.type==='radio') el.checked=false;
        else el.value='';
      });

      // azzera la lista
      window.searchRows = [];
      window.page = 1;
      if (typeof window.renderPager==='function') window.renderPager(0);
      if (typeof window.drawListPage==='function') window.drawListPage();

      console.log(LOG, 'reset eseguito');
    }catch(e){ console.warn(LOG, e); }
  }

  // aggancia ai pulsanti noti e a fallback con testo
  function hook(){
    const btn = $('#btnClearFilter');
    if (btn && !btn.__RESET_HOOKED__) {
      btn.__RESET_HOOKED__ = true;
      btn.addEventListener('click', clearInputs, true);
      console.log(LOG, 'agganciato #btnClearFilter');
    }
    // fallback: pulsanti con testo "Rimuovi filtro" o "Reset"
    Array.from(document.querySelectorAll('button, a')).forEach(b=>{
      const t=(b.textContent||'').trim().toLowerCase();
      if (/(rimuovi\s*filtro|reset)/.test(t) && !b.__RESET_HOOKED__) {
        b.__RESET_HOOKED__=true;
        b.addEventListener('click', clearInputs, true);
      }
    });
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();
})();
