/*!
 * filters-fix.js — v5 (Exact + UI originale + migliorie UX)
 * - Unifica "Applica filtri" + "Ricerca": un solo click su CERCA
 * - Reset pulisce TUTTI i campi della schermata Ricerca
 * - Banner verde "Chiusa" sotto i bottoni se statoPratica === "Completata"
 * - "Data scadenza" in rosso (lista + form, per id/nome comuni)
 */
(function(){
  const LOG = "[filters-fix v5]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const norm = v => String(v ?? '').toLowerCase().trim().replace(/\s+/g,' ');
  const has  = v => (v!=null && String(v).trim()!=="");
  if (!window.sb) { console.warn(LOG, "Supabase client mancante"); return; }

  // --- stile "data scadenza" rosso (form/modifica) ---
  (function injectScadenzaStyle(){
    const css = `
      #dataScadenza, input[name="dataScadenza"] { color:#dc3545 !important; border-color:#dc3545 !important; }
      .text-scadenza-rossa { color:#dc3545 !important; }
    `;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  })();

  // --- GET FILTERS dalla tua UI originale ---
  function getFilters(){
    const F = {};
    const map = {
      q:               "#q",
      note:            "#filterNoteExact",
      battCollettore:  "#f_battCollettore",
      lunghezzaAsse:   "#f_lunghezzaAsse",
      lunghezzaPacco:  "#f_lunghezzaPacco",
      larghezzaPacco:  "#f_larghezzaPacco",
      punta:           "#f_punta",
      numPunte:        "#f_numPunte"
    };
    for (const [k,sel] of Object.entries(map)){
      const el = $(sel);
      if (!el) continue;
      const v = el.value;
      if (has(v)) F[k] = norm(v);
    }
    return F;
  }

  // --- RESET COMPLETO schermata ricerca ---
  function doReset(){
    $$("#page-search input, #page-search select").forEach(el => {
      if (el.tagName === "SELECT") el.selectedIndex = 0;
      else el.value = "";
    });
    $("#activeFilterBox")?.classList.add("d-none");
    $("#activeFilterLabel")?.replaceChildren();
    const tBody = $("#resBody, #listTableBody");
    if (tBody) tBody.innerHTML = "";
  }

  // --- Query Supabase: ILIKE senza wildcard per case-insensitive exact; eq per numerici ---
  function buildQuery(F){
    let q = sb.from('records').select('*').limit(500);
    const textFields = ["note","battCollettore","punta"];
    textFields.forEach(k=>{ if (F[k]) q = q.ilike(k, F[k]); });
    const numFields = ["lunghezzaAsse","lunghezzaPacco","larghezzaPacco","numPunte"];
    numFields.forEach(k=>{ if (F[k]) q = q.eq(k, isNaN(Number(F[k])) ? F[k] : Number(F[k])); });
    if (F.q){
      const cols = ["descrizione","modello","cliente","telefono","email","note"];
      const ors = cols.map(c => `${c}.ilike.${F.q}`).join(",");
      q = q.or(ors);
    }
    try { q = q.order('dataApertura', {ascending:false}); } catch(e){}
    return q;
  }

  // --- Decorazione lista: badge Chiusa + scadenza rossa ---
  function decorateList(rows){
    try{
      const byId = new Map((rows||[]).map(r => [String(r.id||""), r]));
      $$('button[data-open]').forEach(btn => {
        const id = String(btn.getAttribute('data-open') || "");
        const r = byId.get(id);
        if (r && (r.statoPratica||"") === "Completata"){
          const td = btn.closest('td');
          if (td && !td.querySelector('.badge-chiusa-v5')){
            const wrap = document.createElement('div');
            wrap.className = 'mt-1';
            wrap.innerHTML = '<span class="badge badge-chiusa-v5" style="background:#1e8b3d">Chiusa</span>';
            td.appendChild(wrap);
          }
        }
      });
      const selList = ['[data-field="dataScadenza"]','.data-scadenza','.col-scadenza'];
      selList.forEach(sel => document.querySelectorAll(sel).forEach(el => el.classList.add('text-scadenza-rossa')));
    }catch(e){ console.warn(LOG, "decorateList", e); }
  }

  // --- Ricerca unificata (CERCA) ---
  async function lista_v5(){
    try{
      if (window.__searchLock?.lock) window.__searchLock.lock();
      if (typeof pauseRealtime === "function") pauseRealtime();

      const F = getFilters();
      const hasAny = Object.keys(F).some(k => has(F[k]));

      let data, error;
      if (!hasAny){
        ({data, error} = await sb.from('records').select('*').order('dataApertura', {ascending:false}).limit(500));
      } else {
        ({data, error} = await buildQuery(F));
      }
      if (error) throw error;

      if (typeof window.drawListPage === 'function'){
        await window.drawListPage(Array.isArray(data)?data:[]);
        decorateList(Array.isArray(data)?data:[]);
      }

      if (window.__searchLock?.unlock) window.__searchLock.unlock();
      if (typeof resumeRealtime === "function") resumeRealtime();
      console.log(LOG, "OK", {rows:(data||[]).length, F});
    }catch(e){
      console.error(LOG, e);
      if (window.__searchLock?.unlock) window.__searchLock.unlock();
    }
  }

  function init(){
    const cercaBtn = document.querySelector("#btnDoSearch");
    if (cercaBtn){
      cercaBtn.removeEventListener("click", window.lista, true);
      cercaBtn.addEventListener("click", lista_v5, true);
    }
    document.addEventListener("keydown", e=>{
      if (e.key === "Enter" && document.activeElement && document.activeElement.closest("#page-search")) {
        lista_v5();
      }
    });
    const resetBtn = document.querySelector("#btnClearFilter") || document.querySelector("#btnReset");
    if (resetBtn) resetBtn.addEventListener("click", doReset);

    window.lista = lista_v5;
    console.log(LOG, "attivo con UI originale (CERCA unificato, reset completo, badge Chiusa, scadenza rossa)");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();