// === Cloud sync layer (Supabase) ===
// Requires: window.SUPABASE_URL, window.SUPABASE_ANON_KEY, and supabase-js v2 loaded in the page

(function(){
  if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
    console.warn('[cloud-sync] Missing Supabase config. Falling back to local IndexedDB.');
    return;
  }
  if(!window.supabase){
    console.warn('[cloud-sync] supabase-js not loaded. Falling back to local IndexedDB.');
    return;
  }

  const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  window.__sb = sb;

  // --- helpers ---
  async function sbUpsert(table, data){
    const { data: rows, error } = await sb.from(table).upsert(data).select();
    if(error) throw error;
    return Array.isArray(rows) ? rows[0] : rows;
  }
  async function sbGet(table, id){
    const { data: rows, error } = await sb.from(table).select('*').eq('id', id).limit(1);
    if(error) throw error;
    return rows && rows[0] || null;
  }
  async function sbDelete(table, id){
    const { error } = await sb.from(table).delete().eq('id', id);
    if(error) throw error;
  }

  // --- API overrides ---
  const _putLocal   = window.putRecord;
  const _getLocal   = window.getRecord;
  const _allLocal   = window.getAllRecords;
  const _delLocal   = window.deleteRecord;
  const _savePhLoc  = window.savePhotosWithThumbs || window.savePhotos;
  const _getPhLoc   = window.getPhotos;

  async function putRecordCloud(v){
    // Keep updatedAt and createdAt consistent
    if(!v.createdAt) v.createdAt = new Date().toISOString();
    if(!v.updatedAt) v.updatedAt = new Date().toISOString();
    const row = await sbUpsert('records', v);
    try{ await _putLocal(v); }catch{}
    return row;
  }

  async function getRecordCloud(id){
    const r = await sbGet('records', id);
    if(r){ try{ await _putLocal(r); }catch{} }
    return r;
  }

  async function getAllRecordsCloud(){
    const { data: rows, error } = await sb.from('records').select('*').order('updatedAt', { ascending:false });
    if(error) throw error;
    // refresh local cache (best‑effort)
    if(Array.isArray(rows)){
      for(const r of rows){ try{ await _putLocal(r); }catch{} }
    }
    return rows || [];
  }

  async function getByStatoCloud(stato){
    const { data: rows, error } = await sb.from('records').select('*').eq('statoPratica', stato).order('updatedAt', { ascending:false });
    if(error) throw error;
    return rows || [];
  }

  async function deleteRecordCloud(id){
    await sbDelete('records', id);
    try{ await _delLocal(id); }catch{}
  }

  async function savePhotosWithThumbsCloud(id, images, thumbs){
    // store photos as single row per record id
    const rec = { id, images: images||[], thumbs: thumbs||[] };
    await sbUpsert('photos', rec);
    try{ await _savePhLoc(id, images, thumbs); }catch{}
  }

  async function getPhotosCloud(id){
    const { data: rows, error } = await sb.from('photos').select('*').eq('id', id).limit(1);
    if(error) throw error;
    const row = rows && rows[0];
    if(row){
      try{ await _savePhLoc(id, row.images||[], row.thumbs||[]); }catch{}
      return { images: row.images||[], thumbs: row.thumbs||[] };
    }
    return { images: [], thumbs: [] };
  }

  // Expose cloud overrides
  window.putRecord = putRecordCloud;
  window.getRecord = getRecordCloud;
  window.getAllRecords = getAllRecordsCloud;
  window.getByStato = getByStatoCloud;
  window.deleteRecord = deleteRecordCloud;
  window.savePhotosWithThumbs = savePhotosWithThumbsCloud;
  window.getPhotos = getPhotosCloud;

  // Small badge in console
  console.log('[cloud-sync] Supabase cloud mode ACTIVE');
})();
