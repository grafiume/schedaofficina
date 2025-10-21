// Singleton per Supabase v2
(() => {
  if (window.supabaseClient) return;
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CFG || {};
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("[sb-singleton] Config mancante");
    return;
  }
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  console.log("[sb-singleton] creato");
})();
