/* ===== HOTFIX VISIBILITÀ MULTI-DEVICE (runtime, senza toccare index.html) =====
   - Disinstalla *tutti* i Service Worker del dominio
   - Svuota *tutte* le cache (inclusi vecchi 'officina-cache-v4', ecc.)
   - Ricarica la pagina con ?v=<timestamp> per bustare la cache dei file
   - Esegue una sola volta per sessione (usa sessionStorage)
*/
(async function hotfixPWAOnce() {
  try {
    if (sessionStorage.getItem('officina_hotfix_done')) return;

    // 1) Unregister SW (se presenti)
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try { await reg.unregister(); } catch (e) { /* ignore */ }
      }
      // cerca anche un solo registration “default”
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.unregister();
      } catch (e) { /* ignore */ }
    }

    // 2) Svuota tutte le cache
    if (window.caches && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => {
        // elimina tutto; se vuoi tenere qualcosa, filtra qui
        return caches.delete(k);
      }));
    }

    // 3) Forza reload con query version per rompere qualsiasi cache residua
    const url = new URL(location.href);
    if (!url.searchParams.has('v')) {
      url.searchParams.set('v', String(Date.now()));
      sessionStorage.setItem('officina_hotfix_done', '1');
      location.replace(url.toString());
      return; // stop qui: dopo reload non riesegue
    } else {
      sessionStorage.setItem('officina_hotfix_done', '1');
    }
  } catch (err) {
    console.warn('[officina hotfix] errore durante la pulizia cache/SW:', err);
  }
})();

