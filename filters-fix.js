/*!
 * filters-fix.js — v2 (drop-in, sostituzione)
 * - Aggiunge "Note (match esatto)" nel box "Filtri tecnici (singoli)"
 * - Sovrascrive `lista()` per fare query DETERMINISTICHE su Supabase con match ESATTO
 * - Blocca refresh concorrenti durante la ricerca (realtime + refreshDashboard)
 * - Deduplica per id e ordina in modo stabile
 */
(function(){
  const LOG = "[filters-fix]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const norm = v => String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

  if (!window.sb) { console.warn(LOG, "Supabase client mancante"); return; }

  /* ---------- UI: campo Note (match esatto) ---------- */
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

    // Enter = Cerca
    $("#filterNoteExact")?.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); $('#btnDoSearch')?.click(); }});
    console.log(LOG, "campo Note (match esatto) aggiunto");
    return true;
  }

  /* ---------- Gate refresh: blocca concorrenti durante la ricerca ---------- */
  if (typeof window.refreshDashboard === 'function' && !window.__refreshDashboard_orig){
    window.__refreshDashboard_orig = window.refreshDashboard;
    window.refreshDashboard = function(){
      if (window.__SEARCH_ACTIVE__) {
        console.log(LOG, "skip refreshDashboard (ricerca attiva)");
        return;
      }
      return window.__refreshDashboard_orig.apply(this, arguments);
    };
  }

  function pauseRealtime(){
    try {
      const sb = window.sb;
      if (sb?.removeAllChannels) sb.removeAllChannels(); // chiude eventuali canali già aperti
      console.log(LOG, "Realtime OFF durante ricerca");
    } catch(e){}
  }

  /* ---------- Lettura filtri UI ---------- */
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

  // PostgREST or=(...) per il campo q come match esatto su più colonne
  function buildOrForQ(q){
    const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica'];
    const enc = q.replace(/"/g,'\\"'); // escape minimale
    const parts = cols.map(c => `${c}.eq."${enc}"`);
    return `or=(${parts.join(',')})`;
  }

  async function querySupabaseExact(F){
    let url = `${window.SUPABASE_URL}/rest/v1/records?select=*`;
    const params = [];

    // eq per tutti i campi forniti (incluso note)
    for (const [k,v] of Object.entries(F)){
      if (!v || k==='q') continue;
      params.push(`${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`);
    }
    if (F.q) params.push(buildOrForQ(F.q));

    // ordine deterministico
    params.push('order=dataArrivo.desc,created_at.desc,id.asc');

    url += '&' + params.join('&');

    const res = await fetch(url, {
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
        'Accept-Profile': 'public'
      },
      method: 'GET'
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=> '');
      throw new Error(`HTTP ${res.status} - ${txt}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.data || []);
  }

  function dedupeSort(rows){
    const seen = new Set(); const out = [];
    for (const r of rows){
      const id = String(r?.id || "");
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

  /* ---------- Override lista() con ricerca deterministica ---------- */
  async function lista_exact(){
    try {
      window.__SEARCH_ACTIVE__ = true;
      pauseRealtime();

      const F = getFilters();
      console.log(LOG, "filtri", F);

      const rows = await querySupabaseExact(F);

      // rete di sicurezza client-side (normalizza e verifica eq)
      const keys = Object.keys(F).filter(k => F[k] && k!=='q');
      const filtered = rows.filter(r => {
        for (const k of keys){
          if (norm(r[k]) !== F[k]) return false;
        }
        if (F.q){
          const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica'];
          if (!cols.some(c => norm(r[c]) === F.q)) return false;
        }
        return true;
      });

      const clean = dedupeSort(filtered);

      // Pubblica per il renderer esistente (drawListPage/renderPager)
      window.searchRows = clean;
      window.page = 1;
      if (typeof window.renderPager === 'function') window.renderPager(clean.length);
      if (typeof window.drawListPage === 'function') await window.drawListPage();

      console.log(LOG, `OK: ${clean.length} risultati (deterministico)`);
    } catch (err) {
      console.error(LOG, err);
      alert("Errore nella ricerca: " + (err.message || err));
    } finally {
      window.__SEARCH_ACTIVE__ = false;
    }
  }

  function init(){
    ensureNoteInput();

    // Sovrascrivo la funzione globale `lista` usata dal bottone "Cerca"
    window.lista = lista_exact;

    // Aggancio il click al bottone Cerca in maniera non invasiva
    const btn = $('#btnDoSearch');
    if (btn) {
      btn.addEventListener('click', lista_exact, true);
      console.log(LOG, "override lista() attivo");
    } else {
      console.warn(LOG, "Bottone Cerca non trovato");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
