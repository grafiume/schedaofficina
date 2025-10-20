
/*!
 * search-notes-addon.v1.js  (rev2)
 * - UI "Note (match esatto)" con query remota .eq('note', value) se Supabase è disponibile.
 * - Filtro locale di fallback su risultati esistenti.
 * - Ricerca generale: supporto per match parola intera se la query è tra virgolette ("...").
 * - Nessuna modifica a index.html richiesta.
 */
(function () {
  const LOG_PREFIX = "[notes-addon]";
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).toLowerCase().trim().replace(/\s+/g, " ");
  const hasSupabase = !!(window.supabase && typeof window.supabase.from === "function");

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

  // ========== UI Injection ==========
  function injectNoteSearchUI() {
    const host = $("#page-search");
    if (!host) return console.warn(LOG_PREFIX, "#page-search non trovato, UI note non iniettata.");
    if ($("#noteExactBox", host)) return;

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
      '      <input id="qNoteExact" class="form-control" placeholder="Note (match esatto) — es. na → solo &quot;na&quot; non &quot;nato&quot;">',
      '    </div>',
      '    <div class="col-md-2 d-grid"><button id="btnNoteExact" class="btn btn-outline-primary" type="button">Cerca Note</button></div>',
      '    <div class="col-md-2 d-grid"><button id="btnNoteClear" class="btn btn-outline-secondary" type="button">Rimuovi</button></div>',
      '  </div>',
      '  <div class="small text-muted mt-2">Consiglio: nella ricerca generale puoi forzare la parola intera scrivendo tra virgolette, es. <code>"na"</code>.</div>',
      '</div>'
    ].join("");

    if (anchor && anchor.nextSibling) {
      host.insertBefore(box, anchor.nextSibling);
    } else {
      host.appendChild(box);
    }

    const input = $("#qNoteExact", box);
    const btnGo = $("#btnNoteExact", box);
    const btnClr = $("#btnNoteClear", box);

    // Cerca Note (remota se possibile, altrimenti riuso locale)
    btnGo?.addEventListener("click", async () => {
      const raw = input.value;
      const val = norm(raw);
      activateNoteExactMode(val);
      if (!val) return;

      // 1) Se abbiamo Supabase, facciamo query esatta remota
      if (hasSupabase) {
        try {
          const { data, error } = await window.supabase
            .from("records")
            .select("*")
            .eq("note", raw.trim()); // usa raw (non normalizzato) per un match semantico esatto sul DB
          if (error) throw error;

          // Se c'è una funzione di render dedicata, usiamola
          if (typeof window.renderSearch === "function") {
            // Best effort: ordina già qui (anche se per note eq non serve)
            const out = Array.isArray(data) ? data.slice(0) : [];
            window.renderSearch(out);
            console.log(LOG_PREFIX, `renderSearch con ${out.length} risultati (Supabase eq note).`);
          } else {
            // Altrimenti emettiamo eventi standard ascoltati dall'app (se presenti)
            const ev = new CustomEvent("search:results", { detail: { results: data || [], query: raw, mode: "note-exact-remote" } });
            window.dispatchEvent(ev);
            const ev2 = new CustomEvent("search:results:filtered", { detail: { results: data || [], query: raw } });
            window.dispatchEvent(ev2);
            console.log(LOG_PREFIX, `events dispatched (${(data||[]).length} results).`);
          }
          return; // non proseguire al click standard
        } catch (e) {
          console.warn(LOG_PREFIX, "Supabase eq(note) fallita, fallback locale:", e);
        }
      }

      // 2) Fallback: forza il flusso standard e filtra a valle
      const q = $("#q"); if (q) q.value = ""; // svuota ricerca generica
      const btnDo = $("#btnDoSearch");
      if (btnDo) btnDo.click();
    });

    // Invio dentro l'input: come click
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnGo?.click();
      }
    });

    // Rimuovi modalità + refresh
    btnClr?.addEventListener("click", () => {
      input.value = "";
      deactivateNoteExactMode();
      const btnDo = $("#btnDoSearch");
      if (btnDo) btnDo.click();
      else window.dispatchEvent(new CustomEvent("search:request", { detail: { query: "" } }));
    });

    console.log(LOG_PREFIX, "UI Note (match esatto) iniettata. Supabase:", hasSupabase ? "OK" : "NO");
  }

  // ========== Ricerca generale: supporto "parola intera" con virgolette ==========
  function buildWordBoundaryRegex(needle) {
    // Escapa i caratteri regex e crea \b...\b per match su parola intera
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // \b con unicode non sempre perfetto; usiamo alternative: (^|[^a-z0-9à-ù_])needle([^a-z0-9à-ù_]|$)
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${esc}([^\\p{L}\\p{N}_]|$)`, "iu");
  }

  const fieldsDefault = [
    "descrizione","modello","cliente","telefono","ddt",
    "marca","battCollettore","battcollettore","datiTecnici","note"
  ];

  function defaultMatcher(r, q) {
    const s = safeStr(q);
    const quoted = /^"(.*)"$/.test(s.trim());
    const needleRaw = quoted ? s.trim().slice(1, -1) : s;
    const needle = norm(needleRaw);
    if (!needle) return true;
    const hay = fieldsDefault.map(k => norm(r && r[k])).join(" ");

    if (quoted) {
      // match parola intera
      const re = buildWordBoundaryRegex(needleRaw.toLowerCase().trim());
      return re.test(hay);
    } else {
      // include
      return hay.includes(needle);
    }
  }

  // ========== recordMatchesQuery wrapper ==========
  try {
    const original = (typeof window.recordMatchesQuery === "function") ? window.recordMatchesQuery : null;
    window.recordMatchesQuery = function (r, q) {
      // Modalità "solo note esatte" sempre prioritaria
      if (window.__NOTE_SEARCH_ACTIVE) {
        const target = window.__NOTE_SEARCH_VALUE;
        const val = norm(r && (r.note ?? r.notesk ?? r.notes ?? r.osservazioni));
        return !!target && val === target;
      }
      // Altrimenti prova l'originale, poi fallback con supporto virgolette
      try {
        if (original) return original.call(this, r, q);
      } catch (e) {
        console.warn(LOG_PREFIX, "original recordMatchesQuery failed:", e);
      }
      return defaultMatcher(r, q);
    };
    console.log(LOG_PREFIX, original ? "wrapped recordMatchesQuery (note exact + quoted full-word)" : "defined recordMatchesQuery (fallback: note + quoted full-word).");
  } catch (e) {
    console.warn(LOG_PREFIX, "recordMatchesQuery patch error:", e);
  }

  // ========== Hook risultati per fallback filtro ==========
  try {
    window.addEventListener("search:results", (ev) => {
      const detail = ev && ev.detail;
      if (!detail || !Array.isArray(detail.results)) return;
      const q = detail.query || "";
      const filtered = detail.results.filter(r => window.recordMatchesQuery(r, q));

      // Facoltativo: priorità ai match parola intera quando l'utente usa virgolette
      const quoted = /^"(.*)"$/.test((q||"").trim());
      if (quoted) {
        const needleRaw = (q||"").trim().slice(1, -1).toLowerCase().trim();
        const re = buildWordBoundaryRegex(needleRaw);
        filtered.sort((a, b) => {
          const hayA = fieldsDefault.map(k => norm(a && a[k])).join(" ");
          const hayB = fieldsDefault.map(k => norm(b && b[k])).join(" ");
          const aFull = re.test(hayA) ? 1 : 0;
          const bFull = re.test(hayB) ? 1 : 0;
          return (bFull - aFull); // quelli con match pieno prima
        });
      }

      const out = new CustomEvent("search:results:filtered", { detail: { results: filtered, query: q }});
      window.dispatchEvent(out);
      console.log(LOG_PREFIX, `post-filter applicato (${filtered.length}/${detail.results.length}).`);
    });
  } catch (e) {
    console.warn(LOG_PREFIX, "post-filter hook error:", e);
  }

  // Inietta UI quando pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectNoteSearchUI);
  } else {
    injectNoteSearchUI();
  }
})();
