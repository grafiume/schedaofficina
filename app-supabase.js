/* app-supabase.js v1.0.2 */
(() => {
  const TABLE = "records";

  function _getClientOrNull() {
    return (window.SB && typeof SB.get === "function") ? SB.get() : null;
  }

  /**
   * fetchRecords
   * @param {Object} opt
   * @param {string} opt.q - valore ricerca
   * @param {boolean} opt.exact - true = ricerca esatta (ILIKE senza %), false = contiene (%val%)
   * @param {number} [opt.limit=500]
   */
  async function fetchRecords(opt = {}) {
    const client = _getClientOrNull();
    if (!client) {
      return { data: [], error: new Error("Supabase non inizializzato (controlla config.js e CDN).") };
    }

    const raw = typeof opt.q === "string" ? opt.q : "";
    const clean = raw.trim().replace(/,/g, " "); // evita conflitti con OR di supabase
    const exact = !!opt.exact;
    const limit = opt.limit ?? 500;

    const cols = [
      "descrizione",
      "modello",
      "cliente",
      "telefono",
      "ddt",
      "notesk",
      "battcollettore",
      "marca"
    ];

    let query = client.from(TABLE).select("*").limit(limit);

    if (clean) {
      const val = exact ? clean : `%${clean}%`;
      const operator = "ilike"; // ilike senza % ≈ uguaglianza case-insensitive

      const orParts = cols.map((c) => `${c}.${operator}.${val}`);
      query = query.or(orParts.join(","));
    }

    query = query.order("dataApertura", { ascending: false }).order("id", { ascending: false });

    const { data, error } = await query;
    return { data: data || [], error };
  }

  window.Api = {
    fetchRecords,
  };
})();
