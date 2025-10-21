
/*!
 * table-debounce-dedupe.v1.js
 * - Cancella richieste REST precedenti verso /rest/v1/records|records_view (AbortController)
 * - Evita risultati "random" da risposte fuori ordine
 * - De-duplica le righe della tabella principale (#tableResults) tenendo 1 sola per ogni record id
 */
(function(){
  const LOG = "[tbl-guard]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));

  // ---- 1) Abort vecchie query REST verso records ----
  let lastCtrl = null;
  if (!window.__TBL_FETCH_GUARD__) {
    const ORIG = window.fetch.bind(window);
    window.fetch = function(input, init={}){
      try{
        const url = typeof input === 'string' ? input : (input?.url || '');
        const method = (init?.method || (typeof input!=='string' ? input?.method : '') || 'GET').toUpperCase();
        if (method === 'GET' && /\/rest\/v1\/(records|records_view)\b/i.test(url)) {
          // aborta la precedente
          if (lastCtrl) { try { lastCtrl.abort(); } catch(e){} }
          lastCtrl = new AbortController();
          init.signal = lastCtrl.signal;
          arguments[1] = init;
          // console.debug(LOG, "nuova query, abort precedente:", url);
        }
      }catch(e){ /* ignore */ }
      return ORIG.apply(this, arguments);
    };
    window.__TBL_FETCH_GUARD__ = true;
    console.log(LOG, "fetch guard attivo (abort richieste precedenti)");
  }

  // ---- 2) DEDUPE delle righe della tabella ----
  function extractRowId(tr){
    // Preferisci un attributo data-*
    const ds = tr.dataset?.id || tr.dataset?.recordId || tr.getAttribute('data-record-id') || tr.getAttribute('data-id');
    if (ds) return ds;
    // Cerca in un link "Apri" con href contenente id=...
    const a = tr.querySelector('a[href*="id="], button[data-id], a[data-id]');
    if (a){
      const d = a.getAttribute('data-id');
      if (d) return d;
      const href = a.getAttribute('href') || '';
      const m = href.match(/[?&]id=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    // Altra euristica: cerca una cella con "id:"
    const txt = tr.innerText || tr.textContent || '';
    const m = txt.match(/\bid[:#]?\s*([0-9a-f-]{8,})/i); // uuid o testo lungo
    if (m) return m[1];
    return null;
  }

  function dedupeTable(){
    const tbl = $("#tableResults");
    const tbody = tbl?.querySelector("tbody");
    if (!tbody) return;
    const seen = new Set();
    const rows = Array.from(tbody.children).filter(el => el.tagName === 'TR');
    let removed = 0;
    rows.forEach(tr => {
      const id = extractRowId(tr);
      if (!id) return;
      if (seen.has(id)) {
        tr.remove();
        removed++;
      } else {
        seen.add(id);
      }
    });
    if (removed) console.log(LOG, "righe duplicate rimosse:", removed);
  }

  function initObserver(){
    const tbl = $("#tableResults");
    const target = tbl?.querySelector("tbody") || tbl;
    if (!target) return;
    const obs = new MutationObserver(() => {
      // dedupe dopo modifiche al DOM della tabella
      dedupeTable();
    });
    obs.observe(target, { childList:true, subtree:true });
    // dedupe iniziale
    dedupeTable();
    console.log(LOG, "observer attivo (dedupe)");

    // Espone anche un comando manuale
    window.__dedupeTableResults = dedupeTable;
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initObserver);
  else
    initObserver();
})();
