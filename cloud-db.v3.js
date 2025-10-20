/*! cloud-db.v3.5.js — HYBRID (Supabase + IndexedDB fallback) + Exact-Match incl. NOTE
 *  - Cattura le funzioni IndexedDB già presenti nell'index (se esistono) e le usa come fallback.
 *  - Se `window.sb` è disponibile, usa Supabase; in caso di errore/assenza, usa IndexedDB.
 *  - CRUD + photos + realtime (se sb c'è).
 *  - Override `lista()` con match ESATTO (incl. `note`) senza toccare l'HTML.
 */

(function(){
  // ===== Cattura ORIGINALI (IndexedDB) per fallback =====
  const IDB = {
    getRecord:      window.getRecord,
    getAllRecords:  window.getAllRecords,
    getByStato:     window.getByStato,
    deleteRecord:   window.deleteRecord,
    savePhotosWithThumbs: window.savePhotosWithThumbs,
    getPhotos:      window.getPhotos,
    putRecord:      window.putRecord
  };

  // ===== Safe Supabase binding =====
  const sb = (typeof window !== 'undefined') ? window.sb : null;
  const BUCKET = (typeof window !== 'undefined' && window.SB_BUCKET) ? window.SB_BUCKET : 'photos';

  function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }

  // ===== HYBRID CRUD =====
  async function putRecord(v){
    // Se Supabase non esiste → delega a IndexedDB originale
    if(!sb){
      if(typeof IDB.putRecord === 'function') return IDB.putRecord(v);
      return;
    }
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
    if(error){ console.warn('[putRecord sb->idb fallback]', error); if(typeof IDB.putRecord==='function') return IDB.putRecord(v); throw error; }
  }

  async function getRecord(id){
    if(!sb){
      if(typeof IDB.getRecord==='function') return IDB.getRecord(id);
      return null;
    }
    const { data, error } = await sb.from('records').select('*').eq('id', id).single();
    if(error){
      console.warn('[getRecord sb->idb fallback]', error);
      if(typeof IDB.getRecord==='function') return IDB.getRecord(id);
      return null;
    }
    return data;
  }

  async function getAllRecords(){
    if(!sb){
      if(typeof IDB.getAllRecords==='function') return IDB.getAllRecords();
      return [];
    }
    const { data, error } = await sb.from('records').select('*').order('updatedAt', { ascending: false });
    if(error || !Array.isArray(data)){
      if(error) console.warn('[getAllRecords sb->idb fallback]', error);
      if(typeof IDB.getAllRecords==='function') return IDB.getAllRecords();
      return [];
    }
    // Se Supabase è vuoto ma abbiamo IDB, prova fallback così Home non risulta "vuota"
    if((data || []).length === 0 && typeof IDB.getAllRecords==='function'){
      const idbData = await IDB.getAllRecords();
      if(Array.isArray(idbData) && idbData.length) return idbData;
    }
    return data || [];
  }

  async function getByStato(st){
    if(!sb){
      if(typeof IDB.getByStato==='function') return IDB.getByStato(st);
      return [];
    }
    const { data, error } = await sb.from('records').select('*').eq('statoPratica', st).order('updatedAt', { ascending:false });
    if(error || !Array.isArray(data)){
      if(error) console.warn('[getByStato sb->idb fallback]', error);
      if(typeof IDB.getByStato==='function') return IDB.getByStato(st);
      return [];
    }
    if((data||[]).length===0 && typeof IDB.getByStato==='function'){
      const idbData = await IDB.getByStato(st);
      if(Array.isArray(idbData) && idbData.length) return idbData;
    }
    return data || [];
  }

  async function deleteRecord(id){
    if(!sb){
      if(typeof IDB.deleteRecord==='function') return IDB.deleteRecord(id);
      return;
    }
    try{
      const { data: ph } = await sb.from('photos').select('path').eq('record_id', id);
      const del = (ph || []).map(p => p.path).filter(Boolean);
      if(del.length) await sb.storage.from(BUCKET).remove(del);
      await sb.from('photos').delete().eq('record_id', id);
      await sb.from('records').delete().eq('id', id);
    }catch(err){
      console.warn('[deleteRecord sb->idb fallback]', err);
      if(typeof IDB.deleteRecord==='function') return IDB.deleteRecord(id);
    }
  }

  window.putRecord = putRecord;
  window.getRecord = getRecord;
  window.getAllRecords = getAllRecords;
  window.getByStato = getByStato;
  window.deleteRecord = deleteRecord;

  // ===== HYBRID Photos =====
  window.__photoUploadGuards = window.__photoUploadGuards || {};
  async function savePhotosWithThumbs(recordId, images, thumbs){
    if(!sb){
      // se non c'è Supabase, delega al vecchio gestore (se esiste) o no-op
      if(typeof IDB.savePhotosWithThumbs === 'function') return IDB.savePhotosWithThumbs(recordId, images, thumbs);
      return;
    }
    if(!images || !images.length) return;
    if(window.__photoUploadGuards[recordId]) return;
    window.__photoUploadGuards[recordId] = true;
    try{
      const onlyData = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
      if(!onlyData.length) return;
      const toUpload = Array.from(new Set(onlyData));
      for(let i=0;i<toUpload.length;i++){
        try{
          const dataUrl = toUpload[i];
          const parts = dataUrl.split(',');
          if(parts.length < 2) continue;
          const base64 = parts[1];
          const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          const path   = `${recordId}/${Date.now()}-${i+1}.jpg`;
          const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType:'image/jpeg', upsert:false });
          if(up?.error && !(String(up.error.message||'').includes('already exists'))){
            console.warn('[upload photo]', up.error);
            continue;
          }
          const ins = await sb.from('photos').insert({ record_id: recordId, path });
          if(ins?.error){ console.warn('[photos insert]', ins.error); }
          const pub = sb.storage.from(BUCKET).getPublicUrl(path);
          const url = (pub && pub.data && pub.data.publicUrl) ? String(pub.data.publicUrl) : '';
          if(url){
            const preview = document.getElementById('photoPreview');
            if(preview) preview.src = url;
          }
        }catch(e){
          console.warn('[savePhotosWithThumbs] skip image', e);
        }
        await new Promise(r=>setTimeout(r, 40));
      }
    }finally{
      setTimeout(()=>{ delete window.__photoUploadGuards[recordId]; }, 150);
    }
  }
  window.savePhotosWithThumbs = savePhotosWithThumbs;

  async function getPhotos(recordId){
    if(!sb){
      if(typeof IDB.getPhotos==='function') return IDB.getPhotos(recordId);
      return { images:[], thumbs:[] };
    }
    const { data, error } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at', { ascending:false });
    if(error){
      console.warn('[getPhotos sb->idb fallback]', error);
      if(typeof IDB.getPhotos==='function') return IDB.getPhotos(recordId);
      return { images:[], thumbs:[] };
    }
    const images = [];
    for(const row of (data || [])){
      if(!row || !row.path) continue;
      const pub = sb.storage.from(BUCKET).getPublicUrl(row.path);
      const url = (pub && pub.data && pub.data.publicUrl) ? String(pub.data.publicUrl) : '';
      if(url) images.push(url);
    }
    if(images.length === 0 && typeof IDB.getPhotos==='function'){
      const local = await IDB.getPhotos(recordId);
      if(local && Array.isArray(local.images) && local.images.length) return local;
    }
    return { images, thumbs: images };
  }
  window.getPhotos = getPhotos;

  // ===== Realtime (solo se sb esiste) =====
  (function(){
    if(!sb) { console.log('[realtime] disattivo (nessun sb)'); return; }
    try{
      const ch1 = sb.channel('records-ch')
        .on('postgres_changes', { event:'*', schema:'public', table:'records' }, () => {
          if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
          if(typeof window.lista === 'function') window.lista();
        }).subscribe();
      const ch2 = sb.channel('photos-ch')
        .on('postgres_changes', { event:'*', schema:'public', table:'photos' }, () => {
          if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
        }).subscribe();
      window.__sb_channels = [ch1, ch2];
      window.addEventListener('focus', () => {
        if(typeof window.refreshDashboard === 'function') window.refreshDashboard();
      });
      console.log('[realtime] attivo');
    }catch(err){
      console.warn('[realtime] non attivo:', err?.message || err);
    }
  })();

  // ===== Exact-Match override (incl. NOTE) =====
  (function(){
    function norm(v){ return String(v ?? '').trim().toLowerCase(); }
    function isExactMatchRecord(r, q){
      const needle = norm(q);
      const fields = [
        'descrizione','modello','cliente','telefono','docTrasporto',
        'battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco',
        'punta','numPunte','note'
      ];
      for(const k of fields){ if(norm(r?.[k]) === needle) return true; }
      return false;
    }

    const __orig_lista = window.lista;
    window.lista = async function(){
      try{
        const qEl = document.getElementById('q');
        const q = qEl ? qEl.value : '';
        let rows;
        if(window.currentFilter === 'attesa' || window.currentFilter === 'lavorazione' || window.currentFilter === 'completed'){
          if(window.currentFilter === 'completed'){
            const comp = await getByStato('Completata');
            const cons = await getByStato('Consegnata');
            rows = [...(comp||[]), ...(cons||[])];
          }else{
            const stato = (window.currentFilter === 'attesa') ? 'In attesa' : 'In lavorazione';
            rows = await getByStato(stato);
          }
        }else{
          rows = await getAllRecords();
        }
        if(window.currentFilter === 'soon'){
          rows = rows.filter(r => window.isSoon(window.parseDate(r.dataScadenza)));
        }
        const qn = norm(q);
        if(qn){ rows = rows.filter(r => isExactMatchRecord(r, qn)); }
        if(typeof window.matchTechFilters === 'function'){ rows = rows.filter(window.matchTechFilters); }
        rows.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));

        const box = document.getElementById('activeFilterBox');
        const lab = document.getElementById('activeFilterLabel');
        if(box && lab){
          if(window.currentFilter){
            box.classList.remove('d-none');
            const lbl = (window.FILTER_LABELS && window.FILTER_LABELS[window.currentFilter]) || 'Filtro attivo';
            lab.textContent = lbl;
          }else{
            box.classList.add('d-none');
            lab.textContent = '';
          }
        }
        window.searchRows = rows;
        window.page = 1;
        if(typeof window.renderPager === 'function') window.renderPager(window.searchRows.length);
        if(typeof window.drawListPage === 'function') await window.drawListPage();
      }catch(err){
        console.error('[v3.5] lista():', err);
        if(typeof __orig_lista === 'function'){
          try{ return await __orig_lista(); }catch(e){ console.error('[v3.5] fallback lista() err:', e); }
        }
      }
    };
    console.log('%c[cloud-db] Exact-Match override attivo (HYBRID, incl. NOTE)', 'color:#1e8b3d');
  })();

})();