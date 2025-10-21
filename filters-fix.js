/*!
 * filters-fix.js — v2 (sostituzione completa)
 * - Aggiunge "Note (match esatto)" in Filtri tecnici
 * - Sovrascrive lista() per ricerca deterministica e match esatto via Supabase
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
    $("#filterNoteExact")?.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); $('#btnDoSearch')?.click(); }});
    console.log(LOG, "campo Note (match esatto) aggiunto");
    return true;
  }

  if (typeof window.refreshDashboard === 'function' && !window.__refreshDashboard_orig){
    window.__refreshDashboard_orig = window.refreshDashboard;
    window.refreshDashboard = function(){
      if (window.__SEARCH_ACTIVE__) { console.log(LOG, "skip refreshDashboard"); return; }
      return window.__refreshDashboard_orig.apply(this, arguments);
    };
  }
  function pauseRealtime(){
    try { const sb = window.sb; if (sb?.removeAllChannels) sb.removeAllChannels(); } catch(e){}
  }

  function getFilters(){
    const F = {};
    F.q = norm($("#q")?.value || "");
    const techMap = {
      battCollettore: "#f_battCollettore",
      lunghezzaAsse:  "#f_lunghezzaAsse",
      lunghezzaPacco: "#f_lunghezzaPacco",
      larghezzaPacco: "#f_larghezzaPacco",
      punta:          "#f_punta",
      numPunte:       "#f_numPunte"
    };
    for (const [k,sel] of Object.entries(techMap)){
      const v = $(sel)?.value;
      if (v && norm(v)) F[k] = norm(v);
    }
    const noteX = $("#filterNoteExact")?.value;
    if (noteX && norm(noteX)) F.note = norm(noteX);
    return F;
  }
  function buildOrForQ(q){
    const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica'];
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
  async function lista_exact(){
    try {
      window.__SEARCH_ACTIVE__ = true;
      pauseRealtime();
      const F = getFilters();
      const rows = await querySupabaseExact(F);
      const keys = Object.keys(F).filter(k => F[k] && k!=='q');
      const filtered = rows.filter(r => {
        for (const k of keys){ if (norm(r[k]) !== F[k]) return false; }
        if (F.q){
          const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica'];
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
      window.__SEARCH_ACTIVE__ = false;
    }
  }
  function init(){
    ensureNoteInput();
    window.lista = lista_exact;
    const btn = $('#btnDoSearch');
    if (btn) btn.addEventListener('click', lista_exact, true);
    console.log(LOG, "override lista() attivo");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
