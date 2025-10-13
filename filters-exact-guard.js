
/**
 * filters-exact-guard.js
 * Enforce exact-match filters globally across renders and data sources.
 * Use AFTER other scripts, as the LAST <script> before </body>.
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
  function hasAny(f){
    return !!(f.battCollettore || f.lungAsse || f.lungPacco || f.largPacco ||
      (f.punta && f.punta !== '' && f.punta.toLowerCase() !== 'tutte' && f.punta.toLowerCase() !== 'punta (tutte)') ||
      f.numPunte);
  }
  function predicate(f){
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

  // GLOBAL FLAGS
  window.__EXACTFILTER__ = {
    ACTIVE:false,
    STATE:null,
  };

  async function runExact(){
    const f = readFilters();
    const globalSearch = document.querySelector('input[type="search"], input[placeholder*="cerca"], input[placeholder*="Cerca"]');
    if(globalSearch) globalSearch.value = '';

    if(!hasAny(f)){
      window.__EXACTFILTER__.ACTIVE = false;
      window.__EXACTFILTER__.STATE  = null;
      console.log('[exact-guard] nessun filtro impostato → guard off');
      return;
    }
    window.__EXACTFILTER__.ACTIVE = true;
    window.__EXACTFILTER__.STATE  = f;
    console.log('[exact-guard] attivo con filtri:', f);

    // prova a ricaricare con Supabase (se disponibile)
    try{
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
        const rows = (data||[]).filter(predicate(f));
        if(error) console.warn('[exact-guard] supabase error:', error?.message);
        console.log('[exact-guard] risultati (SB):', rows.length);
        if(typeof window.renderList === 'function') window.renderList(rows);
        else if(typeof window.lista === 'function') window.lista(rows);
        else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
        return;
      }
    }catch(e){}

    // fallback locale
    let all = [];
    if(typeof window.getAllRecords === 'function') all = await window.getAllRecords();
    const rows = (all||[]).filter(predicate(f));
    console.log('[exact-guard] risultati (locale):', rows.length);
    if(typeof window.renderList === 'function') window.renderList(rows);
    else if(typeof window.lista === 'function') window.lista(rows);
    else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }

  function patch(){
    const pred = () => window.__EXACTFILTER__.ACTIVE ? predicate(window.__EXACTFILTER__.STATE||{}) : null;

    function wrapList(fn, name){
      if(typeof fn !== 'function') return fn;
      return function(data){
        const p = pred();
        if(p && Array.isArray(data)){
          const filtered = data.filter(p);
          console.log(`[exact-guard] ${name} filtrati:`, filtered.length);
          return fn.call(this, filtered);
        }
        return fn.apply(this, arguments);
      };
    }

    window.renderList = wrapList(window.renderList, 'renderList');
    window.lista      = wrapList(window.lista, 'lista');

    // Wrap refreshDashboard per rifiltrare dopo il refresh
    const _refresh = window.refreshDashboard;
    if(typeof _refresh === 'function'){
      window.refreshDashboard = async function(){
        const res = await _refresh.apply(this, arguments);
        // se dopo il refresh un'altra parte del codice fa il render, il wrap sopra interverrà
        // come ulteriore garanzia, prova a rifare una runExact se attivo
        if(window.__EXACTFILTER__.ACTIVE){
          setTimeout(runExact, 30);
        }
        return res;
      };
    }

    // Wrap getAllRecords/getByStato per ridurre in origine
    const _getAll = window.getAllRecords;
    if(typeof _getAll === 'function'){
      window.getAllRecords = async function(){
        const data = await _getAll.apply(this, arguments);
        const p = pred();
        return p && Array.isArray(data) ? data.filter(p) : data;
      };
    }
    const _getByStato = window.getByStato;
    if(typeof _getByStato === 'function'){
      window.getByStato = async function(stato){
        const data = await _getByStato.apply(this, arguments);
        const p = pred();
        return p && Array.isArray(data) ? data.filter(p) : data;
      };
    }
  }

  function bind(){
    patch();

    // intercetta i click nella card "Filtri tecnici (singoli)"
    const cards = Array.from(document.querySelectorAll('.card'));
    const card = cards.find(c => (c.querySelector('.card-header')?.textContent||'').trim().toLowerCase() === 'filtri tecnici (singoli)');
    if(card){
      card.addEventListener('click', function(e){
        const t = e.target;
        if(t && (t.tagName==='BUTTON' || (t.tagName==='INPUT' && (t.type==='button' || t.type==='submit')))){
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
          runExact();
        }
      }, true);
    }
    console.log('[filters-exact-guard] attivo');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
