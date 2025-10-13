
/**
 * filters-exact-override.js
 * Forza la ricerca con corrispondenza ESATTA nei "Filtri tecnici (singoli)".
 * - Supabase: usa .eq('campo', valore)
 * - Offline: confronto stringa ===
 * - Non fa match parziali (niente "1" che trova "12").
 *
 * Inserisci questo file DOPO tutti gli altri script (dopo technical-filters.js se presente).
 */

(function(){
  function $(sel){ return document.querySelector(sel); }
  function byPlaceholder(txt){
    const els = document.querySelectorAll('input,select,textarea');
    for(const el of els){
      const ph = (el.getAttribute('placeholder')||'').trim().toLowerCase();
      if(ph === txt.toLowerCase()) return el;
    }
    return null;
  }
  function ensureIdFallbacks(){
    // Se gli ID non esistono li assegno guardando i placeholder
    if(!$('#f-battCollettore')){
      const el = byPlaceholder('Batt. collettore') || byPlaceholder('Battuta collettore');
      if(el) el.id = 'f-battCollettore';
    }
    if(!$('#f-lungAsse')){
      const el = byPlaceholder('Lunghezza asse'); if(el) el.id = 'f-lungAsse';
    }
    if(!$('#f-lungPacco')){
      const el = byPlaceholder('Lunghezza pacco'); if(el) el.id = 'f-lungPacco';
    }
    if(!$('#f-largPacco')){
      const el = byPlaceholder('Larghezza pacco'); if(el) el.id = 'f-largPacco';
    }
    if(!$('#f-punta')){
      const el = byPlaceholder('Punta (tutte)') || byPlaceholder('Punta') || document.querySelector('select');
      if(el) el.id = 'f-punta';
    }
    if(!$('#f-numPunte')){
      const el = byPlaceholder('N.') || byPlaceholder('N. punte');
      if(el) el.id = 'f-numPunte';
    }
    if(!$('#btnApplyFilters')){
      const btns = Array.from(document.querySelectorAll('button,input[type="button"],input[type="submit"]'));
      const found = btns.find(b => (b.textContent||b.value||'').trim().toLowerCase() === 'applica filtri');
      if(found) found.id = 'btnApplyFilters';
    }
    if(!$('#btnResetFilters')){
      const btns = Array.from(document.querySelectorAll('button,input[type="button"],input[type="submit"]'));
      const found = btns.find(b => (b.textContent||b.value||'').trim().toLowerCase() === 'reset');
      if(found) found.id = 'btnResetFilters';
    }
  }

  function norm(x){ return (x==null) ? '' : String(x).trim(); }

  async function applyExactFilters(){
    ensureIdFallbacks();
    const battCollettore = norm($('#f-battCollettore')?.value);
    const lungAsse       = norm($('#f-lungAsse')?.value);
    const lungPacco      = norm($('#f-lungPacco')?.value);
    const largPacco      = norm($('#f-largPacco')?.value);
    const punta          = norm($('#f-punta')?.value);
    const numPunte       = norm($('#f-numPunte')?.value);

    // Se ho Supabase client disponibile, uso .eq (corrispondenza ESATTA)
    const sb = (window.getSupabase && window.getSupabase()) || (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)) || null;

    if(sb){
      let q = sb.from('records').select('*');
      if(battCollettore) q = q.eq('battCollettore', battCollettore);
      if(lungAsse)       q = q.eq('lungAsse',       lungAsse);
      if(lungPacco)      q = q.eq('lungPacco',      lungPacco);
      if(largPacco)      q = q.eq('largPacco',      largPacco);
      if(punta && punta !== 'tutte') q = q.eq('punta', punta);
      if(numPunte)       q = q.eq('numPunte',       numPunte);
      const { data, error } = await q.order('updatedAt', { ascending:false });
      if(error){ console.warn('[filters-exact] supabase error:', error.message); }
      window.__lastExactFiltered = data || [];
      if(typeof window.renderList === 'function') window.renderList(window.__lastExactFiltered);
      else if(typeof window.lista === 'function') window.lista(window.__lastExactFiltered);
      else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
      return;
    }

    // Fallback locale in memoria
    let all = [];
    if(typeof window.getAllRecords === 'function') all = await window.getAllRecords();
    const filtered = (all||[]).filter(r => {
      if(battCollettore && norm(r.battCollettore) !== battCollettore) return false;
      if(lungAsse       && norm(r.lungAsse)       !== lungAsse)       return false;
      if(lungPacco      && norm(r.lungPacco)      !== lungPacco)      return false;
      if(largPacco      && norm(r.largPacco)      !== largPacco)      return false;
      if(punta && punta !== 'tutte' && norm(r.punta) !== punta)       return false;
      if(numPunte       && norm(r.numPunte)       !== numPunte)       return false;
      return true;
    });
    window.__lastExactFiltered = filtered;
    if(typeof window.renderList === 'function') window.renderList(filtered);
    else if(typeof window.lista === 'function') window.lista(filtered);
    else if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }

  function bind(){
    ensureIdFallbacks();
    const btn = $('#btnApplyFilters');
    if(btn){
      btn.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        applyExactFilters();
      }, { capture: true });
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  console.log('[filters-exact-override] attivo');
})();
