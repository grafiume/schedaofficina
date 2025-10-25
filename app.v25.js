// === ELIP TAGLIENTE • app.v25.js ===
// Thumb 144x144 con lazy-load + throttling & backoff (anti 429), overlay in pagina,
// Ricerca con filtri esatti, Nuova scheda con upload immagini (mobile OK),
// Salva scheda => ritorno automatico alla Home.

// ----------------- Helpers -----------------
(function(){
  if (typeof window.fmtIT !== 'function') {
    window.fmtIT = function(d){
      if(!d) return '';
      const s = String(d);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)){
        const [y,m,dd] = s.split('-');
        return [dd,m,y].join('/');
      }
      return s;
    };
  }
  if (typeof window.norm !== 'function') {
    window.norm = s => (s??'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }
  if (typeof window.statusOrder !== 'function') {
    window.statusOrder = s => { s=norm(s); if(s.includes('attesa'))return 1; if(s.includes('lavorazione'))return 2; if(s.includes('completata'))return 3; return 9; };
  }
  if (typeof window.byHomeOrder !== 'function') {
    window.byHomeOrder = (a,b)=>{
      // Ordine principale: dataApertura desc
      const da = String(b.dataApertura||'').localeCompare(String(a.dataApertura||''));
      if (da !== 0) return da;
      // Secondario: stato
      return window.statusOrder(a.statoPratica) - window.statusOrder(b.statoPratica);
    };
  }
})();

function show(id){
  try{ if(id!=='edit' && document.getElementById('ePrevURL')) document.getElementById('ePrevURL').value=''; }catch(e){}

  ['page-home','page-search','page-edit'].forEach(pid=>{
    const el=document.getElementById(pid); if(el) el.classList.add('d-none');
  });
  const tgt=document.getElementById(id); if(tgt) tgt.classList.remove('d-none');
  window.state.currentView=id.replace('page-','');
}
if (typeof window.state !== 'object'){ window.state={ all:[], currentView:'home', editing:null }; }

// ----------------- Supabase -----------------
if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
  console.warn('config.js mancante o variabili non definite');
}
const sb = (typeof supabase!=='undefined')
  ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

// ----------------- Storage helpers -----------------
const bucket='photos';
const _pubUrlCache=new Map();
function publicUrl(path){ const {data}=sb.storage.from(bucket).getPublicUrl(path); return data?.publicUrl||''; }
function publicUrlCached(path){ if(_pubUrlCache.has(path)) return _pubUrlCache.get(path); const u=publicUrl(path); _pubUrlCache.set(path,u); return u; }

