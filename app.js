// Minimal app with optimized search & exact-match note filter
const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);


// === Storage helpers (bucket: photos) ===
const bucket = 'photos';
async function listPhotos(recordId){
  const prefix = `records/${recordId}/`;
  const { data, error } = await sb.storage.from(bucket).list(prefix, {limit:100, sortBy:{column:'name', order:'asc'}});
  if (error) { console.warn('listPhotos', error.message); return []; }
  return data.map(x => prefix + x.name);
}
function publicUrl(path){
  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl;
}
async function uploadFiles(recordId, files){
  const prefix = `records/${recordId}/`;
  for (const f of files){
    const name = Date.now() + '_' + f.name.replace(/[^a-z0-9_.-]+/gi,'_');
    const { error } = await sb.storage.from(bucket).upload(prefix + name, f, { upsert: false });
    if (error) { alert('Errore upload: '+error.message); return false; }
  }
  return true;
}
async function refreshGallery(recordId){
  const gallery = document.getElementById('gallery');
  gallery.innerHTML = '';
  const paths = await listPhotos(recordId);
  // preview first image
  const prev = document.querySelector('.img-preview');
  if (paths.length){
    prev.innerHTML = `<img src="${publicUrl(paths[0])}" style="max-width:100%;max-height:220px;object-fit:contain" />`;
  } else {
    prev.textContent = 'Nessuna immagine disponibile';
  }
  // thumbs
  paths.forEach(p=>{
    const col = document.createElement('div');
    col.className = 'col-4 gallery-item';
    col.innerHTML = `<img src="${publicUrl(p)}" alt="">`;
    gallery.appendChild(col);
  });
}

const state = {
  all: [],
  currentFilter: null,
  currentView: 'home',
  editing: null,
};

