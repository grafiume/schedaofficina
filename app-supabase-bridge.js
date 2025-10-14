// app-supabase-bridge.js
// Aggiunge sincronizzazione minima con Supabase mantenendo la UI locale (IndexedDB) invariata.
(function(){
  // Inizializza Supabase
  if(!window.createClient && !window.supabase){
    console.error('[supabase] libreria non caricata');
    return;
  }
  const sb = window.supabase?.createClient
    ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : window.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  async function upsertFromForm(){
    try{
      const f = document.getElementById('recordForm');
      if(!f) return;
      const d = Object.fromEntries(new FormData(f).entries());
      // id: se esiste hidden 'numero' usalo, altrimenti recupera dall'anteprima 'cur' se globale
      let id = d.id || d.numero || (window.cur && window.cur.id) || null;
      if(!id){
        // fallback: genera, ma la UI salva già con un id
        id = (Date.now()).toString();
      }
      d.id = id;
      // Normalizza alcuni campi
      d.updatedAt = new Date().toISOString();
      if(!d.preventivoStato) d.preventivoStato = 'Non inviato';
      if(!d.statoPratica) d.statoPratica = 'In attesa';
      if(d.statoPratica === 'Completata'){
        if(!d.dataCompletamento){
          const p = n => String(n).padStart(2,'0');
          const now = new Date();
          d.dataCompletamento = `${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}`;
        }
        d.dataScadenza = '';
      }
      d.dataArrivo = d.dataApertura || d.dataArrivo || '';
      // Upsert
      const { error } = await sb.from('records').upsert(d, { onConflict: 'id' });
      if(error) console.warn('[supabase] upsert error', error);
      else console.log('[supabase] upsert OK', d.id);
    }catch(e){
      console.warn('[supabase] upsert exception', e);
    }
  }

  async function bootstrapPull(){
    try{
      const { data, error } = await sb.from('records').select('*').order('updatedAt', { ascending: false }).limit(500);
      if(error){ console.warn('[supabase] select error', error); return; }
      if(!Array.isArray(data)) return;
      // Salva in cache locale se non presente
      if(typeof window.getRecord !== 'function' || typeof window.putRecord !== 'function'){
        console.warn('[supabase] funzioni IndexedDB non trovate, salto il merge iniziale');
        return;
      }
      for(const r of data){
        try{
          const ex = await window.getRecord(r.id);
          if(!ex){
            await window.putRecord(r);
          }
        }catch(_){}
      }
      if(typeof window.refreshDashboard==='function') window.refreshDashboard();
      console.log('[supabase] bootstrapPull OK:', data.length, 'record');
    }catch(e){
      console.warn('[supabase] bootstrap exception', e);
    }
  }

  // Hook al click su "Salva scheda" per inviare a Supabase dopo il salvataggio locale
  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('saveRecord');
    if(btn){
      btn.addEventListener('click', ()=>{
        // piccola attesa per lasciare concludere salva()
        setTimeout(upsertFromForm, 150);
      });
    }
    // Tenta un pull iniziale
    bootstrapPull();
  });
})();
