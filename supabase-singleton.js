// Crea una singola istanza Supabase
window.sb = (() => {
  const { supabaseUrl, supabaseKey } = window.APP_CONFIG;
  const client = window.supabase.createClient(supabaseUrl, supabaseKey);
  return client;
})();
