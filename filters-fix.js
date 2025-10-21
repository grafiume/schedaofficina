
/*!
 * filters-fix.js — Add-on per "Filtri tecnici (singoli)"
 * Aggiunge un campo "Note (match esatto)" e filtra la TABella principale (#tableResults)
 * senza modificare l'HTML originale.
 *
 * Funziona così:
 *  - Inserisce un <input id="filterNoteExact"> accanto agli altri filtri.
 *  - Quando clicchi "Applica filtri" (o premi Invio nel campo Note), salva il valore
 *    e applica un post-filtro sulle righe della tabella, mantenendo SOLO quelle
 *    con "Note: <testo>" esattamente uguale (case-insensitive, spazi normalizzati).
 *  - "Reset" svuota il campo e rimuove il filtro.
 *  - Se la tabella viene rigenerata, un MutationObserver ri-applica il filtro.
 */
(function(){
  const LOG = "[filters-fix]";
  const $  = (s,ctx=document)=>ctx.querySelector(s);
  const $$ = (s,ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const safe = v => (v==null ? "" : String(v));
  const norm = v => safe(v).toLowerCase().trim().replace(/\s+/g, " ");

  function findFiltersBox(){
    // Trova il box dei "Filtri tecnici (singoli)"
    // Approccio robusto: cerca il testo nel DOM vicino al bottone "Applica filtri"
    const all = $$('div,section,form');
    return all.find(el => /Filtri tecnici\s*\(singoli\)/i.test(el.textContent||""));
  }

  function ensureNoteInput(){
    if ($("#filterNoteExact")) return true;
    const box = findFiltersBox();
    if (!box) return false;

    // Trova la riga che contiene gli input dei filtri (quella con i campi "Batt. collettore", ecc.)
    // Heuristica: il box contiene controlli e i bottoni "Applica filtri" / "Reset"
    const btnApply = Array.from(box.querySelectorAll('button')).find(b => /applica\s*filtri/i.test(b.textContent||""));
    const btnReset = Array.from(box.querySelectorAll('button')).find(b => /reset/i.test(b.textContent||""));
    if (!btnApply) return false;

    // Crea l'input Note
    const wrap = document.createElement('div');
    wrap.className = 'col-md-3'; // bootstrap-like width
    wrap.innerHTML = `
      <input id="filterNoteExact" class="form-control" placeholder="Note (match esatto)">
    `;

    // Inseriscilo prima del select Punta se possibile, altrimenti prima dei bottoni
    const punta = Array.from(box.querySelectorAll('select,input')).find(el => /Punta/i.test(el.previousSibling?.textContent||"") || /Punta/i.test(el.placeholder||""));
    if (punta && punta.parentElement && punta.parentElement.parentElement === box) {
      punta.parentElement.insertAdjacentElement('beforebegin', wrap);
    } else {
      btnApply.parentElement.insertAdjacentElement('beforebegin', wrap);
    }

    // Enter = Applica
    $("#filterNoteExact").addEventListener('keydown', (e)=>{
      if (e.key === 'Enter') { e.preventDefault(); btnApply.click(); }
    });

    // Hook bottoni
    btnApply.addEventListener('click', () => {
      const v = norm($("#filterNoteExact")?.value || "");
      window.__FILTER_NOTE_EXACT__ = v; // globale
      // filtra dopo un microtask (lascia finire i tuoi filtri standard)
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
    // La seconda colonna di solito contiene descrizione e sotto una linea "Note: xx"
    const cell = tr.children?.[1];
    if (!cell) return "";
    // prova a trovare una riga che inizi con "Note:"
    const txt = cell.innerText || cell.textContent || "";
    const m = txt.match(/Note:\s*([^\n\r]+)/i);
    return m ? norm(m[1]) : "";
  }

  function applyNoteFilter(){
    const table = $("#tableResults");
    const tbody = table?.querySelector("tbody");
    if (!tbody) return;
    const want = norm(window.__FILTER_NOTE_EXACT__ || "");
    // se il filtro è vuoto → mostra tutto
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
    applyNoteFilter(); // nel caso ci sia già un valore
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