// Throttling queue per evitare 429
const REQ_QUEUE = [];
let ACTIVE = 0;
const MAX_CONCURRENCY = 2;          // al massimo 2 richieste contemporanee
const MIN_SPACING_MS = 160;         // spaziatura tra job per non saturare
function delay(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function runQueue(){
  if (ACTIVE >= MAX_CONCURRENCY) return;
  const job = REQ_QUEUE.shift();
  if (!job) return;
  ACTIVE++;
  try { await job(); }
  finally {
    ACTIVE--;
    // leggero spacing tra job
    setTimeout(runQueue, MIN_SPACING_MS);
  }
}
function enqueue(fn){
  REQ_QUEUE.push(fn);
  runQueue();
}

// list con retry/backoff se 429
async function listPhotosFromPrefix(prefix){
  let attempt = 0;
  while (attempt < 4){
    const { data, error } = await sb.storage.from(bucket).list(prefix, {limit:200, sortBy:{column:'name', order:'asc'}});
    if (!error) return (data||[]).map(x => prefix + x.name);
    // se 429 o rete, backoff
    const msg = (error?.message || '').toLowerCase();
    const status = error?.status || 0;
    if (status === 429 || msg.includes('too many') || msg.includes('rate')){
      await delay(400 + attempt*600);
      attempt++;
      continue;
    }
    // altri errori -> stop
    return [];
  }
  return [];
}

// Try multiple layouts + table fallback (con queue)
const FIRST_PHOTO_CACHE = new Map(); // recordId -> url (o '' se nessuna)
function getThumbUrl(recordId){
  // Se in cache, immediato
  if (FIRST_PHOTO_CACHE.has(recordId)) return Promise.resolve(FIRST_PHOTO_CACHE.get(recordId));

  // Promise di risoluzione che usa la queue con backoff
  return new Promise((resolve)=>{
    enqueue(async ()=>{
      // 1) new layout
      let p = await listPhotosFromPrefix(`records/${recordId}/`);
      if (!p.length){
        // 2) old layout
        p = await listPhotosFromPrefix(`${recordId}/`);
      }
      if (!p.length){
        // 3) fallback tabella
        try{
          const { data, error } = await sb.from('photos')
            .select('path, created_at')
            .eq('record_id', recordId)
            .order('created_at', { ascending:true })
            .limit(1);
          if (!error && data && data.length) p = [data[0].path];
        }catch{}
      }
      const url = p.length ? publicUrlCached(p[0]) : '';
      FIRST_PHOTO_CACHE.set(recordId, url);
      resolve(url);
    });
  });
}

// Lazy-load con IntersectionObserver
const IO = ('IntersectionObserver' in window)
  ? new IntersectionObserver((entries)=>{
      entries.forEach(en=>{
        if (en.isIntersecting){
          const img = en.target;
          IO.unobserve(img);
          const recordId = img.getAttribute('data-rec');
          if (!recordId) return;
          getThumbUrl(recordId).then(url=>{
            if (url){
              img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
              img.src = url;
              img.addEventListener('click', ()=>openLightbox(url));
            } else {
              img.alt = '—';
            }
          });
        }
      });
    }, { rootMargin: '200px 0px' })
  : null;

function mountLazyThumb(imgEl, recordId){
  imgEl.setAttribute('data-rec', recordId);
  if (IO) IO.observe(imgEl);
  else {
    // fallback senza IO: carica comunque con queue
    getThumbUrl(recordId).then(url=>{
      if (url){
        imgEl.decoding='async'; imgEl.loading='lazy'; imgEl.fetchPriority='low';
        imgEl.src = url;
        imgEl.addEventListener('click', ()=>openLightbox(url));
      } else {
        imgEl.alt = '—';
      }
    });
  }
}

// ----------------- Overlay (single) -----------------
(function initOverlay(){
  const overlay = document.getElementById('imgOverlay');
  const img = document.getElementById('imgOverlayImg');
  if (!overlay || !img) return;
  const btn = overlay.querySelector('.closeBtn');
  function close(){ overlay.classList.remove('open'); img.removeAttribute('src'); }
  btn?.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close(); });
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });
  window.__openOverlay = function(url){ img.src = url; overlay.classList.add('open'); };
})();
function openLightbox(url){
  if (typeof window.__openOverlay === 'function') window.__openOverlay(url);
  else { try{ window.location.assign(url); } catch(e){ window.location.href = url; } }
}

// ----------------- KPI + Home render -----------------
function renderKPIs(rows){
  try{
    const tot=rows.length;
    const att=rows.filter(r=>norm(r.statoPratica).includes('attesa')).length;
    const lav=rows.filter(r=>norm(r.statoPratica).includes('lavorazione')).length;
    const comp=rows.filter(r=>norm(r.statoPratica).includes('completata')).length;
    const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    set('kpiTot',tot); set('kpiAttesa',att); set('kpiLav',lav); set('kpiComp',comp);
  }catch{}
}

window.renderHome=function(rows){
  const tb=document.getElementById('homeRows'); if(!tb) return;
  tb.innerHTML=''; renderKPIs(rows);
  (rows||[]).sort(byHomeOrder).forEach(r=>{
    const tr=document.createElement('tr');

    const tdFoto=document.createElement('td'); tdFoto.className='thumb-cell';
    const img=document.createElement('img'); img.className='thumb thumb-home'; img.alt='';
    tdFoto.appendChild(img); tr.appendChild(tdFoto);

    const tdData=document.createElement('td'); tdData.textContent=fmtIT(r.dataApertura); tr.appendChild(tdData);
    const tdCliente=document.createElement('td'); tdCliente.textContent=r.cliente??''; tr.appendChild(tdCliente);
    const tdDesc=document.createElement('td'); tdDesc.textContent=r.descrizione??''; tr.appendChild(tdDesc);
    const tdMod=document.createElement('td'); tdMod.textContent=r.modello??''; tr.appendChild(tdMod);

    const tdStato=document.createElement('td');
    const closed=norm(r.statoPratica).includes('completata');
    tdStato.textContent=r.statoPratica??'';
    if(closed){ const b=document.createElement('span'); b.className='badge badge-chiusa ms-2'; b.textContent='Chiusa'; tdStato.appendChild(b); }
    tr.appendChild(tdStato);

    const tdAz=document.createElement('td'); tdAz.className='text-end';
    const btn=document.createElement('button'); btn.className='btn btn-sm btn-outline-primary'; btn.type='button'; btn.textContent='Apri';
    btn.addEventListener('click',()=>openEdit(r.id)); tdAz.appendChild(btn); tr.appendChild(tdAz);

    tb.appendChild(tr);

    // Miniatura: lazy + queue (anti 429)
    mountLazyThumb(img, r.id);
  });
  if(!rows?.length){ tb.innerHTML='<tr><td colspan="7" class="text-center text-muted py-4">Nessun record</td></tr>'; }
};