function fmtDateISO(d) { // expects 'YYYY-MM-DD' or null
  return d ? d : '';
}
function fmtIT(d) {
  if (!d) return '';
  const [y,m,dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}
function norm(s){return (s??'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function isNumEq(a,b){ if(a==null||a==='') return true; return String(a).trim()===String(b??'').trim(); }

function statusOrder(s) {
  s = norm(s);
  if (s.includes('attesa')) return 1;
  if (s.includes('lavorazione')) return 2;
  if (s.includes('completata')) return 3;
  return 9;
}

function byHomeOrder(a,b){
  const so = statusOrder(a.statoPratica) - statusOrder(b.statoPratica);
  if (so!==0) return so;
  // desc by dataApertura
  return String(b.dataApertura||'').localeCompare(String(a.dataApertura||''));
}

function show(id){
  for (const el of document.querySelectorAll('#page-home,#page-search,#page-edit')) el.classList.add('d-none');
  document.querySelector('#'+id).classList.remove('d-none');
  state.currentView = id.replace('page-','');
}

async function loadAll(){
  const { data, error } = await sb.from('records')
    .select('id, descrizione, modello, cliente, telefono, statoPratica, preventivoStato, note, dataApertura, dataAccettazione, dataScadenza, docTrasporto, battCollettore, lunghezzaAsse, lunghezzaPacco, larghezzaPacco, punta, numPunte, email');
  if(error){ console.error(error); renderHome([]); return; }
  state.all = data;
  renderHome(state.all);
}

function renderHome(rows){
  // KPIs
  const tot = rows.length;
  const att = rows.filter(r=>norm(r.statoPratica).includes('attesa')).length;
  const lav = rows.filter(r=>norm(r.statoPratica).includes('lavorazione')).length;
  const comp = rows.filter(r=>norm(r.statoPratica).includes('completata')).length;
  document.getElementById('kpiTot').textContent = tot;
  document.getElementById('kpiAttesa').textContent = att;
  document.getElementById('kpiLav').textContent = lav;
  document.getElementById('kpiComp').textContent = comp;

  const tb = document.getElementById('homeRows');
  tb.innerHTML = '';
  rows.sort(byHomeOrder).forEach(r=>{
    const closed = norm(r.statoPratica).includes('completata');
    const badge = closed ? ' <span class="badge badge-chiusa">Chiusa</span>' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fmtIT(r.dataApertura)}</td>
      <td>${r.cliente??''}</td>
      <td>${r.descrizione??''}</td>
      <td>${r.modello??''}</td>
      <td>${r.statoPratica??''}${badge}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-id="${r.id}">Apri</button></td>`;
    tr.querySelector('button').addEventListener('click',()=>openEdit(r.id));
    tb.appendChild(tr);
  });
  if(!rows.length){
    tb.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nessun record</td></tr>';
  }
}

function getSearchFilters(){
  return {
    q: document.getElementById('q').value.trim(),
    noteExact: document.getElementById('noteExact').value.trim(),
    batt: document.getElementById('fBatt').value.trim(),
    asse: document.getElementById('fAsse').value.trim(),
    pacco: document.getElementById('fPacco').value.trim(),
    larg: document.getElementById('fLarg').value.trim(),
    punta: document.getElementById('fPunta').value.trim(),
    np: document.getElementById('fNP').value.trim(),
  };
}

function matchRow(r, f){
  // general token search over descrizione, modello, cliente, telefono, docTrasporto
  if (f.q){
    const hay = [r.descrizione, r.modello, r.cliente, r.telefono, r.docTrasporto].map(norm).join(' ');
    const tokens = norm(f.q).split(/\s+/).filter(Boolean);
    for (const t of tokens){ if(!hay.includes(t)) return false; }
  }
  // exact note (case-insensitive, spaces-insensitive)
  if (f.noteExact){
    if (norm(r.note) !== norm(f.noteExact)) return false;
  }
  // single technical filters as exact (string compare)
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
  const rows = state.all.filter(r=>matchRow(r,f)).sort(byHomeOrder);
  const tb = document.getElementById('searchRows');
  tb.innerHTML = '';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fmtIT(r.dataApertura)}</td>
      <td>${r.descrizione??''}</td>
      <td>${r.cliente??''}</td>
      <td>${r.modello??''}</td>
      <td>${r.statoPratica??''}</td>
      <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-id="${r.id}">Apri</button></td>`;
    tr.querySelector('button').addEventListener('click',()=>openEdit(r.id));
    tb.appendChild(tr);
  });
  if(!rows.length) tb.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nessun risultato</td></tr>';
}

function clearSearchUI(){
  document.getElementById('q').value = '';
  document.getElementById('noteExact').value = '';
  for (const id of ['fBatt','fAsse','fPacco','fLarg','fPunta','fNP']){
    const el = document.getElementById(id);
    if (el.tagName==='SELECT') el.selectedIndex = 0; else el.value='';
  }
  document.getElementById('searchRows').innerHTML = '';
}

function openEdit(id){
  const r = state.all.find(x=>x.id===id);
  if(!r) return;
  state.editing = r;
  // banner chiusa
  const closed = norm(r.statoPratica).includes('completata');
  document.getElementById('closedBanner').classList.toggle('d-none', !closed);
  document.getElementById('closedHint').textContent = closed ? `Chiusa il ${fmtIT(r.dataAccettazione||r.dataCompletamento||'')}` : '';

  // bind fields
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
  document.getElementById('btnUpload').onclick = async ()=>{
    const files = document.getElementById('eFiles').files;
    if(!files || !files.length){ alert('Seleziona una o più immagini'); return; }
    const ok = await uploadFiles(r.id, files);
    if(ok){ await refreshGallery(r.id); document.getElementById('eFiles').value=''; }
  };
}

function setV(id, v){
  const el = document.getElementById(id);
  if (!el) return;
  if (el.tagName==='SELECT'){
    // try to select matching option
    let found = false;
    for (const opt of el.options){ if (norm(opt.value)===norm(v)) { el.value = opt.value; found=true; break; } }
    if (!found) el.value = '';
  } else {
    el.value = v ?? '';
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
  if(error){ alert('Errore salvataggio: '+error.message); return; }
  // refresh local cache
  Object.assign(r, data);
  // chiusa banner
  const closed = norm(r.statoPratica).includes('completata');
  document.getElementById('closedBanner').classList.toggle('d-none', !closed);
  alert('Salvato!');
}

function val(id){ return document.getElementById(id).value.trim(); }

// Navigation
document.getElementById('btnHome').addEventListener('click', ()=>{ show('page-home'); });
document.getElementById('btnRicerca').addEventListener('click', ()=>{ show('page-search'); });
document.getElementById('btnClearFilter').addEventListener('click', ()=>{ clearSearchUI(); show('page-home'); });
document.getElementById('btnReset').addEventListener('click', ()=>{ clearSearchUI(); });
document.getElementById('btnApply').addEventListener('click', doSearch);
document.getElementById('btnDoSearch').addEventListener('click', doSearch);
document.getElementById('btnCancel').addEventListener('click', ()=>{ show('page-home'); });

document.getElementById('kpiTotBtn').addEventListener('click', ()=>renderHome(state.all));
document.getElementById('kpiAttesaBtn').addEventListener('click', ()=>renderHome(state.all.filter(r=>norm(r.statoPratica).includes('attesa'))));
document.getElementById('kpiLavBtn').addEventListener('click', ()=>renderHome(state.all.filter(r=>norm(r.statoPratica).includes('lavorazione'))));
document.getElementById('kpiCompBtn').addEventListener('click', ()=>renderHome(state.all.filter(r=>norm(r.statoPratica).includes('completata'))));

document.getElementById('btnSave').addEventListener('click', saveEdit);
document.getElementById('btnPrint').addEventListener('click', ()=> state.editing && printPDF(state.editing));

// bootstrap
loadAll();


function printPDF(r){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const L = (k,v)=>[k, String(v??'')];

  doc.setFontSize(14);
  doc.text('Scheda riparazione', 14, 16);
  doc.setFontSize(10);

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

  doc.autoTable({
    head:[['Campo','Valore']],
    body: rows,
    startY: 22,
    styles:{ fontSize:10 }
  });

  doc.save((r.cliente||'scheda') + '_riparazione.pdf');
}

