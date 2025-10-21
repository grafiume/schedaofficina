// UI logic & bindings
(function () {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const fmtDate = (s) => (s || "").slice(0,10);

  // Elements
  const pageHome = $("#page-home");
  const pageSearch = $("#page-search");
  const listHome = $("#listHome");
  const listSearch = $("#list");
  const kpiTot = $("#kpiTot"), kpiAttesa=$("#kpiAttesa"), kpiLav=$("#kpiLav"), kpiChiuse=$("#kpiChiuse");

  const btnHome = $("#btnHome");
  const btnSearchPage = $("#btnSearchPage");
  const btnNew = $("#btnNew");

  const q = $("#q"); const qCol = $("#qCol");
  const btnDoSearch = $("#btnDoSearch");
  const btnClearFilter = $("#btnClearFilter");
  const btnBackHome = $("#btnBackHome");
  const activeFilterBox = $("#activeFilterBox"); const activeFilterLabel = $("#activeFilterLabel");

  const detail = $("#detailPanel");
  const btnCloseDetail = $("#btnCloseDetail");
  const btnSave = $("#btnSave");
  const btnDelete = $("#btnDelete");
  const statusBadge = $("#statusBadge");
  const detailTitle = $("#detailTitle");

  const f = {
    id:null, cliente:$("#cliente"), telefono:$("#telefono"),
    marca:$("#marca"), modello:$("#modello"),
    descrizione:$("#descrizione"), note:$("#note"),
    ddt:$("#ddt"), stato:$("#stato"),
    dataApertura:$("#dataApertura"), dataAccettazione:$("#dataAccettazione"), dataFine:$("#dataFine"),
    avanzamento:$("#avanzamento"),
    photo:$("#photo"), btnUpload:$("#btnUpload"), uploadMsg:$("#uploadMsg")
  };

  let ALL_ROWS = [];
  let FILTER = null; // {q, col}

  // Navigation
  function showHome(){ pageHome.classList.remove("d-none"); pageSearch.classList.add("d-none"); activeFilterBox.classList.add("d-none"); renderListHome(); }
  function showSearch(){ pageSearch.classList.remove("d-none"); pageHome.classList.add("d-none"); }
  function openDetail(record){ detail.classList.remove("d-none"); fillForm(record || null); }
  function closeDetail(){ detail.classList.add("d-none"); clearForm(); }

  // Render cards
  function badgeForStato(st){
    const s = (st||'').toLowerCase();
    if (s.includes('attesa')) return '<span class="badge green">In attesa</span>';
    if (s.includes('lavorazione')) return '<span class="badge orange">In lavorazione</span>';
    return '<span class="badge gray">Completata</span>';
  }

  function cardTemplate(r){
    const meta = [
      r.marca||'', r.modello||'', r.telefono||'', r.ddt||''
    ].filter(Boolean).join(" · ");
    return `<div class="card">
      <div class="head">
        <div><strong>${r.cliente||'—'}</strong></div>
        <div>${badgeForStato(r.stato)}</div>
      </div>
      <div class="meta">${fmtDate(r.dataApertura)} · ${meta}</div>
      <div>${(r.descrizione||'').slice(0,120)}</div>
      <div class="actions">
        <button class="btn ghost" data-act="edit" data-id="${r.id}">Apri</button>
        <button class="btn ghost" data-act="dup" data-id="${r.id}">Duplica</button>
      </div>
    </div>`;
  }

  function renderListHome(){
    const html = ALL_ROWS.map(cardTemplate).join("");
    listHome.innerHTML = html || "<div class='muted'>Nessun record.</div>";
  }

  function renderListSearch(rows){
    const html = rows.map(cardTemplate).join("");
    listSearch.innerHTML = html || "<div class='muted'>Nessun risultato.</div>";
  }

  function computeKPI(rows){
    const tot = rows.length;
    const att = rows.filter(r => (r.stato||'').toLowerCase().includes('attesa')).length;
    const lav = rows.filter(r => (r.stato||'').toLowerCase().includes('lavorazione')).length;
    const chi = rows.filter(r => {
      const s=(r.stato||'').toLowerCase();
      const pct = Number(r.avanzamento||0);
      return s.includes('completata') || s.includes('chiusa') || pct===100;
    }).length;
    kpiTot.textContent = tot; kpiAttesa.textContent = att; kpiLav.textContent = lav; kpiChiuse.textContent = chi;
  }

  function fillForm(r){
    detailTitle.textContent = r && r.id ? `Scheda · ${r.cliente||r.marca||'Senza titolo'}` : "Nuova scheda";
    f.id = r ? r.id : null;
    f.cliente.value = r?.cliente || "";
    f.telefono.value = r?.telefono || "";
    f.marca.value = r?.marca || "";
    f.modello.value = r?.modello || "";
    f.descrizione.value = r?.descrizione || "";
    f.note.value = r?.note || "";
    f.ddt.value = r?.ddt || "";
    f.stato.value = r?.stato || "In attesa";
    f.dataApertura.value = (r?.dataApertura||"").slice(0,10);
    f.dataAccettazione.value = (r?.dataAccettazione||"").slice(0,10);
    f.dataFine.value = (r?.dataFine||"").slice(0,10);
    f.avanzamento.value = r?.avanzamento ?? "";

    // Banner CHIUSA se completata
    const isClosed = (f.stato.value.toLowerCase().includes("completata") || Number(f.avanzamento.value||0)===100);
    statusBadge.classList.toggle("d-none", !isClosed);
  }

  function clearForm(){ fillForm(null); }

  function readForm(){
    return {
      id: f.id,
      cliente: f.cliente.value.trim(),
      telefono: f.telefono.value.trim(),
      marca: f.marca.value.trim(),
      modello: f.modello.value.trim(),
      descrizione: f.descrizione.value.trim(),
      note: f.note.value.trim(),
      ddt: f.ddt.value.trim(),
      stato: f.stato.value,
      dataApertura: f.dataApertura.value || null,
      dataAccettazione: f.dataAccettazione.value || null,
      dataFine: f.dataFine.value || null,
      avanzamento: f.avanzamento.value ? Number(f.avanzamento.value) : null
    };
  }

  // Event wiring
  btnHome.addEventListener("click", showHome);
  btnSearchPage.addEventListener("click", () => { showSearch(); q.focus(); });
  btnNew.addEventListener("click", () => openDetail(null));
  btnCloseDetail.addEventListener("click", closeDetail);

  btnDoSearch.addEventListener("click", () => {
    const query = q.value.trim();
    const col = qCol.value;
    const FILTER = query ? { q: query, col } : null;
    activeFilterLabel.textContent = FILTER ? `Filtro: ${FILTER.q} in ${FILTER.col}` : "";
    activeFilterBox.classList.toggle("d-none", !FILTER);
    const rows = FILTER ? window.DB.exactMatchRows(ALL_ROWS, FILTER.q, FILTER.col) : ALL_ROWS;
    renderListSearch(rows);
  });

  btnClearFilter.addEventListener("click", () => {
    q.value = ""; qCol.value="auto";
    showHome();
  });

  btnBackHome.addEventListener("click", showHome);

  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-act]");
    if (!t) return;
    const act = t.getAttribute("data-act");
    const id = t.getAttribute("data-id");
    if (act==="edit") {
      const rec = ALL_ROWS.find(r => String(r.id)===String(id));
      openDetail(rec||null);
    } else if (act==="dup") {
      const src = ALL_ROWS.find(r => String(r.id)===String(id));
      if (!src) return;
      const dup = { ...src }; delete dup.id; dup.dataApertura=(new Date()).toISOString().slice(0,10);
      openDetail(dup);
    }
  });

  btnSave.addEventListener("click", async () => {
    try {
      const rec = readForm();
      const saved = await window.DB.saveRecord(rec);
      // update local cache
      const i = ALL_ROWS.findIndex(r => String(r.id)===String(saved.id));
      if (i>=0) ALL_ROWS[i]=saved; else ALL_ROWS.push(saved);
      computeKPI(ALL_ROWS);
      showHome();
      closeDetail();
    } catch (e) {
      alert("Errore salvataggio: " + (e?.message||e));
      console.error(e);
    }
  });

  btnDelete.addEventListener("click", async () => {
    if (!f.id) { closeDetail(); return; }
    if (!confirm("Eliminare questa scheda?")) return;
    try {
      await window.DB.deleteRecord(f.id);
      ALL_ROWS = ALL_ROWS.filter(r => String(r.id)!==String(f.id));
      computeKPI(ALL_ROWS);
      closeDetail(); showHome();
    } catch (e) {
      alert("Errore eliminazione: " + (e?.message||e));
      console.error(e);
    }
  });

  f.btnUpload.addEventListener("click", async () => {
    try {
      const rec = readForm();
      if (!rec.id) {
        alert("Salva prima la scheda per ottenere un ID, poi carica la foto.");
        return;
      }
      const file = f.photo.files?.[0];
      if (!file) { alert("Seleziona un file immagine."); return; }
      f.uploadMsg.textContent = "Caricamento…";
      const url = await window.DB.uploadPhoto(file, rec.id);
      f.uploadMsg.textContent = "Caricata ✔ " + url;
    } catch (e) {
      f.uploadMsg.textContent = "Errore upload: " + (e?.message||e);
      console.error(e);
    }
  });

  // init
  async function refresh() {
    try {
      ALL_ROWS = await window.DB.listRecords();
      computeKPI(ALL_ROWS);
      renderListHome();
    } catch (e) {
      console.error(e);
      listHome.innerHTML = "<div class='muted'>Errore di connessione al database.</div>";
    }
  }

  // Auto-refresh su focus
  window.addEventListener("focus", refresh);
  refresh();
})();
