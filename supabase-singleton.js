
(function () {
  if (typeof window === 'undefined') return;
  if (typeof window.supabase === 'undefined') {
    console.warn('[sb-singleton] supabase-js non caricato ancora.');
    return;
  }
  if (window.__sb && typeof window.__sb === 'object') {
    window.getSupabase = () => window.__sb;
    return;
  }
  const origCreate = window.supabase.createClient;
  window.supabase.createClient = function (url, key, options) {
    if (window.__sb) return window.__sb;
    const opts = Object.assign(
      {
        auth: {
          storageKey: 'sb-schedaofficina',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      },
      options || {}
    );
    window.__sb = origCreate.call(window.supabase, url, key, opts);
    window.getSupabase = () => window.__sb;
    window.supabaseClient = window.__sb;
    console.log('[sb-singleton] client creato una sola volta');
    return window.__sb;
  };
  try {
    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.warn('[sb-singleton] init opzionale non riuscito:', e && e.message);
  }
})();
