
// === ELIP TAGLIENTE • app.v25.js (upgrade immagini veloci) ===
// - Home/Ricerca allineate (Foto 144x144, Data, Cliente, Descrizione, Modello, Stato, Azioni)
// - Anteprima in pagina (overlay) 4:3
// - Cache API prefetch (photos-v2) per velocizzare le immagini
// - Supabase Image Transformations: thumb 144x144 (q=60), preview 1200px (q=70)
// - Upload da telefono: supporto galleria + scatta foto + compressione client-side (max 1600px, q=0.7)

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
    window.norm = function(s){
      return (s??'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    };
  }
  if (typeof window.statusOrder !== 'function') {
    window.statusOrder = function(s){
      s = window.norm(s);
      if (s.includes('attesa')) return 1;
      if (s.includes('lavorazione')) return 2;
      if (s.includes('completata')) return 3;
      return 9;
    };
  }
  if (typeof window.byHomeOrder !== 'function') {
    window.byHomeOrder = function(a,b){
      const so = window.statusOrder(a.statoPratica) - window.statusOrder(b.statoPratica);
      if (so !== 0) return so;
      // più recenti prima
      return String(b.dataApertura||'').localeCompare(String(a.dataApertura||''));
    };
  }
})();

function show(id){
  const pages = ['page-home','page-search','page-edit','page-new'];
  pages.forEach(pid => {
    const el = document.getElementById(pid);
    if (el) el.classList.add('d-none');
  });
  const tgt = document.getElementById(id);
  if (tgt) tgt.classList.remove('d-none');
  window.state.currentView = id.replace('page-','');
}

if (typeof window.state !== 'object'){
  window.state = { all: [], currentView: 'home', editing: null };
}

// ----------------- Supabase -----------------
if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
  console.warn('config.js mancante o variabili non definite');
}
const sb = (typeof supabase !== 'undefined')
  ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

// ----------------- Storage helpers -----------------
const bucket = 'photos';
const _pubUrlCache = new Map();

function publicUrl(path){
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
}
function publicUrlCached(path){
  if (_pubUrlCache.has(path)) return _pubUrlCache.get(path);
  const url = publicUrl(path);
  _pubUrlCache.set(path, url);
  return url;
}

// Supabase Image Transformations (assicurati che siano abilitate)
// Converte /object/public/ -> /render/image/public/ + parametri
function toTransformed(url, params){
  try{
    if (!url) return '';
    const u = new URL(url);
    u.pathname = u.pathname.replace('/object/public/', '/render/image/public/');
    for (const [k,v] of Object.entries(params||{})) u.searchParams.set(k, v);
    return u.toString();
  }catch(e){ return url; }
}
function thumbUrl(path){ // 144x144 cover q=60
  const base = publicUrlCached(path);
  return toTransformed(base, { width: 144, height: 144, resize: 'cover', quality: 60, format: 'webp' });
}
function previewUrl(path){ // anteprima 1200px lato lungo q=70
  const base = publicUrlCached(path);
  return toTransformed(base, { width: 1200, resize: 'contain', quality: 70, format: 'webp' });
}

// Cache API per immagini (prefetch)
const PHOTOS_CACHE = 'photos-v2';
async function prefetchToCache(urls){
  try{
    if (!('caches' in window)) return;
    const cache = await caches.open(PHOTOS_CACHE);
    await Promise.all((urls||[]).map(async u=>{
      if (!u) return;
      const hit = await cache.match(u);
      if (hit) return;
      try{ await cache.add(u); }catch(e){}
    }));
  }catch(e){}
}

async function listPhotosFromPrefix(prefix){
  try{
    const { data, error } = await sb.storage.from(bucket).list(prefix, {limit:200, sortBy:{column:'name', order:'asc'}});
    if (error) return [];
    return (data||[]).map(x => prefix + x.name);
  }catch(e){ return []; }
}
// Prova più layout + fallback a tabella photos
async function listPhotos(recordId){
  let paths = await listPhotosFromPrefix(`records/${recordId}/`);
  if (paths.length) return paths;
  paths = await listPhotosFromPrefix(`${recordId}/`);
  if (paths.length) return paths;
  try{
    const { data, error } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at', {ascending:true});
    if (!error && data && data.length) return data.map(r=>r.path);
  }catch(e){}
  return [];
}

