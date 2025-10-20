
/*!
 * search-notes-addon.v1.js  (notes-only exact panel + matching)
 * Aggiunge nel pannello "Ricerca" un campo dedicato alle Note con match ESATTO
 * (case-insensitive, trim/whitespace-normalized) e senza modificare index.html.
 *
 * Come funziona:
 * - Inserisce dinamicamente un input "Note (match esatto)" + pulsante "Cerca Note".
 * - Quando lo usi, attiva una modalità "solo note esatte" e riusa il flusso di ricerca
 *   esistente cliccando #btnDoSearch, ma il filtro viene applicato dal wrapper
 *   di recordMatchesQuery qui sotto (match su r.note).
 *
 * Requisiti minimi dell'app:
 * - Presenza del container #page-search e (idealmente) del bottone #btnDoSearch.
 * - Presenza della funzione recordMatchesQuery(r,q) (se non c'è, la definiamo noi).
 */
(function () {
  const LOG_PREFIX = "[notes-addon]";
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  // ---------- Utility ----------
  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).toLowerCase().trim().replace(/\s+/g, " ");

  // Stato modalità "solo note"
  window.__NOTE_SEARCH_ACTIVE = false;
  window.__NOTE_SEARCH_VALUE = "";

  function activateNoteExactMode(val) {
    window.__NOTE_SEARCH_VALUE = norm(val);
    window.__NOTE_SEARCH_ACTIVE = !!window.__NOTE_SEARCH_VALUE;
    console.log(LOG_PREFIX, "note-only exact mode:", window.__NOTE_SEARCH_ACTIVE ? `"${window.__NOTE_SEARCH_VALUE}"` : "OFF");
  }
  function deactivateNoteExactMode() {
    window.__NOTE_SEARCH_VALUE = "";
    window.__NOTE_SEARCH_ACTIVE = false;
    console.log(LOG_PREFIX, "note-only exact mode: OFF");
  }

  // ---------- UI Injection ----------
  function injectNoteSearchUI() {
    const host = $("#page-search");
    if (!host) return console.warn(LOG_PREFIX, "#page-search non trovato, UI note non iniettata.");

    // Evita duplicati
    if ($("#noteExactBox", host)) return;

    // Trova un punto comodo sotto al titolo o alla prima riga
    const title = $("h4", host);
    const anchor = title ? title.nextElementSibling : host.firstElementChild;

    const box = document.createElement("div");
    box.id = "noteExactBox";
    box.className = "card mb-2";
    box.innerHTML = [
      '<div class="card-header py-2">Ricerca Note (match esatto)</div>',
      '<div class="card-body py-2">',
      '  <div class="row g-2 align-items-center">',
      '    <div class="col-md-8">',
      '      <input id="qNoteExact" class="form-control" placeholder="Note (match esatto) — es. na trova SOLO &quot;na&quot;, non &quot;nato&quot;">',
      '    </div>',
      '    <div class="col-md-2 d-grid"><button id="btnNoteExact" class="btn btn-outline-primary" type="button">Cerca Note</button></div>',
      '    <div class="col-md-2 d-grid"><button id="btnNoteClear" class="btn btn-outline-secondary" type="button">Rimuovi</button></div>',
      '  </div>',
      '</div>'
    ].join("");

    // Inserisci subito dopo il titolo o in cima
    if (anchor && anchor.nextSibling) {
      host.insertBefore(box, anchor.nextSibling);
    } else {
      host.appendChild(box);
    }

    const input = $("#qNoteExact", box);
    const btnGo = $("#btnNoteExact", box);
    const btnClr = $("#btnNoteClear", box);

    // Click su "Cerca Note": attiva modalità e richiama ricerca standard
    btnGo?.addEventListener("click", () => {
      const val = input.value;
      activateNoteExactMode(val);
      const btnDo = $("#btnDoSearch");
      if (btnDo) {
        // Se c'è un campo #q, svuotiamolo per chiarezza visiva (non usato in questa modalità)
        const q = $("#q");
        if (q) q.value = "";
        // Riusa la ricerca standard (eventuali fetch remoti + render), poi noi rifiliamo
        btnDo.click();
      } else {
        // Se non esiste, emettiamo un evento che l'app (o un altro hook) può intercettare
        const ev = new CustomEvent("search:request", { detail: { query: "", mode: "note-exact", value: window.__NOTE_SEARCH_VALUE } });
        window.dispatchEvent(ev);
      }
    });

    // Invio dentro l'input: come click
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnGo?.click();
      }
    });

    // Rimuovi modalità + pulisci
    btnClr?.addEventListener("click", () => {
      input.value = "";
      deactivateNoteExactMode();
      // Riavvia ricerca "normale" (mostra tutti o applica q standard)
      const btnDo = $("#btnDoSearch");
      if (btnDo) btnDo.click();
      else window.dispatchEvent(new CustomEvent("search:request", { detail: { query: "" } }));
    });

    console.log(LOG_PREFIX, "UI Note (match esatto) iniettata.");
  }

  // ---------- Matching wrapper ----------
  // Manteniamo il comportamento originale se esiste.
  const fieldsDefault = [
    "descrizione","modello","cliente","telefono","ddt",
    "marca","battcollettore","datiTecnici","note"
  ];

  function defaultMatcher(r, q) {
    const needle = norm(q || "");
    if (!needle) return true;
    const hay = fieldsDefault.map(k => norm(r && r[k])).join(" ");
    return hay.includes(needle);
  }

  try {
    const original = (typeof window.recordMatchesQuery === "function") ? window.recordMatchesQuery : null;
    window.recordMatchesQuery = function (r, q) {
      // Modalità "solo note esatte"
      if (window.__NOTE_SEARCH_ACTIVE) {
        const target = window.__NOTE_SEARCH_VALUE;
        const val = norm(r && (r.note ?? r.notesk ?? r.notes ?? r.osservazioni));
        return !!target && val === target;
      }
      // Altrimenti: usa originale se presente, altrimenti fallback con note inclusa
      try {
        if (original) return original.call(this, r, q);
      } catch (e) {
        console.warn(LOG_PREFIX, "original recordMatchesQuery failed:", e);
      }
      return defaultMatcher(r, q);
    };
    console.log(LOG_PREFIX, original ? "wrapped recordMatchesQuery (note + note-exact mode)" : "defined recordMatchesQuery (fallback + note-exact).");
  } catch (e) {
    console.warn(LOG_PREFIX, "recordMatchesQuery patch error:", e);
  }

  // ---------- Hook risultati: post-filtraggio e reset one-shot ----------
  try {
    window.addEventListener("search:results", (ev) => {
      const detail = ev && ev.detail;
      if (!detail || !Array.isArray(detail.results)) return;
      const q = detail.query || "";
      // Applichiamo SEMPRE il filtro finale con recordMatchesQuery (copre anche note-only)
      const filtered = detail.results.filter(r => window.recordMatchesQuery(r, q));
      const out = new CustomEvent("search:results:filtered", { detail: { results: filtered, query: q }});
      window.dispatchEvent(out);
      console.log(LOG_PREFIX, `post-filter applicato (${filtered.length}/${detail.results.length}).`);
      // Nota: NON resettiamo automaticamente la modalità per poter cambiare pagina e mantenere il filtro.
    });
  } catch (e) {
    console.warn(LOG_PREFIX, "post-filter hook error:", e);
  }

  // Inietta UI al DOMContentLoaded (o subito se già pronto)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectNoteSearchUI);
  } else {
    injectNoteSearchUI();
  }
})();
