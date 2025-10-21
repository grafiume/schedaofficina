
/*!
 * filters-fix.js — v4 (deterministico + reset completo)
 * - Aggiunge "Note (match esatto)" nei Filtri tecnici (se manca)
 * - Ricerca deterministica (match ESATTO) via supabase-js
 * - Sblocca sempre alla fine (permette ricerche successive)
 * - RESET pulisce TUTTO: Note, filtri tecnici e **ricerca generale #q**
 * - Renderer compatibile: usa window.searchRows + drawListPage()/renderPager()
 */
(function(){
  const LOG = "[filters-fix v4]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const norm = v => String(v ?? '').toLowerCase().trim().replace(/\s+/g,' ');

  // ---- Supabase client ----
  const sb = (window.sb || window.supabase);
  if (!sb || !sb.from) { console.warn(LOG, "Supabase client non trovato"); return; }

  // ---- UI helpers ----
  function findFiltersBox(){
    // prova selettori più comuni
    const candidates = [
      '#page-search',
      '#filters-tech',
      '.filters-tech',
      'form#filters-tech'
    ];
    for (const sel of candidates){
      const el = $(sel);
      if (el && /filtri\s*tecnici/i.test(el.textContent||"")) return el;
    }
    // fallback: blocco che contiene il testo "Filtri tecnici (singoli)"
    const all = $$('div,section,form');
    return all.find(el => /Filtri tecnici\s*\(singoli\)/i.test(el.textContent||"")) || $('#page-search') || document.body;
  }

  function ensureNoteInput(){
    if ($("#filterNoteExact")) return true;
    const box = findFiltersBox();
    if (!box) return false;

    const col = document.createElement('div');
    col.className = 'col-md-3 my-1';
    col.innerHTML = '<input id="filterNoteExact" class="form-control" placeholder="Note (match esatto)">';
    // Inserisci vicino al bottone Cerca se c'è una .row
    const row = box.querySelector('.row') || box;
    row.appendChild(col);

    // Enter avvia ricerca
    $("#filterNoteExact")?.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') { e.preventDefault(); $('#btnDoSearch')?.click(); }
    });

    console.log(LOG, "Campo Note (match esatto) aggiunto");
    return true;
  }

  // ---- Reset (pulisce tutto, compreso #q) ----
  function doReset(){
    try {
      // ricerca generale
      const q = $('#q'); if (q) q.value = '';

      // note
      const n = $('#filterNoteExact'); if (n) n.value = '';

      // filtri tecnici singoli (supporta sia id che name)
      const ids = ["#f_battCollettore","#f_lunghezzaAsse","#f_lunghezzaPacco","#f_larghezzaPacco","#f_punta","#f_numPunte"];
      ids.forEach(sel => { const el = $(sel); if (el) el.value = ""; });
      ['battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco','punta','numPunte']
        .forEach(name => { const el = document.querySelector(`[name="${name}"]`); if (el) el.value = ''; });

      // sblocca eventuale lock
      window.__SEARCH_ACTIVE__ = false;
      if (window.__searchLock?.unlock) window.__searchLock.unlock();

      // svuota lista/tabella
      window.searchRows = [];
      window.page = 1;
      if (typeof window.renderPager === 'function') window.renderPager(0);
      if (typeof window.drawListPage === 'function') window.drawListPage();

      console.log(LOG, "RESET completo eseguito");
    } catch(e){
      console.warn(LOG, "reset error", e);
    }
  }

  function attachResetButton(){
    // Aggancia #btnClearFilter se presente, altrimenti creane uno
    let btn = $('#btnClearFilter');
    if (!btn){
      const near = $('#btnDoSearch');
      btn = document.createElement('button');
      btn.id = 'btnClearFilter';
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary ms-2';
      btn.textContent = 'Rimuovi filtro';
      if (near && near.parentElement) near.parentElement.appendChild(btn);
      else (findFiltersBox() || document.body).appendChild(btn);
    }
    btn.addEventListener('click', doReset);
  }

  // ---- Gate refresh: evita refresh concorrenti mentre cerchiamo ----
  if (typeof window.refreshDashboard === 'function' && !window.__refreshDashboard_orig){
    window.__refreshDashboard_orig = window.refreshDashboard;
    window.refreshDashboard = function(){
      if (window.__SEARCH_ACTIVE__) {
        console.log(LOG, 'skip refreshDashboard (ricerca attiva)');
        return;
      }
      return window.__refreshDashboard_orig.apply(this, arguments);
    };
  }
  function pauseRealtime(){
    try { if (sb.removeAllChannels) { sb.removeAllChannels(); console.log(LOG, 'Realtime OFF durante ricerca'); } } catch(e){}
  }

  // ---- Lettura filtri ----
  function getFilters(){
    const F = {};
    F.q = norm($('#q')?.value || '');

    const techIdMap = {
      battCollettore: '#f_battCollettore',
      lunghezzaAsse:  '#f_lunghezzaAsse',
      lunghezzaPacco: '#f_lunghezzaPacco',
      larghezzaPacco: '#f_larghezzaPacco',
      punta:          '#f_punta',
      numPunte:       '#f_numPunte'
    };
    for (const [k,sel] of Object.entries(techIdMap)){
      const v = $(sel)?.value;
      if (v && norm(v)) F[k] = norm(v);
    }
    // fallback per name=
    ['battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco','punta','numPunte']
      .forEach(k => {
        if (F[k]) return;
        const el = document.querySelector(`[name="${k}"]`);
        if (el && norm(el.value)) F[k] = norm(el.value);
      });

    const noteX = $('#filterNoteExact')?.value;
    if (noteX && norm(noteX)) F.note = norm(noteX);

    return F;
  }

  // ---- Query deterministica (match ESATTO) ----
  function buildOrForQ(q){
    // Supabase .or() usa una stringa tipo: 'note.eq."le",cliente.eq."le",...'
    const cols = ['note','cliente','descrizione','modello','telefono','numero','email','statoPratica'];
    const esc = q.replace(/"/g, '\\"');
    return cols.map(c => `${c}.eq."${esc}"`).join(',');
  }

  async function queryExact(F){
    let q = sb.from('records').select('*').order('dataArrivo', { ascending:false }).order('created_at', { ascending:false }).order('id', { ascending:true });

    // eq per ogni filtro esplicito (incluso note)
    for (const [k,v] of Object.entries(F)){
      if (!v || k === 'q') continue;
      q = q.eq(k, v);
    }
    // q generico come esatto su varie colonne
    if (F.q) q = q.or(buildOrForQ(F.q));

    const { data, error } = await q;
    if (error) throw error;
    return data || [];
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

  // ---- Override lista() ----
  async function lista_exact(){
    // Sblocca prima (in caso di lock rimasto)
    window.__SEARCH_ACTIVE__ = false;
    if (window.__searchLock?.unlock) window.__searchLock.unlock();

    try {
      window.__SEARCH_ACTIVE__ = true;
      if (window.__searchLock?.lock) window.__searchLock.lock();
      pauseRealtime();

      const F = getFilters();
      // se non c'è nessun filtro né q, non facciamo query e svuotiamo la lista
      const allEmpty = Object.values(F).every(v => !v);
      if (allEmpty){
        window.searchRows = [];
        window.page = 1;
        if (typeof window.renderPager === 'function') window.renderPager(0);
        if (typeof window.drawListPage === 'function') await window.drawListPage();
        console.log(LOG, "Nessun filtro: lista svuotata");
        return;
      }

      const rows = await queryExact(F);

      // Rete di sicurezza: verifica match esatto normalizzato
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

      console.log(LOG, `OK: ${clean.length} risultati (match esatto)`);
    } catch (e){
      console.error(LOG, e);
      alert("Errore ricerca: " + (e.message || e));
    } finally {
      // Sblocca SEMPRE
      window.__SEARCH_ACTIVE__ = false;
      if (window.__searchLock?.unlock) window.__searchLock.unlock();
    }
  }

  // ---- Init ----
  function init(){
    ensureNoteInput();
    attachResetButton();

    // Enter in #q avvia ricerca e sblocca eventuale lock
    const q = $('#q');
    if (q) q.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter'){
        e.preventDefault();
        window.__SEARCH_ACTIVE__ = false;
        if (window.__searchLock?.unlock) window.__searchLock.unlock();
        $('#btnDoSearch')?.click();
      }
    });

    // Sovrascrivi lista() e aggancia il bottone Cerca
    window.lista = lista_exact;
    const btn = $('#btnDoSearch');
    if (btn) btn.addEventListener('click', lista_exact, true);

    console.log(LOG, "override lista() attivo (v4)");
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
