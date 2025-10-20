/*! cloud-db.v3.7.js — Search override (Fallback-First IDB → Cloud) + Exact-Match incl. note */
(function(){
  console.log('%c[cloud-db.v3.7] Search override: Fallback-First (IDB→Cloud) + exact-match (incl. note)', 'color:#e07b39');

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
  function dedupeByIdPreferNewest(arr){
    const map = new Map();
    for(const r of arr){
      if(!r || !r.id) continue;
      const prev = map.get(r.id);
      if(!prev) { map.set(r.id, r); continue; }
      const a = String(prev.updatedAt||''); const b = String(r.updatedAt||''); 
      if(b.localeCompare(a) > 0){ map.set(r.id, r); }
    }
    return Array.from(map.values());
  }

  async function idbAll(){
    try{
      if(typeof window.openDB !== 'function') return [];
      const db = await window.openDB();
      return await new Promise((res, rej)=>{
        const tx = db.transaction('records','readonly');
        const q  = tx.objectStore('records').getAll();
        q.onsuccess = ()=> res(q.result || []);
        q.onerror   = ()=> rej(q.error);
      });
    }catch(e){ console.warn('[v3.7] idbAll err', e); return []; }
  }
  async function idbByStato(st){
    try{
      if(typeof window.openDB !== 'function') return [];
      const db = await window.openDB();
      return await new Promise((res, rej)=>{
        const tx  = db.transaction('records','readonly');
        const idx = tx.objectStore('records').index('byStato');
        const q   = idx.getAll(st);
        q.onsuccess = ()=> res(q.result || []);
        q.onerror   = ()=> rej(q.error);
      });
    }catch(e){ console.warn('[v3.7] idbByStato err', e); return []; }
  }

  async function cloudAll(){
    try{
      if(typeof window.getAllRecords !== 'function') return [];
      const rows = await window.getAllRecords();
      return Array.isArray(rows) ? rows : [];
    }catch(e){ console.warn('[v3.7] cloudAll err', e); return []; }
  }
  async function cloudByStato(st){
    try{
      if(typeof window.getByStato !== 'function') return [];
      const rows = await window.getByStato(st);
      return Array.isArray(rows) ? rows : [];
    }catch(e){ console.warn('[v3.7] cloudByStato err', e); return []; }
  }

  async function loadAllFallbackFirst(){
    const a = await idbAll();
    if(a.length){
      console.log('[v3.7] source=IDB all ->', a.length);
      return a;
    }
    const b = await cloudAll();
    console.log('[v3.7] source=CLOUD all ->', b.length);
    return b;
  }
  async function loadByStatoFallbackFirst(st){
    const a = await idbByStato(st);
    if(a.length){
      console.log(`[v3.7] source=IDB byStato(${st}) ->`, a.length);
      return a;
    }
    const b = await cloudByStato(st);
    console.log(`[v3.7] source=CLOUD byStato(${st}) ->`, b.length);
    return b;
  }

  const __orig_lista = window.lista;

  window.lista = async function(){
    try{
      const t0 = performance.now();
      const qEl = document.getElementById('q');
      const q = qEl ? qEl.value : '';
      const qn = norm(q);

      let rows = [];
      if(window.currentFilter === 'attesa' || window.currentFilter === 'lavorazione' || window.currentFilter === 'completed'){
        if(window.currentFilter === 'completed'){
          const comp = await loadByStatoFallbackFirst('Completata');
          const cons = await loadByStatoFallbackFirst('Consegnata');
          rows = dedupeByIdPreferNewest([...(comp||[]), ...(cons||[])]);
        }else{
          const stato = (window.currentFilter === 'attesa') ? 'In attesa' : 'In lavorazione';
          rows = await loadByStatoFallbackFirst(stato);
        }
      }else{
        rows = await loadAllFallbackFirst();
      }

      const totalBefore = rows.length;

      if(window.currentFilter === 'soon' && typeof window.isSoon==='function' && typeof window.parseDate==='function'){
        rows = rows.filter(r => window.isSoon(window.parseDate(r.dataScadenza)));
      }
      const afterSoon = rows.length;

      if(qn){
        rows = rows.filter(r => isExactMatchRecord(r, qn));
      }
      const afterSearch = rows.length;

      if(typeof window.matchTechFilters === 'function'){
        rows = rows.filter(window.matchTechFilters);
      }
      const afterTech = rows.length;

      rows.sort((a,b)=>(String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))));

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

      window.searchRows = rows;
      window.page = 1;
      if(typeof window.renderPager === 'function') window.renderPager(window.searchRows.length);
      if(typeof window.drawListPage === 'function') await window.drawListPage();

      const t1 = performance.now();
      console.log(`[v3.7] lista(): tot:${totalBefore} -> soon:${afterSoon} -> search:${afterSearch} -> tech:${afterTech} | ${Math.round(t1-t0)}ms`);
    }catch(err){
      console.error('[cloud-db.v3.7] lista():', err);
      if(typeof __orig_lista === 'function'){
        try{ return await __orig_lista(); }catch(e){ console.error('[cloud-db.v3.7] fallback lista() err:', e); }
      }
    }
  };
})();