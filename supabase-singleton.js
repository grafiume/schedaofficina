(function(){
  if (window.supabase) {
    window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    console.log("[sb] client ready");
  } else {
    console.error("Supabase SDK not loaded");
  }
})();