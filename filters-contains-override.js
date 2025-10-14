/* filters-exact-override.js
   Match ESATTO per i filtri tecnici (trim + case-insensitive) */
(function () {
  const eq = (a,b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

  // Override globale: applicato dopo che la pagina ha definito i record
  window.matchTechFilters = function (r) {
    const w = window.techFilters || {};

    // Se un filtro è valorizzato, il campo del record DEVE esistere e combaciare esattamente.
    if (w.battCollettore && !eq(r.battCollettore, w.battCollettore)) return false;
    if (w.lunghezzaAsse && !eq(r.lunghezzaAsse, w.lunghezzaAsse)) return false;
    if (w.lunghezzaPacco && !eq(r.lunghezzaPacco, w.lunghezzaPacco)) return false;
    if (w.larghezzaPacco && !eq(r.larghezzaPacco, w.larghezzaPacco)) return false;

    // Punta: se selezioni "(tutte)" non filtra, altrimenti match esatto
    if (w.punta && w.punta !== '(tutte)' && !eq(r.punta, w.punta)) return false;

    if (w.numPunte && !eq(r.numPunte, w.numPunte)) return false;

    return true;
  };

  console.log('[filters-exact-override] attivo (match esatto)');
})();
