
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js'));}
const $=s=>document.querySelector(s);
let cur=null, deleteTargetId=null;
const pH=$('#page-home'),pF=$('#page-form'),pS=$('#page-search');
$('#btnHome').onclick=()=>{sh('home');refreshDashboard();}; $('#btnSearch').onclick=()=>{sh('search');lista();};
$('#newRecord').onclick=nuovo; $('#cancelForm').onclick=()=>{sh('home');refreshDashboard();}; $('#saveRecord').onclick=salva;
$('#btnDoSearch').onclick=lista; $('#exportZip').onclick=backup; $('#importZip').addEventListener('change', ripristina);
$('#photoInput').addEventListener('change',async e=>{const f=e.target.files?.[0]; if(f){$('#photoPreview').src=await f2url(f);}});
$('#photoPreview').addEventListener('click',()=>openImg($('#photoPreview').src));
document.getElementById('confirmDeleteBtn').addEventListener('click', async ()=>{ if(!deleteTargetId) return; await deleteRecord(deleteTargetId); deleteTargetId=null; bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal')).hide(); lista(); refreshDashboard(); });

function sh(n){pH.classList.toggle('d-none',n!=='home'); pF.classList.toggle('d-none',n!=='form'); pS.classList.toggle('d-none',n!=='search');}
function nuovo(){cur={id:Date.now().toString(),createdAt:new Date().toISOString()}; const f=$('#recordForm'); f.reset(); $('#formTitle').textContent='Nuova scheda'; f.numero.value=cur.id; $('#photoPreview').src=''; sh('form');}
async function modifica(id){const r=await getRecord(id); if(!r){alert('Scheda non trovata');return;} cur=r; const f=$('#recordForm'); $('#formTitle').textContent='Modifica scheda'; [...f.elements].forEach(el=>{if(el.name&&r[el.name]!=null) el.value=r[el.name];}); f.numero.value=r.id; const imgs=await getPhotos(id); $('#photoPreview').src=imgs[0]||''; sh('form');}
async function salva(){const f=$('#recordForm'); const d=Object.fromEntries(new FormData(f).entries()); d.id=cur?.id||Date.now().toString(); d.updatedAt=new Date().toISOString(); let imgs=[]; const fl=$('#photoInput').files; if(fl&&fl.length){for(const file of fl){imgs.push(await f2url(file));}} else {const prev=$('#photoPreview').getAttribute('src'); if(prev) imgs=[prev];} await putRecord(d); if(imgs.length) await savePhotos(d.id,imgs); alert('Scheda salvata'); sh('home'); refreshDashboard();}

async function lista(){const q=($('#q').value||'').toLowerCase(); const tb=document.querySelector('#tableResults tbody'); tb.innerHTML=''; let rows=await getAllRecords(); rows.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')); if(q) rows=rows.filter(r=>((r.marca||'')+' '+(r.modello||'')+' '+(r.cliente||'')+' '+(r.note||'')).toLowerCase().includes(q)); for(const r of rows){const imgs=await getPhotos(r.id); const tr=document.createElement('tr'); tr.innerHTML=`<td>${imgs[0]?`<img class="thumb" src="${imgs[0]}" data-img="${imgs[0]}">`:'<div class="thumb d-flex align-items-center justify-content-center text-secondary">—</div>'}</td><td><strong>${r.marca||''}</strong> ${r.modello||''}</td><td>${r.cliente||''}</td><td>${r.dataAccettazione||''}</td><td>${r.dataScadenza||''}</td><td class="text-end"><div class="btn-group"><button class="btn btn-sm btn-outline-primary" data-open="${r.id}">Apri</button><button class="btn btn-sm btn-outline-success" data-edit="${r.id}">Modifica</button></div></td>`; tb.appendChild(tr);} tb.querySelectorAll('img.thumb').forEach(i=>i.addEventListener('click',()=>openImg(i.dataset.img))); tb.querySelectorAll('button[data-open]').forEach(b=>b.onclick=()=>apri(b.dataset.open)); tb.querySelectorAll('button[data-edit]').forEach(b=>b.onclick=()=>modifica(b.dataset.edit));}

async function apri(id){const r=await getRecord(id),imgs=await getPhotos(id); const d=document.getElementById('detailContent'); d.innerHTML=`${imgs[0]?`<img class="img-fluid mb-3" src="${imgs[0]}" id="detailImg" style="cursor:pointer">`:''}<table class="table table-sm"><tr><th>Marca</th><td>${r.marca||''}</td></tr><tr><th>Modello</th><td>${r.modello||''}</td></tr><tr><th>Cliente</th><td>${r.cliente||''}</td></tr><tr><th>Telefono</th><td>${r.telefono||''}</td></tr><tr><th>Email</th><td>${r.email||''}</td></tr><tr><th>Stato pratica</th><td>${r.statoPratica||''}</td></tr><tr><th>Accettazione</th><td>${r.dataAccettazione||''}</td></tr><tr><th>Scadenza</th><td>${r.dataScadenza||''}</td></tr><tr><th>Note</th><td>${r.note||''}</td></tr></table>`; const modal=new bootstrap.Modal('#detailModal'); modal.show(); const img=document.getElementById('detailImg'); if(img) img.addEventListener('click',()=>openImg(img.src)); document.getElementById('btnPDF').onclick=()=>openPDF(id); document.getElementById('btnEdit').onclick=()=>{modal.hide(); modifica(id);}; document.getElementById('btnDelete').onclick=()=>{ deleteTargetId=id; new bootstrap.Modal('#confirmDeleteModal').show(); };}

async function openPDF(id){const r=await getRecord(id); const imgs=await getPhotos(id); pdfRec(r,imgs[0]);}
function openImg(src){ if(!src) return; const el=document.getElementById('imgFull'); el.src=src; new bootstrap.Modal('#imgModal').show(); }

function f2url(file){return new Promise((res,rej)=>{const R=new FileReader(); R.onload=()=>res(R.result); R.onerror=()=>rej(R.error); R.readAsDataURL(file);});}
function pdfRec(r,img){const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'pt',format:'a4'}); let y=40; doc.setFontSize(18); doc.text('Scheda Officina — Riepilogo',40,y); y+=24; doc.setFontSize(12); const L=(l,v)=>{doc.setFont(undefined,'bold');doc.text(l,40,y);doc.setFont(undefined,'normal');doc.text(': '+(v||''),140,y);y+=16;}; const map={marca:'Marca',modello:'Modello',cliente:'Cliente',telefono:'Telefono',email:'Email',statoPratica:'Stato pratica',dataAccettazione:'Accettazione',dataScadenza:'Scadenza',preventivo:'Preventivo',note:'Note'}; Object.keys(map).forEach(k=>{if(r[k]) L(map[k],r[k]);}); if(img){try{doc.addImage(img,'JPEG',40,y+6,500,300);}catch(e){} } doc.save(`Scheda-${r.marca||''}-${r.modello||''}.pdf`);}

async function backup(){const zip=new JSZip(),all=await getAllRecords(); for(const r of all){zip.file(`records/${r.id}.json`,JSON.stringify(r,null,2)); const imgs=await getPhotos(r.id); imgs.forEach((d,i)=>zip.file(`photos/${r.id}-${i+1}.jpg`,d.split(',')[1],{base64:true}));} const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='backup_schedaofficina.zip'; a.click();}
async function ripristina(e){const f=e.target.files?.[0]; if(!f)return; const zip=await JSZip.loadAsync(f); const recs=Object.keys(zip.files).filter(k=>k.startsWith('records/')&&k.endsWith('.json')); for(const k of recs){const txt=await zip.files[k].async('string'); const r=JSON.parse(txt); await putRecord(r); const photos=Object.keys(zip.files).filter(p=>p.startsWith('photos/')&&p.includes(r.id+'-')); if(photos.length){const imgs=[]; for(const p of photos){const b=await zip.files[p].async('base64'); imgs.push('data:image/jpeg;base64,'+b);} await savePhotos(r.id,imgs);} } alert('Ripristino completato'); sh('home'); refreshDashboard();}

function parseDate(v){ if(!v) return null; const d=new Date(v); if(isNaN(d)) return null; return d; }
function isOverdue(d){ if(!d) return false; const today=new Date(); today.setHours(0,0,0,0); return d < today; }
function isSoon(d){ if(!d) return false; const today=new Date(); today.setHours(0,0,0,0); const lim=new Date(today); lim.setDate(lim.getDate()+7); return d>=today && d<=lim; }

async function refreshDashboard(){
  const box=$('#alertBox'); box.classList.add('d-none'); box.textContent='';
  const all=await getAllRecords();
  const kpiTot=$('#kpiTot'),kpiAttesa=$('#kpiAttesa'),kpiLavor=$('#kpiLavor'),kpiCompl=$('#kpiCompl'),kpiSoon=$('#kpiSoon'),kpiOver=$('#kpiOver');
  const cAtt=all.filter(r=>r.statoPratica==='In attesa').length;
  const cLav=all.filter(r=>r.statoPratica==='In lavorazione').length;
  const cCom=all.filter(r=>r.statoPratica==='Completata').length;
  const soon=[], over=[];
  for(const r of all){
    const d=parseDate(r.dataScadenza);
    if(isSoon(d)) soon.push(r);
    if(isOverdue(d)) over.push(r);
  }
  kpiTot.textContent=all.length; kpiAttesa.textContent=cAtt; kpiLavor.textContent=cLav; kpiCompl.textContent=cCom; kpiSoon.textContent=soon.length; kpiOver.textContent=over.length;

  // Fill soon table
  const tb=document.getElementById('soonBody'); tb.innerHTML='';
  if(!soon.length){ tb.innerHTML='<tr><td colspan="4" class="text-muted">Nessuna scadenza imminente</td></tr>'; }
  else{
    soon.sort((a,b)=> (a.dataScadenza||'').localeCompare(b.dataScadenza||''));
    for(const r of soon){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${r.dataScadenza||''}</td><td><strong>${r.marca||''}</strong> ${r.modello||''}</td><td>${r.cliente||''}</td>
      <td class="text-end"><div class="btn-group"><button class="btn btn-sm btn-outline-primary" data-open="${r.id}">Apri</button><button class="btn btn-sm btn-outline-success" data-edit="${r.id}">Modifica</button></div></td>`;
      tb.appendChild(tr);
    }
    tb.querySelectorAll('button[data-open]').forEach(b=>b.onclick=()=>apri(b.dataset.open));
    tb.querySelectorAll('button[data-edit]').forEach(b=>b.onclick=()=>modifica(b.dataset.edit));
  }

  // In-app alert
  if(over.length || soon.length){
    const parts=[];
    if(over.length) parts.append if callable
  }
}

document.addEventListener('DOMContentLoaded', refreshDashboard);
sh('home');
