
// ================================
// ELIP TAGLIENTE - app.v25.js
// Scheda Riparazioni (Home, Ricerca, Modifica)
// Foto in prima colonna; Ricerca colonne: Foto, Data, Cliente, Descrizione, Modello, Stato, Azioni
// ================================

// --- Helpers ---
if (typeof window.fmtIT !== 'function') {
  window.fmtIT = function(d){
    if(!d) return '';
    const s = String(d);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y,m,dd] = s.split('T')[0].split('-');
      return `${dd}/${m}/${y}`;
    }
    return s;
  };
}
if (typeof window.norm !== 'function') {
  window.norm = function(s){
    return (s ?? '').toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim();
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

// --- UI base ---
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
function showError(msg){
  try {
    const el = document.getElementById('errBanner');
    if (el) { el.textContent = msg; el.classList.remove('d-none'); }
  } catch(e){}
  console.error(msg);
}

// --- State ---
if (typeof window.state !== 'object') {
  window.state = { all: [], currentView: 'home', editing: null };
}

// --- Supabase ---
const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// --- Storage helpers ---
const bucket = 'photos';
async function listPhotosFromPrefix(prefix){
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit:200, sortBy:{column:'name', order:'asc'} });
  if (error) return [];
  return (data||[]).map(x => prefix + x.name);
}
// Try multiple folder layouts + fallback tabella photos
async function listPhotos(recordId){
  let paths = await listPhotosFromPrefix(`records/${recordId}/`);
  if (paths.length) return paths;
  paths = await listPhotosFromPrefix(`${recordId}/`);
  if (paths.length) return paths;
  try{
    const { data, error } = await sb.from('photos').select('path').eq('record_id', recordId).order('created_at', {ascending:true});
    if (!error && data && data.length) return data.map(r => r.path);
  }catch(e){}
  return [];
}
const _pubUrlCache = new Map();
function publicUrlCached(path){
  if (_pubUrlCache.has(path)) return _pubUrlCache.get(path);
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  const url = data?.publicUrl || '';
  _pubUrlCache.set(path, url);
  return url;
}
function publicUrl(path){
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl;
}

// --- Home renderer ---
if (typeof window.renderHome !== 'function') {
  window.renderHome = function(rows){
    const tb = document.getElementById('homeRows');
    if (!tb) return;

    // KPI
    try {
      const tot = rows.length;
      const att = rows.filter(r=>window.norm(r.statoPratica).includes('attesa')).length;
      const lav = rows.filter(r=>window.norm(r.statoPratica).includes('lavorazione')).length;
      const comp = rows.filter(r=>window.norm(r.statoPratica).includes('completata')).length;
      const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
      set('kpiTot', tot); set('kpiAttesa', att); set('kpiLav', lav); set('kpiComp', comp);
    } catch(e){}

    tb.innerHTML = '';
    (rows||[]).sort(window.byHomeOrder).forEach(r=>{
      const tr = document.createElement('tr');

      // Foto
      const tdFoto = document.createElement('td');
      tdFoto.className = 'thumb-cell';
      const img = document.createElement('img');
      img.className = 'thumb thumb-home';
      img.setAttribute('role','button');
      tdFoto.appendChild(img);
      tr.appendChild(tdFoto);

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

      // Data arrivo
      const tdArr = document.createElement('td');
      tdArr.textContent = fmtIT(r.dataApertura);
      tr.appendChild(tdArr);

      // Data accettazione
      const tdAcc = document.createElement('td');
      tdAcc.textContent = fmtIT(r.dataAccettazione);
      tr.appendChild(tdAcc);

      // Stato
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
      btn.addEventListener('click', () => openEdit(r.id));
      tdAz.appendChild(btn);
      tr.appendChild(tdAz);

      tb.appendChild(tr);

      // Thumb async
      try{
        listPhotos(r.id).then(paths=>{
          if (paths && paths.length){
            const url = publicUrlCached(paths[0]);
            img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
            img.src = url;
            img.addEventListener('click', ()=>openLightbox(url));
          } else { img.alt = '—'; }
        }).catch(()=>{});
      }catch(e){}
    });

    if (!rows || !rows.length){
      tb.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Nessun record</td></tr>';
    }
  };
}

