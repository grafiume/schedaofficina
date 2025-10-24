
/* Preventivi ELIP — app.js (FINAL v4c) */
(function(){
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const EURO = n => (n||0).toLocaleString('it-IT', { style:'currency', currency:'EUR' });
  const DTIT = s => s ? new Date(s).toLocaleDateString('it-IT') : '';

  // ===== Catalogo =====
  const DEFAULT_CATALOG=[
    {code:"05",desc:"Smontaggio completo del motore sistematico"},
    {code:"29",desc:"Lavaggio componenti e trattamento termico avvolgimenti"},
    {code:"06",desc:"Verifiche meccaniche alberi/alloggi cuscinetti + elettriche avvolgimenti"},
    {code:"07",desc:"Tornitura, smicatura ed equilibratura rotore"},
    {code:"22",desc:"Sostituzione collettore con recupero avvolgimento"},
    {code:"01",desc:"Avvolgimento indotto con recupero collettore"},
    {code:"01C",desc:"Avvolgimento indotto con sostituzione collettore"},
    {code:"08",desc:"Isolamento statore"},
    {code:"02",desc:"Avvolgimento statore"},
    {code:"31",desc:"Lavorazioni meccaniche albero"},
    {code:"32",desc:"Lavorazioni meccaniche flange"},
    {code:"19",desc:"Sostituzione spazzole"},
    {code:"20",desc:"Sostituzione molle premispazzole"},
    {code:"21",desc:"Sostituzione cuscinetti"},
    {code:"23",desc:"Sostituzione tenuta meccanica"},
    {code:"26",desc:"Sostituzione guarnizioni/paraolio"},
    {code:"30",desc:"Montaggio, collaudo e verniciatura"},
    {code:"16",desc:"Ricambi vari"}
  ];
  function getCatalog(){
    try {
      const raw = localStorage.getItem('elip_catalog');
      if (!raw) return DEFAULT_CATALOG.slice();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length ? arr : DEFAULT_CATALOG.slice();
    } catch { return DEFAULT_CATALOG.slice(); }
  }
  function setCatalog(rows){ try { localStorage.setItem('elip_catalog', JSON.stringify(rows||[])); } catch {} }
  function ensureCatalog(){ const arr = getCatalog(); if (!arr.length) setCatalog(DEFAULT_CATALOG); }
  function buildDatalist(){
    let dl = $('#catalogCodes');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'catalogCodes'; document.body.appendChild(dl); }
    dl.innerHTML = '';
    getCatalog().forEach(x=>{
      const o=document.createElement('option');
      o.value = x.code;
      o.label = `${x.code} - ${x.desc}`;
      dl.appendChild(o);
    });
  }
  function renderCatalog(filter=''){
    const ul = $('#catalogList'); if (!ul) return;
    const q = (filter||'').toLowerCase();
    const rows = getCatalog().filter(x => (x.code+' '+x.desc).toLowerCase().includes(q));
    ul.innerHTML = '';
    if (rows.length===0) { ul.innerHTML = '<li class="list-group-item text-muted">Nessuna voce…</li>'; return; }
    rows.forEach(x => {
      const li = document.createElement('li');
      li.className = 'list-group-item';
      li.textContent = `${x.code} - ${x.desc}`;
      li.addEventListener('click',()=> addLine({code:x.code,desc:x.desc,qty:1,price:0,done:false,doneBy:'',doneDate:''}));
      ul.appendChild(li);
    });
  }

  // ===== Stato =====
  function getCur(){ try { return JSON.parse(localStorage.getItem('elip_current') || 'null'); } catch { return null; } }
  function setCurLight(o){ try { localStorage.setItem('elip_current', JSON.stringify(o||{})); } catch {} }
  function nextNumero(){
    const y = new Date().getFullYear();
    const k = 'elip_seq_'+y;
    const s = (parseInt(localStorage.getItem(k)||'0',10) + 1);
    localStorage.setItem(k, String(s));
    return `ELP-${y}-${String(s).padStart(4,'0')}`;
  }
  function initCur(){
    let cur = getCur();
    if (!cur) {
      cur = { id: nextNumero(), createdAt: new Date().toISOString(), cliente:'', articolo:'', ddt:'', telefono:'', email:'' , dataInvio:'', dataAcc:'', dataScad:'', note:'', lines:[] };
      setCurLight(cur);
    }
    return cur;
  }

  function updateAccPill(){
    const has = ($('#dataAcc')?.value || '').trim().length > 0;
    const pill = $('#okPill');
    if (!pill) return;
    pill.textContent = has ? '● OK' : '● NO';
    pill.classList.toggle('acc-yes', has);
    pill.classList.toggle('acc-no', !has);
  }
  function updateProgress(){
    const c = initCur();
    let toDo=0, done=0;
    (c.lines||[]).forEach(r => {
      const has = (r.desc||'').trim()!=='' || (+r.qty||0)>0 || (+r.price||0)>0;
      if (has) { toDo++; if (r.doneDate && String(r.doneDate).trim()) done++; }
    });
    const pct = toDo ? Math.round((done/toDo)*100) : 0;
    const bar = $('#progressBar');
    if (bar) { bar.style.width = pct+'%'; bar.textContent = pct+'%'; }
    try{ updateDeadlineUI(); }catch{}
  }
  function recalcTotals(){
    const c = initCur();
    let imp=0;
    (c.lines||[]).forEach((r,i)=>{
      const t = (+r.qty||0) * (+r.price||0);
      imp += t;
      const cell = $('#lineTot'+i); if (cell) cell.textContent = EURO(t);
    });
    const iva = imp*0.22, tot = imp+iva;
    $('#imponibile') && ($('#imponibile').textContent = EURO(imp));
    $('#iva') && ($('#iva').textContent = EURO(iva));
    $('#totale') && ($('#totale').textContent = EURO(tot));
    updateProgress();
    updateAccPill();
    updateDeadlineUI(); updateDaysLeftBanner();
  }

  // ===== Righe =====
  function addLine(r){
    const c = initCur();
    c.lines.push(r);
    setCurLight(c);
    renderLines();
    recalcTotals();
  }
  function renderLines(){
    const c = initCur();
    const body = $('#linesBody'); if (!body) return;
    body.innerHTML = '';
    (c.lines||[]).forEach((r,i) => {
      const statoBadge = r.doneDate && String(r.doneDate).trim()
        ? '<span class="badge text-bg-success">OK</span>'
        : '<span class="badge text-bg-danger">NO</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="form-control form-control-sm line-code" list="catalogCodes" data-idx="${i}" placeholder="Cod." value="${r.code||''}"></td>
        <td><input class="form-control form-control-sm line-desc" data-idx="${i}" placeholder="Descrizione…" value="${r.desc||''}"></td>
        <td><input type="number" min="0" step="1" class="form-control form-control-sm text-end line-qty" data-idx="${i}" value="${r.qty||1}"></td>
        <td><input type="number" min="0" step="0.01" class="form-control form-control-sm text-end line-price" data-idx="${i}" value="${r.price||0}"></td>
        <td class="text-end" id="lineTot${i}">€ 0,00</td>
        <td class="text-center">${statoBadge}</td>
        <td><input class="form-control form-control-sm line-operator" data-idx="${i}" value="${r.doneBy||''}"></td>
        <td><input type="date" class="form-control form-control-sm line-date" data-idx="${i}" value="${r.doneDate||''}"></td>
        <td><button class="btn btn-sm btn-outline-danger" data-del="${i}">✕</button></td>`;
      body.appendChild(tr);
    });
    body.oninput = onLineEdit;
    body.onclick = onLineClick;
    recalcTotals(); updateDeadlineUI(); updateDaysLeftBanner();
  }
  function onLineEdit(e){
    const c = initCur();
    const i = e.target.dataset.idx;
    if (e.target.classList.contains('line-code')) {
      const v = e.target.value;
      c.lines[i].code = v;
      const hit = getCatalog().find(x=>x.code.toLowerCase()===String(v||'').toLowerCase());
      if (hit) {
        c.lines[i].desc = hit.desc;
        const desc = e.target.closest('tr')?.querySelector('.line-desc');
        if (desc) desc.value = hit.desc;
      }
    }
    if (e.target.classList.contains('line-desc')) c.lines[i].desc = e.target.value;
    if (e.target.classList.contains('line-qty')) c.lines[i].qty = parseFloat(e.target.value)||0;
    if (e.target.classList.contains('line-price')) c.lines[i].price = parseFloat(e.target.value)||0;
    if (e.target.classList.contains('line-operator')) c.lines[i].doneBy = e.target.value;
    if (e.target.classList.contains('line-date')) c.lines[i].doneDate = e.target.value;
    setCurLight(c);
    renderLines();
    recalcTotals();
  }
  function onLineClick(e){
    const btn = e.target.closest('button[data-del]');
    if (btn) {
      const i = +btn.getAttribute('data-del');
      const c = initCur();
      c.lines.splice(i,1);
      setCurLight(c);
      renderLines();
    }
  }

  // ===== Foto (locale + server) =====
  let photoItems = [];            // [{id,file,key,thumb,full,origin,path?}]
  const photoIndex = new Map();   // key -> idx
  function fileKey(f){ return `${f?.name||'?' }|${f?.size||0}|${f?.lastModified||0}`; }
  function readFileAsDataURL(file){
    return new Promise((res,rej)=>{
      const fr = new FileReader();
      fr.onload = ()=> res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
  async function makeThumbFromDataURL(dataUrl, size=164){
    const img = new Image();
    img.src = dataUrl; await img.decode();
    const ratio = Math.max(size / img.width, size / img.height);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0,0,size,size);
    ctx.drawImage(img, (size - w)/2, (size - h)/2, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
  async function addLocalFiles(files){
    const list = Array.from(files||[]).filter(Boolean);
    for (const f of list){
      const key = fileKey(f);
      if (photoIndex.has(key)) continue;
      const dataUrl = await readFileAsDataURL(f);
      const thumb = await makeThumbFromDataURL(dataUrl, 164);
      const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now()+'_'+Math.random().toString(36).slice(2,8));
      const item = { id, file: f, key, full: dataUrl, thumb, origin:'local' };
      photoIndex.set(key, photoItems.length);
      photoItems.push(item);
    }
    renderPhotoArea();
  }
  function setServerThumbs(list){
    photoItems = photoItems.filter(x => x.origin === 'local');
    for (const obj of (list||[])){
      const id = 'srv_'+(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2,10));
      photoItems.push({ id, file:null, key:'srv:'+id, full: obj.full, thumb: obj.thumb || obj.full, path: obj.path, origin:'server' });
    }
    renderPhotoArea();
  }
  function renderPhotoArea(){
    const wrap = document.getElementById('imgPreview');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const it of photoItems){
      if (!it || !it.thumb) continue;
      const card = document.createElement('div');
      card.className = 'border rounded position-relative';
      card.style.width='164px'; card.style.height='164px'; card.style.overflow='hidden'; card.style.display='inline-block'; card.style.marginRight='.5rem'; card.style.marginBottom='.5rem';
      const img = document.createElement('img');
      img.src = it.thumb; img.alt = it.file?.name || 'Foto';
      img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover';
      img.dataset.full = it.full || it.thumb;
      card.appendChild(img);

      const btn = document.createElement('button');
      btn.type='button'; btn.textContent='×';
      btn.title = (it.origin==='server') ? 'Elimina dal server' : 'Rimuovi dalla coda';
      btn.className='btn btn-sm btn-danger position-absolute';
      btn.style.top='.25rem'; btn.style.right='.25rem'; btn.style.lineHeight='1';
      btn.setAttribute('data-remove-id', it.id);
      card.appendChild(btn);

      if (it.origin==='server'){
        const badge = document.createElement('div');
        badge.textContent='cloud';
        badge.className='badge text-bg-primary position-absolute';
        badge.style.left='.25rem'; badge.style.top='.25rem';
        card.appendChild(badge);
      }
      wrap.appendChild(card);
    }
  }
  window.__elipGetUploadFiles = function(){ return photoItems.filter(x=>x.origin==='local').map(x=>x.file).filter(Boolean); };
  window.__elipClearUploadQueue = function(){ photoItems = photoItems.filter(x=>x.origin!=='local'); renderPhotoArea(); };
  window.__elipResetPhotos = function(){ photoItems = []; renderPhotoArea(); };

  // ===== Archivio =====
  function coerceArray(a){ if (!a) return []; if (Array.isArray(a)) return a; try{const p=JSON.parse(a); return Array.isArray(p)?p:[];}catch{return [];} }
  function lineHasWork(e){
    const desc = (e.desc ?? e.descrizione ?? '').toString().trim();
    const qty  = Number(e.qty ?? e.qta ?? 0) || 0;
    const price= Number(e.price ?? e.prezzo ?? 0) || 0;
    return desc !== '' || qty > 0 || price > 0;
  }
  function progressPctFromLines(linee){
    const arr = coerceArray(linee);
    let toDo=0, done=0;
    for (const e of arr){
      if (lineHasWork(e)) {
        toDo++;
        const doneDate = (e.doneDate ?? e.data_fine ?? '').toString().trim();
        if (doneDate) done++;
      }
    }
    return toDo ? Math.round((done/toDo)*100) : 0;
  }
  async function renderArchiveTable(){
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('elip_archive') || '[]') || []; } catch {}
    const tbody = $('#archBody'); if (!tbody) return;
    const q = ($('#filterQuery')?.value||'').trim().toLowerCase();
    const mode = (
      document.getElementById('fltDue')?.classList.contains('active') ? 'due' :
      document.getElementById('fltOk')?.classList.contains('active') ? 'ok' :
      document.getElementById('fltNo')?.classList.contains('active') ? 'no' : 'all');
    const rows = arr.filter(r => {
      const hitTxt = (txt) => (String(txt||'').toLowerCase().includes(q));
      const accepted = !!(r.data_accettazione);
      if (mode==='ok' && !accepted) return false;
      if (mode==='no' && accepted) return false;
      if (mode==='due'){
        if (!accepted) return false;
        const pctTmp = progressPctFromLines(r.linee);
        if (pctTmp>=100) return false;
        const dStr = r.data_scadenza;
        if (!dStr) return false;
        const d = new Date(dStr); if (isNaN(d)) return false;
        const today = new Date();
        const MS=86400000;
        const daysLeft = Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) - Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/MS);
        if (daysLeft>5) return false;
      }
      if (q && !(hitTxt(r.cliente)||hitTxt(r.articolo)||hitTxt(r.numero)||hitTxt(r.ddt))) return false;
      return true;
    });

    tbody.innerHTML = '';
    rows.forEach(r => {
      const pct = progressPctFromLines(r.linee);
      const isAccepted = !!(r.data_accettazione);
      const accBadge = isAccepted
        ? '<span class="badge text-bg-success ms-2">Accettata</span>'
        : '<span class="badge text-bg-danger ms-2">Non accettata</span>';

      const statoHtml = (pct === 100)
        ? `<span class="badge text-bg-primary">Chiusa</span> <span class="small text-muted ms-1">${pct}%</span>`
        : `<span class="badge text-bg-secondary">${pct}%</span>${accBadge}`;

      // scadenza evidenziata se prossima/scaduta e non chiusa
      const dStr = r.data_scadenza;
      let dateHtml = DTIT(dStr);
      if (pct < 100 && dStr){
        const d = new Date(dStr);
        if (!isNaN(d)){
          const today = new Date();
          const MS = 24*60*60*1000;
          const daysLeft = Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) - Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/MS);
          if (daysLeft <= 5) dateHtml = `<span class="text-danger fw-semibold">${DTIT(dStr)}</span>`;
          if (daysLeft < 0)  dateHtml = `<span class="text-danger fw-bold">${DTIT(dStr)} (scaduta)</span>`;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.numero||''}</td>
        <td>${DTIT(r.created_at||r.data_invio)}</td>
        <td>${r.cliente||''}</td>
        <td>${r.articolo||''}</td>
        <td>${r.ddt||''}</td>
        <td class="text-end">${EURO(r.imponibile||0)}</td>
        <td>${DTIT(r.data_accettazione)}</td>
        <td>${dateHtml}</td>
        <td>${statoHtml}</td>
        <td><button class="btn btn-sm btn-outline-primary" data-open-num="${r.numero}">Apri</button></td>`;
      tbody.appendChild(tr);
    });
  }
  window.renderArchiveLocal = function(){ try { renderArchiveTable(); } catch{} };

  function openFromArchive(num){
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('elip_archive') || '[]') || []; } catch {}
    const r = arr.find(x => x.numero === num);
    if (!r) return;
    const cur = {
      id: r.numero || nextNumero(),
      createdAt: r.created_at || new Date().toISOString(),
      cliente: r.cliente || '',
      articolo: r.articolo || '',
      ddt: r.ddt || '',
      telefono: r.telefono || '',
      email: r.email || '',
      dataInvio: r.data_invio || '',
      dataAcc: r.data_accettazione || '',
      dataScad: r.data_scadenza || '',
      note: r.note || '',
      lines: r.linee || []
    };
    setCurLight(cur);
    fillForm();
    renderLines(); updateDeadlineUI(); updateDaysLeftBanner();
    try { window.dbApi?.loadPhotosFor(cur.id).then(list => setServerThumbs(list)); } catch {}
    const btn = document.querySelector('[data-bs-target="#tab-editor"]');
    if (btn) { try { new bootstrap.Tab(btn).show(); } catch { btn.click(); } }
  }
  window.openFromArchive = openFromArchive;

  // ===== PDF / Email / WhatsApp =====
  function collectFlat(c){
    let imp=0; (c.lines||[]).forEach(r=> imp += (+r.qty||0)*(+r.price||0));
    const iva = imp*0.22, tot = imp+iva;
    return { imp, iva, tot };
  }
  async function makePDF(detail){
    const c = initCur();
    const jsPDF = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
    if (!jsPDF) { alert('jsPDF non disponibile'); return; }
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const title = `Preventivo ${c.id}`;
    doc.setFontSize(16); doc.text(title, 40, 40);
    doc.setFontSize(11);
    doc.text(`Cliente: ${c.cliente||''}`, 40, 70);
    doc.text(`Articolo: ${c.articolo||''}`, 40, 90);
    doc.text(`DDT: ${c.ddt||''}`, 40, 110);
    doc.text(`Data invio: ${DTIT(c.dataInvio)||''}`, 40, 130);
    doc.text(`Data accettazione: ${DTIT(c.dataAcc)||''}`, 40, 150);
    doc.text(`Scadenza lavori: ${DTIT(c.dataScad)||''}`, 40, 170);
    if (detail && doc.autoTable) {
      const rows = (c.lines||[]).map(r => [r.code||'', r.desc||'', r.qty||0, (r.price||0), ((+r.qty||0)*(+r.price||0))]);
      if (rows.length) {
        doc.autoTable({
          startY: 190,
          head: [['Cod', 'Descrizione', 'Q.tà', 'Prezzo €', 'Tot. €']],
          body: rows,
          styles: { fontSize: 9, halign:'right' },
          columnStyles: { 0:{halign:'left'}, 1:{halign:'left'} }
        });
      }
    }
    const { imp, iva, tot } = collectFlat(c);
    let y = detail && doc.lastAutoTable ? (doc.lastAutoTable.finalY || 190) + 20 : 200;
    doc.setFontSize(12);
    doc.text(`Imponibile: ${EURO(imp)}`, 40, y); y+=18;
    doc.text(`IVA (22%): ${EURO(iva)}`, 40, y); y+=18;
    doc.text(`TOTALE: ${EURO(tot)}`, 40, y);

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const ifr = $('#pdfFrame'); if (ifr) ifr.src = url;

    const modalBody = document.querySelector('#pdfModal .modal-body');
    if (modalBody && !document.getElementById('pdfJPGPreview')){
      const img = document.createElement('img');
      img.id = 'pdfJPGPreview'; img.alt = 'Anteprima JPG';
      img.style.display='block'; img.style.maxWidth='100%'; img.style.marginTop='12px';
      modalBody.appendChild(img);
    }
    const jpgDataUrl = await makeJPGPreviewCanvas(detail);
    const imgEl = document.getElementById('pdfJPGPreview'); if (imgEl) imgEl.src = jpgDataUrl;

    const a = document.getElementById('btnDownload'); if (a) { a.href = url; a.download = `${c.id}.pdf`; }
    const aJPG = document.getElementById('btnJPG'); if (aJPG) { aJPG.href = jpgDataUrl; aJPG.download = `${c.id}.jpg`; }

    const modalEl = document.getElementById('pdfModal'); if (modalEl) {
      try { new bootstrap.Modal(modalEl).show(); } catch { modalEl.style.display='block'; }
    }
  }
  async function makeJPGPreviewCanvas(detail){
    const c = initCur();
    const { imp, iva, tot } = collectFlat(c);
    const W = 794, H = 1123;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`Preventivo ${c.id}`, 40, 40);
    ctx.font = '14px Arial';
    ctx.fillText(`Cliente: ${c.cliente||''}`, 40, 80);
    ctx.fillText(`Articolo: ${c.articolo||''}`, 40, 100);
    ctx.fillText(`DDT: ${c.ddt||''}`, 40, 120);
    ctx.fillText(`Data invio: ${DTIT(c.dataInvio)||''}`, 40, 140);
    ctx.fillText(`Accettazione: ${DTIT(c.dataAcc)||''}`, 40, 160);
    ctx.fillText(`Scadenza: ${DTIT(c.dataScad)||''}`, 40, 180);
    ctx.font = '12px Arial';
    let y = 210;
    const maxRows = detail ? 12 : 6;
    const lines = (c.lines||[]).slice(0, maxRows);
    if (lines.length){
      ctx.fillText('Righe lavorazione:', 40, y); y+=18;
      for (const r of lines){
        const t = `${r.code||''}  ${String(r.desc||'').slice(0,60)}  x${r.qty||0}  €${(+r.price||0).toFixed(2)}`;
        ctx.fillText(t, 40, y); y+=16;
      }
      if ((c.lines||[]).length > maxRows){
        ctx.fillText(`… altre ${(c.lines.length - maxRows)} righe`, 40, y+4);
        y += 20;
      }
    }
    y = Math.max(y+10, H-100);
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`Imponibile: ${EURO(imp)}`, 40, y); y+=20;
    ctx.fillText(`IVA 22%: ${EURO(iva)}`, 40, y); y+=20;
    ctx.fillText(`TOTALE: ${EURO(tot)}`, 40, y);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
  function composeEmail(){
    const c = initCur();
    const { imp, iva, tot } = collectFlat(c);
    const to = (c.email||'').trim();
    const subject = encodeURIComponent(`Preventivo ${c.id} - ${c.cliente||''}`);
    const body = encodeURIComponent(
`Gentile ${c.cliente||''},

in allegato il preventivo ${c.id}.
Riepilogo:
- Articolo: ${c.articolo||''}
- Imponibile: ${EURO(imp)}
- IVA (22%): ${EURO(iva)}
- Totale: ${EURO(tot)}

Restiamo a disposizione.
Cordiali saluti`);
    const href = `mailto:${to}?subject=${subject}&body=${body}`;
    window.location.assign(href);
  }
  function composeWhatsApp(){
    const c = initCur();
    const { imp, tot } = collectFlat(c);
    const msg = encodeURIComponent(
`Preventivo ${c.id}
Cliente: ${c.cliente||''}
Articolo: ${c.articolo||''}
Imponibile: ${EURO(imp)}
Totale: ${EURO(tot)}`);
    const raw = (c.telefono||'').replace(/\D+/g,'');
    const link = raw ? `https://wa.me/${raw}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(link, '_blank', 'noopener');
  }

  // ===== Scadenza & Alert =====
  function getProgressPctFromCur(){
    let c = null;
    try { c = JSON.parse(localStorage.getItem('elip_current') || 'null'); } catch {}
    if (!c || !Array.isArray(c.lines)) return 0;
    let toDo=0, done=0;
    for (const r of c.lines){
      const has = (r?.desc||'').toString().trim()!=='' || (+r?.qty||0)>0 || (+r?.price||0)>0;
      if (has) { toDo++; if (r?.doneDate && String(r.doneDate).trim()) done++; }
    }
    return toDo ? Math.round((done/toDo)*100) : 0;
  }
  function parseISODate(v){
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  function diffDaysUTC(a,b){
    const MS = 24*60*60*1000;
    const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ua - ub)/MS);
  }
  function ensureDeadlineAlertContainer(){
    const table = document.getElementById('linesTable');
    if (!table) return null;
    const card = table.closest('.card');
    if (!card) return null;
    let host = card.querySelector('.deadline-host');
    if (!host){
      host = document.createElement('div');
      host.className = 'deadline-host';
      card.insertBefore(host, card.firstChild);
    }
    return host;
  }
  function showDeadlineAlert(html){
    const host = ensureDeadlineAlertContainer();
    if (!host) return;
    host.innerHTML = '';
    const div = document.createElement('div');
    div.id = 'deadlineAlert';
    div.className = 'alert alert-danger d-flex align-items-center my-2';
    div.role = 'alert';
    div.innerHTML = html;
    host.appendChild(div);
  }
  function hideDeadlineAlert(){
    const el = document.getElementById('deadlineAlert');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function applyScadenzaInputStyle(isWarn){
    const el = document.getElementById('dataScad');
    if (!el) return;
    el.classList.toggle('is-invalid', !!isWarn);
    el.style.color = isWarn ? '#dc3545' : '';
    el.style.fontWeight = isWarn ? '600' : '';
  }
  function updateDeadlineUI(){
    let c = null; try { c = JSON.parse(localStorage.getItem('elip_current') || 'null'); } catch {}
    c = c || {};
    const pct = getProgressPctFromCur();
    const dStr = c.dataScad || (document.getElementById('dataScad')?.value || '');
    const d = parseISODate(dStr);
    if (!d || pct===100){
      hideDeadlineAlert();
      applyScadenzaInputStyle(false);
      return;
    }
    const today = new Date();
    const daysLeft = diffDaysUTC(d, today);
    if (daysLeft < 0){
      applyScadenzaInputStyle(true);
      showDeadlineAlert(`<strong>Attenzione:</strong> scadenza <u>già passata</u> (${DTIT(dStr)}).`);
    } else if (daysLeft <= 5){
      applyScadenzaInputStyle(true);
      showDeadlineAlert(`<strong>Attenzione:</strong> mancano <u>${daysLeft} giorni</u> alla scadenza lavori (${DTIT(dStr)}).`);
    } else {
      hideDeadlineAlert();
      applyScadenzaInputStyle(false);
    }
  }
  function ensureScadenzaBanner(){
    const input = document.getElementById('dataScad');
    if (!input) return null;
    let bn = document.getElementById('daysLeftBanner');
    if (!bn){
      bn = document.createElement('div');
      bn.id = 'daysLeftBanner';
      bn.className = 'small mt-1';
      input.parentElement && input.parentElement.appendChild(bn);
    }
    return bn;
  }
  function updateDaysLeftBanner(){
    let c = null; try { c = JSON.parse(localStorage.getItem('elip_current') || 'null'); } catch {}
    c = c || {};
    const pct = getProgressPctFromCur();
    const bn = ensureScadenzaBanner();
    if (!bn) return;
    const dVal = c.dataScad || (document.getElementById('dataScad')?.value || '');
    const d = dVal ? new Date(dVal) : null;
    if (!d || isNaN(d) || pct===100){ bn.textContent=''; return; }
    const today = new Date();
    const MS = 86400000;
    const daysLeft = Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) - Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/MS);
    if (daysLeft < 0){ bn.innerHTML = '<span class="text-danger fw-bold">Scaduta</span>'; }
    else if (daysLeft <= 5){ bn.innerHTML = `<span class="text-danger fw-semibold">Mancano ${daysLeft} giorni alla scadenza</span>`; }
    else { bn.textContent=''; }
  }

  // ===== Helpers UI =====
  function fillForm(){
    const c = initCur();
    const ids = ['cliente','articolo','ddt','telefono','email','dataInvio','dataAcc','dataScad','note'];
    ids.forEach(id => { const el = $('#'+id); if (el) el.value = c[id] || ''; });
    const q = $('#quoteId'); if (q) q.textContent = c.id;
    updateAccPill(); updateProgress(); recalcTotals(); updateDeadlineUI(); updateDaysLeftBanner();
  }
  function snapshotFormToCur(){
    const c = initCur();
    c.cliente   = ($('#cliente')?.value || '').trim();
    c.articolo  = ($('#articolo')?.value || '').trim();
    c.ddt       = ($('#ddt')?.value || '').trim();
    c.telefono  = ($('#telefono')?.value || '').trim();
    c.email     = ($('#email')?.value || '').trim();
    c.dataInvio = ($('#dataInvio')?.value || '').trim();
    c.dataAcc   = ($('#dataAcc')?.value || '').trim();
    c.dataScad  = ($('#dataScad')?.value || '').trim();
    c.note      = ($('#note')?.value || '');
    setCurLight(c);
    return c;
  }
  function focusFirstField(){
    const el = $('#cliente') || document.querySelector('input,textarea,select');
    if (el) { el.focus(); try{ el.select && el.select(); }catch{} }
  }
  function clearEditorToNew(){
    const fresh = { id: nextNumero(), createdAt: new Date().toISOString(), cliente:'', articolo:'', ddt:'', telefono:'', email:'', dataInvio:'', dataAcc:'', dataScad:'', note:'', lines:[] };
    setCurLight(fresh);
    if (typeof window.__elipResetPhotos === 'function') window.__elipResetPhotos();
    const ids = ['cliente','articolo','ddt','telefono','email','dataInvio','dataAcc','dataScad','note'];
    ids.forEach(id => { const el = $('#'+id); if (el) el.value = ''; });
    fillForm(); renderLines(); updateDeadlineUI(); updateDaysLeftBanner(); focusFirstField();
  }

  function toastSaved(){
    const t = document.getElementById('toastSave');
    if (!t) return;
    try { new bootstrap.Toast(t).show(); } catch { t.style.display='block'; }
  }
  function savedModal(){
    const wrapId='savedModal';
    if (!document.getElementById(wrapId)){
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="modal fade" id="${wrapId}" tabindex="-1">
          <div class="modal-dialog modal-sm modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-body text-center">
                <div class="h5 mb-2">✅ Preventivo salvato</div>
                <div class="text-muted small">Le modifiche sono state registrate.</div>
              </div>
              <div class="modal-footer justify-content-center">
                <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(wrap.firstElementChild);
    }
    try { new bootstrap.Modal(document.getElementById(wrapId)).show(); } catch {}
  }

  // ===== Archivio — Button "In scadenza" =====
  function ensureInScadenzaButton(){
    const grp = document.querySelector('#tab-archivio .btn-group');
    if (!grp || document.getElementById('fltDue')) return;
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline-warning';
    btn.id = 'fltDue';
    btn.textContent = 'In scadenza ⏰';
    grp.appendChild(btn);
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      document.getElementById('fltAll')?.classList.remove('active');
      document.getElementById('fltOk')?.classList.remove('active');
      document.getElementById('fltNo')?.classList.remove('active');
      btn.classList.add('active');
      renderArchiveTable();
    });
  }

  // ===== Bind & Init =====
  function bind(){
    $('#btnNew')?.addEventListener('click', (e)=>{
      e.preventDefault();
      clearEditorToNew();
      const btn = document.querySelector('[data-bs-target="#tab-editor"]');
      if (btn) { try { new bootstrap.Tab(btn).show(); } catch { btn.click(); } }
    });
    $('#btnClear')?.addEventListener('click', (e)=>{
      e.preventDefault();
      const c = initCur();
      setCurLight({ id:c.id, createdAt:c.createdAt, cliente:'', articolo:'', ddt:'', telefono:'', email:'', dataInvio:'', dataAcc:'', dataScad:'', note:'', lines:[] });
      if (typeof window.__elipResetPhotos === 'function') window.__elipResetPhotos();
      fillForm(); renderLines(); updateDeadlineUI(); updateDaysLeftBanner(); focusFirstField();
      const btn = document.querySelector('[data-bs-target="#tab-editor"]');
      if (btn) { try { new bootstrap.Tab(btn).show(); } catch { btn.click(); } }
    });
    $('#btnSave')?.addEventListener('click', async (e)=>{
      e.preventDefault();
      snapshotFormToCur();
      const ok = await (window.dbApi?.saveToSupabase ? window.dbApi.saveToSupabase(true) : Promise.resolve(false));
      if (ok) {
        toastSaved(); savedModal();
        try { await window.dbApi.loadArchiveRetry?.(); } catch {}
        window.renderArchiveLocal?.();
        ensureInScadenzaButton();
        const t = document.querySelector('[data-bs-target="#tab-archivio"]');
        if (t) { try { new bootstrap.Tab(t).show(); } catch { t.click(); } }
        clearEditorToNew();
      }
    });

    $('#btnPDFDett')?.addEventListener('click', ()=> makePDF(true));
    $('#btnPDFTot')?.addEventListener('click', ()=> makePDF(false));
    $('#btnMail')?.addEventListener('click', composeEmail);
    $('#btnWA')?.addEventListener('click', composeWhatsApp);

    $('#imgInput')?.addEventListener('change', async e => {
      try { await addLocalFiles(e.target.files); } catch (err) { console.error('[imgInput]', err); }
    });

    $('#catalogSearch')?.addEventListener('input', e => renderCatalog(e.target.value));

    $('#filterQuery')?.addEventListener('input', renderArchiveTable);
    $('#fltAll')?.addEventListener('click', (e)=>{ e.preventDefault(); $('#fltAll').classList.add('active'); $('#fltOk')?.classList.remove('active'); $('#fltNo')?.classList.remove('active'); document.getElementById('fltDue')?.classList.remove('active'); renderArchiveTable(); });
    $('#fltOk')?.addEventListener('click', (e)=>{ e.preventDefault(); $('#fltOk').classList.add('active'); $('#fltAll')?.classList.remove('active'); $('#fltNo')?.classList.remove('active'); document.getElementById('fltDue')?.classList.remove('active'); renderArchiveTable(); });
    $('#fltNo')?.addEventListener('click', (e)=>{ e.preventDefault(); $('#fltNo').classList.add('active'); $('#fltAll')?.classList.remove('active'); $('#fltOk')?.classList.remove('active'); document.getElementById('fltDue')?.classList.remove('active'); renderArchiveTable(); });

    $('#archBody')?.addEventListener('click', (e)=>{
      const b = e.target.closest('button[data-open-num]');
      if (b){ openFromArchive(b.getAttribute('data-open-num')); }
    });

    $('#imgPreview')?.addEventListener('click', async (e)=>{
      const btn = e.target.closest('button[data-remove-id]');
      if (btn){
        const id = btn.getAttribute('data-remove-id');
        const i = photoItems.findIndex(x=>x.id===id);
        if (i>=0){
          const it = photoItems[i];
          if (it.origin==='server'){
            if (confirm('Eliminare definitivamente questa foto dal server?')){
              try { await window.dbApi?.deletePhoto?.(it.path); } catch (err) { alert('Eliminazione fallita: '+(err?.message||err)); return; }
              photoItems.splice(i,1); renderPhotoArea();
            }
          } else {
            photoItems.splice(i,1); renderPhotoArea();
          }
        }
        return;
      }
      const img = e.target.closest('img');
      const modal = document.getElementById('imgModal');
      const target = document.getElementById('imgModalImg');
      if (img && img.dataset.full && target){
        target.src = img.dataset.full;
        if (modal) { try { new bootstrap.Modal(modal).show(); } catch { modal.style.display='block'; } }
      }
    });

    $('#dataAcc')?.addEventListener('input', updateAccPill);
    $('#dataAcc')?.addEventListener('change', updateAccPill);
    $('#dataScad')?.addEventListener('input', ()=>{ updateDeadlineUI(); updateDaysLeftBanner(); });
    $('#dataScad')?.addEventListener('change', ()=>{ updateDeadlineUI(); updateDaysLeftBanner(); });
  }

  async function init(){
    try {
      ensureCatalog();
      buildDatalist();
      renderCatalog('');
      initCur();
      fillForm();
      renderLines(); updateDeadlineUI(); updateDaysLeftBanner();
      if (window.dbApi?.loadArchive) await window.dbApi.loadArchive();
      renderArchiveTable();
      ensureInScadenzaButton();
      focusFirstField();
    } catch (e) { console.error('[init failed]', e); }
  }

  document.addEventListener('DOMContentLoaded', ()=>{ bind(); init(); });
})();
