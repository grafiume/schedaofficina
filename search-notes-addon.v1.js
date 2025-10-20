
/*!
 * search-notes-addon.v1.js  (rev4, robust client detect + strict exact)
 * - Rileva il client Supabase anche se esposto via getSupabase(), sb, __supabaseClient, ecc.
 * - Query in ordine: eq('note', raw) → ilike('note', raw) → filtro client norm-equal.
 * - UI risultati autonoma, zero dipendenze dal renderer dell'app.
 * - NESSUNA modifica a index.html necessaria.
 */
(function () {
  const LOG_PREFIX = "[notes-addon]";
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).toLowerCase().trim().replace(/\s+/g, " ");

  function resolveSupabase() {
    try {
      if (window.supabase && typeof window.supabase.from === "function") return window.supabase;
      if (typeof window.getSupabase === "function") {
        const c = window.getSupabase();
        if (c && typeof c.from === "function") return c;
      }
      if (window.sb && typeof window.sb.from === "function") return window.sb;
      if (window.__supabase && typeof window.__supabase.from === "function") return window.__supabase;
      if (window.__supabaseClient && typeof window.__supabaseClient.from === "function") return window.__supabaseClient;
    } catch (e) {}
    return null;
  }

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

  function renderStatus(msg, type="secondary") {
    const res = ensureResultsBox();
    if (!res) return;
    res.innerHTML = `<div class="alert alert-${type} my-2">${msg}</div>`;
  }

  function renderResults(data, rawQuery, diag) {
    const res = ensureResultsBox();
    if (!res) return;
    const arr = Array.isArray(data) ? data : [];
    if (!arr.length) {
      res.innerHTML = `<div class="alert alert-warning my-2">Nessun record con <strong>note = "${escapeHtml(rawQuery)}"</strong>.</div>`
        + (diag ? `<div class="small text-muted">${diag}</div>` : "");
      return;
    }
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
        ${diag ? `<div class="small text-muted mt-2">${diag}</div>` : ""}
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
      '  <div class="small text-muted mt-2">Case-insensitive. Ricerca dedicata su <code>note</code>, indipendente dalla ricerca generale.</div>',
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

      const sb = resolveSupabase();
      if (!sb) {
        renderStatus('Nessun client Supabase rilevato. Verifica che il client sia esposto come <code>window.supabase</code> o <code>window.getSupabase()</code>.', "danger");
        return;
      }

      try {
        // Step 1: eq — match esatto case-sensitive sul DB
        let diag = "";
        let data = null, error = null;

        ({ data, error } = await sb.from("records").select("*").eq("note", raw));
        diag += `Query: eq(note, "${escapeHtml(raw)}") → ${(data && data.length) || 0} risultati. `;
        if (error) diag += `Errore eq: ${escapeHtml(safeStr(error.message))}. `;

        // Step 2: se eq non trova nulla, prova ilike (case-insensitive) senza wildcard
        if (!error && (!data || data.length === 0)) {
          let res2 = await sb.from("records").select("*").ilike("note", raw);
          data = res2.data;
          if (res2.error) diag += `Errore ilike: ${escapeHtml(safeStr(res2.error.message))}. `;
          else diag += `Query: ilike(note, "${escapeHtml(raw)}") → ${(data && data.length) || 0} risultati. `;
        }

        // Step 3: filtro client rigoroso (norm equality), utile se nel DB compaiono spazi o maiuscole/minuscole
        const target = norm(raw);
        const out = (data || []).filter(r => norm(r && r.note) === target);

        renderResults(out, raw, diag + ` | Post-filtro (norm eq) → ${out.length} risultati.`);
      } catch (e) {
        console.warn(LOG_PREFIX, "Errore ricerca note:", e);
        renderStatus("Errore durante la ricerca. Dettagli console.", "danger");
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

    const sb = resolveSupabase();
    console.log(LOG_PREFIX, "UI Note (match esatto) iniettata. Supabase:", sb ? "OK" : "NO");
  }

  // ========== Ricerca generale (opzionale) ==========
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