// --- Upload & Gallery (edit page) ---
async function uploadFiles(recordId, files){
  const prefix = `records/${recordId}/`;
  for (const f of files){
    const name = Date.now() + '_' + f.name.replace(/[^a-z0-9_.-]+/gi,'_');
    const { error } = await sb.storage.from(bucket).upload(prefix + name, f, { upsert:false });
    if (error) { alert('Errore upload: ' + error.message); return false; }
  }
  return true;
}
async function refreshGallery(recordId){
  const gallery = document.getElementById('gallery');
  if (gallery) gallery.innerHTML = '';
  const paths = await listPhotos(recordId);

  // Preview
  const prev = document.querySelector('.img-preview');
  if (prev) prev.textContent = '';
  if (paths.length && prev){
    const url0 = publicUrlCached(paths[0]);
    const img0 = new Image();
    img0.style.maxWidth = '100%';
    img0.style.maxHeight = '420px';
    img0.style.objectFit  = 'contain';
    img0.alt = 'Anteprima';
    img0.decoding = 'async'; img0.loading = 'eager'; img0.fetchPriority = 'high';
    img0.src = url0;
    img0.addEventListener('click', ()=>openLightbox(url0));
    prev.appendChild(img0);
  } else if (prev){ prev.textContent = 'Nessuna immagine disponibile'; }

  // Thumbs
  if (gallery){
    paths.forEach(p=>{
      const url = publicUrlCached(p);
      const col = document.createElement('div');
      col.className = 'col-4 gallery-item';
      const img = new Image();
      img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
      img.src = url; img.style.width='100%'; img.style.height='144px'; img.style.objectFit='cover'; img.style.borderRadius='.5rem';
      img.addEventListener('click', ()=>openLightbox(url));
      col.appendChild(img); gallery.appendChild(col);
    });
  }
}

// --- Filtri Ricerca ---
function getSearchFilters(){
  return {
    q: (document.getElementById('q')?.value || '').trim(),
    noteExact: (document.getElementById('noteExact')?.value || '').trim(),
    batt: (document.getElementById('fBatt')?.value || '').trim(),
    asse: (document.getElementById('fAsse')?.value || '').trim(),
    pacco: (document.getElementById('fPacco')?.value || '').trim(),
    larg: (document.getElementById('fLarg')?.value || '').trim(),
    punta: (document.getElementById('fPunta')?.value || '').trim(),
    np: (document.getElementById('fNP')?.value || '').trim(),
  };
}

