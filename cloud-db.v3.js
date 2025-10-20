/*! cloud-db.v3.10.js — Force-Bind + Fallback Renderer (IDB-only exact-match incl. note) */
(function(){
  console.log('%c[cloud-db.v3.10] Force-Bind + Fallback Renderer attivo (IDB-only + exact-match incl. note)', 'color:#e07b39');

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
      console.warn('[v3.10] openDB non definito, impossibile leggere IDB');
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

  function fmtIT(v){
    try{
      if(!v) return '';
      const d = new Date(v);
      if(isNaN(d)) return '';
      return d.toLocaleDateString('it-IT');
    }catch(_){ return ''; }
  }
  function safe(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  async function fallbackRender(rows){
    try{
      const tb = document.querySelector('#tableResults tbody');
      if(!tb){ console.warn('[v3.10] fallbackRender: tbody non trovato'); return; }
      tb.innerHTML = '';

      if(!rows.length){
        tb.innerHTML = `<tr><td colspan="9" class="text-muted">Nessun risultato.</td></tr>`;
        return;
      }

      const slice = rows.slice(0, 50);
      for(const r of slice){
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><!-- thumb n/d in fallback --></td>
          <td class="desc-col"><strong>${safe(r.descrizione)}</strong> ${safe(r.modello)}</td>
          <td class="nowrap">${safe(r.cliente)}</td>
          <td class="nowrap">${safe(r.telefono)}</td>
          <td class="nowrap">${fmtIT(r.dataApertura || r.dataArrivo || '')}</td>
          <td class="nowrap">${fmtIT(r.dataAccettazione)}</td>
          <td class="nowrap">${fmtIT(r.dataScadenza)}</td>
          <td class="nowrap">${safe(r.statoPratica || '')}</td>
          <td class="text-end nowrap">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" data-open="${r.id}">Apri</button>
              <button class="btn btn-sm btn-outline-success" data-edit="${r.id}">Modifica</button>
            </div>
          </td>`;
        tb.appendChild(tr);
      }
      tb.querySelectorAll('button[data-open]').forEach(b=>{
        b.addEventListener('click', ()=>{ if(typeof window.apri==='function') window.apri(b.dataset.open); });
      });
      tb.querySelectorAll('button[data-edit]').forEach(b=>{
        b.addEventListener('click', ()=>{ if(typeof window.modifica==='function') window.modifica(b.dataset.edit); });
      });
      console.log('[v3.10] fallbackRender completato:', slice.length, 'righe');
    }catch(err){
      console.error('[v3.10] fallbackRender err:', err);
    }
  }

  const __orig_lista = window.lista;
  async function lista_override(){
    const t0 = performance.now();
    try{
      if(typeof window.openDB !== 'function'){
        console.warn('[v3.10] openDB assente, fallback lista() originale');
        if(typeof __orig_lista === 'function') return await __orig_lista();
        return;
      }
      const qEl = document.getElementById('q');
      const q = qEl ? qEl.value : '';
      const qn = norm(q);

      let rows = await idbAll();
      const totalBefore = rows.length;

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

      if(qn){
        rows = rows.filter(r => isExactMatchRecord(r, qn));
      }
      const afterSearch = rows.length;

      if(typeof window.matchTechFilters === 'function'){
        rows = rows.filter(window.matchTechFilters);
      }
      const afterTech = rows.length;

      rows.sort((a,b)=>(String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))));

      // badge filtro attivo
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

      // standard pipeline
      let standardRendered = false;
      try{
        window.searchRows = rows;
        window.page = 1;
        if(typeof window.renderPager === 'function') window.renderPager(window.searchRows.length);
        if(typeof window.drawListPage === 'function'){
          await window.drawListPage();
          standardRendered = true;
          console.log('[v3.10] drawListPage OK');
        }
      }catch(e){
        console.warn('[v3.10] drawListPage ha dato errore, uso fallbackRender:', e?.message || e);
      }

      if(!standardRendered){
        await fallbackRender(rows);
      }

      const t1 = performance.now();
      console.log(`[v3.10] lista(): IDB total:${totalBefore} -> afterFilter:${afterFilter} -> afterSearch:${afterSearch} -> afterTech:${afterTech} | ${Math.round(t1-t0)}ms`);
    }catch(err){
      console.error('[cloud-db.v3.10] lista():', err);
      if(typeof __orig_lista === 'function'){
        try{ return await __orig_lista(); }catch(e){ console.error('[cloud-db.v3.10] fallback lista() err:', e); }
      }
    }
  }
  window.lista = lista_override;

  function forceBind(){
    try{
      const btn = document.getElementById('btnDoSearch');
      if(btn){ btn.onclick = lista_override; }
      const q = document.getElementById('q');
      if(q){
        q.addEventListener('input', ()=>{ window.lista && window.lista(); }, { passive:true });
      }
      console.log('[v3.10] forceBind: handlers ricollegati');
    }catch(e){
      console.warn('[v3.10] forceBind err', e);
    }
  }

  if(document.readyState === 'complete' || document.readyState === 'interactive'){
    forceBind();
  }else{
    document.addEventListener('DOMContentLoaded', forceBind, { once:true });
  }

  const __orig_sh = window.sh;
  if(typeof __orig_sh === 'function'){
    window.sh = function(n){
      const r = __orig_sh.apply(this, arguments);
      if(n === 'search'){
        setTimeout(()=>{ if(typeof window.lista === 'function') window.lista(); }, 0);
      }
      return r;
    };
    console.log('[v3.10] sh() wrapped');
  }

  const __orig_go = window.goToSearchWithFilter;
  if(typeof __orig_go === 'function'){
    window.goToSearchWithFilter = function(filterKey){
      const r = __orig_go.apply(this, arguments);
      setTimeout(()=>{ if(typeof window.lista === 'function') window.lista(); }, 0);
      return r;
    };
    console.log('[v3.10] goToSearchWithFilter() wrapped');
  }
})();