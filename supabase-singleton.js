/* supabase-singleton.js v1.0.1 */
(() => {
  const TAG = "[sb-singleton]";
  let _client = null;

  function get() {
    if (_client) return _client;

    const url = (window.SUPABASE_URL || "").trim();
    const key = (window.SUPABASE_ANON_KEY || "").trim();

    if (!url || !key) {
      console.warn("[supabase] Missing config.js values");
      return null;
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      console.error(`${TAG} supabase-js v2 non caricato (manca lo script CDN?)`);
      return null;
    }

    _client = window.supabase.createClient(url, key, {
      auth: { persistSession: false },
    });
    console.log(`${TAG} client created`);
    return _client;
  }

  window.SB = { get };
})();