// ----------------- Ricerca -----------------
function getSearchFilters(){
  return {
    q: document.getElementById('q').value.trim(),
    noteExact: document.getElementById('noteExact')?.value.trim() || '',
    batt: document.getElementById('fBatt').value.trim(),
    asse: document.getElementById('fAsse')?.value.trim() || '',
    pacco: document.getElementById('fPacco')?.value.trim() || '',
    larg: document.getElementById('fLarg')?.value.trim() || '',
    punta: document.getElementById('fPunta')?.value.trim() || '',
    np: document.getElementById('fNP')?.value.trim() || '',
  };
}
function toNum(val){ if(val==null) return null; const s=String(val).trim().replace(',', '.'); if(s==='') return null; const n=Number(s); return Number.isFinite(n)?n:null; }
function isNumEq(fv, rv){ if(fv==null || String(fv).trim()==='') return true; const f=toNum(fv), r=toNum(rv); if(f===null||r===null) return false; return f===r; }
function matchRow(r,f){
  if(f.q){
    const hay=[r.descrizione,r.modello,r.cliente,r.telefono,r.docTrasporto].map(norm).join(' ');
    const tokens=norm(f.q).split(/\s+/).filter(Boolean);
    for(const t of tokens){ if(!hay.includes(t)) return false; }
  }
  if(f.noteExact && norm(r.note)!==norm(f.noteExact)) return false;
  if(!isNumEq(f.batt,r.battCollettore)) return false;
  if(!isNumEq(f.asse,r.lunghezzaAsse)) return false;
  if(!isNumEq(f.pacco,r.lunghezzaPacco)) return false;
  if(!isNumEq(f.larg,r.larghezzaPacco)) return false;
  if(f.punta && norm(f.punta)!==norm(r.punta)) return false;
  if(!isNumEq(f.np,r.numPunte)) return false;
  return true;
}
function doSearch(){
  const f=getSearchFilters();
  const rows=(window.state.all||[]).filter(r=>matchRow(r,f)).sort(byHomeOrder);
  const tb=document.getElementById('searchRows'); tb.innerHTML='';
  rows.forEach(r=>{
    const tr=document.createElement('tr');

    const tdFoto=document.createElement('td'); tdFoto.className='thumb-cell';
    const img=document.createElement('img'); img.className='thumb thumb-home'; img.alt='';
    tdFoto.appendChild(img); tr.appendChild(tdFoto);

    const tdData=document.createElement('td'); tdData.textContent=fmtIT(r.dataApertura); tr.appendChild(tdData);
    const tdCliente=document.createElement('td'); tdCliente.textContent=r.cliente??''; tr.appendChild(tdCliente);
    const tdDesc=document.createElement('td'); tdDesc.textContent=r.descrizione??''; tr.appendChild(tdDesc);
    const tdMod=document.createElement('td'); tdMod.textContent=r.modello??''; tr.appendChild(tdMod);

    const tdStato=document.createElement('td');
    const closed=norm(r.statoPratica).includes('completata');
    tdStato.textContent=r.statoPratica??'';
    if(closed){ const b=document.createElement('span'); b.className='badge badge-chiusa ms-2'; b.textContent='Chiusa'; tdStato.appendChild(b); }
    tr.appendChild(tdStato);

    const tdAz=document.createElement('td'); tdAz.className='text-end';
    const btn=document.createElement('button'); btn.className='btn btn-sm btn-outline-primary'; btn.type='button'; btn.textContent='Apri';
    btn.addEventListener('click',()=>openEdit(r.id)); tdAz.appendChild(btn); tr.appendChild(tdAz);

    tb.appendChild(tr);

    // Miniatura: lazy + queue (anti 429)
    mountLazyThumb(img, r.id);
  });
  if(!rows.length){ tb.innerHTML='<tr><td colspan="7" class="text-center text-muted py-4">Nessun risultato</td></tr>'; }
}

