/*!
 * filters-fix.js — v6 (Exact + UI originale + CERCA unificato + RESET totale + Home)
 * - Unico flusso: sia "Cerca" che "Applica filtri" eseguono lista_v6()
 * - Reset realmente TOTALE: input, select (anche multiple), textarea, checkbox, radio, risultati, badge, stato interno
 * - Torna alla HOME dopo il reset
 * - Banner "Chiusa" e "Scadenza" rossa preservati
 */
(function(){
  const LOG = "[filters-fix v6]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const norm = v => String(v ?? '').toLowerCase().trim().replace(/\s+/g,' ');
  const has  = v => (v!=null && String(v).trim()!=="");
  if (!window.sb) { console.warn(LOG, "Supabase client mancante"); return; }

  (function injectScadenzaStyle(){
    const css = `
      #dataScadenza, input[name="dataScadenza"] { color:#dc3545 !important; border-color:#dc3545 !important; }
      .text-scadenza-rossa { color:#dc3545 !important; }
    `;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  })();

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

  function goHome(){
    const tryClick = (sel)=>{ const b=$(sel); if (b){ b.click(); return true; } return false; };
    if (tryClick("#kpiTotBtn")) return;
    if (tryClick("#btnHome")) return;
    if (tryClick('[data-target="home"]')) return;
    const pages = ["#page-home","#page-search","#page-detail","#page-archive","#page-mod"];
    const found = pages.map(s=>$(s)).filter(Boolean);
    found.forEach(p=>p.classList.add("d-none"));
    $("#page-home")?.classList.remove("d-none");
    window.scrollTo(0,0);
  }

  function doReset(){
    $$("#page-search input, #page-search select, #page-search textarea").forEach(el => {
      const t = el.type ? el.type.toLowerCase() : el.tagName.toLowerCase();
      if (t === "checkbox" || t === "radio") el.checked = false;
      else if (el.tagName === "SELECT" && el.multiple) el.selectedIndex = -1;
      else if (el.tagName === "SELECT") el.selectedIndex = 0;
      else el.value = "";
    });
    $("#activeFilterBox")?.classList.add("d-none");
    if ($("#activeFilterLabel")) $("#activeFilterLabel").innerHTML = "";
    ["#resBody","#listTableBody","#results","#resultsList"].forEach(sel=>{
      const el = document.querySelector(sel);
      if (!el) return;
      if (el.tagName === "TBODY" || el.tagName === "THEAD" || el.tagName === "TABLE"){
        el.innerHTML = "";
      } else {
        el.classList.add("d-none");
      }
    });
    window.__SEARCH_ACTIVE__ = false;
    if (window.__searchLock?.unlock) window.__searchLock.unlock();
    goHome();
  }

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

  function decorateList(rows){
    try{
      const byId = new Map((rows||[]).map(r => [String(r.id||""), r]));
      document.querySelectorAll('button[data-open]').forEach(btn => {
        const id = String(btn.getAttribute('data-open') || "");
        const r = byId.get(id);
        if (r && (r.statoPratica||"") === "Completata"){
          const td = btn.closest('td');
          if (td && !td.querySelector('.badge-chiusa-v6')){
            const wrap = document.createElement('div');
            wrap.className = 'mt-1';
            wrap.innerHTML = '<span class="badge badge-chiusa-v6" style="background:#1e8b3d">Chiusa</span>';
            td.appendChild(wrap);
          }
        }
      });
      const selList = ['[data-field="dataScadenza"]','.data-scadenza','.col-scadenza'];
      selList.forEach(sel => document.querySelectorAll(sel).forEach(el => el.classList.add('text-scadenza-rossa')));
    }catch(e){ console.warn(LOG, "decorateList", e); }
  }

  async function lista_v6(){
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
      cercaBtn.addEventListener("click", lista_v6, true);
    }
    const applyBtn = document.querySelector("#btnApplyFilters");
    if (applyBtn){
      applyBtn.removeEventListener("click", window.lista, true);
      applyBtn.addEventListener("click", lista_v6, true);
    }
    document.addEventListener("keydown", e=>{
      if (e.key === "Enter" && document.activeElement && document.activeElement.closest("#page-search")) {
        lista_v6();
      }
    });
    const resetBtn = document.querySelector("#btnClearFilter") || document.querySelector("#btnReset");
    if (resetBtn) resetBtn.addEventListener("click", doReset);

    window.lista = lista_v6;
    console.log(LOG, "attivo: CERCA/APPLICA unificati, reset totale con HOME, badge Chiusa, scadenza rossa");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();