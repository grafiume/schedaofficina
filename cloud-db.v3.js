/*! cloud-db.v3.6-search-override.js — Search union (Supabase + IndexedDB) + Exact-Match incl. NOTE
 *  - Sovrascrive SOLO `window.lista()`
 *  - Carica e unisce i record da: funzioni app (cloud) + IndexedDB diretto (se disponibile)
 *  - Match ESATTO (case-insensitive, trim) anche su `note`
 *  - Non tocca CRUD/Upload/Realtime
 */
(function(){
  console.log('%c[cloud-db.v3.6] Search override: union Cloud+IDB + exact-match (incl. note)', 'color:#1e8b3d');

  // ---- Helpers ----
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

  // ---- IndexedDB direct readers (use only if openDB exists) ----
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
    }catch(_){ return []; }
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
    }catch(_){ return []; }
  }

  // ---- Loaders: cloud (via app functions) + idb ----
  async function loadAll(){
    const parts = [];
    try{ if(typeof window.getAllRecords === 'function'){ parts.push(await window.getAllRecords() || []); } }catch(e){ console.warn('[v3.6] getAllRecords cloud err', e); }
    try{ parts.push(await idbAll()); }catch(_){}
    return dedupeByIdPreferNewest(parts.flat());
  }
  async function loadByStato(st){
    const parts = [];
    try{ if(typeof window.getByStato === 'function'){ parts.push(await window.getByStato(st) || []); } }catch(e){ console.warn('[v3.6] getByStato cloud err', e); }
    try{ parts.push(await idbByStato(st)); }catch(_){}
    return dedupeByIdPreferNewest(parts.flat());
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
          const comp = await loadByStato('Completata');
          const cons = await loadByStato('Consegnata');
          rows = [...comp, ...cons];
        }else{
          const stato = (window.currentFilter === 'attesa') ? 'In attesa' : 'In lavorazione';
          rows = await loadByStato(stato);
        }
      }else{
        rows = await loadAll();
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
      console.log(`[v3.6] lista(): tot:${totalBefore} -> soon:${afterSoon} -> search:${afterSearch} -> tech:${afterTech} | ${Math.round(t1-t0)}ms`);
    }catch(err){
      console.error('[cloud-db.v3.6] lista():', err);
      if(typeof __orig_lista === 'function'){
        try{ return await __orig_lista(); }catch(e){ console.error('[cloud-db.v3.6] fallback lista() err:', e); }
      }
    }
  };
})();