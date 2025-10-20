/*! cloud-db.v3.4.js — SAFE Exact-Match (incl. NOTE) — non tocca CRUD/Upload/Realtime
 *  - Sovrascrive SOLO `window.lista()`.
 *  - Usa le funzioni già definite (IndexedDB o Supabase) senza cambiarle.
 *  - Include anche il campo `note` nel match esatto.
 */
(function(){
  console.log('%c[cloud-db.v3.4] Exact-Match SAFE attivo (incl. note)', 'color:#e07b39');

  function norm(v){ return String(v ?? '').trim().toLowerCase(); }
  function isExactMatchRecord(r, q){
    const needle = norm(q);
    const fields = [
      'descrizione','modello','cliente','telefono','docTrasporto',
      'battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco',
      'punta','numPunte','note' // <-- includiamo anche NOTE
    ];
    for(const k of fields){ if(norm(r?.[k]) === needle) return true; }
    return false;
  }

  const __orig_lista = window.lista;

  window.lista = async function(){
    try{
      const t0 = performance.now();
      const qEl = document.getElementById('q');
      const q = qEl ? qEl.value : '';
      const qn = norm(q);

      // Usa SEMPRE le funzioni già caricate nell'app
      const getAllRecords = window.getAllRecords;
      const getByStato    = window.getByStato;
      const isSoon        = window.isSoon;
      const parseDate     = window.parseDate;

      if(typeof getAllRecords !== 'function'){
        console.error('[v3.4] getAllRecords non trovato. Carica prima lo script principale.');
        if(typeof __orig_lista === 'function') return await __orig_lista();
        return;
      }
      if(typeof getByStato !== 'function'){
        console.warn('[v3.4] getByStato non trovato — uso getAllRecords().');
      }

      let rows;
      if(window.currentFilter === 'attesa' || window.currentFilter === 'lavorazione' || window.currentFilter === 'completed'){
        if(window.currentFilter === 'completed'){
          const comp = (typeof getByStato==='function') ? await getByStato('Completata') : await getAllRecords();
          const cons = (typeof getByStato==='function') ? await getByStato('Consegnata') : [];
          rows = [...(comp||[]), ...(cons||[])];
        }else{
          const stato = (window.currentFilter === 'attesa') ? 'In attesa' : 'In lavorazione';
          rows = (typeof getByStato==='function') ? await getByStato(stato) : await getAllRecords();
        }
      }else{
        rows = await getAllRecords();
      }

      const totalBefore = rows.length;

      if(window.currentFilter === 'soon' && typeof isSoon==='function' && typeof parseDate==='function'){
        rows = rows.filter(r => isSoon(parseDate(r.dataScadenza)));
      }

      const afterSoon = rows.length;

      // === Filtro di Ricerca (match ESATTO) ===
      if(qn){
        rows = rows.filter(r => isExactMatchRecord(r, qn));
      }

      const afterSearch = rows.length;

      // Filtri tecnici già esatti nel tuo index
      if(typeof window.matchTechFilters === 'function'){
        rows = rows.filter(window.matchTechFilters);
      }

      const afterTech = rows.length;

      // Ordina come da comportamento originale
      rows.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));

      // Aggiorna badge filtro attivo
      const box = document.getElementById('activeFilterBox');
      const lab = document.getElementById('activeFilterLabel');
      if(box && lab){
        if(window.currentFilter){
          box.classList.remove('d-none');
          const lbl = (window.FILTER_LABELS && window.FILTER_LABELS[window.currentFilter]) || 'Filtro attivo';
          lab.textContent = lbl;
        }else{
          box.classList.add('d-none');
          lab.textContent = '';
        }
      }

      // Paginazione + render
      window.searchRows = rows;
      window.page = 1;
      if(typeof window.renderPager === 'function') window.renderPager(window.searchRows.length);
      if(typeof window.drawListPage === 'function') await window.drawListPage();

      const t1 = performance.now();
      console.log(`[v3.4] lista(): tot:${totalBefore} -> soon:${afterSoon} -> search:${afterSearch} -> tech:${afterTech} | ${Math.round(t1-t0)}ms`);
    }catch(err){
      console.error('[cloud-db.v3.4] lista():', err);
      if(typeof __orig_lista === 'function'){
        try{ return await __orig_lista(); }catch(e){ console.error('[cloud-db.v3.4] fallback lista() err:', e); }
      }
    }
  };
})();