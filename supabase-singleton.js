(function(){
  if (window.__sb) return;
  window.__sb = {
    get() {
      if (!this.client) {
        if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
          console.warn("[supabase] Missing config.js values");
        }
        this.client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      }
      return this.client;
    }
  };
  console.log("[sb-singleton] ready");
})();