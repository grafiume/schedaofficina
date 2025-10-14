/* cloud-db.js (v3.1) — dedupe uploads to avoid duplicate photos */
if(!window.sb){ console.error("[cloud-db] Supabase client assente"); }
function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }

async function putRecord(v){
  const row = {
    id:v.id, descrizione:v.descrizione??null, modello:v.modello??null, cliente:v.cliente??null,
    telefono:v.telefono??null, email:v.email??null, battCollettore:  v.battCollettore ?? null,
lunghezzaAsse:   v.lunghezzaAsse ?? null,
lunghezzaPacco:  v.lunghezzaPacco ?? null,
larghezzaPacco:  v.larghezzaPacco ?? null,
punta:v.punta??null, numPunte:v.numPunte??null,
    statoPratica:v.statoPratica??'In attesa', preventivoStato:v.preventivoStato??'Non inviato',
    docTrasporto:v.docTrasporto??null, dataApertura:toNullEmpty(v.dataApertura),
    dataAccettazione:toNullEmpty(v.dataAccettazione), dataScadenza:toNullEmpty(v.dataScadenza),
    dataArrivo:toNullEmpty(v.dataArrivo), dataCompletamento:toNullEmpty(v.dataCompletamento),
    note:v.note??null, createdAt:v.createdAt??new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  const { error } = await sb.from('records').upsert(row, { onConflict:'id' });
  if(error){ console.error(error); throw error; }
}

async function getRecord(id){ const {data,error}=await sb.from('records').select('*').eq('id',id).single(); if(error) throw error; return data; }
async function getAllRecords(){ const {data,error}=await sb.from('records').select('*').order('updatedAt',{ascending:false}); if(error) throw error; return data||[]; }
async function getByStato(st){ const {data,error}=await sb.from('records').select('*').eq('statoPratica',st).order('updatedAt',{ascending:false}); if(error) throw error; return data||[]; }
async function deleteRecord(id){ try{ const {data:ph}=await sb.from('photos').select('path').eq('record_id',id); const del=(ph||[]).map(p=>p.path).filter(Boolean); if(del.length) await sb.storage.from(window.SB_BUCKET||'photos').remove(del); await sb.from('photos').delete().eq('record_id',id);}catch(_){} const {error}=await sb.from('records').delete().eq('id',id); if(error) throw error; }

// --- DEDUPE GUARD MEMORY
window.__photoUploadGuards = window.__photoUploadGuards || {};

async function savePhotosWithThumbs(recordId, images, thumbs){
  if(!images || !images.length) return;

  // evita doppie chiamate contemporanee sullo stesso record
  if(window.__photoUploadGuards[recordId]) return;
  window.__photoUploadGuards[recordId] = true;

  try {
    // carica solo data-URL (nuove foto)
    const onlyData = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
    if(!onlyData.length) return;

    // deduplica dataURL identici nella stessa save
    const toUpload = Array.from(new Set(onlyData));

    for(let i=0;i<toUpload.length;i++){
      try{
        const dataUrl = toUpload[i];
        const parts = dataUrl.split(','); if(parts.length<2) continue;
        const base64 = parts[1];
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const path  = `${recordId}/${Date.now()}-${i+1}.jpg`;

        const up = await sb.storage.from(window.SB_BUCKET||'photos')
          .upload(path, bytes, { contentType:'image/jpeg', upsert:false });

        if(up.error && !(up.error.message||'').includes('already exists')){
          console.warn('[upload photo]', up.error); continue;
        }

        const ins = await sb.from('photos').insert({ record_id: recordId, path });
        if(ins.error){ console.warn('[photos insert]', ins.error); }

        // aggiorna anteprima con l'ultima foto caricata
        const pub = sb.storage.from(window.SB_BUCKET||'photos').getPublicUrl(path);
        const url = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
        if(url){ const preview = document.getElementById('photoPreview'); if(preview) preview.src = url; }

      }catch(e){ console.warn('[savePhotosWithThumbs] skip image', e); }
      await new Promise(r=>setTimeout(r, 40)); // piccolo respiro
    }
  } finally {
    // rilascia guard dopo un tick (evita re-entry immediati)
    setTimeout(()=>{ delete window.__photoUploadGuards[recordId]; }, 150);
  }
}

async function getPhotos(recordId){
  const {data,error}=await sb.from('photos').select('path').eq('record_id',recordId).order('created_at',{ascending:false});
  if(error){ console.error('[getPhotos]', error); return {images:[], thumbs:[]} }
  const images=[];
  for(const row of (data||[])){
    if(!row || !row.path) continue;
    const pub=sb.storage.from(window.SB_BUCKET||'photos').getPublicUrl(row.path);
    const url=(pub && pub.data && pub.data.publicUrl) ? String(pub.data.publicUrl) : '';
    if(url) images.push(url);
  }
  return { images, thumbs: images };
}

(function(){ try{
  const ch1 = sb.channel('records-ch').on('postgres_changes',{event:'*',schema:'public',table:'records'},()=>{
    if(typeof refreshDashboard==='function') refreshDashboard();
    if(typeof lista==='function') lista();
  }).subscribe();
  const ch2 = sb.channel('photos-ch').on('postgres_changes',{event:'*',schema:'public',table:'photos'},()=>{
    if(typeof refreshDashboard==='function') refreshDashboard();
  }).subscribe();
  window.__sb_channels=[ch1,ch2];
  window.addEventListener('focus',()=>{ if(typeof refreshDashboard==='function') refreshDashboard(); });
  console.log('[realtime] attivo');
}catch(err){ console.warn('[realtime] non attivo:', err?.message||err); } })();
