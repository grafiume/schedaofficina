(function(){
  if(!window.sb){ console.warn('[supabase] client assente, uso solo IndexedDB'); return; }
  console.log('[supabase] Bridge attivo (v6.3.3)');
  async function upsert(table, payload){
    const { data, error } = await window.sb.from(table).upsert(payload).select();
    if(error) throw error; return data;
  }
  async function savePhotos(id, images, thumbs){
    const payload = { id, images, thumbs };
    const { data, error } = await window.sb.from('photos').upsert(payload).select();
    if(error) throw error; return data;
  }
  window.sbbridge = {
    async syncRecord(rec, images, thumbs){
      const norm = { ...rec };
      ['dataApertura','dataAccettazione','dataScadenza','dataCompletamento','createdAt','updatedAt'].forEach(k=>{ if(norm[k]==='') norm[k]=null; });
      await upsert('records', norm);
      if((images&&images.length)||(thumbs&&thumbs.length)) await savePhotos(rec.id, images||[], thumbs||[]);
    }
  };
})();