// ----------------- Overlay (single) -----------------
(function initOverlay(){
  const overlay = document.getElementById('imgOverlay');
  const img = document.getElementById('imgOverlayImg');
  if (!overlay || !img) return;
  const btn = overlay.querySelector('.closeBtn');
  function close(){ overlay.classList.remove('open'); img.removeAttribute('src'); }
  if (btn) btn.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close(); });
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });
  window.__openOverlay = function(url){ img.src = url; overlay.classList.add('open'); };
})();
function openLightbox(url){
  if (typeof window.__openOverlay === 'function') window.__openOverlay(url);
  else { try{ window.location.assign(url); } catch(e){ window.location.href = url; } }
}

// ----------------- Table renderers -----------------
function renderKPIs(rows){
  try {
    const tot = rows.length;
    const att = rows.filter(r=>norm(r.statoPratica).includes('attesa')).length;
    const lav = rows.filter(r=>norm(r.statoPratica).includes('lavorazione')).length;
    const comp = rows.filter(r=>norm(r.statoPratica).includes('completata')).length;
    const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
    set('kpiTot', tot); set('kpiAttesa', att); set('kpiLav', lav); set('kpiComp', comp);
  } catch(e){}
}

window.renderHome = function(rows){
  const tb = document.getElementById('homeRows');
  if (!tb) return;
  tb.innerHTML = '';
  renderKPIs(rows);
  (rows||[]).sort(byHomeOrder).forEach(r=>{
    const tr = document.createElement('tr');

    // Foto
    const tdFoto = document.createElement('td');
    tdFoto.className = 'thumb-cell';
    const img = document.createElement('img');
    img.className = 'thumb thumb-home';
    img.alt = '';
    tdFoto.appendChild(img);
    tr.appendChild(tdFoto);

    // Data
    const tdData = document.createElement('td');
    tdData.textContent = fmtIT(r.dataApertura);
    tr.appendChild(tdData);

    // Cliente
    const tdCliente = document.createElement('td');
    tdCliente.textContent = r.cliente ?? '';
    tr.appendChild(tdCliente);

    // Descrizione
    const tdDesc = document.createElement('td');
    tdDesc.textContent = r.descrizione ?? '';
    tr.appendChild(tdDesc);

    // Modello
    const tdMod = document.createElement('td');
    tdMod.textContent = r.modello ?? '';
    tr.appendChild(tdMod);

    // Stato + badge
    const tdStato = document.createElement('td');
    const closed = norm(r.statoPratica).includes('completata');
    tdStato.textContent = r.statoPratica ?? '';
    if (closed){
      const span = document.createElement('span');
      span.className = 'badge badge-chiusa ms-2';
      span.textContent = 'Chiusa';
      tdStato.appendChild(span);
    }
    tr.appendChild(tdStato);

    // Azioni
    const tdAz = document.createElement('td');
    tdAz.className = 'text-end';
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-primary';
    btn.type = 'button';
    btn.textContent = 'Apri';
    btn.addEventListener('click', ()=>openEdit(r.id));
    tdAz.appendChild(btn);
    tr.appendChild(tdAz);

    tb.appendChild(tr);

    // Async thumb + cache
    try{
      listPhotos(r.id).then(paths=>{
        if(paths && paths.length){
          const url = thumbUrl(paths[0]);
          prefetchToCache([url]);
          img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
          img.src = url;
          img.addEventListener('click', ()=>openLightbox(previewUrl(paths[0])));
        } else {
          img.alt = '—';
        }
      }).catch(()=>{});
    }catch(e){}
  });
  if (!rows || !rows.length){
    tb.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Nessun record</td></tr>';
  }
};

