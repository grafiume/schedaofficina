/* cloud-db.js (v3.2.3) — base v3.1 + exact search case-insensitive + fallback renderer */
if(!window.sb){ console.error("[cloud-db] Supabase client assente"); }
function toNullEmpty(v){ return (v===undefined || v==='') ? null : v; }

/* === CONFIG: colonne ammesse nella exact-search (case-insensitive) === */
window.SEARCH_EXACT_COLS = [
  'descrizione',
  'modello',
  'cliente',
  'note'
];

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

  if(window.__photoUploadGuards[recordId]) return;
  window.__photoUploadGuards[recordId] = true;

  try {
    const onlyData = images.filter(s => typeof s === 'string' && s.startsWith('data:image/'));
    if(!onlyData.length) return;

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

        const pub = sb.storage.from(window.SB_BUCKET||'photos').getPublicUrl(path);
        const url = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';
        if(url){ const preview = document.getElementById('photoPreview'); if(preview) preview.src = url; }

      }catch(e){ console.warn('[savePhotosWithThumbs] skip image', e); }
      await new Promise(r=>setTimeout(r, 40));
    }
  } finally {
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

/* ============ Ricerca ESATTA server-side (Supabase) — case-insensitive ============ */
function __escapeForOr(val){ return String(val).replace(/,/g,'\\,'); }

async function searchExactSupabase(opts){
  const {
    q = '',
    statoKey = null,
    tech = {},
    includeSoon = false
  } = opts || {};

  let query = sb.from('records').select('*');

  if(statoKey === 'attesa')       query = query.eq('statoPratica','In attesa');
  else if(statoKey === 'lavorazione') query = query.eq('statoPratica','In lavorazione');
  else if(statoKey === 'completed')   query = query.in('statoPratica',['Completata','Consegnata']);

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

  const cols = Array.isArray(window.SEARCH_EXACT_COLS) && window.SEARCH_EXACT_COLS.length
    ? window.SEARCH_EXACT_COLS
    : ['descrizione','modello','cliente','note'];

  const needleRaw = String(q||'').trim();
  if(needleRaw){
    const val = __escapeForOr(needleRaw);
    const orCond = cols.map(c => `${c}.ilike.${val}`).join(',');
    query = query.or(orCond);
  }

  query = query.order('updatedAt', { ascending:false });
  const { data, error } = await query;
  if(error){ console.error('[searchExactSupabase]', error); return []; }

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

/* ====== Fallback renderer se drawListPage non disegna ====== */
function __safe(s){ return String(s ?? '').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function __fmtIT(v){ try{ if(!v) return ''; const d=new Date(v); if(isNaN(d)) return ''; return d.toLocaleDateString('it-IT'); }catch(_){ return ''; } }

async function __fallbackRender(rows){
  try{
    const tb = document.querySelector('#tableResults tbody');
    if(!tb){ console.warn('[v3.2.3] fallback: tbody non trovato'); return; }
    tb.innerHTML = '';

    if(!rows.length){
      tb.innerHTML = `<tr><td colspan="9" class="text-muted">Nessun risultato.</td></tr>`;
      return;
    }

    const slice = rows.slice(0, 50);
    for(const r of slice){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><!-- thumb by drawListPage, qui omessa --></td>
        <td class="desc-col"><strong>${__safe(r.descrizione)}</strong> ${__safe(r.modello)}</td>
        <td class="nowrap">${__safe(r.cliente)}</td>
        <td class="nowrap">${__safe(r.telefono)}</td>
        <td class="nowrap">${__fmtIT(r.dataApertura || r.dataArrivo || '')}</td>
        <td class="nowrap">${__fmtIT(r.dataAccettazione)}</td>
        <td class="nowrap">${__fmtIT(r.dataScadenza)}</td>
        <td class="nowrap">${__safe(r.statoPratica || '')}</td>
        <td class="text-end nowrap">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" data-open="${r.id}">Apri</button>
            <button class="btn btn-sm btn-outline-success" data-edit="${r.id}">Modifica</button>
          </div>
        </td>`;
      tb.appendChild(tr);
    }
    tb.querySelectorAll('button[data-open]').forEach(b=>{
      b.addEventListener('click', ()=>{ if(typeof window.apri==='function') window.apri(b.dataset.open); });
    });
    tb.querySelectorAll('button[data-edit]').forEach(b=>{
      b.addEventListener('click', ()=>{ if(typeof window.modifica==='function') window.modifica(b.dataset.edit); });
    });
    console.log('[v3.2.3] fallbackRender completato:', slice.length, 'righe');
  }catch(err){
    console.error('[v3.2.3] fallbackRender err:', err);
  }
}

/* ============ OVERRIDE soft di lista() (non serve toccare index) ============ */
(function(){
  const __orig_lista = window.lista;

  window.lista = async function(){
    const tb = document.querySelector('#tableResults tbody');
    const qEl = document.getElementById('q');
    if(!tb || !qEl){
      if(typeof __orig_lista === 'function') return __orig_lista();
      return;
    }

    const q = qEl.value || '';
    const hasQ = String(q).trim() !== '';

    const tech = {
      battCollettore: (document.getElementById('f_battCollettore')||{}).value || '',
      lunghezzaAsse:  (document.getElementById('f_lunghezzaAsse')||{}).value || '',
      lunghezzaPacco: (document.getElementById('f_lunghezzaPacco')||{}).value || '',
      larghezzaPacco: (document.getElementById('f_larghezzaPacco')||{}).value || '',
      punta:          (document.getElementById('f_punta')||{}).value || '',
      numPunte:       (document.getElementById('f_numPunte')||{}).value || ''
    };
    const hasTech = Object.values(tech).some(v => String(v||'').trim()!=='');

    const fkey = window.currentFilter || null;
    const includeSoon = (fkey === 'soon');

    let rows = [];
    try{
      if(hasQ || hasTech || fkey){
        rows = await searchExactSupabase({
          q,
          statoKey: fkey==='soon'? null : fkey,
          tech,
          includeSoon
        });
      }else{
        rows = await getAllRecords();
      }
    }catch(e){
      console.warn('[lista override] fallback a getAllRecords per errore ricerca esatta:', e?.message||e);
      rows = await getAllRecords();
    }

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

    rows.sort((a,b)=>(String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))));

    window.searchRows = rows;
    window.page = 1;

    let rendered = false;
    try{
      if(typeof window.renderPager === 'function') window.renderPager(window.searchRows.length);
      if(typeof window.drawListPage === 'function'){
        await window.drawListPage();
        const trCount = (tb && tb.querySelectorAll('tr').length) || 0;
        rendered = trCount > 0;
        console.log('[v3.2.3] drawListPage OK, rows:', trCount);
      }
    }catch(e){
      console.warn('[v3.2.3] drawListPage errore:', e?.message||e);
    }

    if(!rendered){
      await __fallbackRender(rows);
    }

    console.log('[v3.2.3] lista() exact-search:', {
      q:String(q).trim(),
      cols: window.SEARCH_EXACT_COLS,
      caseInsensitiveExact: true,
      fkey,
      techActive:hasTech,
      count:rows.length
    });
  };
})();