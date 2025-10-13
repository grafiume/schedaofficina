
/**
 * app-supabase.v6.3.3.js
 * - Normalizza valori prima dell'upsert ('' -> null per date/number)
 * - Evita errori 400 su Supabase quando i campi date sono stringhe vuote
 * - Gestisce mancanza colonne in 'photos' con fallback silenzioso
 */
(function(){
  const url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
  if(!url || !key || typeof window.supabase === 'undefined'){
    console.warn("[supabase] Config mancante o client non caricato. Resto in locale.");
    return;
  }
  const sb = window.supabase.createClient(url, key);
  console.log("[supabase] Bridge attivo (v6.3.3) su", url);

  const _getAllRecords = window.getAllRecords;
  const _getRecord = window.getRecord;
  const _putRecord = window.putRecord;
  const _getByStato = window.getByStato;
  const _deleteRecord = window.deleteRecord;
  const _savePhotosWithThumbs = window.savePhotosWithThumbs;
  const _getPhotos = window.getPhotos;

  const DATE_FIELDS = ["dataApertura","dataAccettazione","dataScadenza","dataArrivo","dataCompletamento","createdAt","updatedAt"];
  const NUM_FIELDS = []; // aggiungi qui se hai campi number obbligatori

  function isBlank(x){ return x === "" || x === undefined || x === null; }
  function toISOorNull(v){
    if(isBlank(v)) return null;
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = String(v).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if(m){
      const d = m[1].padStart(2,'0'), mo = m[2].padStart(2,'0'), y = m[3];
      return `${y}-${mo}-${d}`;
    }
    return null;
    }
  function toNumberOrNull(v){
    if(isBlank(v)) return null;
    const n = Number(String(v).replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  }
  function sanitizeRecord(v){
    const out = {...v};
    for(const k of DATE_FIELDS){
      if(k in out) out[k] = toISOorNull(out[k]);
    }
    for(const k of NUM_FIELDS){
      if(k in out) out[k] = toNumberOrNull(out[k]);
    }
    for(const k in out){
      if(out[k] === "") out[k] = null;
    }
    out.updatedAt = new Date().toISOString();
    return out;
  }

  async function sbPutRecord(v){
    const payload = sanitizeRecord(v);
    const { error } = await sb.from('records').upsert(payload).select().maybeSingle();
    if(error){
      console.warn("[supabase] putRecord errore, fallback locale:", error.message);
      return _putRecord ? _putRecord(v) : void 0;
    }
    if(_putRecord) try{ await _putRecord(payload); }catch{}
  }

  async function sbGetRecord(id){
    const { data, error } = await sb.from('records').select('*').eq('id', id).maybeSingle();
    if(error){
      console.warn("[supabase] getRecord errore, fallback locale:", error.message);
      return _getRecord ? _getRecord(id) : null;
    }
    if(data && _putRecord) try{ await _putRecord(data); }catch{}
    return data;
  }

  async function sbGetAllRecords(){
    const { data, error } = await sb.from('records').select('*').order('updatedAt', { ascending: false }).order('createdAt', { ascending: false });
    if(error){
      console.warn("[supabase] getAllRecords errore, fallback locale:", error.message);
      return _getAllRecords ? _getAllRecords() : [];
    }
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
    try{
      const payload = { id, images: images || [], thumbs: thumbs || [], updated_at: new Date().toISOString() };
      const { error } = await sb.from('photos').upsert(payload).select().maybeSingle();
      if(error) throw error;
      if(_savePhotosWithThumbs) try{ await _savePhotosWithThumbs(id, images, thumbs); }catch{}
    }catch(e){
      console.warn("[supabase] savePhotosWithThumbs errore (ignoro e continuo):", e?.message);
      if(_savePhotosWithThumbs) try{ await _savePhotosWithThumbs(id, images, thumbs); }catch{}
    }
  }

  async function sbGetPhotos(id){
    try{
      const { data, error } = await sb.from('photos').select('*').eq('id', id).maybeSingle();
      if(error) throw error;
      const res = { images: data?.images || [], thumbs: data?.thumbs || [] };
      if(_savePhotosWithThumbs) try{ await _savePhotosWithThumbs(id, res.images, res.thumbs); }catch{}
      return res;
    }catch(e){
      console.warn("[supabase] getPhotos errore (uso fallback locale):", e?.message);
      return _getPhotos ? _getPhotos(id) : { images: [], thumbs: [] };
    }
  }

  window.putRecord = sbPutRecord;
  window.getRecord = sbGetRecord;
  window.getAllRecords = sbGetAllRecords;
  window.getByStato = sbGetByStato;
  window.deleteRecord = sbDeleteRecord;
  window.savePhotosWithThumbs = sbSavePhotosWithThumbs;
  window.getPhotos = sbGetPhotos;

  try{
    sb.channel('records-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, () => {
        if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
        if(typeof window.lista === 'function') window.lista();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, () => {
        if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
      })
      .subscribe();
  }catch(e){
    console.warn("[supabase] realtime non disponibile:", e?.message);
  }
})();
