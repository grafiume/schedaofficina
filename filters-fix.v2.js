
/*!
 * filters-fix.v2.js — Note (match esatto) per Filtri tecnici (singoli)
 * Migliora l'estrazione della nota dalla riga tabellare:
 * - Normalizza l'intero testo cella (collassa \s) e cerca "Note: <valore>"
 * - Fallback: cerca elementi con [data-note], [data-field="note"], .note, .badge-note
 * - Fallback 2: scansiona tutte le <small>/<div> nella cella e prende la prima che inizia con "Note"
 */
(function(){
  const LOG = "[filters-fix]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const safe = v => (v==null ? "" : String(v));
  const norm = v => safe(v).toLowerCase().trim().replace(/\s+/g, " ");

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

    const firstInputRow = box.querySelector('input.form-control, select.form-select');
    if (firstInputRow && firstInputRow.parentElement) {
      firstInputRow.parentElement.insertAdjacentElement('beforebegin', wrap);
    } else {
      btnApply.parentElement.insertAdjacentElement('beforebegin', wrap);
    }

    $("#filterNoteExact").addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') { e.preventDefault(); btnApply.click(); }
    });

    btnApply.addEventListener('click', () => {
      const v = norm($("#filterNoteExact")?.value || "");
      window.__FILTER_NOTE_EXACT__ = v;
      setTimeout(applyNoteFilter, 0);
    });

    if (btnReset) {
      btnReset.addEventListener('click', () => {
        const ip = $("#filterNoteExact"); if (ip) ip.value = "";
        window.__FILTER_NOTE_EXACT__ = "";
        setTimeout(applyNoteFilter, 0);
      });
    }

    console.log(LOG, "campo Note (match esatto) aggiunto");
    return true;
  }

  function extractNoteFromRow(tr){
    const cell = tr.children?.[1];
    if (!cell) return "";
    // 1) dataset esplicito
    const ds = cell.dataset?.note || tr.dataset?.note || "";
    if (ds) return norm(ds);
    // 2) scorciatoie comuni
    const el2 = cell.querySelector('[data-note], [data-field="note"], .note, .badge-note');
    if (el2) return norm(el2.textContent||"");
    // 3) testo normalizzato della cella (collassa whitespace)
    const raw = (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
    const m = raw.match(/note:\s*([^|•\n\r]+)/i); // fino a separatori comuni
    if (m && m[1]) return norm(m[1]);
    // 4) scan di piccoli elementi
    const small = Array.from(cell.querySelectorAll('small,div,span')).map(x => x.textContent||"");
    for (const t of small) {
      const mm = t.match(/^\s*note[:]?\s*(.+)$/i);
      if (mm && mm[1]) return norm(mm[1]);
    }
    return "";
  }

  function applyNoteFilter(){
    const table = $("#tableResults");
    const tbody = table?.querySelector("tbody");
    if (!tbody) return;
    const want = norm(window.__FILTER_NOTE_EXACT__ || "");
    if (!want) {
      $$("#tableResults tbody tr").forEach(tr => tr.style.display = "");
      console.log(LOG, "filtro Note disattivato");
      return;
    }
    let shown = 0, hidden = 0;
    $$("#tableResults tbody tr").forEach(tr => {
      const note = extractNoteFromRow(tr);
      const ok = (note === want);
      tr.style.display = ok ? "" : "none";
      ok ? shown++ : hidden++;
    });
    console.log(LOG, `filtro Note="${want}" → visibili ${shown}, nascosti ${hidden}`);
  }

  function init(){
    if (!ensureNoteInput()) return;
    applyNoteFilter();
    const table = $("#tableResults");
    const target = table?.querySelector("tbody") || table;
    if (target) {
      new MutationObserver(() => applyNoteFilter())
        .observe(target, { childList:true, subtree:true });
    }
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else
    init();
})();
