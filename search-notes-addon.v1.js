
/*!
 * search-notes-addon.v1.js  (rev8 — lock render + strict actions)
 * - Mostra risultati Note nella tabella principale CLONANDO la prima riga (template).
 * - Mentre la modalità Note è attiva: blocca render esterni (renderSearch, renderArchiveLocal, refreshDashboard, renderTable, renderArchive).
 * - Protegge il tbody con MutationObserver; se altri script lo cambiano, ripristina i risultati Note.
 * - Bottoni "Apri/Modifica": click intercettato (preventDefault/stopPropagation) e inoltrato a openRecord/editRecord(id) se presenti
 *   o eventi custom; mai usare indice di riga.
 * - Selezione stato: assegna data-id al <select> ed evita derivazioni basate su indice.
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

  function setStateCell(td, statoText, id) {
    if (!td) return;
    const v = safe(statoText);
    const sel = td.querySelector("select");
    if (sel) {
      sel.setAttribute("data-id", id);
      const goal = norm(v);
      let picked = false;
      for (const opt of sel.options) {
        if (norm(opt.value) === goal || norm(opt.textContent) === goal) {
          sel.value = opt.value; picked = true; break;
        }
      }
      if (!picked && sel.options.length) sel.value = sel.options[0].value;
      return;
    }
    const badge = td.querySelector(".badge, .status-badge");
    if (badge) badge.textContent = v || "—"; else td.textContent = v || "—";
  }

  function escapeHtml(s) {
    return safe(s).replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ===== LOCK esterni =====
  const WRAPPABLE = ["renderSearch","renderArchiveLocal","refreshDashboard","renderTable","renderArchive"];
  const ORIGINALS = {};
  function setRenderLock(enabled) {
    WRAPPABLE.forEach(name => {
      const fn = window[name];
      if (typeof fn === "function") {
        if (enabled) {
          if (!ORIGINALS[name]) {
            ORIGINALS[name] = fn;
            window[name] = function(...args){
              if (window.__NOTE_SEARCH_ACTIVE) {
                console.log(LOG, `blocca ${name} mentre modalità Note attiva`);
                return;
              }
              return ORIGINALS[name].apply(this, args);
            };
          }
        } else {
          if (ORIGINALS[name]) {
            window[name] = ORIGINALS[name];
            delete ORIGINALS[name];
          }
        }
      }
    });
  }

  // ===== MutationObserver =====
  let MO = null;
  function startObserver(cacheHTML) {
    const tbl = $("#tableResults"); if (!tbl) return;
    const tbody = tbl.querySelector("tbody"); if (!tbody) return;
    stopObserver();
    MO = new MutationObserver(() => {
      if (!window.__NOTE_SEARCH_ACTIVE) return;
      if (window.__NOTE_LAST_ROWS) {
        tbody.innerHTML = window.__NOTE_LAST_ROWS;
        wireActions(tbody);
        console.log(LOG, "ripristino righe Note (observer).");
      } else if (cacheHTML) {
        tbody.innerHTML = cacheHTML;
      }
    });
    MO.observe(tbody, { childList: true, subtree: true });
  }
  function stopObserver(){ if (MO){ MO.disconnect(); MO = null; } }

  // ===== Template e wiring =====
  function getTemplateRow() {
    const tbl = $("#tableResults"); if (!tbl) return null;
    const tr = tbl.querySelector("tbody tr");
    return tr ? tr.cloneNode(true) : null;
  }

  function assignIdEverywhere(tr, id) {
    tr.dataset.id = id;
    tr.setAttribute("data-record-id", id);
    $$("a,button,select,input", tr).forEach(el => {
      el.setAttribute("data-id", id);
      el.setAttribute("data-record-id", id);
      const href = el.getAttribute("href");
      if (href && UUID_RE.test(href)) el.setAttribute("href", href.replace(UUID_RE, id));
      const onclk = el.getAttribute("onclick");
      if (onclk && UUID_RE.test(onclk)) el.setAttribute("onclick", onclk.replace(UUID_RE, id));
    });
  }

  function fillRow(templateTr, r) {
    const tr = templateTr.cloneNode(true);
    const tds = [...tr.children];
    const id = safe(r.id);

    try {
      const img = safe(r.image_url);
      const imgel = tds[0]?.querySelector("img");
      if (imgel) imgel.src = img || imgel.src;
    } catch(e){}

    try {
      const numero = safe(r.numero||"");
      const descr = safe(r.descrizione || r.modello || "");
      const note = safe(r.note || "");
      const block = tds[1];
      if (block) {
        const title = block.querySelector(".fw-semibold, .title, .desc");
        if (title) title.textContent = descr || "—";
        else block.innerHTML = `<div class="fw-semibold">${escapeHtml(descr||"—")}</div>`;
        const numEl = block.querySelector(".small.text-muted, .num, .numero");
        if (numEl) numEl.textContent = numero ? `#${numero}` : "";
        else if (numero) block.insertAdjacentHTML("beforeend", `<div class="small text-muted">#${escapeHtml(numero)}</div>`);
        const noteEl = block.querySelector(".note-line");
        if (noteEl) noteEl.innerHTML = note ? `Note: <strong>${escapeHtml(note)}</strong>` : "";
        else if (note) block.insertAdjacentHTML("beforeend", `<div class="small note-line">Note: <strong>${escapeHtml(note)}</strong></div>`);
      }
    } catch(e){}

    if (tds[2]) { const el = tds[2].querySelector(".cliente, div, span") || tds[2]; el.textContent = safe(r.cliente || "—"); }
    if (tds[3]) { const el = tds[3].querySelector(".telefono, div, span") || tds[3]; el.textContent = safe(r.telefono || "—"); }
    if (tds[4]) tds[4].textContent = fmtIT(r.dataArrivo || r.dataarrivo || r.dataApertura);
    if (tds[5]) tds[5].textContent = fmtIT(r.dataAccettazione);
    if (tds[6]) tds[6].textContent = fmtIT(r.dataScadenza);
    setStateCell(tds[7], safe(r.statoPratica || r.stato || ""), id);

    assignIdEverywhere(tr, id);
    return tr;
  }

  function wireActions(tbody) {
    tbody.querySelectorAll(".btn, a").forEach(el => {
      const isAction = /\b(Apri|Modifica)\b/i.test(el.textContent||"") || el.classList.contains("btn-open") || el.classList.contains("btn-edit");
      if (!isAction) return;
      el.addEventListener("click", (e) => {
        const id = el.getAttribute("data-id") || el.getAttribute("data-record-id");
        if (!id) return;
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        if (/modifica/i.test(el.textContent||"") || el.classList.contains("btn-edit")) {
          if (typeof window.editRecord === "function") window.editRecord(id);
          else window.dispatchEvent(new CustomEvent("record:edit", { detail: { id } }));
        } else {
          if (typeof window.openRecord === "function") window.openRecord(id);
          else window.dispatchEvent(new CustomEvent("record:open", { detail: { id } }));
        }
      }, { capture: true });
    });

    tbody.querySelectorAll("select").forEach(sel => {
      if (!sel.getAttribute("data-id")) {
        const tr = sel.closest("tr");
        const id = tr?.getAttribute("data-id") || tr?.getAttribute("data-record-id");
        if (id) sel.setAttribute("data-id", id);
      }
    });
  }

  function renderIntoTable(records) {
    const tbl = $("#tableResults"); if (!tbl) return false;
    const tbody = tbl.querySelector("tbody"); if (!tbody) return false;

    if (!window.__NOTE_SEARCH_BACKUP_HTML) window.__NOTE_SEARCH_BACKUP_HTML = tbody.innerHTML;

    const tmpl = getTemplateRow();
    if (!tmpl) return false;

    const frag = document.createDocumentFragment();
    records.forEach(r => frag.appendChild(fillRow(tmpl, r)));
    tbody.innerHTML = "";
    tbody.appendChild(frag);
    window.__NOTE_LAST_ROWS = tbody.innerHTML;
    wireActions(tbody);
    startObserver(window.__NOTE_SEARCH_BACKUP_HTML);
    return true;
  }

  async function doSearch(raw) {
    const sb = resolveSupabase();
    if (!sb) return { out: [], diag: "no supabase" };
    let data = null, diag = "";
    let res = await sb.from("records").select("*").eq("note", raw);
    data = res.data; diag += `eq→${(data&&data.length)||0};`;
    if (!data || !data.length) {
      res = await sb.from("records").select("*").ilike("note", raw);
      data = res.data; diag += `ilike→${(data&&data.length)||0};`;
    }
    const target = norm(raw);
    const out = (data||[]).filter(r => norm(r && r.note) === target);
    return { out, diag };
  }

  function banner(text) {
    const b = $("#noteExactBox .note-banner");
    if (b) b.textContent = text || "";
  }

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
        <div class="small text-muted mt-2">I risultati popolano la tabella sottostante mantenendo Apri/Modifica e il menu Stato.</div>
      </div>`;
    host.insertBefore(box, host.firstElementChild);

    $("#btnNoteExact").addEventListener("click", async () => {
      const raw = safe($("#qNoteExact")?.value).trim();
      if (!raw) return;
      window.__NOTE_SEARCH_ACTIVE = true;
      setRenderLock(true);
      const { out, diag } = await doSearch(raw);
      banner(`note = "${raw}" — risultati: ${out.length} (${diag} post=${out.length})`);
      renderIntoTable(out);
    });

    $("#btnNoteClear").addEventListener("click", () => {
      window.__NOTE_SEARCH_ACTIVE = false;
      setRenderLock(false);
      stopObserver();
      banner("");
      const tbl = $("#tableResults"); if (!tbl) return;
      const tbody = tbl.querySelector("tbody"); if (!tbody) return;
      if (window.__NOTE_SEARCH_BACKUP_HTML) {
        tbody.innerHTML = window.__NOTE_SEARCH_BACKUP_HTML;
        window.__NOTE_SEARCH_BACKUP_HTML = "";
        window.__NOTE_LAST_ROWS = "";
      }
      const btn = $("#btnDoSearch"); if (btn) btn.click();
    });

    $("#qNoteExact").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); $("#btnNoteExact").click(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureUI);
  else ensureUI();
})();
