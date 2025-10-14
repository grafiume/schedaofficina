/* Supabase Cloud Bridge (UUID-ready) */
if(!window.sb){ console.error("[cloud-db] Supabase client assente"); }

function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }

async function putRecord(v){
  const row = {
    id: v.id || (typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2))),
    descrizione: v.descrizione ?? null,
    modello: v.modello ?? null,
    cliente: v.cliente ?? null,
    telefono: v.telefono ?? null,
    email: v.email ?? null,
    punta: v.punta ?? null,
    numPunte: v.numPunte ?? null,
    statoPratica: v.statoPratica ?? 'In attesa',
    preventivoStato: v.preventivoStato ?? 'Non inviato',
    docTrasporto: v.docTrasporto ?? null,
    dataApertura: toNullEmpty(v.dataApertura),
    dataAccettazione: toNullEmpty(v.dataAccettazione),
    dataScadenza: toNullEmpty(v.dataScadenza),
    dataArrivo: toNullEmpty(v.dataArrivo),
    dataCompletamento: toNullEmpty(v.dataCompletamento),
    note: v.note ?? null,
    createdAt: v.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const { error } = await sb.from('records').upsert(row, { onConflict: 'id' });
  if(error){ console.error(error); throw error; }
  return row.id;
}

async function getRecord(id){
  const { data, error } = await sb.from('records').select('*').eq('id', id).single();
  if(error){ throw error; }
  return data;
}

async function getAllRecords(){
  const { data, error } = await sb.from('records').select('*').order('updatedAt', { ascending:false });
  if(error){ throw error; }
  return data || [];
}

async function getByStato(stato){
  const { data, error } = await sb.from('records').select('*').eq('statoPratica', stato).order('updatedAt', { ascending:false });
  if(error){ throw error; }
  return data || [];
}

async function deleteRecord(id){
  try{
    const { data: ph } = await sb.from('photos').select('path').eq('record_id', id);
    if(ph && ph.length){
      const toRemove = ph.map(p=>p.path);
      await sb.storage.from(window.SB_BUCKET).remove(toRemove);
    }
    await sb.from('photos').delete().eq('record_id', id);
  }catch(_){}
  const { error } = await sb.from('records').delete().eq('id', id);
  if(error){ throw error; }
}

async function savePhotosWithThumbs(recordId, images, thumbs){
  if(!images || !images.length) return;
  for(let i=0;i<images.length;i++){
    const dataUrl = images[i];
    const base64 = dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const path = `${recordId}/${Date.now()}-${i+1}.jpg`;
    const { error: upErr } = await sb.storage.from(window.SB_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if(upErr && upErr.message && !upErr.message.includes('already exists')){
      console.error("[upload photo]", upErr);
      continue;
    }
    await sb.from('photos').insert({ record_id: recordId, path });
  }
}

async function getPhotos(recordId){
  const { data, error } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at', { ascending:true });
  if(error){ console.error(error); return { images:[], thumbs:[] }; }
  const images = [];
  for(const row of (data||[])){
    const { data:pub } = sb.storage.from(window.SB_BUCKET).getPublicUrl(row.path);
    if(pub && pub.publicUrl){ images.push(pub.publicUrl); }
  }
  return { images, thumbs: images };
}

(function setupRealtime(){
  try{
    const ch1 = sb.channel('records-ch')
      .on('postgres_changes', { event:'*', schema:'public', table:'records' }, (_)=>{
        if(typeof refreshDashboard === 'function'){ refreshDashboard(); }
        if(typeof lista === 'function'){ lista(); }
      })
      .subscribe();
    const ch2 = sb.channel('photos-ch')
      .on('postgres_changes', { event:'*', schema:'public', table:'photos' }, (_)=>{
        if(typeof refreshDashboard === 'function'){ refreshDashboard(); }
      })
      .subscribe();
    window.__sb_channels = [ch1, ch2];
    window.addEventListener('focus', ()=>{
      if(typeof refreshDashboard === 'function'){ refreshDashboard(); }
    });
    console.log("[realtime] attivo");
  }catch(err){
    console.warn("[realtime] non attivo:", err?.message||err);
  }
})();
