/*! cloud-db.v3.8.js — Search override (IDB-Only) + Exact-Match incl. note
 *  - Sovrascrive SOLO `window.lista()`
 *  - Legge direttamente da IndexedDB (openDB) per evitare dipendenze dal cloud
 *  - Se IndexedDB non è disponibile, esegue la lista() originale
 */
(function(){
  console.log('%c[cloud-db.v3.8] Search override: IndexedDB-Only + exact-match (incl. note)', 'color:#1e8b3d');

  const norm = v => String(v ?? '').trim().toLowerCase();
  function isExactMatchRecord(r, q){
    const needle = norm(q);
    const fields = [
      'descrizione','modello','cliente','telefono','docTrasporto',
      'battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco',
      'punta','numPunte','note'
    ];
    for(const k of fields){ if(norm(r?.[k]) === needle) return true; }
    return false;
  }

  async function idbAll(){
    if(typeof window.openDB !== 'function'){
      console.warn('[v3.8] openDB non definito: non posso leggere IndexedDB');
      return [];
    }
    const db = await window.openDB();
    return await new Promise((res, rej)=>{
      const tx = db.transaction('records','readonly');
      const q  = tx.objectStore('records').getAll();
      q.onsuccess = ()=> res(q.result || []);
      q.onerror   = ()=> rej(q.error);
    });
  }

  const __orig_lista = window.lista;

  window.lista = async function(){
    const t0 = performance.now();
    try{
      if(typeof window.openDB !== 'function'){
        console.warn('[v3.8] openDB assente, fallback a lista() originale');
        if(typeof __orig_lista === 'function') return await __orig_lista();
        return;
      }
      const qEl = document.getElementById('q');
      const q = qEl ? qEl.value : '';
      const qn = norm(q);

      // Carica TUTTO da IDB
      let rows = await idbAll();
      const totalBefore = rows.length;

      // Applica filtri "stato" della tua UX
      if(window.currentFilter === 'attesa'){
        rows = rows.filter(r => (r.statoPratica||'') === 'In attesa');
      }else if(window.currentFilter === 'lavorazione'){
        rows = rows.filter(r => (r.statoPratica||'') === 'In lavorazione');
      }else if(window.currentFilter === 'completed'){
        rows = rows.filter(r => (r.statoPratica||'') === 'Completata' || (r.statoPratica||'') === 'Consegnata');
      }
      if(window.currentFilter === 'soon' && typeof window.isSoon==='function' && typeof window.parseDate==='function'){
        rows = rows.filter(r => window.isSoon(window.parseDate(r.dataScadenza)));
      }
      const afterFilter = rows.length;

      // Ricerca a MATCH ESATTO (incl. note)
      if(qn){
        rows = rows.filter(r => isExactMatchRecord(r, qn));
      }
      const afterSearch = rows.length;

      // Filtri tecnici già esatti
      if(typeof window.matchTechFilters === 'function'){
        rows = rows.filter(window.matchTechFilters);
      }
      const afterTech = rows.length;

      // Ordine come originale
      rows.sort((a,b)=>(String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))));

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

      // Render
      window.searchRows = rows;
      window.page = 1;
      if(typeof window.renderPager === 'function') window.renderPager(window.searchRows.length);
      if(typeof window.drawListPage === 'function') await window.drawListPage();

      const t1 = performance.now();
      console.log(`[v3.8] lista(): IDB total:${totalBefore} -> afterFilter:${afterFilter} -> afterSearch:${afterSearch} -> afterTech:${afterTech} | ${Math.round(t1-t0)}ms`);
    }catch(err){
      console.error('[cloud-db.v3.8] lista():', err);
      if(typeof __orig_lista === 'function'){
        try{ return await __orig_lista(); }catch(e){ console.error('[cloud-db.v3.8] fallback lista() err:', e); }
      }
    }
  };
})();