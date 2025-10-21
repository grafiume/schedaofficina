// Data access for 'records' table
window.AppSupabase = (function(){
  const sb = window.__sb.get();

  // columns searched
  const SEARCH_COLS = [
    "descrizione","cliente","telefono","ddt","modello","marca","battcoll","note","notes","notesk","descrizionegenerale","descrizione_generale"
  ];

  function buildOrFilter(value, exact){
    const enc = encodeURIComponent;
    if (!value || !value.trim()) return null;
    const v = value.trim();
    // exact (case-insensitive): use ILIKE without wildcards (no %)
    // contains: use ILIKE with %value%
    const pattern = exact ? enc(v) : enc("%" + v + "%");
    const op = exact ? "ilike" : "ilike"; // ilike without % behaves like case-insensitive equality
    const parts = SEARCH_COLS.map(c => `${c}.${op}.${pattern}`);
    return parts.join(",");
  }

  async function fetchRecords(opts){
    const { q = "", exact = false } = opts || {};
    let url = `${window.SUPABASE_URL}/rest/v1/records?select=*`;
    const orFilter = buildOrFilter(q, exact);
    if (orFilter) url += `&or=(${orFilter})`;
    url += `&order=dataApertura.desc.nullslast`;
    const res = await fetch(url, {
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
        Accept: "application/json"
      }
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    const rows = await res.json();
    return rows;
  }

  return { fetchRecords };
})();