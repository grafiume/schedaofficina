/*! cloud-db.v3.2.js — Supabase sync + Exact-Match search (safe fix)
 *  - Fix: usa `const sb = window.sb` per evitare ReferenceError e blocchi JS.
 *  - R/W su Supabase + upload foto con dedupe.
 *  - Realtime refresh.
 *  - Override di `lista()` per ricerca a MATCH ESATTO senza toccare l'index.
 */
(function(){
  // ===== Safe Supabase binding =====
  const sb = (typeof window !== 'undefined') ? window.sb : null;
  if(!sb){
    console.error("[cloud-db] Supabase client assente (window.sb non definito). Carica prima supabase-client.js");
    // Non throw: evitiamo di bloccare il resto dell'app. Le funzioni ritorneranno fallback.
  }

  function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }
  const BUCKET = (typeof window !== 'undefined' && window.SB_BUCKET) ? window.SB_BUCKET : 'photos';

  // ===== CRUD =====
  async function putRecord(v){
    if(!sb) return;
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
    const { error } = await sb.from('records').upsert(row, { onConflict:'id' });
    if(error){ console.error('[putRecord]', error); throw error; }
  }
  async function getRecord(id){
    if(!sb) return null;
    const { data, error } = await sb.from('records').select('*').eq('id', id).single();
    if(error){ console.error('[getRecord]', error); throw error; }
    return data;
  }
  async function getAllRecords(){
    if(!sb) return [];
    const { data, error } = await sb.from('records').select('*').order('updatedAt', { ascending:false });
    if(error){ console.error('[getAllRecords]', error); throw error; }
    return data || [];
  }
  async function getByStato(st){
    if(!sb) return [];
    const { data, error } = await sb.from('records').select('*').eq('statoPratica', st).order('updatedAt', { ascending:false });
    if(error){ console.error('[getByStato]', error); throw error; }
    return data || [];
  }
  async function deleteRecord(id){
    if(!sb) return;
    try{
      const { data: ph } = await sb.from('photos').select('path').eq('record_id', id);
      const del = (ph || []).map(p => p.path).filter(Boolean);
      if(del.length) await sb.storage.from(BUCKET).remove(del);
      await sb.from('photos').delete().eq('record_id', id);
    }catch(_){ /* ignore storage errors */ }
    const { error } = await sb.from('records').delete().eq('id', id);
    if(error){ console.error('[deleteRecord]', error); throw error; }
  }

  // Esponi a window per l'index
  window.putRecord = putRecord;
  window.getRecord = getRecord;
  window.getAllRecords = getAllRecords;
  window.getByStato = getByStato;
  window.deleteRecord = deleteRecord;

  // ===== Photo upload dedupe =====
  window.__photoUploadGuards = window.__photoUploadGuards || {};
  async function savePhotosWithThumbs(recordId, images, thumbs){
    if(!sb) return;
    if(!images || !images.length) return;

    // evita chiamate simultanee per lo stesso record
    if(window.__photoUploadGuards[recordId]) return;
    window.__photoUploadGuards[recordId] = true;

    try{
      const onlyData = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
      if(!onlyData.length) return;

      const toUpload = Array.from(new Set(onlyData)); // dedupe dataURL identici
      for(let i=0;i<toUpload.length;i++){
        try{
          const dataUrl = toUpload[i];
          const parts = dataUrl.split(',');
          if(parts.length < 2) continue;
          const base64 = parts[1];
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          const path  = `${recordId}/${Date.now()}-${i+1}.jpg`;

          const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType:'image/jpeg', upsert:false });
          if(up?.error && !(String(up.error.message||'').includes('already exists'))){
            console.warn('[upload photo]', up.error);
            continue;
          }

          const ins = await sb.from('photos').insert({ record_id: recordId, path });
          if(ins?.error){ console.warn('[photos insert]', ins.error); }

          // Aggiorna anteprima con l'ultima foto caricata
          const pub = sb.storage.from(BUCKET).getPublicUrl(path);
          const url = (pub && pub.data && pub.data.publicUrl) ? String(pub.data.publicUrl) : '';
          if(url){
            const preview = document.getElementById('photoPreview');
            if(preview) preview.src = url;
          }
        }catch(e){
          console.warn('[savePhotosWithThumbs] skip image', e);
        }
        // micro delay per non saturare
        await new Promise(r=>setTimeout(r, 40));
      }
    }finally{
      setTimeout(()=>{ delete window.__photoUploadGuards[recordId]; }, 150);
    }
  }
  window.savePhotosWithThumbs = savePhotosWithThumbs;

  async function getPhotos(recordId){
    if(!sb) return {images:[], thumbs:[]};
    const { data, error } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at', { ascending:false });
    if(error){
      console.error('[getPhotos]', error);
      return { images: [], thumbs: [] };
    }
    const images = [];
    for(const row of (data || [])){
      if(!row || !row.path) continue;
      const pub = sb.storage.from(BUCKET).getPublicUrl(row.path);
      const url = (pub && pub.data && pub.data.publicUrl) ? String(pub.data.publicUrl) : '';
      if(url) images.push(url);
    }
    return { images, thumbs: images };
  }
  window.getPhotos = getPhotos;

  // ===== Realtime sync =====
  (function(){
    if(!sb) return;
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

  // ===== Exact-Match Search override for `lista()` =====
  (function(){
    // Normalizza query/campi
    function norm(v){ return String(v ?? '').trim().toLowerCase(); }
    // true se almeno un campo è esattamente uguale alla query
    function isExactMatchRecord(r, q){
      const needle = norm(q);
      const fields = [
        'descrizione','modello','cliente','telefono','docTrasporto',
        'battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco',
        'punta','numPunte'
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
            const comp = await window.getByStato('Completata');
            const cons = await window.getByStato('Consegnata'); // compat se esiste
            rows = [...comp, ...cons];
          }else{
            const stato = (window.currentFilter === 'attesa') ? 'In attesa' : 'In lavorazione';
            rows = await window.getByStato(stato);
          }
        }else{
          rows = await window.getAllRecords();
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
        console.error('[cloud-db.v3.2] lista():', err);
        if(typeof __orig_lista === 'function'){ try{ return await __orig_lista(); }catch(e){ console.error('[cloud-db.v3.2] fallback lista() err:', e); } }
      }
    };
    console.log('[cloud-db] Exact-Match override attivo');
  })();

})();