// ----------------- Gallery (Edit) -----------------
async function uploadFiles(recordId, files){
  const prefix=`records/${recordId}/`;
  for (const f of files){
    const name=Date.now()+'_'+f.name.replace(/[^a-z0-9_.-]+/gi,'_');
    const { error } = await sb.storage.from(bucket).upload(prefix+name, f, { upsert:false });
    if(error){ alert('Errore upload: '+error.message); return false; }
  }
  // invalida cache thumb per questo record
  FIRST_PHOTO_CACHE.delete(recordId);
  return true;
}
async function refreshGallery(recordId){
  const gallery=document.getElementById('gallery');
  const prev=document.querySelector('.img-preview');
  if(gallery) gallery.innerHTML=''; if(prev) prev.innerHTML='';

  // per non stressare lo storage, usa la stessa getThumbUrl (queue + cache) per la prima
  const firstUrl = await getThumbUrl(recordId);
  if(prev){
    if(firstUrl){
      const img0=new Image();
      img0.alt='Anteprima'; img0.decoding='async'; img0.loading='eager'; img0.fetchPriority='high';
      img0.src=firstUrl; prev.appendChild(img0);
      img0.addEventListener('click',()=>openLightbox(firstUrl));
    } else {
      prev.textContent='Nessuna immagine disponibile';
    }
  }

  // carica l’elenco completo (qui una sola richiesta, già con retry/backoff)
  let paths = await listPhotosFromPrefix(`records/${recordId}/`);
  if (!paths.length) paths = await listPhotosFromPrefix(`${recordId}/`);
  if (!paths.length){
    try{
      const { data } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at',{ascending:true});
      if (data?.length) paths = data.map(r=>r.path);
    }catch{}
  }

  if(gallery){
    paths.forEach(p=>{
      const url=publicUrlCached(p);
      const col=document.createElement('div'); col.className='col-4';
      const wrap=document.createElement('div'); wrap.className='position-relative';
      const img=new Image(); img.alt=''; img.className='img-fluid rounded'; img.style.height='144px'; img.style.objectFit='cover'; img.src=url;
      img.addEventListener('click',()=>openLightbox(url));
      const del=document.createElement('button'); del.type='button'; del.className='btn btn-sm btn-danger position-absolute top-0 end-0 m-1'; del.textContent='×'; del.title='Elimina immagine';
      del.addEventListener('click', async ev=>{ ev.stopPropagation(); if(!confirm('Sei sicuro di voler eliminare questa immagine?')) return;
        const { error } = await sb.storage.from(bucket).remove([p]);
        if(error){ alert('Errore eliminazione: '+error.message); return; }
        await refreshGallery(recordId);
      });
      wrap.appendChild(img); wrap.appendChild(del); col.appendChild(wrap); gallery.appendChild(col);
    });
  }
}

// ----------------- Edit page -----------------
function setV(id,v){ const el=document.getElementById(id); if(!el) return;
  if(el.tagName==='SELECT'){ let f=false; for(const opt of el.options){ if(norm(opt.value)===norm(v)){ el.value=opt.value; f=true; break; } } if(!f) el.value=''; }
  else { el.value = v??''; }
}
function val(id){ const el=document.getElementById(id); return el?el.value.trim():''; }

