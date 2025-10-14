(function(){
  if(window.sb && window.sb.__is_singleton) return;
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if(!url || !key){ console.error("[supabase] Config mancante"); return; }
  const client = window.supabase.createClient(url, key);
  client.__is_singleton = true;
  window.sb = client;
  console.log("[supabase] client pronto");
})();
