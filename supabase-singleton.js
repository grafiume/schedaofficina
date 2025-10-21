// Simple singleton to share a single Supabase client across modules
(function(){
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.warn('[sb-singleton] Config mancante. Carica config.js prima.');
  }
  if (!window._sb) {
    window._sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
    console.log('[sb-singleton] creato');
  } else {
    console.log('[sb-singleton] esiste');
  }
  window.getSB = () => window._sb;
})();