// app-supabase-bridge.js (public bucket)
(function(){
  const create = (window.supabase && window.supabase.createClient) ? window.supabase.createClient : window.createClient;
  if(!create){ console.error('[supabase] libreria non caricata'); return; }
  const sb = create(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const BUCKET = 'photos';
  function cbust(u){ try{ const url=new URL(u,location.origin); url.searchParams.set('t',Date.now().toString()); return url.toString(); }catch(_){ return u+(u.includes('?')?'&':'?')+'t='+Date.now(); } }
  function publicUrl(path){ const { data } = sb.storage.from(BUCKET).getPublicUrl(path); return cbust(data?.publicUrl || ''); }
  async function listPhotos(recordId){
    const { data, error } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at', { ascending: true });
    if(error){ console.warn('[supabase] listPhotos', error); return []; }
    return (data||[]).map(r=>publicUrl(r.path)).filter(Boolean);
  }
  async function uploadPhoto(file, recordId){
    try{
      const ext = (file.name && file.name.split('.').pop()) || 'jpg';
      const fname = `${recordId}/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(fname, file, { upsert:false, cacheControl:'0' });
      if(error){ console.warn('[supabase] upload error', error); return null; }
      await sb.from('photos').insert({ record_id: recordId, path: fname });
      return publicUrl(fname);
    }catch(e){ console.warn('[supabase] upload exception', e); return null; }
  }
  window.getPhotos = window.getPhotos || listPhotos;
  window.uploadPhotoToCloud = uploadPhoto;
  window.cacheBust = cbust;
  document.addEventListener('DOMContentLoaded', ()=>{
    if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js'); }
  });
})();
