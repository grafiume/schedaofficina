/* cloud-db.js (v3.1) — dedupe uploads to avoid duplicate photos */
if(!window.sb){ console.error("[cloud-db] Supabase client assente"); }
function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }

async function putRecord(v){
  const row = {
    id:v.id, descrizione:v.descrizione??null, modello:v.modello??null, cliente:v.cliente??null,
    telefono:v.telefono??null, email:v.email??null, punta:v.punta??null, numPunte:v.numPunte??null,
    statoPratica:v.statoPratica??'In attesa', preventivoStato:v.preventivoStato??'Non inviato',
    docTrasporto:v.docTrasporto??null, dataApertura:toNullEmpty(v.dataApertura),
    dataAccettazione:toNullEmpty(v.dataAccettazione), dataScadenza:toNullEmpty(v.dataScadenza),
    dataArrivo:toNullEmpty(v.dataArrivo), dataCompletamento:toNullEmpty(v.dataCompletamento),
    note:v.note??null, createdAt:v.createdAt??new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  const { error } = await sb.from('records').upsert(row, { onConflict:'id' });
  if(error){ console.error(error); throw error; }
}

async function getRecord(id){ const {data,error}=await sb.from('records').select('*').eq('id',id).single(); if(error) throw error; return data; }
async function getAllRecords(){ const {data,error}=await sb.from('records').select('*').order('updatedAt',{ascending:false}); if(error) throw error; return data||[]; }
async function getByStato(st){ const {data,error}=await sb.from('records').select('*').eq('statoPratica',st).order('updatedAt',{ascending:false}); if(error) throw error; return data||[]; }
async function deleteRecord(id){ try{ const {data:ph}=await sb.from('photos').select('path').eq('record_id',id); const del=(ph||[]).map(p=>p.path).filter(Boolean); if(del.length) await sb.storage.from(window.SB_BUCKET||'photos').remove(del); await sb.from('photos').delete().eq('record_id',id);}catch(_){} const {error}=await sb.from('records').delete().eq('id',id); if(error) throw error; }

// --- DEDUPE GUARD MEMORY
window.__photoUploadGuards = window.__photoUploadGuards || {};

async function savePhotosWithThumbs(recordId, images, thumbs){
  if(!images || !images.length) return;

  // evita doppie chiamate contemporanee sullo stesso record
  if(window.__photoUploadGuards[recordId]) return;
  window.__photoUploadGuards[recordId] = true;

  try {
    // carica solo data-URL (nuove foto)
    const onlyData = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
    if(!onlyData.length) return;

    // deduplica dataURL identici nella stessa save
    const toUpload = Array.from(new Set(onlyData));

    for(let i=0;i<toUpload.length;i++){
      try{
        const dataUrl = toUpload[i];
        const parts = dataUrl.split(','); if(parts.length<2) continue;
        const base64 = parts[1];
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const path  = `${recordId}/${Date.now()}-${i+1}.jpg`;

        const up = await sb.storage.from(window.SB_BUCKET||'photos')
          .upload(path, bytes, { contentType:'image/jpeg', upsert:false });

        if(up.error && !(up.error.message||'').includes('already exists')){
          console.warn('[upload photo]', up.error); continue;
        }

        const ins = await sb.from('photos').insert({ record_id: recordId, path });
        if(ins.error){ console.warn('[photos insert]', ins.error); }

        // aggiorna anteprima con l'ultima foto caricata
        const pub = sb.storage.from(window.SB_BUCKET||'photos').getPublicUrl(path);
        const url = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
        if(url){ const preview = document.getElementById('photoPreview'); if(preview) preview.src = url; }

      }catch(e){ console.warn('[savePhotosWithThumbs] skip image', e); }
      await new Promise(r=>setTimeout(r, 40)); // piccolo respiro
    }
  } finally {
    // rilascia guard dopo un tick (evita re-entry immediati)
    setTimeout(()=>{ delete window.__photoUploadGuards[recordId]; }, 150);
  }
}

async function getPhotos(recordId){
  const {data,error}=await sb.from('photos').select('path').eq('record_id',recordId).order('created_at',{ascending:false});
  if(error){ console.error('[getPhotos]', error); return {images:[], thumbs:[]} }
  const images=[];
  for(const row of (data||[])){
    if(!row || !row.path) continue;
    const pub=sb.storage.from(window.SB_BUCKET||'photos').getPublicUrl(row.path);
    const url=(pub && pub.data && pub.data.publicUrl) ? String(pub.data.publicUrl) : '';
    if(url) images.push(url);
  }
  return { images, thumbs: images };
}

(function(){ try{
  const ch1 = sb.channel('records-ch').on('postgres_changes',{event:'*',schema:'public',table:'records'},()=>{
    if(typeof refreshDashboard==='function') refreshDashboard();
    if(typeof lista==='function') lista();
  }).subscribe();
  const ch2 = sb.channel('photos-ch').on('postgres_changes',{event:'*',schema:'public',table:'photos'},()=>{
    if(typeof refreshDashboard==='function') refreshDashboard();
  }).subscribe();
  window.__sb_channels=[ch1,ch2];
  window.addEventListener('focus',()=>{ if(typeof refreshDashboard==='function') refreshDashboard(); });
  console.log('[realtime] attivo');
}catch(err){ console.warn('[realtime] non attivo:', err?.message||err); } })();
/* cloud-db.js (v3.2) — v3.1 + Ricerca EXACT server-side + override soft di lista() */
if(!window.sb){ console.error("[cloud-db] Supabase client assente"); }
function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }

