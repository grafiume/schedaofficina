
/**
 * filters-exact-hard.js
 * Forza filtri tecnici con corrispondenza ESATTA (AND) e disattiva ogni match parziale.
 * Inserire DOPO tutti gli altri script (ultimo in pagina).
 */
(function(){
  function $(s){ return document.querySelector(s); }
  function byPH(txt){
    txt = (txt||'').toLowerCase();
    const els = document.querySelectorAll('input,select,textarea');
    for(const el of els){
      const ph = (el.getAttribute('placeholder')||'').trim().toLowerCase();
      if(ph === txt) return el;
    }
    return null;
  }
  function ensureIds(){
    if(!$('#f-battCollettore')) (byPH('batt. collettore')||byPH('battuta collettore'))?.setAttribute('id','f-battCollettore');
    if(!$('#f-lungAsse')) (byPH('lunghezza asse'))?.setAttribute('id','f-lungAsse');
    if(!$('#f-lungPacco')) (byPH('lunghezza pacco'))?.setAttribute('id','f-lungPacco');
    if(!$('#f-largPacco')) (byPH('larghezza pacco'))?.setAttribute('id','f-largPacco');
    if(!$('#f-punta')) (byPH('punta (tutte)')||byPH('punta')||document.querySelector('select'))?.setAttribute('id','f-punta');
    if(!$('#f-numPunte')) (byPH('n.')||byPH('n. punte'))?.setAttribute('id','f-numPunte');

    if(!$('#btnApplyFilters')){
      const btns=[...document.querySelectorAll('button,input[type="button"],input[type="submit"]')];
      const b=btns.find(b=>(b.textContent||b.value||'').trim().toLowerCase()==='applica filtri');
      if(b) b.id='btnApplyFilters';
    }
    if(!$('#btnResetFilters')){
      const btns=[...document.querySelectorAll('button,input[type="button"],input[type="submit"]')];
      const b=btns.find(b=>(b.textContent||b.value||'').trim().toLowerCase()==='reset');
      if(b) b.id='btnResetFilters';
    }
  }

  function norm(x){ return (x==null)?'':String(x).trim(); }

  async function runExact(){
    ensureIds();
    // Leggi solo i filtri singoli
    const battCollettore = norm($('#f-battCollettore')?.value);
    const lungAsse       = norm($('#f-lungAsse')?.value);
    const lungPacco      = norm($('#f-lungPacco')?.value);
    const largPacco      = norm($('#f-largPacco')?.value);
    const punta          = norm($('#f-punta')?.value);
    const numPunte       = norm($('#f-numPunte')?.value);

    // Svuota l'input di ricerca globale per evitare fuzzy matches
    const globalSearch = document.querySelector('input[type="search"], input[placeholder*="cerca i"], input[placeholder*="cerca per"]');
    if(globalSearch) globalSearch.value = '';

    const hasAny = !!(battCollettore||lungAsse||lungPacco||largPacco||(punta && punta!=='tutte')||numPunte);

    // Se non hai messo alcun filtro, non fare nulla (lascia la lista com'è)
    if(!hasAny){
      return;
    }

    const sb = (window.getSupabase && window.getSupabase()) || null;

    if(sb){
      let q = sb.from('records').select('*');
      if(battCollettore) q = q.eq('battCollettore', battCollettore);
      if(lungAsse)       q = q.eq('lungAsse',       lungAsse);
      if(lungPacco)      q = q.eq('lungPacco',      lungPacco);
      if(largPacco)      q = q.eq('largPacco',      largPacco);
      if(punta && punta!=='tutte') q = q.eq('punta', punta);
      if(numPunte)       q = q.eq('numPunte',       numPunte);

      const { data, error } = await q.order('updatedAt', { ascending:false });
      if(error){ console.warn('[filters-exact-hard] supabase error:', error.message); }
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
    const filtered = (all||[]).filter(r => {
      function eq(a,b){ return norm(a)===norm(b); }
      if(battCollettore && !eq(r.battCollettore, battCollettore)) return false;
      if(lungAsse       && !eq(r.lungAsse,       lungAsse))       return false;
      if(lungPacco      && !eq(r.lungPacco,      lungPacco))      return false;
      if(largPacco      && !eq(r.largPacco,      largPacco))      return false;
      if(punta && punta!=='tutte' && !eq(r.punta, punta))          return false;
      if(numPunte       && !eq(r.numPunte,       numPunte))        return false;
      return true;
    });
    window.__lastExactFiltered = filtered;

    if(typeof window.renderList === 'function') window.renderList(filtered);
    else if(typeof window.lista === 'function') window.lista(filtered);
    else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }

  function bind(){
    ensureIds();
    const btn = $('#btnApplyFilters');
    if(!btn) return;

    // Rimuovi eventuali listener precedenti su "click" (non in modo invasivo):
    // intercettiamo l'evento in cattura e blocchiamo la propagazione.
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      runExact();
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  console.log('[filters-exact-hard] attivo');
})();
