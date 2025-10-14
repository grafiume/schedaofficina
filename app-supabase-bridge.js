// app-supabase-bridge.js (public bucket)
(function(){
  const create = (window.supabase && window.supabase.createClient) ? window.supabase.createClient : window.createClient;
  if(!create){ console.error('[supabase] libreria non caricata'); return; }
  const sb = create(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const BUCKET = 'photos';

  function cbust(u){
    try{
      const url = new URL(u, location.origin);
      url.searchParams.set('t', Date.now().toString());
      return url.toString();
    }catch(_){ return u + (u.includes('?') ? '&' : '?') + 't=' + Date.now(); }
  }

  function publicUrl(path){
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return cbust(data?.publicUrl || '');
  }

  async function listPhotos(recordId){
    const { data, error } = await sb.from('photos')
      .select('path')
      .eq('record_id', recordId)
      .order('created_at', { ascending: true });
    if(error){ console.warn('[supabase] listPhotos', error); return []; }
    return (data || []).map(row => publicUrl(row.path)).filter(Boolean);
  }

  async function uploadPhoto(file, recordId){
    try{
      const ext = (file.name && file.name.split('.').pop()) || 'jpg';
      const fname = `${recordId}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(fname, file, { upsert:false, cacheControl: '0' });
      if(error){ console.warn('[supabase] upload error', error); return null; }
      await sb.from('photos').insert({ record_id: recordId, path: fname });
      return publicUrl(fname);
    }catch(e){
      console.warn('[supabase] upload exception', e);
      return null;
    }
  }

  window.getPhotos = window.getPhotos || listPhotos;
  window.uploadPhotoToCloud = uploadPhoto;
  window.cacheBust = cbust;

  async function upsertFromForm(){
    try{
      const f = document.getElementById('recordForm');
      if(!f) return;
      const d = Object.fromEntries(new FormData(f).entries());
      let id = d.id || d.numero || (window.cur && window.cur.id) || null;
      if(!id){ id = (Date.now()).toString(); d.id = id; }
      d.updatedAt = new Date().toISOString();
      if(!d.preventivoStato) d.preventivoStato = 'Non inviato';
      if(!d.statoPratica) d.statoPratica = 'In attesa';
      d.dataArrivo = d.dataApertura || d.dataArrivo || '';
      const { error } = await sb.from('records').upsert(d, { onConflict: 'id' });
      if(error) console.warn('[supabase] upsert error', error);
      else console.log('[supabase] upsert OK', d.id);
    }catch(e){
      console.warn('[supabase] upsert exception', e);
    }
  }

  async function bootstrapPull(){
    try{
      const { data, error } = await sb.from('records').select('*').order('updatedAt', { ascending: false }).limit(1000);
      if(error){ console.warn('[supabase] select error', error); return; }
      if(!Array.isArray(data)) return;
      if(typeof window.getRecord !== 'function' || typeof window.putRecord !== 'function'){
        console.warn('[supabase] funzioni IndexedDB non trovate, salto il merge iniziale');
        return;
      }
      for(const r of data){
        try{
          const ex = await window.getRecord(r.id);
          if(!ex){ await window.putRecord(r); }
        }catch(_){}
      }
      if(typeof window.refreshDashboard==='function') window.refreshDashboard();
      console.log('[supabase] bootstrapPull OK:', data.length, 'record');
    }catch(e){
      console.warn('[supabase] bootstrap exception', e);
    }
  }

  document.addEventListener('photo-captured', async (ev)=>{
    const { file, recordId } = ev.detail || {};
    if(file && recordId){
      const url = await uploadPhotoToCloud(file, recordId);
      if(url && typeof window.addThumb === 'function'){ window.addThumb(url, true); }
    }
  }, false);

  document.addEventListener('DOMContentLoaded', ()=>{
    const btn = document.getElementById('saveRecord');
    if(btn){ btn.addEventListener('click', ()=> setTimeout(upsertFromForm, 150)); }
    bootstrapPull();
  });
})();
