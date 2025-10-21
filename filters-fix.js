/*!
 * filters-fix.js — v3 (reset & unlock)
 * - Aggiunge "Note (match esatto)" in Filtri tecnici
 * - Ricerca deterministica (match esatto) via Supabase
 * - Sblocca sempre dopo la ricerca e permette ricerche successive
 * - Aggiunge reset dei filtri (integra #btnClearFilter se esiste)
 */
(function(){
  const LOG = "[filters-fix]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const norm = v => String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

  if (!window.sb) { console.warn(LOG, "Supabase client mancante"); return; }

  function findFiltersBox(){
    const all = $$('div,section,form');
    return all.find(el => /Filtri tecnici\s*\(singoli\)/i.test(el.textContent||""));
  }
  function ensureNoteInput(){
    if ($("#filterNoteExact")) return true;
    const box = findFiltersBox();
    if (!box) return false;
    const wrap = document.createElement('div');
    wrap.className = 'col-md-3';
    wrap.innerHTML = `<input id="filterNoteExact" class="form-control" placeholder="Note (match esatto)">`;
    const btnApply = Array.from(box.querySelectorAll('button')).find(b => /applica\s*filtri/i.test(b.textContent||""));
    if (btnApply) btnApply.parentElement.insertAdjacentElement('beforebegin', wrap);
    else box.appendChild(wrap);
    console.log(LOG, "campo Note (match esatto) aggiunto");
    return true;
  }

  // Reset filtri (se esiste #btnClearFilter lo usiamo; altrimenti lo creiamo)
  function attachReset(){
    const doReset = () => {
      try {
        $("#q") && ($("#q").value = "");
        $("#filterNoteExact") && ($("#filterNoteExact").value = "");

        const ids = ["#f_descrizione","#f_modello","#f_cliente","#f_telefono","#f_email","#filterNoteExact","#f_battCollettore","#f_lunghezzaAsse","#f_lunghezzaPacco","#f_larghezzaPacco","#f_punta","#f_numPunte"];
        ids.forEach(sel => { const el = $(sel); if (el) el.value = ""; });

        window.__SEARCH_ACTIVE__ = false;
        if (window.__searchLock?.unlock) window.__searchLock.unlock();

        // ripristina pagina 1 e tabella vuota
        window.searchRows = [];
        window.page = 1;
        if (typeof window.renderPager === 'function') window.renderPager(0);
        if (typeof window.drawListPage === 'function') window.drawListPage();

        console.log(LOG, "reset filtri");
      } catch(e){ console.warn(LOG, "reset error", e); }
    };

    let btn = $("#btnClearFilter");
    if (!btn) {
      // crea un pulsante reset vicino al bottone Cerca
      const row = $("#page-search .row") || $("#page-search");
      if (row) {
        btn = document.createElement("button");
        btn.id = "btnClearFilter";
        btn.type = "button";
        btn.className = "btn btn-outline-secondary ms-2";
        btn.textContent = "Rimuovi filtro";
        const cercaBtn = $("#btnDoSearch");
        if (cercaBtn && cercaBtn.parentElement) {
          cercaBtn.parentElement.appendChild(btn);
        } else if (row.appendChild) {
          row.appendChild(btn);
        }
      }
    }
    if (btn) btn.addEventListener("click", doReset);
  }

  if (typeof window.refreshDashboard === 'function' && !window.__refreshDashboard_orig){
    window.__refreshDashboard_orig = window.refreshDashboard;
    window.refreshDashboard = function(){
      if (window.__SEARCH_ACTIVE__) {
        console.log(LOG, "skip refreshDashboard");
        return;
      }
      return window.__refreshDashboard_orig.apply(this, arguments);
    };
  }
  function pauseRealtime(){
    try { const sb = window.sb; if (sb?.removeAllChannels) sb.removeAllChannels(); } catch(e){}
  }

  function getFilters(){
  const F = {};
  const norm = v => String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  // query "q" => exact across common columns
  F.q = norm($("#q")?.value || "");

  // Exact single fields like the form (excluding date/preventivo/DDT/stato)
  const map = {
    descrizione: "#f_descrizione",
    modello: "#f_modello",
    cliente: "#f_cliente",
    telefono: "#f_telefono",
    email: "#f_email",
    note: "#filterNoteExact",
    battCollettore: "#f_battCollettore",
    lunghezzaAsse: "#f_lunghezzaAsse",
    lunghezzaPacco: "#f_lunghezzaPacco",
    larghezzaPacco: "#f_larghezzaPacco",
    punta: "#f_punta",
    numPunte: "#f_numPunte"
  };
  for (const [k,sel] of Object.entries(map)){
    const v = $(sel)?.value;
    if (v && norm(v)) F[k] = norm(v);
  }
  return F;
}
  function buildOrForQ(q){
    const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica','battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco','punta','numPunte'];
    const enc = q.replace(/"/g,'\\"');
    return `or=(${cols.map(c => `${c}.eq."${enc}"`).join(',')})`;
  }
  async function querySupabaseExact(F){
    let url = `${window.SUPABASE_URL}/rest/v1/records?select=*`;
    const p = [];
    for (const [k,v] of Object.entries(F)){
      if (!v || k==='q') continue;
      p.push(`${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`);
    }
    if (F.q) p.push(buildOrForQ(F.q));
    p.push('order=dataArrivo.desc,created_at.desc,id.asc');
    url += '&' + p.join('&');
    const res = await fetch(url, {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,'Accept-Profile':'public' },
      method: 'GET'
    });
    if (!res.ok){ throw new Error(`HTTP ${res.status}`); }
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data||[]);
  }
  function dedupeSort(rows){
    const seen = new Set(); const out = [];
    for (const r of rows){
      const id = String(r?.id||"");
      if (!id || seen.has(id)) continue;
      seen.add(id); out.push(r);
    }
    out.sort((a,b)=>{
      const da = String(a.dataArrivo||''); const db = String(b.dataArrivo||'');
      if (da !== db) return db.localeCompare(da);
      const ca = String(a.created_at||a.createdAt||''); const cb = String(b.created_at||b.createdAt||'');
      if (ca !== cb) return cb.localeCompare(ca);
      return String(a.id||'').localeCompare(String(b.id||''));
    });
    return out;
  }

  async async function lista_exact(){
    // Se una ricerca precedente fosse rimasta "appesa", sblocco ora
    window.__SEARCH_ACTIVE__ = false;
    if (window.__searchLock?.unlock) window.__searchLock.unlock();

    try {
      window.__SEARCH_ACTIVE__ = true;
      if (window.__searchLock?.lock) window.__searchLock.lock();
      pauseRealtime();

      const F = getFilters();
      console.log(LOG, "filtri", F);

      const rows = await querySupabaseExact(F);

      const keys = Object.keys(F).filter(k => F[k] && k!=='q');
      const filtered = rows.filter(r => {
        for (const k of keys){ if (norm(r[k]) !== F[k]) return false; }
        if (F.q){
          const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica','battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco','punta','numPunte'];
          if (!cols.some(c => norm(r[c]) === F.q)) return false;
        }
        return true;
      });

      const clean = dedupeSort(filtered);

      window.searchRows = clean;
      window.page = 1;
      if (typeof window.renderPager === 'function') window.renderPager(clean.length);
      if (typeof window.drawListPage === 'function') await window.drawListPage();

      console.log(LOG, `OK: ${clean.length} risultati`);
    } catch (e){
      console.error(LOG, e);
      alert("Errore ricerca: " + (e.message||e));
    } finally {
      // sblocca SEMPRE per permettere la ricerca successiva
      window.__SEARCH_ACTIVE__ = false;
      if (window.__searchLock?.unlock) window.__searchLock.unlock();
    }
  }

  function init(){
    ensureNoteInput();
    attachReset();

    // Enter sui campi => nuova ricerca (e sblocca eventuale lock precedente)
    ['#q','#filterNoteExact','#f_battCollettore','#f_lunghezzaAsse','#f_lunghezzaPacco','#f_larghezzaPacco','#f_punta','#f_numPunte']
      .forEach(sel => {
        const el = $(sel);
        if (!el) return;
        el.addEventListener('keydown', (e)=>{
          if (e.key === 'Enter') {
            e.preventDefault();
            window.__SEARCH_ACTIVE__ = false;
            if (window.__searchLock?.unlock) window.__searchLock.unlock();
            $('#btnDoSearch')?.click();
          }
        });
      });

    // Sovrascrivo lista()
    window.lista = lista_exact;
    const btn = $('#btnDoSearch');
    if (btn) btn.addEventListener('click', lista_exact, true);
    console.log(LOG, "override lista() attivo (v3)");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
