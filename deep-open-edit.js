// deep-open-edit.js
// Apre automaticamente la schermata "Modifica scheda" quando l'URL contiene ?edit=<ID> oppure ?id=<ID>.
// Esempio:
// https://grafiume.github.io/schedaofficina/index.html?edit=621e65f2-3ae9-4cdf-99c4-279b3066886b

(function () {
  function getTargetId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("edit") || params.get("id") || "";
  }

  const targetId = getTargetId();
  if (!targetId) return;

  function hasLoadedTarget() {
    try {
      return Array.isArray(window.state?.all) && window.state.all.some(function (r) {
        return String(r && r.id) === String(targetId);
      });
    } catch (_e) {
      return false;
    }
  }

  function isEditVisible() {
    const editPage = document.getElementById("page-edit");
    return !!editPage && !editPage.classList.contains("d-none");
  }

  function tryOpenEdit() {
    try {
      // openEdit cerca il record dentro window.state.all: se i dati non sono ancora
      // caricati bisogna aspettare, altrimenti resta la Home.
      if (!hasLoadedTarget()) return false;

      if (typeof window.openEdit === "function") {
        window.openEdit(targetId);
        return isEditVisible();
      }

      if (typeof openEdit === "function") {
        openEdit(targetId);
        return isEditVisible();
      }
    } catch (error) {
      console.warn("[deep-open-edit] tentativo non riuscito:", error);
    }

    return false;
  }

  function startPolling() {
    let attempts = 0;
    const maxAttempts = 160;

    const timer = setInterval(function () {
      attempts += 1;

      if (tryOpenEdit() || attempts >= maxAttempts) {
        clearInterval(timer);
        if (attempts >= maxAttempts && !isEditVisible()) {
          console.warn("[deep-open-edit] scheda non aperta o record non trovato:", targetId);
        }
      }
    }, 250);
  }

  document.addEventListener("DOMContentLoaded", function () {
    tryOpenEdit();
    startPolling();
  }, { once: true });

  if (document.readyState !== "loading") {
    tryOpenEdit();
    startPolling();
  }
})();