// numerici esatti
function toNum(val){
  if (val === null || val === undefined) return null;
  const s = String(val).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function isNumEq(filterVal, recordVal){
  if (filterVal === null || filterVal === undefined || String(filterVal).trim() === '') return true;
  const f = toNum(filterVal), r = toNum(recordVal);
  if (f === null || r === null) return false;
  return f === r;
}

// confronti
function matchRow(r, f){
  if (f.q){
    const hay = [r.descrizione, r.modello, r.cliente, r.telefono, r.docTrasporto].map(norm).join(' ');
    const tokens = norm(f.q).split(/\s+/).filter(Boolean);
    for (const t of tokens){ if(!hay.includes(t)) return false; }
  }
  if (f.noteExact && norm(r.note) !== norm(f.noteExact)) return false;
  if (!isNumEq(f.batt, r.battCollettore)) return false;
  if (!isNumEq(f.asse, r.lunghezzaAsse)) return false;
  if (!isNumEq(f.pacco, r.lunghezzaPacco)) return false;
  if (!isNumEq(f.larg, r.larghezzaPacco)) return false;
  if (f.punta && norm(f.punta) !== norm(r.punta)) return false;
  if (!isNumEq(f.np, r.numPunte)) return false;
  return true;
}

// --- Ricerca: colonne Foto, Data, Cliente, Descrizione, Modello, Stato, Azioni ---
function doSearch(){
  const f = getSearchFilters();
  const rows = state.all.filter(r => matchRow(r, f)).sort(byHomeOrder);
  const tb = document.getElementById('searchRows');
  if (!tb) return;
  tb.innerHTML = '';

  rows.forEach(r => {
    const tr = document.createElement('tr');

    // Foto
    const tdFoto = document.createElement('td');
    tdFoto.className = 'thumb-cell';
    const img = document.createElement('img');
    img.className = 'thumb thumb-home';
    img.setAttribute('role','button');
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

    // Stato (+ Chiusa)
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
    btn.addEventListener('click', () => openEdit(r.id));
    tdAz.appendChild(btn);
    tr.appendChild(tdAz);

    tb.appendChild(tr);

    // Thumb async
    try{
      listPhotos(r.id).then(paths=>{
        if(paths && paths.length){
          const url = publicUrlCached(paths[0]);
          img.decoding='async'; img.loading='lazy'; img.fetchPriority='low';
          img.src = url;
          img.addEventListener('click', ()=>openLightbox(url));
        } else { img.alt = '—'; }
      }).catch(()=>{});
    }catch(e){}
  });

  if (!rows.length){
    tb.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Nessun risultato</td></tr>';
  }
}

function clearSearchUI(){
  const $ = (id)=>document.getElementById(id);
  if ($('q')) $('q').value = '';
  if ($('noteExact')) $('noteExact').value = '';
  ['fBatt','fAsse','fPacco','fLarg','fPunta','fNP'].forEach(id=>{
    const el = $(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
  });
  const tb = document.getElementById('searchRows');
  if (tb) tb.innerHTML = '';
}

// --- Edit page ---
function setV(id, v){
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName==='SELECT'){
    let found = false;
    for (const opt of el.options){
      if (norm(opt.value)===norm(v)){ el.value = opt.value; found = true; break; }
    }
    if (!found) el.value = '';
  } else {
    el.value = v ?? '';
  }
}
function val(id){ const el = document.getElementById(id); return (el && 'value' in el) ? el.value.trim() : ''; }

function openEdit(id){
  const r = state.all.find(x=>x.id===id);
  if(!r) return;
  state.editing = r;

  const closed = norm(r.statoPratica).includes('completata');
  const banner = document.getElementById('closedBanner');
  const hint   = document.getElementById('closedHint');
  if (banner) banner.classList.toggle('d-none', !closed);
  if (hint) hint.textContent = closed ? `Chiusa il ${fmtIT(r.dataAccettazione||r.dataCompletamento||'')}` : '';

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
      if(ok){ await refreshGallery(r.id); document.getElementById('eFiles').value=''; }
    };
  }
}

async function saveEdit(){
  const r = state.editing;
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
  if (error){ alert('Errore salvataggio: ' + error.message); return; }
  Object.assign(r, data);
  const closed = norm(r.statoPratica).includes('completata');
  const banner = document.getElementById('closedBanner');
  if (banner) banner.classList.toggle('d-none', !closed);
  alert('Salvato!');
}

// --- PDF ---
function printPDF(r){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const L = (k,v)=>[k, String(v??'')];
  doc.setFontSize(14); doc.text('Scheda riparazione', 14, 16); doc.setFontSize(10);
  const rows = [
    L('Data apertura', fmtIT(r.dataApertura)),
    L('Cliente', r.cliente),
    L('Telefono', r.telefono),
    L('Email', r.email),
    L('Modello', r.modello),
    L('Stato', r.statoPratica),
    L('Preventivo', r.preventivoStato),
    L('DDT', r.docTrasporto),
    L('Descrizione', r.descrizione),
    L('Note', r.note),
    L('Batt. collettore', r.battCollettore),
    L('Lunghezza asse', r.lunghezzaAsse),
    L('Lunghezza pacco', r.lunghezzaPacco),
    L('Larghezza pacco', r.larghezzaPacco),
    L('Punta', r.punta),
    L('N. punte', r.numPunte),
  ];
  doc.autoTable({ head:[['Campo','Valore']], body: rows, startY:22, styles:{fontSize:10} });
  doc.save((r.cliente||'scheda') + '_riparazione.pdf');
}

