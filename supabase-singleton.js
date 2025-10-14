(function(){
  if(window.sb){ console.log('[sb-singleton] esiste'); return; }
  if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON){ console.warn('[sb-singleton] manca config/lib'); return; }
  window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON, { auth:{persistSession:true,autoRefreshToken:true} });
  console.log('[sb-singleton] creato');
})();