// ----------------- Filters (Search) -----------------
function getSearchFilters(){
  return {
    q: document.getElementById('q').value.trim(),
    noteExact: document.getElementById('noteExact') ? document.getElementById('noteExact').value.trim() : '',
    batt: document.getElementById('fBatt').value.trim(),
    asse: document.getElementById('fAsse') ? document.getElementById('fAsse').value.trim() : '',
    pacco: document.getElementById('fPacco') ? document.getElementById('fPacco').value.trim() : '',
    larg: document.getElementById('fLarg') ? document.getElementById('fLarg').value.trim() : '',
    punta: document.getElementById('fPunta') ? document.getElementById('fPunta').value.trim() : '',
    np: document.getElementById('fNP') ? document.getElementById('fNP').value.trim() : '',
  };
}
function toNum(val){
  if (val === null || val === undefined) return null;
  const s = String(val).trim().replace(',', '.'); if (s === '') return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function isNumEq(filterVal, recordVal){
  if (filterVal === null || filterVal === undefined || String(filterVal).trim() === '') return true;
  const f = toNum(filterVal); const r = toNum(recordVal);
  if (f === null || r === null) return false;
  return f === r;
}
function matchRow(r, f){
  if (f.q){
    const hay = [r.descrizione, r.modello, r.cliente, r.telefono, r.docTrasporto].map(norm).join(' ');
    const tokens = norm(f.q).split(/\s+/).filter(Boolean);
    for (const t of tokens){ if(!hay.includes(t)) return false; }
  }
  if (f.noteExact){ if (norm(r.note) !== norm(f.noteExact)) return false; }
  if (!isNumEq(f.batt, r.battCollettore)) return false;
  if (!isNumEq(f.asse, r.lunghezzaAsse)) return false;
  if (!isNumEq(f.pacco, r.lunghezzaPacco)) return false;
  if (!isNumEq(f.larg, r.larghezzaPacco)) return false;
  if (f.punta && norm(f.punta) !== norm(r.punta)) return false;
  if (!isNumEq(f.np, r.numPunte)) return false;
  return true;
}

function renderSearchRows(rows){
  const tb = document.getElementById('searchRows');
  tb.innerHTML = '';
  rows.forEach(r=>{
    const tr = document.createElement('tr');

    // Foto
    const tdFoto = document.createElement('td');
    tdFoto.className = 'thumb-cell';
    const img = document.createElement('img');
    img.className = 'thumb thumb-home';
    img.alt = '';
    tdFoto.appendChild(img);
    tr.appendChild(tdFoto);

    // Data
    const tdData = document.createElement('td');
    tdData.textContent = fmtIT(r.dataApertura);
    tr.appendChild(tdData);

    // Cliente
    const tdCliente = document.createElement('td');
    tdCliente.textContent = r.cliente ?? '';
    tr.appendChild(tdCliente);

    // Descrizione
    const tdDesc = document.createElement('td');
    tdDesc.textContent = r.descrizione ?? '';
    tr.appendChild(tdDesc);

    // Modello
    const tdMod = document.createElement('td');
    tdMod.textContent = r.modello ?? '';
    tr.appendChild(tdMod);

    // Stato + badge
    const tdStato = document.createElement('td');
    const closed = norm(r.statoPratica).includes('completata');
    tdStato.textContent = r.statoPratica ?? '';
    if (closed){
      const span = document.createElement('span');
      span.className = 'badge badge-chiusa ms-2';
      span.textContent = 'Chiusa';
      tdStato.appendChild(span);
    }
    tr.appendChild(tdStato);

    // Azioni
    const tdAz = document.createElement('td');
    tdAz.className = 'text-end';
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-primary';
    btn.type = 'button';
    btn.textContent = 'Apri';
    btn.addEventListener('click', ()=>openEdit(r.id));
    tdAz.appendChild(btn);
    tr.appendChild(tdAz);

    tb.appendChild(tr);

    // Async thumb + cache
    try{
      listPhotos(r.id).then(paths=>{
        if(paths && paths.length){
          const url = thumbUrl(paths[0]);
          prefetchToCache([url]);
          img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
          img.src = url;
          img.addEventListener('click', ()=>openLightbox(previewUrl(paths[0])));
        } else { img.alt = '—'; }
      }).catch(()=>{});
    }catch(e){}
  });
  if(!rows.length){
    tb.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Nessun risultato</td></tr>';
  }
}

function doSearch(){
  const f = getSearchFilters();
  const rows = (window.state.all||[]).filter(r=>matchRow(r,f)).sort(byHomeOrder);
  renderSearchRows(rows);
}

// ----------------- Edit/New page -----------------
function setV(id, v){
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName==='SELECT'){
    let found = false;
    for (const opt of el.options){ if (norm(opt.value)===norm(v)) { el.value = opt.value; found=true; break; } }
    if (!found) el.value = '';
  } else {
    el.value = v ?? '';
  }
}
function val(id){ const el = document.getElementById(id); return el ? el.value.trim() : ''; }

