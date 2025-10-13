
/**
 * app-supabase.v6.3.2.js
 * Bridge che sincronizza i dati con Supabase e sovrascrive le funzioni
 * locali (IndexedDB) definite in index.html: getAllRecords, getRecord, putRecord,
 * getByStato, deleteRecord, savePhotosWithThumbs, getPhotos.
 * - Richiede: window.SUPABASE_URL, window.SUPABASE_ANON_KEY, supabase-js v2.
 * - Schema atteso: tabelle "records" e "photos" (vedi schema.sql incluso).
 */
(function(){
  const url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
  if(!url || !key || typeof window.supabase === 'undefined'){
    console.warn("[supabase] Config mancante o client non caricato. Resto in locale.");
    return;
  }
  const sb = window.supabase.createClient(url, key);
  console.log("[supabase] Bridge attivo su", url);

  // Conserviamo i riferimenti alle funzioni originali (IndexedDB) come fallback
  const _getAllRecords = window.getAllRecords;
  const _getRecord = window.getRecord;
  const _putRecord = window.putRecord;
  const _getByStato = window.getByStato;
  const _deleteRecord = window.deleteRecord;
  const _savePhotosWithThumbs = window.savePhotosWithThumbs;
  const _getPhotos = window.getPhotos;

  async function sbPutRecord(v){
    // upsert su "records"
    const { error } = await sb.from('records').upsert(v).select().single();
    if(error){
      console.warn("[supabase] putRecord errore, fallback locale:", error.message);
      return _putRecord ? _putRecord(v) : void 0;
    }
    // salva anche offline per velocità
    if(_putRecord) try{ await _putRecord(v); }catch{}
  }

  async function sbGetRecord(id){
    const { data, error } = await sb.from('records').select('*').eq('id', id).maybeSingle();
    if(error){
      console.warn("[supabase] getRecord errore, fallback locale:", error.message);
      return _getRecord ? _getRecord(id) : null;
    }
    if(!data && _getRecord) return _getRecord(id);
    // tieni un mirror locale
    if(data && _putRecord) try{ await _putRecord(data); }catch{}
    return data;
  }

  async function sbGetAllRecords(){
    const { data, error } = await sb.from('records').select('*').order('updatedAt', { ascending: false });
    if(error){
      console.warn("[supabase] getAllRecords errore, fallback locale:", error.message);
      return _getAllRecords ? _getAllRecords() : [];
    }
    // mirror locale
    if(Array.isArray(data) && _putRecord){
      for(const r of data){ try{ await _putRecord(r); }catch{} }
    }
    return data || [];
  }

  async function sbGetByStato(stato){
    const { data, error } = await sb.from('records').select('*').eq('statoPratica', stato);
    if(error){
      console.warn("[supabase] getByStato errore, fallback locale:", error.message);
      return _getByStato ? _getByStato(stato) : [];
    }
    // mirror locale
    if(Array.isArray(data) && _putRecord){
      for(const r of data){ try{ await _putRecord(r); }catch{} }
    }
    return data || [];
  }

  async function sbDeleteRecord(id){
    const { error } = await sb.from('records').delete().eq('id', id);
    if(error){
      console.warn("[supabase] deleteRecord errore, fallback locale:", error.message);
      return _deleteRecord ? _deleteRecord(id) : void 0;
    }
    if(_deleteRecord) try{ await _deleteRecord(id); }catch{}
  }

  async function sbSavePhotosWithThumbs(id, images, thumbs){
    const payload = { id, images: images||[], thumbs: thumbs||[], updated_at: new Date().toISOString() };
    const { error } = await sb.from('photos').upsert(payload).select().single();
    if(error){
      console.warn("[supabase] savePhotosWithThumbs errore, fallback locale:", error.message);
      return _savePhotosWithThumbs ? _savePhotosWithThumbs(id, images, thumbs) : void 0;
    }
    if(_savePhotosWithThumbs) try{ await _savePhotosWithThumbs(id, images, thumbs); }catch{}
  }

  async function sbGetPhotos(id){
    const { data, error } = await sb.from('photos').select('*').eq('id', id).maybeSingle();
    if(error){
      console.warn("[supabase] getPhotos errore, fallback locale:", error.message);
      return _getPhotos ? _getPhotos(id) : { images: [], thumbs: [] };
    }
    if(!data) return { images: [], thumbs: [] };
    // mirror locale
    if(_savePhotosWithThumbs) try{ await _savePhotosWithThumbs(id, data.images || [], data.thumbs || []); }catch{}
    return { images: data.images || [], thumbs: data.thumbs || [] };
  }

  // Sostituzione delle funzioni globali con le versioni cloud
  window.putRecord = sbPutRecord;
  window.getRecord = sbGetRecord;
  window.getAllRecords = sbGetAllRecords;
  window.getByStato = sbGetByStato;
  window.deleteRecord = sbDeleteRecord;
  window.savePhotosWithThumbs = sbSavePhotosWithThumbs;
  window.getPhotos = sbGetPhotos;

  // Realtime per aggiornare la dashboard automaticamente su più dispositivi
  try{
    sb.channel('records-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, payload => {
        if(typeof window.refreshDashboard === 'function'){
          window.refreshDashboard();
        }
        if(typeof window.lista === 'function'){
          window.lista();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, payload => {
        if(typeof window.refreshDashboard === 'function'){
          window.refreshDashboard();
        }
      })
      .subscribe();
  }catch(e){
    console.warn("[supabase] realtime non disponibile:", e?.message);
  }
})();
