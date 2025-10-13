/**
 * filters-exact-guard.js
 * Enforce exact-match filters globally across renders and data sources.
 * Use AFTER other scripts, as the LAST <script> before </body>.
 */
(function(){
  function $(s){ return document.querySelector(s); }
  function norm(x){ return (x==null)?'':String(x).trim(); }

  // Legge i filtri dai campi (usa gli ID con underscore, aggiungi fallback se ti servono quelli col trattino)
  function readFilters(){
    const get = (id, alt) => {
      const el = document.getElementById(id) || (alt ? document.getElementById(alt) : null);
      return norm(el ? el.value : '');
    };
    return {
      battCollettore: get('f_battCollettore','f-battCollettore'),
      lungAsse:       get('f_lunghezzaAsse','f-lunghezzaAsse'),
      lungPacco:      get('f_lunghezzaPacco','f-lunghezzaPacco'),
      largPacco:      get('f_larghezzaPacco','f-larghezzaPacco'),
      punta:          get('f_punta','f-punta'),
      numPunte:       get('f_numPunte','f-numPunte'),
    };
  }

  function hasAny(f){
    const puntaOk = f.punta && f.punta !== '' &&
                    f.punta.toLowerCase() !== 'tutte' &&
                    f.punta.toLowerCase() !== 'punta (tutte)';
    return !!(f.battCollettore || f.lungAsse || f.lungPacco || f.largPacco || puntaOk || f.numPunte);
  }

  function predicate(f){
    const eq = (a,b)=> norm(a)===norm(b);
    return function(rec){
      if(f.battCollettore && !eq(rec?.battCollettore, f.battCollettore)) return false;
      if(f.lungAsse       && !eq(rec?.lunghezzaAsse ?? rec?.lungAsse, f.lungAsse)) return false;
      if(f.lungPacco      && !eq(rec?.lunghezzaPacco ?? rec?.lungPacco, f.lungPacco)) return false;
      if(f.largPacco      && !eq(rec?.larghezzaPacco ?? rec?.largPacco, f.largPacco)) return false;
      if(f.punta && f.punta!=='' && f.punta.toLowerCase()!=='tutte' && f.punta.toLowerCase()!=='punta (tutte)' &&
         !eq(rec?.punta, f.punta)) return false;
      if(f.numPunte       && !eq(rec?.numPunte, f.numPunte)) return false;
      return true;
    };
  }

  // Stato globale
  window.__EXACTFILTER__ = { ACTIVE:false, STATE:null };

  async function runExact(){
    const f = readFilters();

    // Pulisci la search libera (se ne hai una)
    const globalSearch = document.querySelector('input[type="search"], input[placeholder*="cerca"], input[placeholder*="Cerca"]');
    if(globalSearch) globalSearch.value = '';

    // Nessun filtro -> disattiva guard e ricarica lista completa
    if(!hasAny(f)){
      window.__EXACTFILTER__.ACTIVE = false;
      window.__EXACTFILTER__.STATE  = null;
      console.log('[exact-guard] nessun filtro impostato → guard off (full list)');
      if (typeof window.lista === 'function') { window.lista(); }
      else if (typeof window.refreshDashboard === 'function') { await window.refreshDashboard(); }
      return;
    }

    // Attivo
    window.__EXACTFILTER__.ACTIVE = true;
    window.__EXACTFILTER__.STATE  = f;
    console.log('[exact-guard] attivo con filtri:', f);

    // Prova con Supabase (se presente)
    try{
      const sb = (window.getSupabase && window.getSupabase()) || null;
      if(sb){
        let q = sb.from('records').select('*').order('updatedAt', { ascending:false });
        if(f.battCollettore) q = q.eq('battCollettore', f.battCollettore);
        if(f.lungAsse)       q = q.or(`lunghezzaAsse.eq.${f.lungAsse},lungAsse.eq.${f.lungAsse}`);
        if(f.lungPacco)      q = q.or(`lunghezzaPacco.eq.${f.lungPacco},lungPacco.eq.${f.lungPacco}`);
        if(f.largPacco)      q = q.or(`larghezzaPacco.eq.${f.largPacco},largPacco.eq.${f.largPacco}`);
        if(f.punta && f.punta!=='' && f.punta.toLowerCase()!=='tutte' && f.punta.toLowerCase()!=='punta (tutte)') q = q.eq('punta', f.punta);
        if(f.numPunte)       q = q.eq('numPunte', f.numPunte);

        const { data, error } = await q;
        if(error) console.warn('[exact-guard] supabase error:', error?.message);
        const rows = (data||[]).filter(predicate(f));
        console.log('[exact-guard] risultati (SB):', rows.length);

        if (typeof window.renderList === 'function') window.renderList(rows);
        else if (typeof window.lista === 'function') window.lista(rows);
        else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
        return;
      }
    }catch(e){ /* fallback locale */ }

    // Fallback locale
    let all = [];
    if(typeof window.getAllRecords === 'function') all = await window.getAllRecords();
    const rows = (all||[]).filter(predicate(f));
    console.log('[exact-guard] risultati (locale):', rows.length);

    if (typeof window.renderList === 'function') window.renderList(rows);
    else if (typeof window.lista === 'function') window.lista(rows);
    else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }

  // Patch wrap (non cambia)
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

    const _refresh = window.refreshDashboard;
    if(typeof _refresh === 'function'){
      window.refreshDashboard = async function(){
        const res = await _refresh.apply(this, arguments);
        if(window.__EXACTFILTER__.ACTIVE){
          setTimeout(runExact, 30);
        }
        return res;
      };
    }

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

  // Bind: NON blocca i click, esegue runExact DOPO i tuoi handler
  function bind(){
    patch();

    // Ascolta input/change dei campi: se svuoti → disattiva e ricarica; se compili → applica
    const ids = [
      'f_battCollettore','f-battCollettore',
      'f_lunghezzaAsse','f-lunghezzaAsse',
      'f_lunghezzaPacco','f-lunghezzaPacco',
      'f_larghezzaPacco','f-larghezzaPacco',
      'f_numPunte','f-numPunte',
      'f_punta','f-punta'
    ].map(id => document.getElementById(id)).filter(Boolean);

    const onChange = () => { setTimeout(runExact, 0); };
    ids.forEach(el => {
      el.addEventListener('input',  onChange, {capture:true});
      el.addEventListener('change', onChange, {capture:true});
    });

    // Applica / Reset: lascia lavorare i tuoi handler e poi ricalcola
    const btnApply = document.getElementById('btnApplyFilters');
    if (btnApply) btnApply.addEventListener('click', ()=> setTimeout(runExact, 0), {capture:true});

    const btnReset = document.getElementById('btnResetFilters');
    if (btnReset) btnReset.addEventListener('click', ()=> setTimeout(runExact, 0), {capture:true});

    // Evento globale opzionale emesso dal tuo resetTechFilters()
    document.addEventListener('filters:reset', ()=>{
      // azzera stato e ricarica lista completa
      window.__EXACTFILTER__.ACTIVE = false;
      window.__EXACTFILTER__.STATE  = null;
      try {
        localStorage.removeItem('exactFilters');
        localStorage.removeItem('filters-exact');
      } catch(_){}
      if (typeof window.lista === 'function') window.lista();
      else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
    });

    console.log('[filters-exact-guard] attivo');
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
