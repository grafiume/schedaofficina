
/*!
 * search-notes-addon.v1.js  (rev7 — clone-row template so native handlers work)
 * - I risultati Note vengono inseriti in #tableResults clonando la PRIMA riga esistente come template.
 *   Così manteniamo classi, markup e listener delegati (Apri/Modifica/Stato) identici all'app.
 * - Per ogni record:
 *     - settiamo data-id della <tr> e dei pulsanti interni (data-id / onclick / href se contengono UUID)
 *     - aggiorniamo le celle in base all'ordine colonne o ai data-field se presenti
 *     - se lo stato è un <select>, ne impostiamo il valore; se è un badge, aggiorniamo il testo
 * - "Rimuovi" ripristina il tbody originale.
 */
(function () {
  const LOG = "[notes-addon]";
  const $ = (s, ctx=document)=>ctx.querySelector(s);
  const $$ = (s, ctx=document)=>Array.from(ctx.querySelectorAll(s));
  const safe = (v)=> (v==null ? "" : String(v));
  const norm = (v)=> safe(v).toLowerCase().trim().replace(/\s+/g," ");
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  function resolveSupabase() {
    try {
      if (window.supabase?.from) return window.supabase;
      if (typeof window.getSupabase === "function") { const c = window.getSupabase(); if (c?.from) return c; }
      if (window.sb?.from) return window.sb;
      if (window.__supabase?.from) return window.__supabase;
      if (window.__supabaseClient?.from) return window.__supabaseClient;
    } catch(e) {}
    return null;
  }

  function fmtIT(d) {
    if (!d) return "";
    try {
      const date = (typeof d === "string") ? new Date(d) : d;
      if (isNaN(date)) return safe(d);
      const dd = String(date.getDate()).padStart(2,"0");
      const mm = String(date.getMonth()+1).padStart(2,"0");
      const yy = date.getFullYear();
      return `${dd}/${mm}/${yy}`;
    } catch(e){ return safe(d); }
  }

  // stato
  function setStateCell(td, statoText) {
    if (!td) return;
    const v = safe(statoText);
    // caso select
    const sel = td.querySelector("select");
    if (sel) {
      // prova valori tipici
      const map = {
        "in attesa":"in attesa",
        "attesa":"in attesa",
        "in lavorazione":"in lavorazione",
        "lavorazione":"in lavorazione",
        "completata":"completata",
        "chiusa":"completata",
        "chiuso":"completata"
      };
      let val = map[norm(v)] || v;
      // trova option best-match (case-insensitive)
      let found = false;
      for (const opt of sel.options) {
        if (norm(opt.value) === norm(val) || norm(opt.textContent) === norm(val)) {
          sel.value = opt.value; found = true; break;
        }
      }
      if (!found && sel.options.length) sel.value = sel.options[0].value;
      sel.dispatchEvent(new Event("change",{bubbles:true})); // lascia che l'app aggiorni badge ecc.
      return;
    }
    // caso badge/testo
    const badge = td.querySelector(".badge, .status-badge");
    if (badge) badge.textContent = v || "—";
    else td.textContent = v || "—";
  }

  function setCellText(td, html) {
    if (!td) return;
    td.innerHTML = html;
  }

  function escapeHtml(s) {
    return safe(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // backup originale per ripristino
  window.__NOTE_SEARCH_BACKUP_HTML = window.__NOTE_SEARCH_BACKUP_HTML || "";

  // UI injection (se non già presente)
  function ensureUI() {
    if ($("#noteExactBox")) return;
    const host = $("#page-search"); if (!host) return;
    const box = document.createElement("div");
    box.id = "noteExactBox";
    box.className = "card mb-2";
    box.innerHTML = `
      <div class="card-header py-2 d-flex justify-content-between align-items-center">
        <span>Ricerca Note (match esatto)</span>
        <div class="note-banner small text-muted"></div>
      </div>
      <div class="card-body py-2">
        <div class="row g-2 align-items-center">
          <div class="col-md-8">
            <input id="qNoteExact" class="form-control" placeholder="Note (match esatto) — es. na → solo 'na' non 'nato'">
          </div>
          <div class="col-md-2 d-grid"><button id="btnNoteExact" class="btn btn-primary" type="button">Cerca Note</button></div>
          <div class="col-md-2 d-grid"><button id="btnNoteClear" class="btn btn-outline-secondary" type="button">Rimuovi</button></div>
        </div>
        <div class="small text-muted mt-2">I risultati popolano la tabella sottostante mantenendo **Apri/Modifica** e il menu **Stato** dell'app.</div>
      </div>`;
    host.insertBefore(box, host.firstElementChild);
    $("#btnNoteExact").addEventListener("click", onSearch);
    $("#btnNoteClear").addEventListener("click", restoreTable);
    $("#qNoteExact").addEventListener("keydown", e => { if (e.key==="Enter"){ e.preventDefault(); onSearch(); } });
  }

  function banner(text) {
    const b = $("#noteExactBox .note-banner");
    if (b) b.textContent = text || "";
  }

  // trova template row: prima riga "reale" del tbody
  function getTemplateRow() {
    const tbl = $("#tableResults"); if (!tbl) return null;
    const tr = tbl.querySelector("tbody tr");
    return tr ? tr.cloneNode(true) : null;
  }

  function assignIdEverywhere(tr, id) {
    if (!tr) return;
    tr.dataset.id = id;
    // in pulsanti/link interni
    $$("a,button", tr).forEach(el => {
      el.setAttribute("data-id", id);
      // aggiorna href/onclick se contengono un uuid
      const href = el.getAttribute("href");
      if (href && UUID_RE.test(href)) el.setAttribute("href", href.replace(UUID_RE, id));
      const onclk = el.getAttribute("onclick");
      if (onclk && UUID_RE.test(onclk)) el.setAttribute("onclick", onclk.replace(UUID_RE, id));
    });
  }

  function fillRowFromRecord(templateTr, r) {
    const tr = templateTr.cloneNode(true);
    const tds = [...tr.children];
    // supponiamo ordine colonne come: Foto, Descrizione/Modello, Cliente, Telefono, Arrivo, Accettazione, Scadenza, Stato, Azioni
    // 0 Foto
    const img = safe(r.image_url);
    if (tds[0]) {
      const imgel = tds[0].querySelector("img");
      if (imgel) imgel.src = img || "";
      else tds[0].innerHTML = img ? `<img src="${escapeHtml(img)}" style="width:64px;height:48px;object-fit:cover;border-radius:6px">` : tds[0].innerHTML;
    }
    // 1 Descrizione + numero + note
    const numero = safe(r.numero||"");
    const descr = safe(r.descrizione || r.modello || "");
    const note = safe(r.note || "");
    if (tds[1]) {
      const main = `<div class="fw-semibold">${escapeHtml(descr||"—")}</div>` +
                   (numero ? `<div class="small text-muted">#${escapeHtml(numero)}</div>` : "") +
                   (note ? `<div class="small">Note: <strong>${escapeHtml(note)}</strong></div>` : "");
      setCellText(tds[1], main);
    }
    // 2 Cliente
    if (tds[2]) setCellText(tds[2], `<div>${escapeHtml(safe(r.cliente)||"—")}</div>`);
    // 3 Telefono
    if (tds[3]) setCellText(tds[3], `<div>${escapeHtml(safe(r.telefono)||"—")}</div>`);
    // 4,5,6 Date
    if (tds[4]) setCellText(tds[4], escapeHtml(fmtIT(r.dataArrivo || r.dataarrivo || r.dataApertura)));
    if (tds[5]) setCellText(tds[5], escapeHtml(fmtIT(r.dataAccettazione)));
    if (tds[6]) setCellText(tds[6], escapeHtml(fmtIT(r.dataScadenza)));
    // 7 Stato
    if (tds[7]) setStateCell(tds[7], safe(r.statoPratica || r.stato || ""));
    return tr;
  }

  function setTableRowsClone(out) {
    const tbl = $("#tableResults"); if (!tbl) return false;
    const tbody = tbl.querySelector("tbody"); if (!tbody) return false;
    if (!window.__NOTE_SEARCH_BACKUP_HTML) window.__NOTE_SEARCH_BACKUP_HTML = tbody.innerHTML;

    const tmpl = getTemplateRow();
    if (!tmpl) { console.warn(LOG, "Template row non trovata."); return false; }

    const frag = document.createDocumentFragment();
    out.forEach(r => {
      const tr = fillRowFromRecord(tmpl, r);
      assignIdEverywhere(tr, safe(r.id));
      frag.appendChild(tr);
    });
    tbody.innerHTML = "";
    tbody.appendChild(frag);

    // trigger evento custom per permettere all'app di ricollegare eventuali listener per riga
    window.dispatchEvent(new CustomEvent("table:note-results:rendered", { detail: { count: out.length } }));

    console.log(LOG, `inserite ${out.length} righe clonate (con handler nativi).`);
    return true;
  }

  async function onSearch() {
    const raw = safe($("#qNoteExact")?.value).trim();
    if (!raw) return;
    const sb = resolveSupabase();
    if (!sb) { banner("Client Supabase non trovato."); return; }
    try {
      let data = null;
      let res = await sb.from("records").select("*").eq("note", raw);
      data = res.data;
      if (!data || !data.length) {
        res = await sb.from("records").select("*").ilike("note", raw);
        data = res.data;
      }
      const target = norm(raw);
      const out = (data||[]).filter(r => norm(r && r.note) === target);
      banner(`note = "${raw}" — risultati: ${out.length}`);
      if (!setTableRowsClone(out)) banner("Impossibile popolare la tabella (manca template).");
    } catch(e) {
      console.warn(LOG, e);
      banner("Errore nella query.");
    }
  }

  function restoreTable() {
    const tbl = $("#tableResults"); if (!tbl) return;
    const tbody = tbl.querySelector("tbody"); if (!tbody) return;
    if (window.__NOTE_SEARCH_BACKUP_HTML) {
      tbody.innerHTML = window.__NOTE_SEARCH_BACKUP_HTML;
      window.__NOTE_SEARCH_BACKUP_HTML = "";
      banner("");
      // rilancia eventuale init dell'app
      window.dispatchEvent(new Event("table:restored"));
      const btn = $("#btnDoSearch"); if (btn) btn.click();
      console.log(LOG, "Tabella ripristinata.");
    }
  }

  // bootstrap
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureUI);
  } else {
    ensureUI();
  }
})();