(function(){
  const $=s=>document.querySelector(s);
  const esc = s => String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const parseDate=v=>v?new Date(v):null;
  const fmtIT=v=>{const d=parseDate(v);return d&&!isNaN(d)?d.toLocaleDateString('it-IT'):''};
  const isUrgent=d=>{if(!d)return!1;const t=new Date();t.setHours(0,0,0,0);const due=new Date(d.getFullYear(),d.getMonth(),d.getDate());return (due-t)/(864e5)<=3};
  const newId=()=> (crypto.randomUUID?crypto.randomUUID():Date.now().toString());
  const todayISO=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};

  // DB
  const DB='officinaDB', VER=2;
  function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,VER);r.onupgradeneeded=e=>{const db=e.target.result;let rec;if(!db.objectStoreNames.contains('records')){rec=db.createObjectStore('records',{keyPath:'id'});}else{rec=r.transaction.objectStore('records');}
    if(!rec.indexNames.contains('byStato'))rec.createIndex('byStato','statoPratica',{unique:false});
    if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos',{keyPath:'id'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function putRecord(v){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(v);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function getRecord(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('records','readonly');const q=tx.objectStore('records').get(id);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
  async function getAllRecords(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('records','readonly');const q=tx.objectStore('records').getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error);});}
  async function getByStato(stato){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('records','readonly');const idx=tx.objectStore('records').index('byStato');const q=idx.getAll(stato);q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error);});}
  async function deleteRecord(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(['records','photos'],'readwrite');tx.objectStore('records').delete(id);tx.objectStore('photos').delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
  async function getPhotos(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('photos','readonly');const q=tx.objectStore('photos').get(id);q.onsuccess=()=>{const v=q.result||{};res({images:v.images||[],thumbs:v.thumbs||[]});};q.onerror=()=>rej(q.error);});}
  async function savePhotosWithThumbs(id,images,thumbs){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').put({id,images,thumbs});tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}

  function sh(n){$('#page-home').classList.toggle('d-none',n!=='home');$('#page-form').classList.toggle('d-none',n!=='form');$('#page-search').classList.toggle('d-none',n!=='search');}
  function f2url(file){return new Promise((res,rej)=>{const R=new FileReader();R.onload=()=>res(R.result);R.onerror=()=>rej(R.error);R.readAsDataURL(file);});}

  function nuovo(){cur={id:newId(),createdAt:new Date().toISOString()};const f=$('#recordForm');f.reset();$('#formTitle').textContent='Nuova scheda';$('#photoPreview').src='';const s=$('#statoPratica');if(s)s.value='In attesa';const p=$('#preventivoStato');if(p)p.value='Non inviato';const sm=document.getElementById('completataInline');if(sm){sm.classList.add('d-none');sm.querySelector('#completataDate')?.textContent='';} sh('form');}
  async function modifica(id){const r=await getRecord(id);if(!r){alert('Scheda non trovata');return;}cur=r;const f=$('#recordForm');$('#formTitle').textContent='Modifica scheda';[...f.elements].forEach(el=>{if(el.name&&r[el.name]!=null) el.value=r[el.name];});const s=$('#statoPratica');if(s)s.value=r.statoPratica||'In attesa';const p=$('#preventivoStato');if(p)p.value=r.preventivoStato||'Non inviato';const {images}=await getPhotos(id);$('#photoPreview').src=images[0]||''; sh('form');}

  async function salva(){
    const f=$('#recordForm');
    const d=Object.fromEntries(new FormData(f).entries());
    d.id = cur?.id || newId();
    d.updatedAt = new Date().toISOString();
    if(!d.preventivoStato) d.preventivoStato='Non inviato';
    if(d.statoPratica==='Completata'){ d.dataCompletamento = d.dataCompletamento || todayISO(); d.dataScadenza=''; } else { d.dataCompletamento=''; }
    d.dataArrivo = d.dataApertura || '';

    let full=[],thumbs=[];
    const fl=$('#photoInput').files;
    if(fl&&fl.length){for(const file of fl){const data=await f2url(file);full.push(data);thumbs.push(data);}}
    else{const prev=$('#photoPreview').getAttribute('src');if(prev){full=[prev];thumbs=[prev];}}

    await putRecord(d);
    if(full.length||thumbs.length) await savePhotosWithThumbs(d.id,full,thumbs);
    if(window.sbbridge && typeof window.sbbridge.syncRecord==='function'){ try{ await window.sbbridge.syncRecord(d, full, thumbs); }catch(_){ } }
    alert('Scheda salvata'); sh('home'); refreshDashboard();
  }

  function renderThumb(src,id){return src?`<img class="thumb" loading="lazy" src="${src}" data-id="${id}">`:'<div class="thumb d-flex align-items-center justify-content-center text-secondary">—</div>';}

  async function populateHomeOpenList(){
    const all=await getAllRecords(); all.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
    const open=all.filter(r=>(r.statoPratica||'')!=='Completata');
    const tb=$('#listAllOpenBody');
    if(!open.length){tb.innerHTML='<tr><td colspan="6" class="text-muted">Nessuna scheda</td></tr>';return;}
    const rows=[];
    for(const r of open){
      const {images,thumbs}=await getPhotos(r.id); const th=thumbs[0]||images[0];
      rows.push(`<tr>
        <td>${renderThumb(th,r.id)}</td>
        <td class="desc-col"><strong>${esc(r.descrizione)}</strong> ${esc(r.modello)}</td>
        <td class="nowrap">${esc(r.cliente)}</td>
        <td class="nowrap">${esc(r.telefono)}</td>
        <td class="nowrap">${fmtIT(r.dataApertura||r.dataArrivo||'')}</td>
        <td class="text-end nowrap"><div class="btn-group">
          <button class="btn btn-sm btn-outline-primary" data-open="${r.id}">Apri</button>
          <button class="btn btn-sm btn-outline-success" data-edit="${r.id}">Modifica</button>
        </div></td>
      </tr>`);
    }
    tb.innerHTML=rows.join('');
    tb.querySelectorAll('img.thumb').forEach(img=>{img.addEventListener('click',async()=>{const id=img.getAttribute('data-id');const {images,thumbs}=await getPhotos(id);openImg(images[0]||thumbs[0]);});});
    tb.querySelectorAll('button[data-open]').forEach(b=>b.onclick=()=>apri(b.dataset.open));
    tb.querySelectorAll('button[data-edit]').forEach(b=>b.onclick=()=>modifica(b.dataset.edit));
  }

  function addToSearch(parts,v){if(v)parts.push(String(v).toLowerCase());}
  function buildSearchIndex(r){
    const p=[]; addToSearch(p,r.descrizione); addToSearch(p,r.modello); addToSearch(p,r.cliente);
    addToSearch(p,r.telefono); addToSearch(p,r.docTrasporto);
    addToSearch(p,r.battCollettore); addToSearch(p,r.lunghezzaAsse); addToSearch(p,r.lunghezzaPacco);
    addToSearch(p,r.larghezzaPacco); addToSearch(p,r.punta); addToSearch(p,r.numPunte);
    return p.join(' ');
  }
  function matchTechFilters(r){
    const want=techFilters;
    const eq=(a,b)=> String(a??'').trim().toLowerCase() === String(b??'').trim().toLowerCase();
    if(want.battCollettore && !eq(r.battCollettore, want.battCollettore)) return false;
    if(want.lunghezzaAsse && !eq(r.lunghezzaAsse, want.lunghezzaAsse)) return false;
    if(want.lunghezzaPacco && !eq(r.lunghezzaPacco, want.lunghezzaPacco)) return false;
    if(want.larghezzaPacco && !eq(r.larghezzaPacco, want.larghezzaPacco)) return false;
    if(want.punta && !eq(r.punta, want.punta)) return false;
    if(want.numPunte && !eq(r.numPunte, want.numPunte)) return false;
    return true;
  }

  const techFilters={battCollettore:'',lunghezzaAsse:'',lunghezzaPacco:'',larghezzaPacco:'',punta:'',numPunte:''};
  let searchRows=[], page=1;
  function renderPager(total){
    const pages=Math.max(1,Math.ceil(total/50));
    const ul=$('#pager'); ul.innerHTML='';
    const item=(lbl,target,dis=false,act=false)=>{const li=document.createElement('li');li.className=`page-item ${dis?'disabled':''} ${act?'active':''}`;li.innerHTML=`<span class="page-link">${lbl}</span>`;if(!dis&&!act)li.onclick=()=>{page=target;drawListPage();};ul.appendChild(li);};
    item('«',1,page===1); item('‹',Math.max(1,page-1),page===1);
    for(let i=1;i<=Math.min(pages,7);i++) item(String(i),i,false,page===i);
    item('›',Math.min(pages,page+1),page===pages); item('»',pages,page===pages);
  }
  async function drawListPage(){
    const tb=document.querySelector('#tableResults tbody'); tb.innerHTML='';
    const start=(page-1)*50,end=start+50; const slice=searchRows.slice(start,end);
    if(!slice.length){tb.innerHTML=`<tr><td colspan="9" class="text-muted">Nessun risultato.</td></tr>`;return;}
    for(const r of slice){
      const {images,thumbs}=await getPhotos(r.id); const th=thumbs[0]||images[0];
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${renderThumb(th,r.id)}</td>
        <td class="desc-col"><strong>${esc(r.descrizione)}</strong> ${esc(r.modello)}</td>
        <td class="nowrap">${esc(r.cliente)}</td>
        <td class="nowrap">${esc(r.telefono)}</td>
        <td class="nowrap">${fmtIT(r.dataApertura||r.dataArrivo||'')}</td>
        <td class="nowrap">${fmtIT(r.dataAccettazione)}</td>
        <td class="nowrap">${(()=>{ const d=parseDate(r.dataScadenza); return isUrgent(d) ? `<span class="date-urgent">${fmtIT(r.dataScadenza)}</span>` : fmtIT(r.dataScadenza); })()}</td>
        <td class="nowrap">${esc(r.statoPratica||'In attesa')}</td>
        <td class="text-end nowrap">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" data-open="${r.id}">Apri</button>
            <button class="btn btn-sm btn-outline-success" data-edit="${r.id}">Modifica</button>
          </div>
        </td>`;
      tb.appendChild(tr);
    }
    tb.querySelectorAll('img.thumb').forEach(img=>{img.addEventListener('click',async()=>{const id=img.getAttribute('data-id');const {images,thumbs}=await getPhotos(id);openImg(images[0]||thumbs[0]);});});
    tb.querySelectorAll('button[data-open]').forEach(b=>b.onclick=()=>apri(b.dataset.open));
    tb.querySelectorAll('button[data-edit]').forEach(b=>b.onclick=()=>modifica(b.dataset.edit));
  }

  let currentFilter=null;
  async function lista(){
    const q=($('#q').value||'').toLowerCase();
    let rows=await getAllRecords();
    if(q) rows=rows.filter(r=>buildSearchIndex(r).includes(q));
    rows=rows.filter(matchTechFilters);
    rows.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
    searchRows=rows; page=1; renderPager(searchRows.length); drawListPage();
  }

  function openImg(src){ if(!src) return; $('#imgFull').src=src; new bootstrap.Modal('#imgModal').show(); }
  function pdfRec(r,img){
    const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'pt',format:'a4'}); let y=40;
    doc.setFontSize(18); doc.text('Scheda riparazioni — Riepilogo',40,y); y+=24; doc.setFontSize(12);
    const L=(l,v)=>{doc.setFont(undefined,'bold');doc.text(l,40,y);doc.setFont(undefined,'normal');doc.text(': '+(v||''),180,y);y+=16;};
    const map={descrizione:'Descrizione',modello:'Modello',cliente:'Cliente',telefono:'Telefono',email:'Email',
      battCollettore:'Batt. collettore',lunghezzaAsse:'Lunghezza asse',lunghezzaPacco:'Lunghezza pacco',larghezzaPacco:'Larghezza pacco',
      punta:'Punta',numPunte:'N. punte',statoPratica:'Stato pratica',preventivoStato:'Preventivo',
      docTrasporto:'Documento Trasporto',dataApertura:'Data apertura',dataAccettazione:'Data accettazione',dataScadenza:'Data scadenza',note:'Note'};
    Object.keys(map).forEach(k=>{let v=r[k]; if(['dataApertura','dataAccettazione','dataScadenza'].includes(k)) v=fmtIT(v); if(k==='numPunte'&&!v) return; if(r[k]||v) L(map[k],v);});
    if(img){try{doc.addImage(img,'JPEG',40,y+6,500,300);}catch(e){}}
    doc.save(`Scheda-${(r.descrizione||'').replace(/\s+/g,'_')}-${r.modello||''}.pdf`);
  }

  async function apri(id){
    const r=await getRecord(id),{images,thumbs}=await getPhotos(id);const img=images[0]||thumbs[0];
    const d=$('#detailContent');
    d.innerHTML=`${img?`<img class="img-fluid mb-3" src="${img}" id="detailImg" style="cursor:pointer">`:''}
    <table class="table table-sm">
      <tr><th>Descrizione</th><td>${esc(r.descrizione)}</td></tr>
      <tr><th>Modello</th><td>${esc(r.modello)}</td></tr>
      <tr><th>Cliente</th><td>${esc(r.cliente)}</td></tr>
      <tr><th>Telefono</th><td>${esc(r.telefono)}</td></tr>
      <tr><th>Email</th><td>${esc(r.email)}</td></tr>
      <tr><th>Batt. collettore</th><td>${esc(r.battCollettore||'')}</td></tr>
      <tr><th>Lunghezza asse</th><td>${esc(r.lunghezzaAsse||'')}</td></tr>
      <tr><th>Lunghezza pacco</th><td>${esc(r.lunghezzaPacco||'')}</td></tr>
      <tr><th>Larghezza pacco</th><td>${esc(r.larghezzaPacco||'')}</td></tr>
      <tr><th>Punta</th><td>${esc(r.punta||'')}${r?.numPunte?` (${esc(r.numPunte)} punte)`:''}</td></tr>
      <tr><th>Stato pratica</th><td>${esc(r.statoPratica||'In attesa')}</td></tr>
      <tr><th>Preventivo</th><td>${esc(r.preventivoStato||'Non inviato')}</td></tr>
      <tr><th>Documento Trasporto</th><td>${esc(r.docTrasporto)}</td></tr>
      <tr><th>Data apertura</th><td>${fmtIT(r.dataApertura||r.dataArrivo||'')}</td></tr>
      <tr><th>Data accettazione</th><td>${fmtIT(r.dataAccettazione)}</td></tr>
      <tr><th>Data scadenza</th><td>${fmtIT(r.dataScadenza)}</td></tr>
      <tr><th>Note</th><td>${esc(r.note)}</td></tr>
    </table>`;
    const modal=new bootstrap.Modal('#detailModal'); modal.show();
    const imgEl=$('#detailImg'); if(imgEl) imgEl.addEventListener('click',()=>openImg(img));
    $('#btnPDF').onclick=()=>pdfRec(r,img);
    $('#btnEdit').onclick=()=>{modal.hide(); modifica(id);};
    $('#btnDelete').onclick=()=>{ deleteTargetId=id; new bootstrap.Modal('#confirmDeleteModal').show(); };
  }

  async function backup(){const zip=new JSZip(),all=await getAllRecords();for(const r of all){zip.file(`records/${r.id}.json`,JSON.stringify(r,null,2));const {images,thumbs}=await getPhotos(r.id);images.forEach((d,i)=>zip.file(`photos/${r.id}-${i+1}.jpg`,d.split(',')[1],{base64:true}));thumbs.forEach((d,i)=>zip.file(`photos/${r.id}-${i+1}-thumb.jpg`,d.split(',')[1],{base64:true}));}const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='backup_scheda_riparazioni.zip';a.click();}
  async function ripristina(e){const f=e.target.files?.[0];if(!f)return;const zip=await JSZip.loadAsync(f);const recs=Object.keys(zip.files).filter(k=>k.startsWith('records/')&&k.endsWith('.json'));for(const k of recs){const txt=await zip.files[k].async('string');const r=JSON.parse(txt);await putRecord(r);const photos=Object.keys(zip.files).filter(p=>p.startsWith('photos/')&&p.includes(r.id+'-')&&!p.includes('-thumb'));const thumbs=Object.keys(zip.files).filter(p=>p.startsWith('photos/')&&p.includes(r.id+'-')&&p.includes('-thumb'));const imgs=[],ths=[];for(const p of photos){const b=await zip.files[p].async('base64');imgs.push('data:image/jpeg;base64,'+b);}for(const p of thumbs){const b=await zip.files[p].async('base64');ths.push('data:image/jpeg;base64,'+b);}if(imgs.length||ths.length)await savePhotosWithThumbs(r.id,imgs,ths);}alert('Ripristino completato');sh('home');refreshDashboard();}

  // state
  let deleteTargetId=null;

  document.addEventListener('DOMContentLoaded',()=>{
    $('#btnHome').onclick=()=>{sh('home');refreshDashboard();};
    $('#btnSearch').onclick=()=>{sh('search');lista();};
    $('#goSearch').onclick=()=>{sh('search');lista();};
    $('#newRecord').onclick=nuovo;
    $('#cancelForm').onclick=()=>{sh('home');refreshDashboard();};
    $('#saveRecord').onclick=salva;
    $('#btnDoSearch').onclick=lista;
    $('#exportZip').onclick=backup; $('#importZip').addEventListener('change',ripristina);

    // filtri
    $('#btnApplyFilters').onclick=()=>{techFilters.battCollettore=$('#f_battCollettore').value||'';techFilters.lunghezzaAsse=$('#f_lunghezzaAsse').value||'';techFilters.lunghezzaPacco=$('#f_lunghezzaPacco').value||'';techFilters.larghezzaPacco=$('#f_larghezzaPacco').value||'';techFilters.punta=$('#f_punta').value||'';techFilters.numPunte=$('#f_numPunte').value||'';lista();};
    $('#btnResetFilters').onclick=()=>{['f_battCollettore','f_lunghezzaAsse','f_lunghezzaPacco','f_larghezzaPacco','f_numPunte'].forEach(id=>{$('#'+id).value='';});$('#f_punta').value='';Object.keys(techFilters).forEach(k=>techFilters[k]='');lista();};
    $('#q').addEventListener('input',()=>{clearTimeout(window.__deb);window.__deb=setTimeout(lista,250);});

    // foto preview
    $('#photoInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)$('#photoPreview').src=await f2url(f);const hint=$('#emptyHint');if(hint) hint.style.display=$('#photoPreview').src?'none':'block';});
    $('#photoPreview').addEventListener('click',()=>{ const src=$('#photoPreview').src; if(!src) return; $('#imgCenter').src=src; new bootstrap.Modal('#imgModalCenter').show(); });

    // delete
    document.getElementById('confirmDeleteBtn').addEventListener('click', async ()=>{if(!deleteTargetId)return;await deleteRecord(deleteTargetId);deleteTargetId=null;bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal')).hide();lista();refreshDashboard();});

    refreshDashboard();
  });

  async function refreshDashboard(){
    await populateHomeOpenList();
  }

  window.apri=apri; window.modifica=modifica;
})();
