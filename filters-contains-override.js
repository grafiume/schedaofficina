/* filters-contains-override.js
   Ripristina confronto "contiene" per i filtri tecnici
   (tollerante a punteggiatura, accenti e maiuscole/minuscole) */
(function () {
  // normalizza: rimuove accenti, punteggiatura “rumorosa”, mette in minuscolo
  const norm = (s) => String(s ?? '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    // tieni lettere/numeri/spazi e alcuni separatori utili; elimina il resto (es. ! " # etc.)
    .replace(/[^a-z0-9\s\.\-\/]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const contains = (a, b) => {
    const A = norm(a);
    const B = norm(b);
    if (!B) return true;     // filtro vuoto => passa
    return A.includes(B);    // match "contiene"
  };

  // Override globale: usato dalla tua lista per filtrare i record
  window.matchTechFilters = function (r) {
    const w = window.techFilters || {};
    if (w.battCollettore && !contains(r.battCollettore, w.battCollettore)) return false;
    if (w.lunghezzaAsse && !contains(r.lunghezzaAsse, w.lunghezzaAsse)) return false;
    if (w.lunghezzaPacco && !contains(r.lunghezzaPacco, w.lunghezzaPacco)) return false;
    if (w.larghezzaPacco && !contains(r.larghezzaPacco, w.larghezzaPacco)) return false;
    if (w.punta && w.punta !== '(tutte)' && !contains(r.punta, w.punta)) return false;
    if (w.numPunte && !contains(r.numPunte, w.numPunte)) return false;
    return true;
  };

  console.log('[filters-contains-override] attivo (match "contiene")');
})();
