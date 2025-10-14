/* ======================================================
   Supabase Cloud Bridge — sostituisce le funzioni locali
   usate da index.html con versioni cloud (Supabase)
   Tabelle attese:
     public.records (id text PK, ...fields..., createdAt timestamptz, updatedAt timestamptz)
     public.photos  (id uuid PK default gen_random_uuid(), record_id text, path text, created_at timestamptz default now())
   Storage:
     bucket "photos" pubblico in lettura
   ====================================================== */

if(!window.sb){ console.error("[cloud-db] Supabase client assente"); }

// ---- Helpers
function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }
function safeDateISO(v){
  if(!v) return null;
  try{ const d=new Date(v); return isNaN(d)? null : d.toISOString(); }catch(_){ return null; }
}

// ---- RECORDS
async function putRecord(v){
  // Normalizza campi principali per la tua app
  const row = {
    id: v.id,
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
  // elimina foto dallo storage prima di cancellare record
  try{
    const { data: ph, error: e1 } = await sb.from('photos').select('path').eq('record_id', id);
    if(!e1 && ph && ph.length){
      const toRemove = ph.map(p=>p.path);
      await sb.storage.from(window.SB_BUCKET).remove(toRemove);
    }
    await sb.from('photos').delete().eq('record_id', id);
  }catch(_){ /* noop */ }
  const { error } = await sb.from('records').delete().eq('id', id);
  if(error){ throw error; }
}

// ---- PHOTOS (Storage + tabella photos)
async function savePhotosWithThumbs(recordId, images, thumbs){
  if(!images || !images.length) return;
  // carica ogni immagine nel bucket e registra in tabella
  for(let i=0;i<images.length;i++){
    const dataUrl = images[i];
    // dataURL -> bytes
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
  // ritorna {images: [publicUrl...], thumbs: [publicUrl...]}
  const { data, error } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at', { ascending:true });
  if(error){ console.error(error); return { images:[], thumbs:[] }; }
  const images = [];
  for(const row of (data||[])){
    const { data:pub } = sb.storage.from(window.SB_BUCKET).getPublicUrl(row.path);
    if(pub && pub.publicUrl){ images.push(pub.publicUrl); }
  }
  return { images, thumbs: images };
}

// ---- Realtime: aggiorna automaticamente le liste tra dispositivi
(function setupRealtime(){
  try{
    const ch1 = sb.channel('records-ch')
      .on('postgres_changes', { event:'*', schema:'public', table:'records' }, (payload)=>{
        if(typeof refreshDashboard === 'function'){ refreshDashboard(); }
        // se sei in pagina ricerca
        if(typeof lista === 'function'){ lista(); }
      })
      .subscribe();
    const ch2 = sb.channel('photos-ch')
      .on('postgres_changes', { event:'*', schema:'public', table:'photos' }, (payload)=>{
        if(typeof refreshDashboard === 'function'){ refreshDashboard(); }
      })
      .subscribe();
    window.__sb_channels = [ch1, ch2];
    // Aggiorna su focus della finestra
    window.addEventListener('focus', ()=>{
      if(typeof refreshDashboard === 'function'){ refreshDashboard(); }
    });
    console.log("[realtime] attivo");
  }catch(err){
    console.warn("[realtime] non attivo:", err?.message||err);
  }
})();
