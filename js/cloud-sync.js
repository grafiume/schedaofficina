// === Cloud sync layer (Supabase) — legacy lowercase columns compatible ===
(function(){
  const log = (...a)=>console.log('[cloud-sync]', ...a);
  const warn = (...a)=>console.warn('[cloud-sync]', ...a);
  const errL = (...a)=>console.error('[cloud-sync]', ...a);

  if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
    warn('Missing Supabase config. Falling back to local IndexedDB.');
    return;
  }
  if(!window.supabase){
    warn('supabase-js not loaded. Falling back to local IndexedDB.');
    return;
  }

  const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  window.__sb = sb;

  const isoNow = ()=>new Date().toISOString();
  const genId = ()=> 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

  function toLegacyRow(v){
    const out = {};
    out.id               = v.id || genId();
    out.descrizione      = v.descrizione ?? v.Descrizione ?? '';
    out.modello          = v.modello ?? v.Modello ?? '';
    out.cliente          = v.cliente ?? v.Cliente ?? '';
    out.telefono         = v.telefono ?? v.Telefono ?? '';
    out.email            = v.email ?? v.Email ?? '';
    out.punta            = v.punta ?? v.Punta ?? '';
    out.numpunte         = v.numpunte ?? v.numPunte ?? v.NumPunte ?? '';
    out.statopratica     = v.statopratica ?? v.statoPratica ?? v.StatoPratica ?? '';
    out.preventivostato  = v.preventivostato ?? v.preventivoStato ?? '';
    out.doctrasporto     = v.doctrasporto ?? v.docTrasporto ?? '';
    out.dataapertura     = v.dataapertura ?? v.dataApertura ?? null;
    out.dataaccettazione = v.dataaccettazione ?? v.dataAccettazione ?? null;
    out.datascadenza     = v.datascadenza ?? v.dataScadenza ?? null;
    out.dataarrivo       = v.dataarrivo ?? v.dataArrivo ?? null;
    out.datacompletamento= v.datacompletamento ?? v.dataCompletamento ?? null;
    out.note             = v.note ?? '';
    out.createdat        = v.createdat ?? v.createdAt ?? isoNow();
    out.updatedat        = isoNow();
    return out;
  }

  async function sbUpsert(table, data){
    const { data: rows, error, status, statusText } = await sb.from(table).upsert(data).select();
    if(error){
      errL('Upsert error', {table, status, statusText, error});
      throw error;
    }
    return Array.isArray(rows) ? rows[0] : rows;
  }
  async function sbGet(table, id){
    const { data: rows, error } = await sb.from(table).select('*').eq('id', id).limit(1);
    if(error){ errL('Get error', error); throw error; }
    return rows && rows[0] || null;
  }
  async function sbDelete(table, id){
    const { error } = await sb.from(table).delete().eq('id', id);
    if(error){ errL('Delete error', error); throw error; }
  }

  const _putLocal   = window.putRecord;
  const _getLocal   = window.getRecord;
  const _allLocal   = window.getAllRecords;
  const _delLocal   = window.deleteRecord;
  const _savePhLoc  = window.savePhotosWithThumbs || window.savePhotos;
  const _getPhLoc   = window.getPhotos;

  async function putRecordCloud(v){
    const row = await sbUpsert('records', toLegacyRow(v));
    try{ await _putLocal(row); }catch{}
    return row;
  }
  async function getRecordCloud(id){
    const r = await sbGet('records', id);
    if(r){ try{ await _putLocal(r); }catch{} }
    return r;
  }
  async function getAllRecordsCloud(){
    const { data: rows, error } = await sb
      .from('records')
      .select('*')
      .order('updatedat', { ascending:false, nullsFirst:false });
    if(error){ errL('List error', error); throw error; }
    if(Array.isArray(rows)){
      for(const r of rows){ try{ await _putLocal(r); }catch{} }
    }
    return rows || [];
  }
  async function getByStatoCloud(stato){
    const { data: rows, error } = await sb
      .from('records')
      .select('*')
      .eq('statopratica', stato)
      .order('updatedat', { ascending:false, nullsFirst:false });
    if(error){ errL('Filter error', error); throw error; }
    return rows || [];
  }
  async function deleteRecordCloud(id){
    await sbDelete('records', id);
    try{ await _delLocal(id); }catch{}
  }
  async function savePhotosWithThumbsCloud(id, images, thumbs){
    const rec = { id, images: images||[], thumbs: thumbs||[] };
    const { data, error, status } = await sb.from('photos').upsert(rec).select();
    if(error){ errL('Photos upsert error', {status, error}); throw error; }
    try{ await _savePhLoc(id, images, thumbs); }catch{}
  }
  async function getPhotosCloud(id){
    const { data: rows, error } = await sb.from('photos').select('*').eq('id', id).limit(1);
    if(error){ errL('Photos get error', error); throw error; }
    const row = rows && rows[0];
    if(row){
      try{ await _savePhLoc(id, row.images||[], row.thumbs||[]); }catch{}
      return { images: row.images||[], thumbs: row.thumbs||[] };
    }
    return { images: [], thumbs: [] };
  }

  window.putRecord = putRecordCloud;
  window.getRecord = getRecordCloud;
  window.getAllRecords = getAllRecordsCloud;
  window.getByStato = getByStatoCloud;
  window.deleteRecord = deleteRecordCloud;
  window.savePhotosWithThumbs = savePhotosWithThumbsCloud;
  window.getPhotos = getPhotosCloud;

  log('Supabase cloud mode ACTIVE (legacy columns compatible)');
})();
