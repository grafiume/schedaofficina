
/**
 * technical-filters.js
 * Attiva filtri "corrispondenza esatta" e popola la finestra "Dettaglio scheda"
 * con i campi tecnici aggiuntivi.
 *
 * Assunzioni sugli ID degli elementi (puoi rinominarli se diversi):
 *  Inputs filtro:  #f-battCollettore, #f-lungAsse, #f-lungPacco, #f-largPacco, #f-punta, #f-numPunte
 *  Bottoni:        #btnApplyFilters, #btnResetFilters
 *  Lista/refresh:  window.lista() oppure window.refreshDashboard()
 *  Dettaglio:      esistono elementi con ID: #d-battCollettore, #d-lungAsse, #d-lungPacco, #d-largPacco, #d-punta, #d-numPunte
 *
 * Funziona sia con IndexedDB locale che con Supabase (se presente window.supabase).
 */
(function(){
  const Q = (sel) => document.querySelector(sel);

  // Normalizza per confronto esatto: trim, case-sensitive disabilitato per i numeri
  function norm(x){
    if(x==null) return "";
    return String(x).trim();
  }

  // ========= RICERCA CON CORRISPONDENZA ESATTA =========
  async function searchExact(){
    const battCollettore = norm(Q('#f-battCollettore')?.value);
    const lungAsse       = norm(Q('#f-lungAsse')?.value);
    const lungPacco      = norm(Q('#f-lungPacco')?.value);
    const largPacco      = norm(Q('#f-largPacco')?.value);
    const punta          = norm(Q('#f-punta')?.value);
    const numPunte       = norm(Q('#f-numPunte')?.value);

    // Se presente Supabase, usa query .eq() per match esatto
    if(window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
      const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      let q = sb.from('records').select('*');
      if(battCollettore) q = q.eq('battCollettore', battCollettore);
      if(lungAsse)       q = q.eq('lungAsse',       lungAsse);
      if(lungPacco)      q = q.eq('lungPacco',      lungPacco);
      if(largPacco)      q = q.eq('largPacco',      largPacco);
      if(punta && punta !== 'tutte') q = q.eq('punta', punta);
      if(numPunte)       q = q.eq('numPunte',       numPunte);
      const { data, error } = await q.order('updatedAt', { ascending:false });
      if(error){ console.warn('[filters] supabase error:', error.message); return []; }
      window.__lastExactFiltered = data||[];
      if(typeof window.renderList === 'function'){
        window.renderList(window.__lastExactFiltered);
      }else if(typeof window.lista === 'function'){
        window.lista(window.__lastExactFiltered);
      }else if(typeof window.refreshDashboard === 'function'){
        window.refreshDashboard();
      }
      return data||[];
    }

    // Fallback locale (se hai già in memoria i records)
    let all = [];
    if(typeof window.getAllRecords === 'function'){
      all = await window.getAllRecords();
    }
    const filtered = (all||[]).filter(r => {
      if(battCollettore && norm(r.battCollettore)!==battCollettore) return false;
      if(lungAsse       && norm(r.lungAsse)!==lungAsse) return false;
      if(lungPacco      && norm(r.lungPacco)!==lungPacco) return false;
      if(largPacco      && norm(r.largPacco)!==largPacco) return false;
      if(punta && punta!=='tutte' && norm(r.punta)!==punta) return false;
      if(numPunte       && norm(r.numPunte)!==numPunte) return false;
      return true;
    });
    window.__lastExactFiltered = filtered;
    if(typeof window.renderList === 'function'){
      window.renderList(filtered);
    }else if(typeof window.lista === 'function'){
      window.lista(filtered);
    }else if(typeof window.refreshDashboard === 'function'){
      window.refreshDashboard();
    }
    return filtered;
  }

  // ========= POPOLAMENTO DETTAGLIO =========
  window.populateDettaglioTecnico = function(record){
    if(!record) return;
    const map = {
      '#d-battCollettore': 'battCollettore',
      '#d-lungAsse': 'lungAsse',
      '#d-lungPacco': 'lungPacco',
      '#d-largPacco': 'largPacco',
      '#d-punta': 'punta',
      '#d-numPunte': 'numPunte'
    };
    Object.entries(map).forEach(([sel,key])=>{
      const el = Q(sel);
      if(el) el.textContent = (record[key] ?? '').toString();
    });
  };

  // ========= BIND UI =========
  function bind(){
    const btnApply = Q('#btnApplyFilters');
    if(btnApply) btnApply.addEventListener('click', (e)=>{ e.preventDefault(); searchExact(); });

    const btnReset = Q('#btnResetFilters');
    if(btnReset) btnReset.addEventListener('click', (e)=>{
      e.preventDefault();
      ['#f-battCollettore','#f-lungAsse','#f-lungPacco','#f-largPacco','#f-punta','#f-numPunte']
        .forEach(sel => { const el = Q(sel); if(el) el.value = ''; });
      if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
    });

    // Se esiste una funzione showDettaglio(id), aggancia il popolamento tecnico
    const _showDettaglio = window.showDettaglio;
    window.showDettaglio = async function(id){
      let rec = null;
      if(typeof window.getRecord === 'function') rec = await window.getRecord(id);
      if(!rec && typeof _showDettaglio === 'function') return _showDettaglio(id);
      try{ if(typeof _showDettaglio === 'function') _showDettaglio(id); }catch{}
      window.populateDettaglioTecnico(rec);
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  }else{
    bind();
  }
})();
