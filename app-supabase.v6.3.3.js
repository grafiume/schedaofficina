(function(){
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON;
  if(!window.sb || !url || !key){
    console.warn('[supabase] Config mancante o client non caricato. Resto in locale.');
    return;
  }
  console.log('[supabase] Bridge attivo (v6.3.3) su ' + url);

  async function upsert(table, payload){
    try{
      const { data, error } = await window.sb.from(table).upsert(payload).select();
      if(error) throw error;
      return data;
    }catch(e){
      console.warn('[supabase] upsert', table, e.message);
      throw e;
    }
  }

  async function savePhotos(recordId, images, thumbs){
    try{
      // schema semplice: una riga per record con arrays base64
      const payload = { id: recordId, images, thumbs };
      const { data, error } = await window.sb.from('photos').upsert(payload).select();
      if(error) throw error;
      return data;
    }catch(e){
      console.warn('[supabase] upsert photos', e.message);
      throw e;
    }
  }

  window.sbbridge = {
    async syncRecord(rec, images, thumbs){
      // Normalizza date ISO (Postgrest accetta '' per null via RLS permissiva)
      const norm = Object.assign({}, rec);
      ['dataApertura','dataAccettazione','dataScadenza','dataCompletamento','createdAt','updatedAt'].forEach(k=>{
        if(norm[k]==='') norm[k]=null;
      });
      await upsert('records', norm);
      if((images&&images.length) || (thumbs&&thumbs.length)){
        await savePhotos(rec.id, images||[], thumbs||[]);
      }
    }
  };
})();