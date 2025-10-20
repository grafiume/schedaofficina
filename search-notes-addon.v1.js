
/*!
 * search-notes-addon.v1.js  (rev6 — render in tabella principale con Azioni)
 * - Pannello Note (match esatto) resta in alto per digitare.
 * - I risultati vengono mostrati direttamente dentro #tableResults (tbody),
 *   con le stesse colonne: Foto | Descr/Modello | Cliente | Telefono | Date | Stato | Azioni
 * - Bottoni "Apri" / "Modifica" funzionano:
 *     - se esiste window.openRecord(id) o window.editRecord(id), li usiamo
 *     - altrimenti emettiamo eventi "record:open" / "record:edit" con {id}
 * - "Rimuovi" ripristina la lista originale riusando il flusso di ricerca generale (click su #btnDoSearch)
 */
(function () {
  const LOG_PREFIX = "[notes-addon]";
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const safeStr = (v) => (v == null ? "" : String(v));
  const norm = (v) => safeStr(v).toLowerCase().trim().replace(/\s+/g, " ");

  function resolveSupabase() {
    try {
      if (window.supabase?.from) return window.supabase;
      if (typeof window.getSupabase === "function") { const c = window.getSupabase(); if (c?.from) return c; }
      if (window.sb?.from) return window.sb;
      if (window.__supabase?.from) return window.__supabase;
      if (window.__supabaseClient?.from) return window.__supabaseClient;
    } catch (e) {}
    return null;
  }

  function fmtIT(d) {
    if (!d) return "";
    try {
      const date = (typeof d === "string") ? new Date(d) : d;
      if (isNaN(date)) return safeStr(d);
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yyyy = date.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch(e){ return safeStr(d); }
  }

  function badgeForState(st) {
    const v = (st||"").toLowerCase();
    let cls = "secondary";
    if (v.includes("in attesa") || v === "attesa") cls = "warning";
    else if (v.includes("in lavorazione")) cls = "info";
    else if (v.includes("chius") || v.includes("complet")) cls = "success";
    else if (v.includes("non")) cls = "secondary";
    return `<span class="badge text-bg-${cls}">${escapeHtml(st || "—")}</span>`;
  }

  function imgCell(url) {
    const u = safeStr(url);
    const src = u ? u : "";
    const img = src ? `<img src="${escapeAttr(src)}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:6px">` :
                      `<div class="bg-light border" style="width:64px;height:48px;border-radius:6px"></div>`;
    return img;
  }

  function escapeHtml(s) {
    return safeStr(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

  // Stato modalità "solo note"
  window.__NOTE_SEARCH_ACTIVE = false;
  window.__NOTE_SEARCH_VALUE = "";
  window.__NOTE_SEARCH_BACKUP_HTML = ""; // backup tbody per ripristino

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

  function ensureResultsBanner(rawQuery, diag) {
    const host = $("#noteExactBox .note-banner");
    if (!host) return;
    host.innerHTML = `<div class="small text-muted">Vista filtrata: <code>note = "${escapeHtml(rawQuery)}"</code> (match esatto). ${diag?escapeHtml(diag):""}</div>`;
  }

  function setTableRows(data) {
    const tbl = $("#tableResults");
    if (!tbl) {
      console.warn(LOG_PREFIX, "#tableResults non trovato, mostro nel pannello compatto.");
      return false;
    }
    const tbody = tbl.querySelector("tbody");
    if (!tbody) return false;

    if (!window.__NOTE_SEARCH_BACKUP_HTML) {
      window.__NOTE_SEARCH_BACKUP_HTML = tbody.innerHTML; // salva
    }

    const rows = (data||[]).map(r => {
      const id = safeStr(r.id);
      const numero = safeStr(r.numero || "");
      const descr = safeStr(r.descrizione || r.modello || "");
      const modello = safeStr(r.modello || "");
      const cliente = safeStr(r.cliente || "");
      const tel = safeStr(r.telefono || "");
      const dArr = fmtIT(r.dataArrivo || r.dataarrivo || r.data_apertura || r.dataApertura);
      const dAcc = fmtIT(r.dataAccettazione || r.data_accettazione);
      const dScad = fmtIT(r.dataScadenza || r.data_scadenza);
      const stato = safeStr(r.statoPratica || r.stato || "");
      const note = safeStr(r.note || "");
      const foto = imgCell(r.image_url);

      const descFull = descr || modello || "—";
      const numeroLine = numero ? `<div class="small text-muted">#${escapeHtml(numero)}</div>` : "";
      const noteLine = note ? `<div class="small">Note: <strong>${escapeHtml(note)}</strong></div>` : "";

      return `
        <tr data-id="${escapeAttr(id)}">
          <td class="align-middle">${foto}</td>
          <td class="align-middle">
            <div class="fw-semibold">${escapeHtml(descFull)}</div>
            ${numeroLine}
            ${noteLine}
          </td>
          <td class="align-middle"><div>${escapeHtml(cliente || "—")}</div></td>
          <td class="align-middle"><div>${escapeHtml(tel || "—")}</div></td>
          <td class="align-middle">${escapeHtml(dArr)}</td>
          <td class="align-middle">${escapeHtml(dAcc)}</td>
          <td class="align-middle">${escapeHtml(dScad)}</td>
          <td class="align-middle">${badgeForState(stato)}</td>
          <td class="align-middle">
            <div class="d-flex gap-1">
              <button type="button" class="btn btn-sm btn-outline-primary btn-open" data-id="${escapeAttr(id)}">Apri</button>
              <button type="button" class="btn btn-sm btn-outline-success btn-edit" data-id="${escapeAttr(id)}">Modifica</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="9" class="text-center text-muted py-4">Nessun risultato per questa nota.</td></tr>`;

    // Collega azioni ai possibili handler globali
    tbody.querySelectorAll(".btn-open").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (typeof window.openRecord === "function") return window.openRecord(id);
        window.dispatchEvent(new CustomEvent("record:open", { detail: { id } }));
      });
    });
    tbody.querySelectorAll(".btn-edit").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (typeof window.editRecord === "function") return window.editRecord(id);
        window.dispatchEvent(new CustomEvent("record:edit", { detail: { id } }));
      });
    });

    console.log(LOG_PREFIX, `inserite ${data.length} righe in #tableResults`);
    return true;
  }

  function restoreTable() {
    const tbl = $("#tableResults");
    if (!tbl) return;
    const tbody = tbl.querySelector("tbody");
    if (!tbody) return;
    if (window.__NOTE_SEARCH_BACKUP_HTML) {
      tbody.innerHTML = window.__NOTE_SEARCH_BACKUP_HTML;
      window.__NOTE_SEARCH_BACKUP_HTML = "";
      console.log(LOG_PREFIX, "ripristinata tabella originale.");
    } else {
      // fallback: rilancia ricerca generale
      const btn = $("#btnDoSearch");
      if (btn) btn.click();
    }
  }

  // ========== UI Injection ==========
  function injectNoteSearchUI() {
    const host = $("#page-search");
    if (!host) return console.warn(LOG_PREFIX, "#page-search non trovato, UI note non iniettata.");
    if ($("#noteExactBox", host)) return;

    const box = document.createElement("div");
    box.id = "noteExactBox";
    box.className = "card mb-2";
    box.innerHTML = [
      '<div class="card-header py-2 d-flex justify-content-between align-items-center">',
      '  <span>Ricerca Note (match esatto)</span>',
      '  <div class="note-banner small text-muted"></div>',
      '</div>',
      '<div class="card-body py-2">',
      '  <div class="row g-2 align-items-center">',
      '    <div class="col-md-8">',
      '      <input id="qNoteExact" class="form-control" placeholder="Note (match esatto) — es. na → solo &quot;na&quot; non &quot;nato&quot;">',
      '    </div>',
      '    <div class="col-md-2 d-grid"><button id="btnNoteExact" class="btn btn-primary" type="button">Cerca Note</button></div>',
      '    <div class="col-md-2 d-grid"><button id="btnNoteClear" class="btn btn-outline-secondary" type="button">Rimuovi</button></div>',
      '  </div>',
      '  <div class="small text-muted mt-2">I risultati vengono mostrati nella tabella sottostante con **Azioni** “Apri / Modifica”.</div>',
      '</div>'
    ].join("");

    // Inserisci in alto nel container Ricerca
    const head = host.firstElementChild;
    host.insertBefore(box, head);

    const input = $("#qNoteExact", box);
    const btnGo = $("#btnNoteExact", box);
    const btnClr = $("#btnNoteClear", box);

    btnGo?.addEventListener("click", async () => {
      const raw = (input.value || "").trim();
      activateNoteExactMode(raw);
      if (!raw) return;

      const sb = resolveSupabase();
      if (!sb) {
        ensureResultsBanner(raw, "Client Supabase non trovato.");
        setTableRows([]);
        return;
      }
      try {
        // eq → ilike (senza wildcard) → post filtro
        let diag = "";
        let data = null, error = null;
        ({ data, error } = await sb.from("records").select("*").eq("note", raw));
        diag += `eq(note,"${raw}")→${(data&&data.length)||0}; `;
        if (!error && (!data || data.length === 0)) {
          const res2 = await sb.from("records").select("*").ilike("note", raw);
          data = res2.data;
          diag += `ilike(note,"${raw}")→${(data&&data.length)||0}; `;
        }
        const target = norm(raw);
        const out = (data || []).filter(r => norm(r && r.note) === target);

        ensureResultsBanner(raw, diag + `post=${out.length}`);
        if (!setTableRows(out)) {
          // fallback (non dovrebbe servire su schedaofficina): pannello semplice
          console.warn(LOG_PREFIX, "fallback rendering non implementato perché è richiesto #tableResults");
        }
      } catch(e) {
        console.warn(LOG_PREFIX, "Errore query note:", e);
        ensureResultsBanner(raw, "Errore durante la query.");
        setTableRows([]);
      }
    });

    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); btnGo?.click(); }
    });

    btnClr?.addEventListener("click", () => {
      input.value = "";
      deactivateNoteExactMode();
      ensureResultsBanner("", "");
      restoreTable();
    });

    console.log(LOG_PREFIX, "UI Note (match esatto) pronta (rev6).");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", injectNoteSearchUI);
  else injectNoteSearchUI();
})();