function openEdit(id){
  const r=window.state.all.find(x=>x.id===id); if(!r) return; window.state.editing=r;
  const closed=norm(r.statoPratica).includes('completata'); const cb=document.getElementById('closedBanner'); if(cb) cb.classList.toggle('d-none',!closed);

  setV('eDescrizione',r.descrizione); setV('eModello',r.modello);
  setV('eApertura',r.dataApertura); setV('eAcc',r.dataAccettazione); setV('eScad',r.dataScadenza);
  setV('eStato',r.statoPratica); setV('ePrev',r.preventivoStato||'Non inviato'); setV('eDDT',r.docTrasporto);
  setV('eCliente',r.cliente); setV('eTel',r.telefono); setV('eEmail',r.email);
  setV('eBatt',r.battCollettore); setV('eAsse',r.lunghezzaAsse); setV('ePacco',r.lunghezzaPacco); setV('eLarg',r.larghezzaPacco); setV('ePunta',r.punta); setV('eNP',r.numPunte); setV('eNote',r.note);

  show('page-edit');
  (function(){
    var btnOpen = document.getElementById('btnOpenPrev');
    if(btnOpen){ btnOpen.onclick = function(){
      var u = (val('ePrevURL')||'').trim();
      if(!u) return;
      if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
      window.open(u, '_blank');
    }; }
    var btnSave = document.getElementById('btnSaveLink');
    if(btnSave){ btnSave.onclick = async function(){
      const rec = state.editing; if(!rec) return;
      const url = (val('ePrevURL')||'').trim() || null;
      const { data, error } = await sb.from('records').update({ preventivo_url: url }).eq('id', rec.id).select('id, preventivo_url').single();
      if(error){ alert('Errore salvataggio link: ' + error.message); return; }
      rec.preventivo_url = data ? data.preventivo_url : url;
      alert('Link salvato');
    }; }
  })();

  refreshGallery(r.id);

  // “Carica su cloud” -> salva i dati, poi carica i file, aggiorna galleria
  const upBtn=document.getElementById('btnUpload');
  if(upBtn){
    upBtn.onclick=async ()=>{
      await saveEdit(false); // false = non chiudere
      const files=document.getElementById('eFiles').files;
      if(files?.length){
        const ok=await uploadFiles(r.id, files);
        if(ok){ await refreshGallery(r.id); document.getElementById('eFiles').value=''; }
      }
    };
  }
}

// Salva + chiudi richiesta: dopo salvataggio torniamo in Home
async function saveEdit(closeAfter=true){
  const r=window.state.editing; if(!r) return;
  const payload={
    descrizione:val('eDescrizione'), modello:val('eModello'),
    dataApertura:val('eApertura')||null, dataAccettazione:val('eAcc')||null, dataScadenza:val('eScad')||null,
    statoPratica:val('eStato'), preventivoStato:val('ePrev'), docTrasporto:val('eDDT'),
    cliente:val('eCliente'), telefono:val('eTel'), email:val('eEmail'),
    battCollettore:val('eBatt')||null, lunghezzaAsse:val('eAsse')||null, lunghezzaPacco:val('ePacco')||null, larghezzaPacco:val('eLarg')||null,
    punta:val('ePunta'), numPunte:val('eNP')||null, note: val('eNote'),
    preventivo_url: (val('ePrevURL')||'').trim() || null,
  };
  const { data, error } = await sb.from('records').update(payload).eq('id', r.id).select().single();
  if(error){ alert('Errore salvataggio: '+error.message); return; }
  Object.assign(r, data);
  renderHome(window.state.all);
  if (closeAfter){
    // torna alla Home come richiesto
    show('page-home');
  }
  alert('Salvato!');
}