// Compress immagine lato client (maxW/H, quality)
async function compressImage(file, {maxSize=1600, quality=0.7}={}){
  return new Promise(resolve=>{
    try{
      const img = new Image();
      img.onload = ()=>{
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(b=> resolve(b || file), 'image/jpeg', quality);
      };
      img.onerror = ()=> resolve(file);
      const fr = new FileReader();
      fr.onload = ()=>{ img.src = fr.result; };
      fr.readAsDataURL(file);
    }catch(e){ resolve(file); }
  });
}

async function uploadFiles(recordId, files){
  const prefix = `records/${recordId}/`;
  for (const f of files){
    const comp = await compressImage(f, {maxSize:1600, quality:0.7});
    const ext = '.jpg';
    const safe = f.name.replace(/[^a-z0-9_.-]+/gi,'_').replace(/\.[^.]+$/,'');
    const name = Date.now() + '_' + safe + ext;
    const { error } = await sb.storage.from(bucket).upload(prefix + name, comp, { upsert: false, contentType: 'image/jpeg' });
    if (error) { alert('Errore upload: '+error.message); return false; }
  }
  return true;
}

async function refreshGallery(recordId){
  const gallery = document.getElementById('gallery');
  const prev = document.querySelector('.img-preview');
  if (gallery) gallery.innerHTML = '';
  if (prev) prev.textContent = '';
  const paths = await listPhotos(recordId);

  if (prev){
    if (paths.length){
      const url0 = previewUrl(paths[0]);
      const img0 = new Image();
      img0.style.width = '100%';
      img0.style.aspectRatio = '4 / 3';
      img0.style.objectFit = 'contain';
      img0.alt = 'Anteprima';
      img0.decoding='async'; img0.loading='eager'; img0.fetchPriority='high'; img0.src = url0;
      img0.addEventListener('click', ()=>openLightbox(url0));
      prev.appendChild(img0);
      prefetchToCache([url0]);
    } else {
      prev.textContent = 'Nessuna immagine disponibile';
    }
  }

  if (gallery){
    const urls = [];
    paths.forEach(p=>{
      const url = thumbUrl(p); urls.push(url);
      const col = document.createElement('div');
      col.className = 'col-4 gallery-item';
      const img = new Image();
      img.alt = '';
      img.decoding='async'; img.loading='lazy'; img.fetchPriority='low'; img.src = url;
      img.style.width = '100%';
      img.style.height = '144px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '.5rem';
      img.addEventListener('click', ()=>openLightbox(previewUrl(p)));
      col.appendChild(img);
      gallery.appendChild(col);
    });
    prefetchToCache(urls);
  }
}

