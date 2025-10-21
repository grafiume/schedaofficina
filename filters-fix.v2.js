
/*!
 * filters-fix.v3.js — Note (match esatto) blindata
 * - Aggiunge input "Note (match esatto)"
 * - Quando attivo: nasconde TUTTE le righe e mostra solo quelle con nota esattamente uguale (case-insensitive)
 * - Resiste ai refresh della tabella (observer) grazie ad una regola CSS persistente
 */
(function(){
  const LOG = "[filters-fix]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const safe = v => (v==null ? "" : String(v));
  const norm = v => safe(v).toLowerCase().trim().replace(/\s+/g, " ");

  // CSS gate: tutto nascosto quando attivo, poi mostriamo solo .note-match
  function ensureCSS(){
    if (document.getElementById("noteFilterCSS")) return;
    const st = document.createElement("style");
    st.id = "noteFilterCSS";
    st.textContent = `
      #tableResults[data-note-active="1"] tbody tr { display: none !important; }
      #tableResults[data-note-active="1"] tbody tr.note-match { display: table-row !important; }
    `;
    document.head.appendChild(st);
  }

  function findFiltersBox(){
    const all = $$('div,section,form');
    return all.find(el => /Filtri tecnici\s*\(singoli\)/i.test(el.textContent||""));
  }

  function ensureNoteInput(){
    if ($("#filterNoteExact")) return true;
    const box = findFiltersBox();
    if (!box) return false;

    const btnApply = Array.from(box.querySelectorAll('button')).find(b => /applica\s*filtri/i.test(b.textContent||""));
    const btnReset = Array.from(box.querySelectorAll('button')).find(b => /reset/i.test(b.textContent||""));
    if (!btnApply) return false;

    const wrap = document.createElement('div');
    wrap.className = 'col-md-3';
    wrap.innerHTML = `<input id="filterNoteExact" class="form-control" placeholder="Note (match esatto)">`;

    // inserisci prima del primo input dei filtri
    const firstField = box.querySelector('input.form-control, select.form-select');
    (firstField?.parentElement || btnApply.parentElement).insertAdjacentElement('beforebegin', wrap);

    $("#filterNoteExact").addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') { e.preventDefault(); btnApply.click(); }
    });

    btnApply.addEventListener('click', () => {
      window.__FILTER_NOTE_EXACT__ = norm($("#filterNoteExact")?.value || "");
      scheduleApply();
    });
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        const ip = $("#filterNoteExact"); if (ip) ip.value = "";
        window.__FILTER_NOTE_EXACT__ = "";
        scheduleApply();
      });
    }
    console.log(LOG, "campo Note (match esatto) aggiunto");
    return true;
  }

  function extractNoteFromRow(tr){
    const cell = tr.children?.[1];
    if (!cell) return "";
    // dataset espliciti
    const ds = cell.dataset?.note || tr.dataset?.note || "";
    if (ds) return norm(ds);
    // classi/attributi comuni
    const el2 = cell.querySelector('[data-note], [data-field="note"], .note, .badge-note');
    if (el2) return norm(el2.textContent||"");
    // testo normalizzato della cella (collassa whitespace)
    const raw = (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
    const m = raw.match(/note:\s*([^|•\n\r]+)/i);
    if (m && m[1]) return norm(m[1]);
    // scan elementi piccoli
    const smalls = Array.from(cell.querySelectorAll('small,div,span')).map(x => x.textContent||"");
    for (const t of smalls) {
      const mm = t.match(/^\s*note[:]?\s*(.+)$/i);
      if (mm && mm[1]) return norm(mm[1]);
    }
    return "";
  }

  function applyNoteFilterNow(){
    const table = $("#tableResults");
    const tbody = table?.querySelector("tbody");
    if (!tbody) return;
    const want = norm(window.__FILTER_NOTE_EXACT__ || "");

    if (!want) {
      table.removeAttribute('data-note-active');
      $$("#tableResults tbody tr").forEach(tr => tr.classList.remove('note-match'));
      console.log(LOG, "filtro Note disattivato");
      return;
    }

    table.setAttribute('data-note-active','1'); // attiva il gate CSS
    let shown = 0, hidden = 0;
    $$("#tableResults tbody tr").forEach(tr => {
      const note = extractNoteFromRow(tr);
      const ok = (note === want);
      tr.classList.toggle('note-match', ok);
      ok ? shown++ : hidden++;
    });
    console.log(LOG, `filtro Note="${want}" → visibili ${shown}, nascosti ${hidden}`);
  }

  let applyTimer = null;
  function scheduleApply(){
    if (applyTimer) cancelAnimationFrame(applyTimer);
    applyTimer = requestAnimationFrame(applyNoteFilterNow);
  }

  function init(){
    ensureCSS();
    if (!ensureNoteInput()) return;
    scheduleApply();
    const table = $("#tableResults");
    const target = table?.querySelector("tbody") || table;
    if (target) {
      new MutationObserver(() => scheduleApply())
        .observe(target, { childList:true, subtree:true });
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else
    init();
})();
