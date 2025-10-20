
/*!
 * search-notes-addon.v1.js  (rev3, strict note-only)
 * Cambiamenti principali:
 * - La ricerca "Note (match esatto)" NON richiama più il flusso di ricerca generale dell'app.
 * - Se disponibile Supabase, usa .ilike('note', value) SENZA wildcard per un match esatto case-insensitive.
 * - I risultati vengono renderizzati in un pannello dedicato dentro la card delle Note.
 * - Rimuovi = cancella pannello e disattiva modalità, senza toccare altri risultati.
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

  function ensureResultsBox() {
    const box = $("#noteExactBox");
    if (!box) return null;
    let res = $("#noteExactResults", box);
    if (!res) {
      res = document.createElement("div");
      res.id = "noteExactResults";
      res.className = "card-body pt-2";
      box.appendChild(res);
    }
    return res;
  }

  function renderResults(data, rawQuery) {
    const res = ensureResultsBox();
    if (!res) return;
    const arr = Array.isArray(data) ? data : [];
    if (!arr.length) {
      res.innerHTML = `<div class="alert alert-warning my-2">Nessun record con <strong>note = "${escapeHtml(rawQuery)}"</strong>.</div>`;
      return;
    }
    // Render compatto con campi utili
    const rows = arr.map(r => {
      const id = safeStr(r.id);
      const numero = safeStr(r.numero || "");
      const cliente = safeStr(r.cliente || "");
      const descrizione = safeStr(r.descrizione || "");
      const note = safeStr(r.note || "");
      const stato = safeStr(r.statoPratica || r.stato || "");
      const dataArrivo = safeStr(r.dataArrivo || "");
      return `
        <div class="border rounded p-2 mb-2">
          <div class="d-flex justify-content-between">
            <div class="fw-semibold">${cliente || "(cliente n/d)"} <span class="text-muted">#${numero || id.slice(0,8)}</span></div>
            <div class="badge text-bg-secondary">${stato || "—"}</div>
          </div>
          <div class="small text-muted">${descrizione || "—"}</div>
          <div>Note: <strong>${escapeHtml(note)}</strong></div>
          <div class="small text-muted">Arrivo: ${escapeHtml(safeStr(dataArrivo))}</div>
        </div>
      `;
    }).join("");

    res.innerHTML = `
      <div class="mt-2">
        <div class="small text-muted mb-2">Vista filtrata: <code>note = "${escapeHtml(rawQuery)}"</code> (match esatto, case-insensitive)</div>
        ${rows}
      </div>
    `;
  }

  function clearResults() {
    const box = $("#noteExactBox");
    const res = $("#noteExactResults", box);
    if (res) res.innerHTML = "";
  }

  function escapeHtml(s) {
    return safeStr(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
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
      '    <div class="col-md-2 d-grid"><button id="btnNoteExact" class="btn btn-primary" type="button">Cerca Note</button></div>',
      '    <div class="col-md-2 d-grid"><button id="btnNoteClear" class="btn btn-outline-secondary" type="button">Rimuovi</button></div>',
      '  </div>',
      '  <div class="small text-muted mt-2">Case-insensitive. Non usa la ricerca generale, mostra qui i risultati esatti su <code>note</code>.</div>',
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

    btnGo?.addEventListener("click", async () => {
      const raw = (input.value || "").trim();
      activateNoteExactMode(raw);
      clearResults();
      if (!raw) return;

      if (hasSupabase) {
        try {
          // ilike senza wildcard → uguaglianza case-insensitive
          const { data, error } = await window.supabase
            .from("records")
            .select("*")
            .ilike("note", raw);
          if (error) throw error;
          // Sicurezza extra: filtro client per coerenza (spazi/normalizzazione)
          const target = norm(raw);
          const out = (data || []).filter(r => norm(r && r.note) === target);
          renderResults(out, raw);
          return;
        } catch (e) {
          console.warn(LOG_PREFIX, "Supabase ilike(note) fallita:", e);
          renderResults([], raw);
          return;
        }
      } else {
        // Nessun supabase disponibile → impossibile garantire risultati corretti
        renderResults([], raw);
        return;
      }
    });

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnGo?.click();
      }
    });

    btnClr?.addEventListener("click", () => {
      input.value = "";
      deactivateNoteExactMode();
      clearResults();
    });

    console.log(LOG_PREFIX, "UI Note (match esatto) iniettata. Supabase:", hasSupabase ? "OK" : "NO");
  }

  // ========== Ricerca generale: opzionale supporto quote per parola intera ==========
  // (rimane disponibile ma indipendente dalla ricerca Note)
  function buildWordBoundaryRegex(needle) {
    const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      const re = buildWordBoundaryRegex(needleRaw.toLowerCase().trim());
      return re.test(hay);
    } else {
      return hay.includes(needle);
    }
  }
  try {
    const original = (typeof window.recordMatchesQuery === "function") ? window.recordMatchesQuery : null;
    window.recordMatchesQuery = function (r, q) {
      if (window.__NOTE_SEARCH_ACTIVE) {
        const target = window.__NOTE_SEARCH_VALUE;
        const val = norm(r && (r.note ?? r.notesk ?? r.notes ?? r.osservazioni));
        return !!target && val === target;
      }
      try { if (original) return original.call(this, r, q); } catch (e) {
        console.warn(LOG_PREFIX, "original recordMatchesQuery failed:", e);
      }
      return defaultMatcher(r, q);
    };
  } catch (e) {
    console.warn(LOG_PREFIX, "recordMatchesQuery patch error:", e);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectNoteSearchUI);
  } else {
    injectNoteSearchUI();
  }
})();