function openEdit(id){
  const r = window.state.all.find(x=>x.id===id);
  if (!r) return;
  window.state.editing = r;
  const closed = norm(r.statoPratica).includes('completata');
  const cb = document.getElementById('closedBanner');
  if (cb) cb.classList.toggle('d-none', !closed);

  setV('eDescrizione', r.descrizione);
  setV('eModello', r.modello);
  setV('eApertura', r.dataApertura);
  setV('eAcc', r.dataAccettazione);
  setV('eScad', r.dataScadenza);
  setV('eStato', r.statoPratica);
  setV('ePrev', r.preventivoStato||'Non inviato');
  setV('eDDT', r.docTrasporto);
  setV('eCliente', r.cliente);
  setV('eTel', r.telefono);
  setV('eEmail', r.email);
  setV('eBatt', r.battCollettore);
  setV('eAsse', r.lunghezzaAsse);
  setV('ePacco', r.lunghezzaPacco);
  setV('eLarg', r.larghezzaPacco);
  setV('ePunta', r.punta);
  setV('eNP', r.numPunte);
  setV('eNote', r.note);

  show('page-edit');
  refreshGallery(r.id);
  const upBtn = document.getElementById('btnUpload');
  if (upBtn){
    upBtn.onclick = async ()=>{
      const files = document.getElementById('eFiles').files;
      if(!files || !files.length){ alert('Seleziona una o più immagini'); return; }
      const ok = await uploadFiles(r.id, files);
      if(ok){
        await refreshGallery(r.id);
        document.getElementById('eFiles').value='';
      }
    };
  }
}

async function saveEdit(){
  const r = window.state.editing;
  if(!r) return;
  const payload = {
    descrizione: val('eDescrizione'),
    modello: val('eModello'),
    dataApertura: val('eApertura') || null,
    dataAccettazione: val('eAcc') || null,
    dataScadenza: val('eScad') || null,
    statoPratica: val('eStato'),
    preventivoStato: val('ePrev'),
    docTrasporto: val('eDDT'),
    cliente: val('eCliente'),
    telefono: val('eTel'),
    email: val('eEmail'),
    battCollettore: val('eBatt')||null,
    lunghezzaAsse: val('eAsse')||null,
    lunghezzaPacco: val('ePacco')||null,
    larghezzaPacco: val('eLarg')||null,
    punta: val('ePunta'),
    numPunte: val('eNP')||null,
    note: val('eNote'),
  };
  const { data, error } = await sb.from('records').update(payload).eq('id', r.id).select().single();
  if (error){ alert('Errore salvataggio: '+error.message); return; }
  Object.assign(r, data);
  alert('Salvato!');
}

// ----------------- Boot -----------------
function showError(msg){
  try{
    const el=document.getElementById('errBanner');
    if(el){ el.textContent=msg; el.classList.remove('d-none'); }
  }catch(e){}
  console.error(msg);
}

window.loadAll = async function(){
  try {
    if (!sb){ showError('Supabase non inizializzato'); return; }
    let q = sb.from('records')
      .select('id,descrizione,modello,cliente,telefono,statoPratica,preventivoStato,note,dataApertura,dataAccettazione,dataScadenza,docTrasporto,battCollettore,lunghezzaAsse,lunghezzaPacco,larghezzaPacco,punta,numPunte,email')
      .order('dataApertura', { ascending: false });
    let { data, error } = await q;
    if (error){
      const fb = await sb.from('records_view').select('*').limit(1000);
      if (fb.error){ showError('Errore lettura records: '+error.message+' / '+fb.error.message); renderHome([]); return; }
      data = fb.data;
    }
    window.state.all = data || [];
    renderHome(window.state.all);
  } catch (e){
    showError('Eccezione loadAll: ' + (e?.message||e));
    renderHome([]);
  }
};

document.addEventListener('DOMContentLoaded', ()=>{
  const H = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  H('btnHome', ()=>show('page-home'));
  H('btnRicerca', ()=>show('page-search'));
  H('btnApply', doSearch);
  H('btnDoSearch', doSearch);
  H('btnReset', ()=>{
    const ids = ['q','noteExact','fBatt','fAsse','fPacco','fLarg','fPunta','fNP'];
    ids.forEach(id=>{ const el=document.getElementById(id); if(!el) return; if (el.tagName==='SELECT') el.selectedIndex=0; else el.value=''; });
    document.getElementById('searchRows').innerHTML='';
  });
  H('kpiTotBtn', ()=>renderHome(window.state.all));
  H('kpiAttesaBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('attesa'))));
  H('kpiLavBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('lavorazione'))));
  H('kpiCompBtn', ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('completata'))));
  H('btnSave', saveEdit);
  H('btnCancel', ()=>show('page-home'));

  try{ window.loadAll(); } catch(e){ showError(e.message||String(e)); }
});
