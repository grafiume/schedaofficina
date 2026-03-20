/* Supabase Cloud Bridge (v2) — tollerante path/url in public.photos */
if(!window.sb){ console.error("[cloud-db] Supabase client assente"); }
function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }
async function putRecord(v){
  const row = { id:v.id, descrizione:v.descrizione??null, modello:v.modello??null, cliente:v.cliente??null, telefono:v.telefono??null, email:v.email??null, punta:v.punta??null, numPunte:v.numPunte??null, statoPratica:v.statoPratica??'In attesa', preventivoStato:v.preventivoStato??'Non inviato', docTrasporto:v.docTrasporto??null, dataApertura:toNullEmpty(v.dataApertura), dataAccettazione:toNullEmpty(v.dataAccettazione), dataScadenza:toNullEmpty(v.dataScadenza), dataArrivo:toNullEmpty(v.dataArrivo), dataCompletamento:toNullEmpty(v.dataCompletamento), note:v.note??null, createdAt:v.createdAt??new Date().toISOString(), updatedAt:new Date().toISOString() };
  const { error } = await sb.from('records').upsert(row,{ onConflict:'id' }); if(error){console.error(error);throw error;}
}
async function getRecord(id){ const {data,error}=await sb.from('records').select('*').eq('id',id).single(); if(error) throw error; return data; }
async function getAllRecords(){ const {data,error}=await sb.from('records').select('*').order('updatedAt',{ascending:false}); if(error) throw error; return data||[]; }
async function getByStato(st){ const {data,error}=await sb.from('records').select('*').eq('statoPratica',st).order('updatedAt',{ascending:false}); if(error) throw error; return data||[]; }
async function deleteRecord(id){ try{ const {data:ph}=await sb.from('photos').select('path').eq('record_id',id); const del=(ph||[]).map(p=>p.path).filter(Boolean); if(del.length) await sb.storage.from(window.SB_BUCKET).remove(del); await sb.from('photos').delete().eq('record_id',id);}catch(_){} const {error}=await sb.from('records').delete().eq('id',id); if(error) throw error; }
async function savePhotosWithThumbs(recordId, images, thumbs){
  if(!images || !images.length) return;

  // carica solo i data-URL (nuove foto scattate/caricate), ignora URL http/https
  const toUpload = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
  if(!toUpload.length) return;

  for(let i=0; i<toUpload.length; i++){
    try{
      const dataUrl = toUpload[i];
      const parts = dataUrl.split(',');
      if(parts.length < 2) continue; // niente base64, salta

      const base64 = parts[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const path = `${recordId}/${Date.now()}-${i+1}.jpg`;

      const up = await sb.storage.from(window.SB_BUCKET || 'photos')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

      if(up.error && !(up.error.message || '').includes('already exists')){
        console.warn('[upload photo]', up.error);
        continue;
      }

      const ins = await sb.from('photos').insert({ record_id: recordId, path });
      if(ins.error){ console.warn('[photos insert]', ins.error); }
    }catch(err){
      console.warn('[savePhotosWithThumbs] skip image', err);
      continue;
    }
  }
}
  async function getPhotos(recordId){
  let {data,error}=await sb.from('photos').select('path').eq('record_id',recordId).order('created_at',{ascending:true});
  if(error && error.code==='42703'){ ({data,error}=await sb.from('photos').select('url').eq('record_id',recordId).order('created_at',{ascending:true})); if(error){console.error(error);return{images:[],thumbs:[]}} const images=(data||[]).map(r=>r.url).filter(Boolean); return {images,thumbs:images}; }
  if(error){ console.error(error); return {images:[],thumbs:[]} }
  const images=[]; for(const row of (data||[])){ const {data:pub}=sb.storage.from(window.SB_BUCKET).getPublicUrl(row.path); if(pub&&pub.publicUrl){ images.push(pub.publicUrl); } } return {images,thumbs:images};
}
(function(){ try{ const ch1=sb.channel('records-ch').on('postgres_changes',{event:'*',schema:'public',table:'records'},()=>{ if(typeof refreshDashboard==='function') refreshDashboard(); if(typeof lista==='function') lista(); }).subscribe(); const ch2=sb.channel('photos-ch').on('postgres_changes',{event:'*',schema:'public',table:'photos'},()=>{ if(typeof refreshDashboard==='function') refreshDashboard(); }).subscribe(); window.__sb_channels=[ch1,ch2]; window.addEventListener('focus',()=>{ if(typeof refreshDashboard==='function') refreshDashboard(); }); console.log('[realtime] attivo'); }catch(err){ console.warn('[realtime] non attivo:',err?.message||err); } })();
