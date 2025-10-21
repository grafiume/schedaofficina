/*!
 * filters-fix.js — v4 (Exact Search + Original UI)
 * - Mantiene GRAFICA ORIGINALE (index.html/app-core.js invariati)
 * - Sovrascrive `lista()` con ricerca a MATCH ESATTO case-insensitive (ILIKE senza %)
 * - Se non ci sono filtri => carica TUTTI i record (ordinati per dataApertura desc)
 * - Reset completo dei filtri
 */
(function(){
  const LOG = "[filters-fix v4]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const norm = v => String(v ?? '').toLowerCase().trim().replace(/\s+/g,' ');
  const has  = v => (v!=null && String(v).trim()!=="");

  if (!window.sb) { console.warn(LOG, "Supabase client mancante"); return; }

  // --- GET FILTERS: usa i campi presenti nella tua UI originale ---
  function getFilters(){
    const F = {};
    // testo esatto (senza differenza maiuscole/minuscole)
    const map = {
      q:            "#q",
      note:         "#filterNoteExact",
      battCollettore:"#f_battCollettore",
      lunghezzaAsse: "#f_lunghezzaAsse",
      lunghezzaPacco:"#f_lunghezzaPacco",
      larghezzaPacco:"#f_larghezzaPacco",
      punta:         "#f_punta",
      numPunte:      "#f_numPunte"
    };
    for (const [k,sel] of Object.entries(map)){
      const el = $(sel);
      if (!el) continue;
      const v = el.value;
      if (has(v)) F[k] = norm(v);
    }
    return F;
  }

  // --- RESET UI FILTRI ---
  function doReset(){
    const ids = ["#q","#filterNoteExact","#f_battCollettore","#f_lunghezzaAsse","#f_lunghezzaPacco","#f_larghezzaPacco","#f_punta","#f_numPunte"];
    ids.forEach(id=>{ const el=$(id); if (el) el.value=""; });
    // pulisci eventuali badge attivi
    $("#activeFilterBox")?.classList.add("d-none");
    $("#activeFilterLabel")?.replaceChildren();
    // opzionale: torna su home
    $('#kpiTotBtn')?.click();
  }

  // --- COSTRUISCI QUERY SUPABASE ESATTA (case-insensitive) ---
  function buildQuery(F){
    let q = sb.from('records').select('*').limit(500);
    // esatti su testo: ILIKE ma SENZA wildcard
    const textFields = ["note","battCollettore","punta"];
    textFields.forEach(k=>{ if (F[k]) q = q.ilike(k, F[k]); });

    // numerici: eq
    const numFields = ["lunghezzaAsse","lunghezzaPacco","larghezzaPacco","numPunte"];
    numFields.forEach(k=>{ if (F[k]) q = q.eq(k, isNaN(Number(F[k])) ? F[k] : Number(F[k])); });

    // filtro "q" su più colonne, esatto
    if (F.q){
      const cols = ["descrizione","modello","cliente","telefono","email","note"];
      const ors = cols.map(c => `${c}.ilike.${F.q}`).join(",");
      q = q.or(ors); // senza parentesi!
    }

    try { q = q.order('dataApertura', {ascending:false}); } catch(e){}
    return q;
  }

  // --- RICERCA PRINCIPALE (override lista) ---
  async function lista_v4(){
    try {
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

      if (typeof window.drawListPage === 'function') await window.drawListPage(Array.isArray(data)?data:[]);

      if (window.__searchLock?.unlock) window.__searchLock.unlock();
      if (typeof resumeRealtime === "function") resumeRealtime();
      console.log(LOG, "OK", {rows: (data||[]).length, F});
    } catch (e) {
      console.error(LOG, e);
      if (window.__searchLock?.unlock) window.__searchLock.unlock();
    }
  }

  function init(){
    const resetBtn = $("#btnClearFilter") || $("#btnReset");
    if (resetBtn) resetBtn.addEventListener("click", doReset);

    window.lista = lista_v4;
    const cercaBtn = $("#btnDoSearch");
    if (cercaBtn) cercaBtn.addEventListener("click", lista_v4, true);

    document.addEventListener("keydown", e=>{
      if (e.key === "Enter" && document.activeElement && document.activeElement.closest("#page-search")) {
        lista_v4();
      }
    });

    console.log(LOG, "attivo con UI originale");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();