// ----------------- NUOVA SCHEDA -----------------
let _newModal;
function todayISO(){ const d=new Date(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${dd}`; }
function getV(id){ const el=document.getElementById(id); return el?el.value.trim():''; }
function toNull(s){ return s===''?null:s; }

function previewNewFiles(){
  const box=document.getElementById('nPreview');
  const inp=document.getElementById('nFiles');
  if(!box||!inp){ return; }
  box.innerHTML='';
  const files=inp.files;
  if(!files||!files.length){ box.textContent='Nessuna immagine'; return; }
  const url=URL.createObjectURL(files[0]);
  const img=new Image(); img.src=url; img.onload=()=>URL.revokeObjectURL(url);
  box.appendChild(img);
  img.addEventListener('click', ()=>openLightbox(url));
}

async function createNewRecord(){
  const dtAper=getV('nApertura')||todayISO();
  const payload={
    descrizione:getV('nDescrizione'),
    modello:getV('nModello'),
    dataApertura:dtAper,
    dataAccettazione:toNull(getV('nAcc')),
    dataScadenza:toNull(getV('nScad')),
    statoPratica:getV('nStato')||'In attesa',
    preventivoStato:getV('nPrev')||'Non inviato',
    docTrasporto:getV('nDDT'),
    cliente:getV('nCliente'), telefono:getV('nTel'), email:getV('nEmail'),
    battCollettore:toNull(getV('nBatt')),
    lunghezzaAsse:toNull(getV('nAsse')),
    lunghezzaPacco:toNull(getV('nPacco')),
    larghezzaPacco:toNull(getV('nLarg')),
    punta:getV('nPunta'), numPunte:toNull(getV('nNP')),
    note:getV('nNote'),
  };
  if(!payload.descrizione){ alert('Inserisci la descrizione.'); return; }

  const { data, error } = await sb.from('records').insert(payload).select().single();
  if(error){ alert('Errore creazione: '+error.message); return; }

  // upload immagini se presenti
  const files=document.getElementById('nFiles')?.files;
  if(files && files.length){
    const ok = await uploadFiles(data.id, files);
    if(!ok){ alert('Attenzione: alcune immagini potrebbero non essere state caricate.'); }
    document.getElementById('nFiles').value='';
    const pv=document.getElementById('nPreview'); if(pv){ pv.innerHTML='Nessuna immagine'; }
  }

  // aggiorna cache & UI
  window.state.all.unshift(data);
  renderHome(window.state.all);

  try{ _newModal?.hide(); }catch{}
}

// ----------------- Boot -----------------
function showError(msg){ try{ const el=document.getElementById('errBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); } }catch{} console.error(msg); }

window.loadAll=async function(){
  try{
    if(!sb){ showError('Supabase non inizializzato'); return; }
    let { data, error } = await sb
      .from('records')
      .select('id,descrizione,modello,cliente,telefono,statoPratica,preventivoStato,note,dataApertura,dataAccettazione,dataScadenza,docTrasporto,battCollettore,lunghezzaAsse,lunghezzaPacco,larghezzaPacco,punta,numPunte,email, preventivo_url')
      .order('dataApertura',{ascending:false});
    if(error){
      const fb=await sb.from('records_view').select('*').order('dataApertura',{ascending:false}).limit(1000);
      if(fb.error){ showError('Errore lettura records: '+error.message+' / '+fb.error.message); renderHome([]); return; }
      data=fb.data;
    }
    window.state.all=data||[];
    renderHome(window.state.all);
  }catch(e){ showError('Eccezione loadAll: '+(e?.message||e)); renderHome([]); }
};

document.addEventListener('DOMContentLoaded', ()=>{
  const H=(id,fn)=>{ const el=document.getElementById(id); if(el) el.addEventListener('click',fn); };

  H('btnHome', ()=>show('page-home'));
  H('btnRicerca', ()=>show('page-search'));
  H('btnApply', doSearch);
  H('btnDoSearch', doSearch);
  H('btnReset', ()=>{
    ['q','noteExact','fBatt','fAsse','fPacco','fLarg','fPunta','fNP'].forEach(id=>{
      const el=document.getElementById(id); if(!el) return;
      if(el.tagName==='SELECT') el.selectedIndex=0; else el.value='';
    });
    document.getElementById('searchRows').innerHTML='';
  });

  H('kpiTotBtn', ()=>renderHome(window.state.all));
  H('kpiAttesaBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('attesa'))));
  H('kpiLavBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('lavorazione'))));
  H('kpiCompBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('completata'))));

  // Salva scheda: chiudi dopo il salvataggio (come richiesto)
  const btnSave=document.getElementById('btnSave');
  if(btnSave){ btnSave.addEventListener('click', ()=>saveEdit(true)); }

  const btnCancel=document.getElementById('btnCancel');
  if(btnCancel){ btnCancel.addEventListener('click', ()=>show('page-home')); }

  // Nuova scheda
  const bNew=document.getElementById('btnNew');
  if(bNew){
    bNew.addEventListener('click', ()=>{
      const el=document.getElementById('newRecordModal'); if(!el) return;
      if(!_newModal) _newModal=new bootstrap.Modal(el, { backdrop:'static' });
      const nApertura=document.getElementById('nApertura'); if(nApertura && !nApertura.value) nApertura.value=todayISO();
      _newModal.show();
    });
  }
  const bNewSave=document.getElementById('btnNewSave'); if(bNewSave) bNewSave.addEventListener('click', createNewRecord);

  // Preview live per "Nuova scheda"
  const nFiles=document.getElementById('nFiles'); if(nFiles) nFiles.addEventListener('change', previewNewFiles);

  try{ window.loadAll(); }catch(e){ showError(e.message||String(e)); }
});
