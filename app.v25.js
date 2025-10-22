// === ELIP TAGLIENTE • app.v25.js ===
// Home e Ricerca allineate. Miniature 144x144. Supabase v2. Nuova scheda.
// (Richiede: config.js con SUPABASE_URL e SUPABASE_ANON_KEY)

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
      return String(b.dataApertura||'').localeCompare(String(a.dataApertura||''));
    };
  }
})();

function show(id){
  const pages = ['page-home','page-search','page-edit'];
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
async function listPhotosFromPrefix(prefix){
  try{
    const { data, error } = await sb.storage.from(bucket).list(prefix, {limit:200, sortBy:{column:'name', order:'asc'}});
    if (error) return [];
    return (data||[]).map(x => prefix + x.name);
  }catch(e){ return []; }
}
// Try multiple layouts + table fallback
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
  const overlay = document.createElement('div');
  overlay.id = 'imgOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);z-index:1050;padding:2rem;';
  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.style.cssText = 'position:relative;max-width:90vw;max-height:90vh;box-shadow:0 10px 30px rgba(0,0,0,.5);background:#111;border-radius:12px;overflow:hidden;';
  const btn = document.createElement('button');
  btn.className = 'closeBtn btn btn-sm btn-light position-absolute';
  btn.textContent = '×';
  btn.style.cssText = 'top:.5rem;right:.5rem;border-radius:999px;width:40px;height:40px;font-size:22px;line-height:40px;text-align:center;';
  const img = document.createElement('img');
  img.id = 'imgOverlayImg';
  img.alt = 'Anteprima immagine';
  img.style.cssText = 'display:block;max-width:90vw;max-height:90vh;width:auto;height:auto;object-fit:contain;background:#111;';

  frame.appendChild(btn); frame.appendChild(img); overlay.appendChild(frame);
  document.body.appendChild(overlay);

  function close(){ overlay.style.display = 'none'; img.removeAttribute('src'); }
  btn.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if (e.target === overlay) close(); });
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') close(); });
  window.__openOverlay = function(url){ img.src = url; overlay.style.display = 'flex'; };
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

    // Foto cell
    const tdFoto = document.createElement('td');
    tdFoto.className = 'thumb-cell';
    const img = document.createElement('img');
    img.className = 'thumb thumb-home';
    img.alt = '';
    img.style.width = '144px'; img.style.height = '144px'; img.style.objectFit='cover'; img.style.borderRadius='8px';
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

    // Stato
    const tdStato = document.createElement('td');
    const closed = norm(r.statoPratica).includes('completata');
    tdStato.textContent = r.statoPratica ?? '';
    if (closed){
      const span = document.createElement('span');
      span.className = 'badge badge-chiusa ms-2';
      span.textContent = 'Chiusa';
      span.style.background = '#2e7d32'; span.style.color = '#fff'; span.style.fontWeight='600';
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

    // Async thumb
    try{
      listPhotos(r.id).then(paths=>{
        if(paths && paths.length){
          const url = publicUrlCached(paths[0]);
          img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
          img.src = url;
          img.addEventListener('click', ()=>openLightbox(url));
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

// Search helpers
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
  const s = String(val).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function isNumEq(filterVal, recordVal){
  if (filterVal === null || filterVal === undefined || String(filterVal).trim() === '') return true;
  const f = toNum(filterVal);
  const r = toNum(recordVal);
  if (f === null || r === null) return false;
  return f === r;
}
function matchRow(r, f){
  if (f.q){
    const hay = [r.descrizione, r.modello, r.cliente, r.telefono, r.docTrasporto].map(norm).join(' ');
    const tokens = norm(f.q).split(/\s+/).filter(Boolean);
    for (const t of tokens){ if(!hay.includes(t)) return false; }
  }
  if (f.noteExact){
    if (norm(r.note) !== norm(f.noteExact)) return false;
  }
  if (!isNumEq(f.batt, r.battCollettore)) return false;
  if (!isNumEq(f.asse, r.lunghezzaAsse)) return false;
  if (!isNumEq(f.pacco, r.lunghezzaPacco)) return false;
  if (!isNumEq(f.larg, r.larghezzaPacco)) return false;
  if (f.punta && norm(f.punta) !== norm(r.punta)) return false;
  if (!isNumEq(f.np, r.numPunte)) return false;
  return true;
}

function doSearch(){
  const f = getSearchFilters();
  const rows = (window.state.all||[]).filter(r=>matchRow(r,f)).sort(byHomeOrder);
  const tb = document.getElementById('searchRows');
  tb.innerHTML = '';
  rows.forEach(r=>{
    const tr = document.createElement('tr');

    const tdFoto = document.createElement('td');
    tdFoto.className = 'thumb-cell';
    const img = document.createElement('img');
    img.className = 'thumb thumb-home';
    img.alt = '';
    img.style.width = '144px'; img.style.height = '144px'; img.style.objectFit='cover'; img.style.borderRadius='8px';
    tdFoto.appendChild(img);
    tr.appendChild(tdFoto);

    const tdData = document.createElement('td');
    tdData.textContent = fmtIT(r.dataApertura);
    tr.appendChild(tdData);

    const tdCliente = document.createElement('td');
    tdCliente.textContent = r.cliente ?? '';
    tr.appendChild(tdCliente);

    const tdDesc = document.createElement('td');
    tdDesc.textContent = r.descrizione ?? '';
    tr.appendChild(tdDesc);

    const tdMod = document.createElement('td');
    tdMod.textContent = r.modello ?? '';
    tr.appendChild(tdMod);

    const tdStato = document.createElement('td');
    const closed = norm(r.statoPratica).includes('completata');
    tdStato.textContent = r.statoPratica ?? '';
    if (closed){
      const span = document.createElement('span');
      span.className = 'badge badge-chiusa ms-2';
      span.textContent = 'Chiusa';
      span.style.background = '#2e7d32'; span.style.color = '#fff'; span.style.fontWeight='600';
      tdStato.appendChild(span);
    }
    tr.appendChild(tdStato);

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

    try{
      listPhotos(r.id).then(paths=>{
        if(paths && paths.length){
          const url = publicUrlCached(paths[0]);
          img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
          img.src = url;
          img.addEventListener('click', ()=>openLightbox(url));
        } else {
          img.alt = '—';
        }
      }).catch(()=>{});
    }catch(e){}
  });
  if(!rows.length){
    tb.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Nessun risultato</td></tr>';
  }
}

// ----------------- Edit page (bindings minimal) -----------------
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
  if (typeof refreshGallery === 'function') refreshGallery(r.id);
}

// Save edit (records)
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

// ----------------- Nuova scheda -----------------
(function(){
  const openModal = ()=> {
    try {
      const el = document.getElementById('newRecordModal');
      if (!el) return;
      const d = new Date();
      const pad = n=>String(n).padStart(2,'0');
      const today = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      const nA = document.getElementById('nApertura');
      if (nA) nA.value = today;
      new bootstrap.Modal(el).show();
    } catch(e){}
  };

  const create = async ()=>{
    const pick = id => (document.getElementById(id)?.value || '').trim();
    const payload = {
      descrizione:      pick('nDescrizione') || null,
      modello:          pick('nModello') || null,
      dataApertura:     pick('nApertura') || null,
      cliente:          pick('nCliente') || null,
      telefono:         pick('nTel') || null,
      email:            pick('nEmail') || null,
      note:             pick('nNote') || null,
      statoPratica:     'In attesa',
      preventivoStato:  'Non inviato'
    };
    const { data, error } = await sb.from('records').insert(payload).select().single();
    if (error){ alert('Errore creazione: ' + error.message); return; }

    // aggiorna cache e UI
    window.state.all.unshift(data);
    renderHome(window.state.all);

    // chiudi modal
    const el = document.getElementById('newRecordModal');
    bootstrap.Modal.getInstance(el)?.hide();
  };

  document.getElementById('btnNew')?.addEventListener('click', openModal);
  document.getElementById('btnCreate')?.addEventListener('click', create);
})();

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
    let q = sb.from('records').select('id,descrizione,modello,cliente,telefono,statoPratica,preventivoStato,note,dataApertura,dataAccettazione,dataScadenza,docTrasporto,battCollettore,lunghezzaAsse,lunghezzaPacco,larghezzaPacco,punta,numPunte,email');
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
  H('kpiLavBtn',   ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('lavorazione'))));
  H('kpiCompBtn',  ()=>renderHome(window.state.all.filter(r=>norm(r.statoPratica).includes('completata'))));
  H('btnSave', saveEdit);
  H('btnCancel', ()=>show('page-home'));

  try{ window.loadAll(); } catch(e){ showError(e.message||String(e)); }
});
