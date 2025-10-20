
/*!
 * search-notes-addon.v1.js
 * Scopo: includere il campo `note` (name="note") nella ricerca testuale,
 * senza toccare i file esistenti. Carica questo file DOPO i tuoi script principali.
 * Funziona su ricerca locale (array/cache). Per ricerche remote, la maggior parte
 * dei casi viene coperta da un post-filtraggio sicuro lato client.
 */
(function () {
  const LOG_PREFIX = "[notes-addon]";
  const safeLower = (v) => (v == null ? "" : String(v)).toLowerCase();
  const fieldsDefault = [
    "descrizione","modello","cliente","telefono","ddt",
    "marca","battcollettore","datiTecnici","note" // <-- aggiunta chiave
  ];

  // 1) Wrapper su recordMatchesQuery se esiste
  try {
    if (typeof window.recordMatchesQuery === "function") {
      const original = window.recordMatchesQuery;
      window.recordMatchesQuery = function (r, q) {
        try {
          // Se l'originale trova già il match, fine
          if (original.call(this, r, q)) return true;
        } catch (e) {
          console.warn(LOG_PREFIX, "original recordMatchesQuery failed:", e);
        }
        // Altrimenti estendiamo con campo note
        const needle = safeLower(q || "");
        if (!needle) return true; // vuota: match all
        const hay = [
          r && r.descrizione, r && r.modello, r && r.cliente, r && r.telefono, r && r.ddt,
          r && r.marca, r && r.battcollettore, r && r.datiTecnici,
          r && (r.note ?? (r.notesk ?? (r.notes ?? r.osservazioni)))
        ].map(safeLower).join(" ");
        return hay.includes(needle);
      };
      console.log(LOG_PREFIX, "wrapped existing recordMatchesQuery (aggiunte note).");
    } else {
      // Definiamo una funzione di matching di fallback che include `note`
      window.recordMatchesQuery = function (r, q) {
        const needle = safeLower(q || "");
        if (!needle) return true;
        const hay = fieldsDefault.map(k => safeLower(r && r[k])).join(" ");
        return hay.includes(needle);
      };
      console.log(LOG_PREFIX, "defined fallback recordMatchesQuery with note.");
    }
  } catch (e) {
    console.warn(LOG_PREFIX, "recordMatchesQuery patch error:", e);
  }

  // 2) Se esiste una funzione che aggrega un testo ricercabile, proviamo a estenderla
  //    Pattern comune: window.buildSearchText(record) -> string
  try {
    if (typeof window.buildSearchText === "function") {
      const orig = window.buildSearchText;
      window.buildSearchText = function (r) {
        const base = orig.call(this, r);
        const tail = safeLower(r && (r.note ?? r.notesk ?? r.notes ?? r.osservazioni));
        return tail ? (String(base || "") + " " + tail) : base;
      };
      console.log(LOG_PREFIX, "wrapped buildSearchText (aggiunte note).");
    }
  } catch (e) {
    console.warn(LOG_PREFIX, "buildSearchText patch error:", e);
  }

  // 3) Post-filtraggio gentile sui risultati remoti: se viene emesso un evento custom
  //    "search:results" con payload {results, query}, rifiltriamo includendo `note`.
  //    Se l'app non emette questo evento, questo blocco è ininfluente.
  try {
    window.addEventListener("search:results", (ev) => {
      const detail = ev && ev.detail;
      if (!detail || !Array.isArray(detail.results)) return;
      const q = detail.query || "";
      const filtered = detail.results.filter(r => window.recordMatchesQuery(r, q));
      // Riproiettiamo un evento "search:results:filtered" per chi renderizza
      const out = new CustomEvent("search:results:filtered", { detail: { results: filtered, query: q }});
      window.dispatchEvent(out);
      console.log(LOG_PREFIX, `post-filter remoti applicato (${filtered.length}/${detail.results.length}).`);
    });
  } catch (e) {
    console.warn(LOG_PREFIX, "post-filter hook error:", e);
  }
})();
