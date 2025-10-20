/*! cloud-db.v3.js — Exact-Match Search Patch
 *  Questo file sovrascrive solo la funzione `lista()` per rendere la ricerca a match ESATTO
 *  senza modificare l'index.html. Deve essere caricato DOPO lo script che definisce `lista()`.
 *  (Nel tuo index è già così.)
 */
(function(){
  if (!window) return;
  console.log('[cloud-db.v3.js] Patch "Exact Match" attiva');

  // Normalizza: trim + lowercase
  function norm(v){ return String(v ?? '').trim().toLowerCase(); }

  // Ritorna true se ALMENO UNO dei campi è esattamente uguale alla query (case-insensitive)
  function isExactMatchRecord(r, q){
    const needle = norm(q);
    const fields = [
      'descrizione','modello','cliente','telefono','docTrasporto',
      'battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco',
      'punta','numPunte'
    ];
    for (const k of fields){
      if (norm(r?.[k]) === needle) return true;
    }
    return false;
  }

  // Conserviamo l'originale (per debug eventuale)
  const __orig_lista = window.lista;

  // Sostituiamo `lista()` con versione exact-match, riusando la pipeline originale
  window.lista = async function(){
    try{
      const qEl = document.getElementById('q');
      const q = qEl ? qEl.value : '';
      let rows;

      // Stesse sorgenti dell'originale
      if (window.currentFilter === 'attesa' || window.currentFilter === 'lavorazione' || window.currentFilter === 'completed'){
        if (window.currentFilter === 'completed'){
          const comp = await window.getByStato('Completata');
          const cons = await window.getByStato('Consegnata'); // compat: se presente
          rows = [...comp, ...cons];
        } else {
          const stato = (window.currentFilter === 'attesa') ? 'In attesa' : 'In lavorazione';
          rows = await window.getByStato(stato);
        }
      } else {
        rows = await window.getAllRecords();
      }

      // Scadenze entro 7gg come da originale
      if (window.currentFilter === 'soon'){
        rows = rows.filter(r => window.isSoon(window.parseDate(r.dataScadenza)));
      }

      // === DIFFERENZA CHIAVE: filtro a MATCH ESATTO ===
      const qn = norm(q);
      if (qn){
        rows = rows.filter(r => isExactMatchRecord(r, qn));
      }

      // Filtri tecnici (già esatti nell'index)
      if (typeof window.matchTechFilters === 'function'){
        rows = rows.filter(window.matchTechFilters);
      }

      // Ordina come originale
      rows.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));

      // Aggiorna badge filtro attivo
      const box = document.getElementById('activeFilterBox');
      const lab = document.getElementById('activeFilterLabel');
      if (box && lab){
        if (window.currentFilter){
          box.classList.remove('d-none');
          const lbl = (window.FILTER_LABELS && window.FILTER_LABELS[window.currentFilter]) || 'Filtro attivo';
          lab.textContent = lbl;
        } else {
          box.classList.add('d-none');
          lab.textContent = '';
        }
      }

      // Paginazione e render pagina risultati
      window.searchRows = rows;
      window.page = 1;
      if (typeof window.renderPager === 'function') window.renderPager(window.searchRows.length);
      if (typeof window.drawListPage === 'function') await window.drawListPage();

    }catch(err){
      console.error('[cloud-db.v3.js] Errore in lista():', err);
      // Fallback all'originale se esiste
      if (typeof __orig_lista === 'function'){
        try{ return await __orig_lista(); }catch(e){ console.error('[cloud-db.v3.js] Fallback lista() fallito:', e); }
      }
    }
  };
})();