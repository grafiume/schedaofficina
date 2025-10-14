(function(){
  if(window.sb) { console.log('[sb-singleton] client già esistente'); return; }
  if(!window.SUPABASE_URL || !window.SUPABASE_ANON || !window.supabase){
    console.warn('[sb-singleton] config o libreria mancante: niente client');
    return;
  }
  window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  console.log('[sb-singleton] client creato una sola volta');
})();