// --- Overlay immagine in pagina ---
function openLightbox(url){
  const overlay = document.getElementById('imgOverlay');
  const img = document.getElementById('imgOverlayImg');
  if (overlay && img){
    img.src = url;
    overlay.classList.add('open');
    return;
  }
  // fallback
  try { window.location.assign(url); } catch(e){ window.location.href = url; }
}
function initOverlayClose(){
  const overlay = document.getElementById('imgOverlay');
  const img = document.getElementById('imgOverlayImg');
  const btn = overlay ? overlay.querySelector('.closeBtn') : null;
  if (!overlay || !img) return;
  const close = ()=>{ overlay.classList.remove('open'); img.removeAttribute('src'); };
  if (btn) btn.addEventListener('click', close);
  overlay.addEventListener('click', (e)=>{ if(e.target===overlay) close(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
}

// --- Load all ---
window.loadAll = async function(){
  try{
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
      showError('config.js mancante o variabili non definite (SUPABASE_URL / SUPABASE_ANON_KEY)');
      return;
    }
    let { data, error, status } = await sb
      .from('records')
      .select('id, descrizione, modello, cliente, telefono, statoPratica, preventivoStato, note, dataApertura, dataAccettazione, dataScadenza, docTrasporto, battCollettore, lunghezzaAsse, lunghezzaPacco, larghezzaPacco, punta, numPunte, email')
      .limit(1000);
    if (error){
      console.warn('select records error', status, error.message);
      const fb = await sb
        .from('records_view')
        .select('id, descrizione, modello, cliente, telefono, statoPratica, preventivoStato, note, dataApertura, dataAccettazione, dataScadenza, docTrasporto, battCollettore, lunghezzaAsse, lunghezzaPacco, larghezzaPacco, punta, numPunte, email')
        .limit(1000);
      if (fb.error){
        showError('Errore lettura (records/records_view): ' + error.message + ' / ' + fb.error.message);
        window.renderHome([]); return;
      } else data = fb.data;
    }
    window.state.all = Array.isArray(data) ? data : [];
    window.renderHome(window.state.all);
  }catch(e){
    showError('Eccezione loadAll: ' + (e?.message||e));
    window.renderHome([]);
  }
};

// --- Wiring ---
document.addEventListener('DOMContentLoaded', ()=>{
  initOverlayClose();
  const $ = (id)=>document.getElementById(id);
  if ($('btnHome')) $('btnHome').addEventListener('click', ()=> show('page-home'));
  if ($('btnRicerca')) $('btnRicerca').addEventListener('click', ()=> show('page-search'));

  if ($('btnClearFilter')) $('btnClearFilter').addEventListener('click', ()=>{ clearSearchUI(); show('page-home'); });
  if ($('btnReset')) $('btnReset').addEventListener('click', clearSearchUI);
  if ($('btnApply')) $('btnApply').addEventListener('click', doSearch);
  if ($('btnDoSearch')) $('btnDoSearch').addEventListener('click', doSearch);

  if ($('btnSave')) $('btnSave').addEventListener('click', saveEdit);
  if ($('btnPrint')) $('btnPrint').addEventListener('click', ()=> state.editing && printPDF(state.editing));

  if ($('kpiTotBtn')) $('kpiTotBtn').addEventListener('click', ()=>renderHome(state.all));
  if ($('kpiAttesaBtn')) $('kpiAttesaBtn').addEventListener('click', ()=>renderHome(state.all.filter(r=>norm(r.statoPratica).includes('attesa'))));
  if ($('kpiLavBtn')) $('kpiLavBtn').addEventListener('click', ()=>renderHome(state.all.filter(r=>norm(r.statoPratica).includes('lavorazione'))));
  if ($('kpiCompBtn')) $('kpiCompBtn').addEventListener('click', ()=>renderHome(state.all.filter(r=>norm(r.statoPratica).includes('completata'))));

  try { window.loadAll(); } catch(e){ showError(e.message||String(e)); }
});