async function putRecord(v){
  const row = {
    id:v.id, descrizione:v.descrizione??null, modello:v.modello??null, cliente:v.cliente??null,
    telefono:v.telefono??null, email:v.email??null, punta:v.punta??null, numPunte:v.numPunte??null,
    statoPratica:v.statoPratica??'In attesa', preventivoStato:v.preventivoStato??'Non inviato',
    docTrasporto:v.docTrasporto??null, dataApertura:toNullEmpty(v.dataApertura),
    dataAccettazione:toNullEmpty(v.dataAccettazione), dataScadenza:toNullEmpty(v.dataScadenza),
    dataArrivo:toNullEmpty(v.dataArrivo), dataCompletamento:toNullEmpty(v.dataCompletamento),
    note:v.note??null, createdAt:v.createdAt??new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  const { error } = await sb.from('records').upsert(row, { onConflict:'id' });
  if(error){ console.error(error); throw error; }
}

async function getRecord(id){
  const {data,error}=await sb.from('records').select('*').eq('id',id).single();
  if(error) throw error; return data;
}
async function getAllRecords(){
  const {data,error}=await sb.from('records').select('*').order('updatedAt',{ascending:false});
  if(error) throw error; return data||[];
}
async function getByStato(st){
  const {data,error}=await sb.from('records').select('*').eq('statoPratica',st).order('updatedAt',{ascending:false});
  if(error) throw error; return data||[];
}
async function deleteRecord(id){
  try{
    const {data:ph}=await sb.from('photos').select('path').eq('record_id',id);
    const del=(ph||[]).map(p=>p.path).filter(Boolean);
    if(del.length) await sb.storage.from(window.SB_BUCKET||'photos').remove(del);
    await sb.from('photos').delete().eq('record_id',id);
  }catch(_){}
  const {error}=await sb.from('records').delete().eq('id',id);
  if(error) throw error;
}

// --- DEDUPE GUARD MEMORY
window.__photoUploadGuards = window.__photoUploadGuards || {};

async function savePhotosWithThumbs(recordId, images, thumbs){
  if(!images || !images.length) return;

  // evita doppie chiamate contemporanee sullo stesso record
  if(window.__photoUploadGuards[recordId]) return;
  window.__photoUploadGuards[recordId] = true;

  try {
    // carica solo data-URL (nuove foto)
    const onlyData = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
    if(!onlyData.length) return;

    // deduplica dataURL identici nella stessa save
    const toUpload = Array.from(new Set(onlyData));

    for(let i=0;i<toUpload.length;i++){
      try{
        const dataUrl = toUpload[i];
        const parts = dataUrl.split(','); if(parts.length<2) continue;
        const base64 = parts[1];
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const path  = `${recordId}/${Date.now()}-${i+1}.jpg`;

        const up = await sb.storage.from(window.SB_BUCKET||'photos')
          .upload(path, bytes, { contentType:'image/jpeg', upsert:false });

        if(up.error && !(up.error.message||'').includes('already exists')){
          console.warn('[upload photo]', up.error); continue;
        }

        const ins = await sb.from('photos').insert({ record_id: recordId, path });
        if(ins.error){ console.warn('[photos insert]', ins.error); }

        // aggiorna anteprima con l'ultima foto caricata
        const pub = sb.storage.from(window.SB_BUCKET||'photos').getPublicUrl(path);
        const url = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
        if(url){ const preview = document.getElementById('photoPreview'); if(preview) preview.src = url; }

      }catch(e){ console.warn('[savePhotosWithThumbs] skip image', e); }
      await new Promise(r=>setTimeout(r, 40)); // piccolo respiro
    }
  } finally {
    // rilascia guard dopo un tick (evita re-entry immediati)
    setTimeout(()=>{ delete window.__photoUploadGuards[recordId]; }, 150);
  }
}

async function getPhotos(recordId){
  const {data,error}=await sb.from('photos').select('path').eq('record_id',recordId).order('created_at',{ascending:false});
  if(error){ console.error('[getPhotos]', error); return {images:[], thumbs:[]} }
  const images=[];
  for(const row of (data||[])){
    if(!row || !row.path) continue;
    const pub=sb.storage.from(window.SB_BUCKET||'photos').getPublicUrl(row.path);
    const url=(pub && pub.data && pub.data.publicUrl) ? String(pub.data.publicUrl) : '';
    if(url) images.push(url);
  }
  return { images, thumbs: images };
}

(function(){ try{
  const ch1 = sb.channel('records-ch').on('postgres_changes',{event:'*',schema:'public',table:'records'},()=>{
    if(typeof refreshDashboard==='function') refreshDashboard();
    if(typeof lista==='function') lista();
  }).subscribe();
  const ch2 = sb.channel('photos-ch').on('postgres_changes',{event:'*',schema:'public',table:'photos'},()=>{
    if(typeof refreshDashboard==='function') refreshDashboard();
  }).subscribe();
  window.__sb_channels=[ch1,ch2];
  window.addEventListener('focus',()=>{ if(typeof refreshDashboard==='function') refreshDashboard(); });
  console.log('[realtime] attivo');
}catch(err){ console.warn('[realtime] non attivo:', err?.message||err); } })();

/* ============ NOVITÀ: Ricerca ESATTA server-side (Supabase) ============ */
/** Normalizza stringa (trim + lower) solo per uso client-side eventuale */
function __norm(v){ return String(v??'').trim().toLowerCase(); }

/**
 * Esegue ricerca a MATCH ESATTO (case-insensitive) sui campi testuali indicati,
 * SENZA sottostringhe (no wildcard): 'le' NON corrisponde a 'lecce'.
 * Applica eventuali filtri tecnici (match esatto) e filtro stato.
 * Non tocca paginazione (ci pensa il tuo drawListPage / pager).
 */
async function searchExactSupabase(opts){
  const {
    q = '',                     // stringa cercata
    statoKey = null,            // 'attesa' | 'lavorazione' | 'completed' | 'soon' | null
    tech = {},                  // { battCollettore, lunghezzaAsse, ... , numPunte, punta }
    includeSoon = false         // se true, in client faremo rifinitura "entro 7gg"
  } = opts || {};

  let query = sb.from('records').select('*');

  // Filtro stato (server-side quando possibile)
  if(statoKey === 'attesa') query = query.eq('statoPratica','In attesa');
  else if(statoKey === 'lavorazione') query = query.eq('statoPratica','In lavorazione');
  else if(statoKey === 'completed')   query = query.in('statoPratica',['Completata','Consegnata']);
  // 'soon' lo rifiniamo client-side (per evitare timezone e operatori data)

  // Filtri tecnici ESATTI (server-side)
  const techMap = {
    battCollettore: tech?.battCollettore,
    lunghezzaAsse:  tech?.lunghezzaAsse,
    lunghezzaPacco: tech?.lunghezzaPacco,
    larghezzaPacco: tech?.larghezzaPacco,
    punta:          tech?.punta,
    numPunte:       tech?.numPunte
  };
  Object.entries(techMap).forEach(([k,v])=>{
    if(v!==undefined && v!==null && String(v).trim()!==''){
      query = query.eq(k, String(v).trim());
    }
  });

  // Ricerca a MATCH ESATTO su più colonne: uso ILIKE senza % (== uguaglianza case-insensitive)
  const needle = String(q||'').trim();
  if(needle){
    // NB: con Supabase REST, or() vuole una stringa:  campo.op.val,campo2.op.val,...
    const val = needle.replace(/,/g,'\\,'); // evita rompere la lista OR
    const orCond = [
      `descrizione.ilike.${val}`,
      `modello.ilike.${val}`,
      `cliente.ilike.${val}`,
      `telefono.ilike.${val}`,
      `docTrasporto.ilike.${val}`,
      `battCollettore.ilike.${val}`,
      `lunghezzaAsse.ilike.${val}`,
      `lunghezzaPacco.ilike.${val}`,
      `larghezzaPacco.ilike.${val}`,
      `punta.ilike.${val}`,
      `numPunte.ilike.${val}`,
      `note.ilike.${val}`
    ].join(',');
    query = query.or(orCond);
  }

  // Ordinamento coerente con la tua UI
  query = query.order('updatedAt', { ascending:false });

  const { data, error } = await query;
  if(error){ console.error('[searchExactSupabase]', error); return []; }

  // Rifinitura SOON lato client (entro 7 giorni)
  if(includeSoon){
    const t=new Date(); t.setHours(0,0,0,0);
    const lim=new Date(t); lim.setDate(lim.getDate()+7);
    return (data||[]).filter(r=>{
      const d = r?.dataScadenza ? new Date(r.dataScadenza) : null;
      if(!d || isNaN(d)) return false;
      const dd=new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return dd>=t && dd<=lim;
    });
  }

  return data || [];
}

/* ============ OVERRIDE soft di lista() (non serve toccare index) ============ */
(function(){
  const __orig_lista = window.lista;

  window.lista = async function(){
    // Se mancano elementi base dell’index, lascia tutto com’è
    const tb = document.querySelector('#tableResults tbody');
    const qEl = document.getElementById('q');
    if(!tb || !qEl){
      if(typeof __orig_lista === 'function') return __orig_lista();
      return;
    }

    const q = qEl.value || '';
    const hasQ = String(q).trim() !== '';

    // Recupera filtri tecnici dalla pagina, se esistono
    const tech = {
      battCollettore: (document.getElementById('f_battCollettore')||{}).value || '',
      lunghezzaAsse:  (document.getElementById('f_lunghezzaAsse')||{}).value || '',
      lunghezzaPacco: (document.getElementById('f_lunghezzaPacco')||{}).value || '',
      larghezzaPacco: (document.getElementById('f_larghezzaPacco')||{}).value || '',
      punta:          (document.getElementById('f_punta')||{}).value || '',
      numPunte:       (document.getElementById('f_numPunte')||{}).value || ''
    };
    const hasTech = Object.values(tech).some(v => String(v||'').trim()!=='');

    // Interpreta filtro stato dalla tua variabile globale
    const fkey = window.currentFilter || null;
    const includeSoon = (fkey === 'soon');

    let rows = [];
    try{
      if(hasQ || hasTech || fkey){ // usa ricerca esatta server-side quando c'è qualcosa da filtrare
        rows = await searchExactSupabase({
          q,
          statoKey: fkey==='soon'? null : fkey, // 'soon' lo facciamo client-side
          tech,
          includeSoon
        });
      }else{
        rows = await getAllRecords(); // nessun filtro → lista completa
      }
    }catch(e){
      console.warn('[lista override] fallback a getAllRecords per errore ricerca esatta:', e?.message||e);
      rows = await getAllRecords();
    }

    // Badge filtro attivo
    const box = document.getElementById('activeFilterBox');
    const lab = document.getElementById('activeFilterLabel');
    if(box && lab){
      if(fkey){
        box.classList.remove('d-none');
        const lbl = (window.FILTER_LABELS && window.FILTER_LABELS[fkey]) || 'Filtro attivo';
        lab.textContent = lbl;
      }else{
        box.classList.add('d-none'); lab.textContent = '';
      }
    }

    // Ordina come da UI
    rows.sort((a,b)=>(String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))));

    // Pubblica e disegna con la tua pipeline standard
    window.searchRows = rows;
    window.page = 1;
    if(typeof window.renderPager === 'function') window.renderPager(window.searchRows.length);
    if(typeof window.drawListPage === 'function') await window.drawListPage();

    // Log diagnostico
    console.log('[v3.2] lista() exact-search:',
      { q:String(q).trim(), fkey, techActive:hasTech, count:rows.length });
  };
})();



