
/**
 * filters-exact-enforcer.js
 * Enforce EXACT match on technical filters; prevents partial matches and overrides other handlers.
 * IDs used:
 *   #f_battCollettore, #f_lunghezzaAsse, #f_lunghezzaPacco, #f_larghezzaPacco, #f_punta, #f_numPunte
 * It also binds to any button inside the "Filtri tecnici (singoli)" card.
 */
(function(){
  function $(s){ return document.querySelector(s); }
  function norm(x){ return (x==null)?'':String(x).trim(); }

  function readFilters(){
    return {
      battCollettore: norm($('#f_battCollettore')?.value),
      lungAsse:       norm($('#f_lunghezzaAsse')?.value),
      lungPacco:      norm($('#f_lunghezzaPacco')?.value),
      largPacco:      norm($('#f_larghezzaPacco')?.value),
      punta:          norm($('#f_punta')?.value),
      numPunte:       norm($('#f_numPunte')?.value),
    };
  }

  function hasAnyFilter(f){
    return !!(f.battCollettore || f.lungAsse || f.lungPacco || f.largPacco ||
              (f.punta && f.punta !== '' && f.punta.toLowerCase() !== 'tutte' && f.punta.toLowerCase() !== 'punta (tutte)') ||
              f.numPunte);
  }

  function exactPredicate(f){
    return function(rec){
      function eq(a,b){ return norm(a)===norm(b); }
      if(f.battCollettore && !eq(rec?.battCollettore, f.battCollettore)) return false;
      if(f.lungAsse       && !eq(rec?.lungAsse,       f.lungAsse))       return false;
      if(f.lungPacco      && !eq(rec?.lungPacco,      f.lungPacco))      return false;
      if(f.largPacco      && !eq(rec?.largPacco,      f.largPacco))      return false;
      if(f.punta && f.punta!=='' && f.punta.toLowerCase()!=='tutte' && f.punta.toLowerCase()!=='punta (tutte)' &&
         !eq(rec?.punta, f.punta)) return false;
      if(f.numPunte       && !eq(rec?.numPunte,       f.numPunte))        return false;
      return true;
    };
  }

  async function runExact(){
    const f = readFilters();

    // Clear global fuzzy search to avoid interference
    const globalSearch = document.querySelector('input[type="search"], input[placeholder*="cerca"], input[placeholder*="Cerca"]');
    if(globalSearch) globalSearch.value = '';

    if(!hasAnyFilter(f)){
      // No filters: allow normal flow
      window.__EXACT_FILTER_ACTIVE = false;
      return;
    }

    window.__EXACT_FILTER_ACTIVE = true;
    window.__EXACT_FILTER_STATE = f;

    const sb = (window.getSupabase && window.getSupabase()) || null;

    if(sb){
      let q = sb.from('records').select('*');
      if(f.battCollettore) q = q.eq('battCollettore', f.battCollettore);
      if(f.lungAsse)       q = q.eq('lungAsse',       f.lungAsse);
      if(f.lungPacco)      q = q.eq('lungPacco',      f.lungPacco);
      if(f.largPacco)      q = q.eq('largPacco',      f.largPacco);
      if(f.punta && f.punta!=='' && f.punta.toLowerCase()!=='tutte' && f.punta.toLowerCase()!=='punta (tutte)') q = q.eq('punta', f.punta);
      if(f.numPunte)       q = q.eq('numPunte',       f.numPunte);

      const { data, error } = await q.order('updatedAt', { ascending:false });
      if(error){ console.warn('[filters-exact-enforcer] Supabase error:', error.message); }
      const list = (data || []).filter(exactPredicate(f));
      // render with whatever function exists
      if(typeof window.renderList === 'function') window.renderList(list);
      else if(typeof window.lista === 'function') window.lista(list);
      else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
      return;
    }

    // Local fallback
    let all = [];
    if(typeof window.getAllRecords === 'function') all = await window.getAllRecords();
    const list = (all||[]).filter(exactPredicate(f));

    if(typeof window.renderList === 'function') window.renderList(list);
    else if(typeof window.lista === 'function') window.lista(list);
    else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }

  // Patch renderers as a failsafe: if other code re-renders, we re-apply exact filter
  function patchRenderers(){
    const pred = () => window.__EXACT_FILTER_ACTIVE ? exactPredicate(window.__EXACT_FILTER_STATE||{}) : null;

    const origRenderList = window.renderList;
    if(typeof origRenderList === 'function'){
      window.renderList = function(data){
        const p = pred();
        if(Array.isArray(data) && p) data = data.filter(p);
        return origRenderList.call(this, data);
      };
    }

    const origLista = window.lista;
    if(typeof origLista === 'function'){
      window.lista = function(data){
        const p = pred();
        if(Array.isArray(data) && p) data = data.filter(p);
        return origLista.call(this, data);
      };
    }
  }

  function bind(){
    patchRenderers();

    // Intercept ANY button click inside the "Filtri tecnici (singoli)" card
    // (so it works even if the button has no fixed ID)
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find(c => (c.querySelector('.card-header')?.textContent||'').trim().toLowerCase() === 'filtri tecnici (singoli)');
    if(card){
      card.addEventListener('click', function(e){
        const t = e.target;
        if(t && (t.tagName === 'BUTTON' || (t.tagName === 'INPUT' && (t.type==='button' || t.type==='submit')))){
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
          runExact();
        }
      }, true); // capture
    }

    console.log('[filters-exact-enforcer] attivo');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

})();
