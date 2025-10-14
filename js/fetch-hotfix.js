(() => {
  const origFetch = window.fetch;
  const isDateKey = k => /^data/i.test(k); // dataapertura, dataArrivo, etc.

  const toISO = (s) => {
    if (!s) return null;
    s = String(s).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;             // YYYY-MM-DD
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/); // DD/MM/YYYY
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0,10);
  };

  const fixRow = (row) => {
    const out = {...row};
    for (const k in out) {
      if (isDateKey(k)) {
        const v = out[k];
        out[k] = (v === "" || v === undefined) ? null : toISO(v);
      }
    }
    return out;
  };

  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (url.includes('/rest/v1/records') && init.body) {
        let bodyText;
        if (typeof init.body === 'string') bodyText = init.body;
        else bodyText = await new Response(init.body).text();

        try {
          const json = JSON.parse(bodyText);
          if (Array.isArray(json)) {
            init.body = JSON.stringify(json.map(fixRow));
          } else {
            init.body = JSON.stringify(fixRow(json));
          }
        } catch (e) {
          // non JSON → ignora
        }
      }
    } catch (e) { /* ignora */ }
    return origFetch(input, init);
  };

  console.log('[fetch-hotfix] attivo: date "" → null + DD/MM/YYYY → YYYY-MM-DD');
})();
