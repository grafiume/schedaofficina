
/**
 * filters-exact-hard-custom.js
 * Corrispondenza ESATTA per i "Filtri tecnici (singoli)" usando gli ID:
 *  - #f_battCollettore
 *  - #f_lunghezzaAsse
 *  - #f_lunghezzaPacco
 *  - #f_larghezzaPacco
 *  - #f_punta
 *  - #f_numPunte
 *
 * Inserire QUESTO file per ultimo (subito prima di </body>).
 */
(function(){
  function $(s){ return document.querySelector(s); }
  function norm(x){ return (x==null)?'':String(x).trim(); }

  function findApplyBtn(){
    const byId = $('#btnApplyFilters');
    if (byId) return byId;
    const btns = Array.from(document.querySelectorAll('button,input[type="button"],input[type="submit"]'));
    return btns.find(b => (b.textContent||b.value||'').trim().toLowerCase() === 'applica filtri') || null;
  }

  function findResetBtn(){
    const byId = $('#btnResetFilters');
    if (byId) return byId;
    const btns = Array.from(document.querySelectorAll('button,input[type="button"],input[type="submit"]'));
    return btns.find(b => (b.textContent||b.value||'').trim().toLowerCase() === 'reset') || null;
  }

  async function runExact(){
    const battCollettore = norm($('#f_battCollettore')?.value);
    const lungAsse       = norm($('#f_lunghezzaAsse')?.value);
    const lungPacco      = norm($('#f_lunghezzaPacco')?.value);
    const largPacco      = norm($('#f_larghezzaPacco')?.value);
    const punta          = norm($('#f_punta')?.value);
    const numPunte       = norm($('#f_numPunte')?.value);

    // Svuota eventuale ricerca globale
    const globalSearch = document.querySelector('input[type="search"], input[placeholder*="cerca"], input[placeholder*="Cerca"]');
    if(globalSearch) globalSearch.value = '';

    const hasAny = !!(battCollettore||lungAsse||lungPacco||largPacco||(punta && punta!=='' && punta!=='tutte' && punta!=='Punta (tutte)')||numPunte);
    if(!hasAny){
      // nessun filtro impostato: non altero la lista
      return;
    }

    const sb = (window.getSupabase && window.getSupabase()) || null;

    if(sb){
      let q = sb.from('records').select('*');
      if(battCollettore) q = q.eq('battCollettore', battCollettore);
      if(lungAsse)       q = q.eq('lungAsse',       lungAsse);
      if(lungPacco)      q = q.eq('lungPacco',      lungPacco);
      if(largPacco)      q = q.eq('largPacco',      largPacco);
      if(punta && punta!=='' && punta!=='tutte' && punta!=='Punta (tutte)') q = q.eq('punta', punta);
      if(numPunte)       q = q.eq('numPunte',       numPunte);

      const { data, error } = await q.order('updatedAt', { ascending:false });
      if(error){ console.warn('[filters-exact-hard-custom] supabase error:', error.message); }
      const list = data || [];
      window.__lastExactFiltered = list;

      if(typeof window.renderList === 'function') window.renderList(list);
      else if(typeof window.lista === 'function') window.lista(list);
      else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();

      return;
    }

    // Fallback locale
    let all = [];
    if(typeof window.getAllRecords === 'function') all = await window.getAllRecords();
    function eq(a,b){ return norm(a)===norm(b); }
    const filtered = (all||[]).filter(r => {
      if(battCollettore && !eq(r.battCollettore, battCollettore)) return false;
      if(lungAsse       && !eq(r.lungAsse,       lungAsse))       return false;
      if(lungPacco      && !eq(r.lungPacco,      lungPacco))      return false;
      if(largPacco      && !eq(r.largPacco,      largPacco))      return false;
      if(punta && punta!=='' && punta!=='tutte' && !eq(r.punta, punta)) return false;
      if(numPunte       && !eq(r.numPunte,       numPunte))        return false;
      return true;
    });
    window.__lastExactFiltered = filtered;

    if(typeof window.renderList === 'function') window.renderList(filtered);
    else if(typeof window.lista === 'function') window.lista(filtered);
    else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }

  function bind(){
    const btnApply = findApplyBtn();
    if(btnApply){
      btnApply.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        runExact();
      }, true);
    }
    const btnReset = findResetBtn();
    if(btnReset){
      btnReset.addEventListener('click', function(e){
        // lascia che il reset di UI avvenga ma svuota anche la nostra cache
        window.__lastExactFiltered = null;
      });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  console.log('[filters-exact-hard-custom] attivo (IDs personalizzati)');
})();
