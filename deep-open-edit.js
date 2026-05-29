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

  function tryOpenEdit() {
    try {
      if (typeof window.openEdit === "function") {
        window.openEdit(targetId);
        return true;
      }

      if (typeof openEdit === "function") {
        openEdit(targetId);
        return true;
      }
    } catch (error) {
      console.warn("[deep-open-edit] tentativo non riuscito:", error);
    }

    return false;
  }

  let attempts = 0;
  const maxAttempts = 80;

  const timer = setInterval(function () {
    attempts += 1;

    if (tryOpenEdit() || attempts >= maxAttempts) {
      clearInterval(timer);
    }
  }, 250);

  document.addEventListener("DOMContentLoaded", tryOpenEdit);
})();
