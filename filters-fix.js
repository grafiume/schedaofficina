/*!
 * filters-fix.js — v8 (match ESATTO su campi tecnici + reset reale + binding robusto)
 * Campi tecnici (dal tuo JSON): battCollettore, lunghezzaAsse, lunghezzaPacco, larghezzaPacco, punta, numPunte
 * Regole:
 *  - EXACT match, case-insensitive sui testi (no wildcard)
 *  - EXACT numerico (converte "173" == 173)
 *  - Se qualunque campo tecnico non corrisponde, il record NON esce
 *  - "Cerca" e "Applica filtri" richiamano la stessa funzione unificata
 *  - Pulsante "Reset" accanto a Cerca che pulisce DAVVERO tutto e torna in Home
 *  - Banner verde "Chiusa" quando statoPratica=Completata; data Scadenza in rosso
 */
(function(){
  const LOG = "[filters-fix v8]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const has = v => v!==undefined && v!==null && String(v).trim()!=="";
  const norm = v => String(v??"").trim().toLowerCase().replace(/\s+/g," ");

  if (!window.sb){ console.warn(LOG, "Supabase client mancante"); }

  // --- stile scadenza rossa ---
  (function(){
    const css = `#dataScadenza, input[name="dataScadenza"]{color:#dc3545!important;border-color:#dc3545!important}.text-scadenza-rossa{color:#dc3545!important}`;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
  })();

  // --- binding robusto degli input ai campi del DB ---
  const FIELD_KEYS = ["battCollettore","lunghezzaAsse","lunghezzaPacco","larghezzaPacco","punta","numPunte","note"];
  const GEN_KEYS   = ["q"]; // ricerca generale, opzionale

  function pickFieldEl(field){
    // Id convenzionale f_<nome>, data-field, name, id diretto
    const sels = [
      `#f_${field}`, `[data-field="${field}"]`, `[name="${field}"]`, `#${field}`,
      // anche _norm per eventuali maschere già normalizzate (non usiamo ma fallback)
      `[name="${field}_norm"]`, `#${field}_norm`
    ];
    for (const s of sels){
      const el = $(s);
      if (el) return el;
    }
    return null;
  }

  function getFilters(){
    const F = {};
    for (const k of FIELD_KEYS.concat(GEN_KEYS)){
      const el = pickFieldEl(k);
      if (!el) continue;
      const v = (el.value ?? el.textContent ?? "").toString();
      if (has(v)) F[k] = v;
    }
    return F;
  }

  // --- reset totale + home ---
  function goHome(){
    const clicks = ["#kpiTotBtn","#btnHome","[data-target='home']"];
    for (const s of clicks){ const b=$(s); if (b){ b.click(); return; } }
    // fallback: mostra pagina home se presente
    const pages = ["#page-home","#page-search","#page-detail","#page-mod","#page-archive"];
    pages.map(s=>$(s)).filter(Boolean).forEach(p=>p.classList.add("d-none"));
    $("#page-home")?.classList.remove("d-none");
    window.scrollTo(0,0);
  }
  function doReset(){
    // pulizia di TUTTI gli input all'interno della pagina ricerca
    $$("#page-search input, #page-search select, #page-search textarea").forEach(el=>{
      const t = (el.type||"").toLowerCase();
      if (t==="checkbox"||t==="radio") el.checked = false;
      else if (el.tagName==="SELECT" && el.multiple) el.selectedIndex = -1;
      else if (el.tagName==="SELECT") el.selectedIndex = 0;
      else el.value = "";
    });
    // eventuali badge/risultati
    $("#activeFilterBox")?.classList.add("d-none");
    if ($("#activeFilterLabel")) $("#activeFilterLabel").innerHTML = "";
    ["#resBody","#listTableBody","#results","#resultsList"].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      if (/TBODY|THEAD|TABLE/.test(el.tagName)) el.innerHTML = "";
      else el.classList.add("d-none");
    });
    if (window.__searchLock?.unlock) window.__searchLock.unlock();
    goHome();
  }

  // --- query server: exact sui tecnici (no wildcard), or su ricerca generale ---
  function buildServerQuery(F){
    let q = sb.from("records").select("*");
    // tecnici testuali -> ilike senza wildcard = exact case-insensitive
    ["battCollettore","punta","note"].forEach(k=>{ if (has(F[k])) q = q.ilike(k, norm(F[k])); });
    // tecnici numerici -> eq, convertendo numero se possibile
    ["lunghezzaAsse","lunghezzaPacco","larghezzaPacco","numPunte"].forEach(k=>{
      if (has(F[k])){
        const n = Number(F[k]);
        q = q.eq(k, Number.isFinite(n) ? n : F[k]);
      }
    });
    // ricerca generale esatta across se presente
    if (has(F.q)){
      const nx = norm(F.q);
      const cols = ["descrizione","modello","cliente","telefono","email","note"];
      const ors = cols.map(c => `${c}.ilike.${nx}`).join(",");
      q = q.or(ors);
    }
    try { q = q.order("dataApertura", {ascending:false}); } catch(e){}
    return q.limit(1000);
  }

  // --- filtro client deterministico (doppia sicurezza) ---
  function clientExact(rows, F){
    const n = s => norm(s);
    const numEq = (a,b)=>{
      const na = Number(a), nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na===nb;
      return String(a)===String(b);
    };

    const txt = ["battCollettore","punta","note"];
    const num = ["lunghezzaAsse","lunghezzaPacco","larghezzaPacco","numPunte"];

    return (rows||[]).filter(r=>{
      if (has(F.q)){
        const nx = n(F.q);
        const cols = ["descrizione","modello","cliente","telefono","email","note"];
        if (!cols.some(c => n(r[c]) === nx)) return false;
      }
      for (const k of txt){ if (has(F[k]) && n(r[k]) !== n(F[k])) return false; }
      for (const k of num){ if (has(F[k]) && !numEq(r[k], F[k])) return false; }
      return true;
    });
  }

  // --- decorazioni lista ---
  function decorateList(rows){
    try{
      const byId = new Map((rows||[]).map(r => [String(r.id||""), r]));
      $$('button[data-open]').forEach(btn => {
        const id = String(btn.getAttribute('data-open')||"");
        const r = byId.get(id);
        if (!r) return;
        if ((r.statoPratica||"") === "Completata"){
          const td = btn.closest("td");
          if (td && !td.querySelector(".badge-chiusa-v8")){
            const d = document.createElement("div");
            d.className = "mt-1";
            d.innerHTML = '<span class="badge badge-chiusa-v8" style="background:#1e8b3d">Chiusa</span>';
            td.appendChild(d);
          }
        }
      });
      ['[data-field="dataScadenza"]','.data-scadenza','.col-scadenza'].forEach(sel =>
        $$(sel).forEach(el => el.classList.add("text-scadenza-rossa"))
      );
    }catch(e){ console.warn(LOG, e); }
  }

  // --- ricerca unificata ---
  async function lista_v8(){
    try{
      if (window.__searchLock?.lock) window.__searchLock.lock();
      if (typeof pauseRealtime==="function") pauseRealtime();

      const F = getFilters();
      const hasAny = Object.keys(F).some(k => has(F[k]));

      let data, error;
      if (!hasAny){
        ({data, error} = await sb.from("records").select("*").order("dataApertura",{ascending:false}).limit(500));
      } else {
        ({data, error} = await buildServerQuery(F));
      }
      if (error) throw error;

      const rows = clientExact(Array.isArray(data)?data:[], F);

      if (typeof window.drawListPage === "function"){
        await window.drawListPage(rows);
        decorateList(rows);
      }
      if (window.__searchLock?.unlock) window.__searchLock.unlock();
      if (typeof resumeRealtime==="function") resumeRealtime();
      console.log(LOG, "rows:", rows.length, F);
    }catch(e){
      console.error(LOG, e);
      if (window.__searchLock?.unlock) window.__searchLock.unlock();
    }
  }

  // --- aggiungi Reset accanto a Cerca ---
  function ensureResetButton(){
    const cercaBtn = $("#btnDoSearch");
    if (!cercaBtn) return;
    if ($("#btnHardReset")) return;
    const btn = document.createElement("button");
    btn.id = "btnHardReset";
    btn.type = "button";
    btn.className = "btn btn-outline-secondary ms-2";
    btn.textContent = "Reset";
    btn.addEventListener("click", doReset);
    (cercaBtn.parentElement||cercaBtn).appendChild(btn);
  }

  function init(){
    const cercaBtn = $("#btnDoSearch");
    if (cercaBtn){
      cercaBtn.removeEventListener("click", window.lista, true);
      cercaBtn.addEventListener("click", lista_v8, true);
    }
    const applyBtn = $("#btnApplyFilters");
    if (applyBtn){
      applyBtn.removeEventListener("click", window.lista, true);
      applyBtn.addEventListener("click", lista_v8, true);
    }
    // ENTER nella schermata di ricerca
    document.addEventListener("keydown", e=>{
      if (e.key==="Enter" && document.activeElement && document.activeElement.closest("#page-search")){
        lista_v8();
      }
    });
    // reset esistenti
    const resetBtn = $("#btnClearFilter") || $("#btnReset");
    if (resetBtn) resetBtn.addEventListener("click", doReset);

    ensureResetButton();

    // override pubblico
    window.lista = lista_v8;

    console.log(LOG, "attivo (binding robusto + exact match tecnici + reset reale)");
  }

  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();