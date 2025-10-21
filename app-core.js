/* app-core.js v1.0.3 */
(() => {
  const els = {
    q: document.querySelector("#q"),
    chkExact: document.querySelector("#chkExact"),
    btnSearch: document.querySelector("#btnDoSearch"),
    btnReset: document.querySelector("#btnReset"),
    list: document.querySelector("#listContainer"),
    toast: document.querySelector("#appToast"),
  };

  function showMessage(msg) {
    if (els.toast) {
      els.toast.textContent = msg;
      els.toast.classList.remove("d-none");
    } else {
      console.warn(msg);
      try { alert(msg); } catch(e) {}
    }
  }

  function isClosed(r) {
    const stato = String(r?.stato || "").toLowerCase();
    const percent = Number(r?.percentuale || 0);
    return /complet|chius/.test(stato) || !!r?.dataFine || percent >= 100;
  }

  function safe(str) {
    if (str == null) return "";
    return String(str);
  }

  function renderList(rows) {
    if (!els.list) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      els.list.innerHTML = '<div class="text-muted p-3">Nessun risultato.</div>';
      return;
    }

    const html = rows.map(r => {
      const badge = isClosed(r) ? '<span class="badge bg-success ms-2">CHIUSA</span>' : "";
      const cliente = r?.cliente ? `<div class="small text-muted">${safe(r.cliente)}</div>` : "";
      const descr = r?.descrizione ? `<div class="fw-semibold">${safe(r.descrizione)}</div>` : "";
      const modello = r?.modello ? `<div class="small">${safe(r.modello)}</div>` : "";
      const note = r?.notesk ? `<div class="small text-truncate">${safe(r.notesk)}</div>` : "";
      const stato = r?.stato ? `<span class="badge text-bg-secondary">${safe(r.stato)}</span>` : "";

      return [
        '<div class="card mb-2 shadow-sm">',
          '<div class="card-body py-2">',
            '<div class="d-flex align-items-center justify-content-between">',
              '<div>',
                descr, cliente, modello, note,
              '</div>',
              '<div>',
                stato, badge,
              '</div>',
            '</div>',
          '</div>',
        '</div>'
      ].join("");
    }).join("");

    els.list.innerHTML = html;
  }

  async function doSearch() {
    if (!window.Api || typeof Api.fetchRecords !== "function") {
      showMessage("Impossibile cercare: Supabase non è pronto. Controlla l’ordine degli script in index.html.");
      return;
    }
    const q = (els.q && typeof els.q.value === "string") ? els.q.value.trim() : "";
    const exact = !!(els.chkExact && els.chkExact.checked);

    const { data, error } = await Api.fetchRecords({ q, exact, limit: 1000 });
    if (error) {
      console.error(error);
      showMessage("Errore durante la ricerca.");
      return;
    }
    renderList(data);
  }

  function doReset() {
    if (els.q) els.q.value = "";
    if (els.chkExact) els.chkExact.checked = false;
    doSearch();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (els.btnSearch) els.btnSearch.addEventListener("click", doSearch);
    if (els.btnReset) els.btnReset.addEventListener("click", doReset);
    if (els.q) {
      els.q.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") doSearch();
      });
    }
    doSearch();
  });
})();
