(function(){
  const VAT_RATE = 22;
  const EDIT_PASSWORD = String(window.QUOTE_EDIT_PASSWORD || 'ELIP2026');
  const WORKS = [
    { code:'RIP05', text:'SMONTAGGIO COMPLETO DEL MOTORE SISTEMATICO' },
    { code:'RIP29', text:'LAVAGGIO COMPONENTI, E TRATTAMENTO TERMICO AVVOLGIMENTI' },
    { code:'RIP06', text:'VERIFICHE MECCANICHE ALBERI E ALLOGIAMENTO CUSCINETTI E VERIFICHE ELETTRICHE AVVOLGIMENTI' },
    { code:'RIP07', text:'TORNITURA, SMICATURA ED EQUILIBRATURA ROTORE' },
    { code:'RIP22', text:'SOSTITUZIONE COLLETTORE CON RECUPERO AVVOLGIMENTO' },
    { code:'RIP01', text:'AVVOLGIMENTO INDOTTO CON SOSTITUZIONE COLLETTORE' },
    { code:'RIP01C', text:'AVVOLGIMENTO INDOTTO CON SOSTITUZIONE COLLETTORE' },
    { code:'RIP08', text:'ISOLAMENTO STATORE' },
    { code:'RIP02', text:'AVVOLGIMENTO STATORE' },
    { code:'RIP31', text:'LAVORAZIONI MECCANICHE ALBERO' },
    { code:'RIP32', text:'LAVORAZIONI MECCANICHE FLANGE' },
    { code:'RIP19', text:'SOSTITUZIONE SPAZZOLE' },
    { code:'RIP20', text:'SOSTITUZIONE MOLLE PREMISPAZZOLE' },
    { code:'RIP21', text:'SOSTITUZIONE CUSCINETTI' },
    { code:'RIP23', text:'SOSTITUZIONE TENUTA MECCANICA' },
    { code:'RIP26', text:'SOSTITUZIONE GUARNIZIONI/ PARAOLIO' },
    { code:'RIP30', text:'MONTAGGIO, COLLAUDO E VERNICIATURA' },
    { code:'RIP16', text:'RICAMBI VARI' },
    { code:'RIP00', text:'LAVORAZIONE LIBERA', free:true },
  ];
  const STATUS = [
    { v:'DA_FARE', label:'DA FARE', pct:0 },
    { v:'IN_LAVORAZIONE', label:'IN LAVORAZIONE', pct:50 },
    { v:'COMPLETATA', label:'COMPLETATA', pct:100 },
  ];
  function $(id){ return document.getElementById(id); }
  function qs(){ return new URLSearchParams(location.search); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function showErr(msg){ const el=$('errBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); } }
  function clearErr(){ const el=$('errBanner'); if(el){ el.classList.add('d-none'); el.textContent=''; } }
  function showOk(msg){ const el=$('okBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); setTimeout(()=>{ try{ el.classList.add('d-none'); }catch{} }, 1800); } }
  function parseNum(v){ const x=Number(String(v ?? '').replace(',', '.').trim()); return isFinite(x) ? x : 0; }
  function fmtMoney(n){ return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function statusMeta(v){ return STATUS.find(x=>x.v===v) || STATUS[0]; }
  function today0(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
  function esc(s){ return (s ?? '').toString().replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
  function fmtDateISO(d){ const x = (d instanceof Date) ? d : new Date(d); if(isNaN(x.getTime())) return '—'; return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`; }
  function computeDueInfo(q){
    const now = today0(); let expected = null;
    if(q.delivery_date){ expected = new Date(q.delivery_date); expected.setHours(0,0,0,0); }
    else if(Number.isFinite(+q.delivery_days) && +q.delivery_days>0){ const base = q.accepted_at || q.sent_at || new Date().toISOString(); expected = new Date(base); expected.setHours(0,0,0,0); expected.setDate(expected.getDate() + (+q.delivery_days)); }
    if(!expected || isNaN(expected.getTime())) return { text:'Nessuna scadenza impostata', cls:'text-muted' };
    const diff = Math.round((expected.getTime()-now.getTime())/(1000*60*60*24));
    if(diff < 0) return { text:`${q.is_urgent?'URGENTE • ':''}in ritardo di ${Math.abs(diff)} gg • scadenza ${fmtDateISO(expected)}`, cls:'text-danger fw-semibold' };
    if(diff === 0) return { text:`${q.is_urgent?'URGENTE • ':''}scade oggi • ${fmtDateISO(expected)}`, cls:q.is_urgent?'text-danger fw-semibold':'text-warning fw-semibold' };
    if(diff <= 2 || q.is_urgent) return { text:`${q.is_urgent?'URGENTE • ':''}mancano ${diff} gg • scadenza ${fmtDateISO(expected)}`, cls:q.is_urgent?'text-danger fw-semibold':'text-warning fw-semibold' };
    return { text:`Fine lavori prevista ${fmtDateISO(expected)} • mancano ${diff} gg`, cls:'text-muted' };
  }

  let sb, record=null, currentQuoteId=null, quoteState=null, originalState=null, isEditUnlocked=false, isSaving=false;
  function emptyQuoteState(recordId){ return { id:null, record_id:recordId, status:'BOZZA', sent_at:'', accepted_at:'', delivery_days:'', delivery_date:'', notes:'', is_urgent:false, subtotal_ex_vat:0, vat_rate:VAT_RATE, vat_total:0, grand_total:0, progress_percent:0, items:{} }; }
  function isDirty(){ return JSON.stringify(quoteState) !== JSON.stringify(originalState); }
  function getSelectedItems(){ return WORKS.map(w => quoteState.items[w.code]).filter(Boolean); }
  function hasMeaningfulData(state){ const items=Object.values(state?.items||{}).filter(it => Number(it?.unit_price_ex_vat||0)>0 || !!it?.operatore || !!it?.started_at || !!it?.finished_at || !!it?.description).length; return items>0 || !!state.notes || !!state.sent_at || !!state.accepted_at || !!state.delivery_days || !!state.delivery_date || !!state.is_urgent || Number(state?.subtotal_ex_vat||0)>0 || ((state.status||'BOZZA')!=='BOZZA'); }

  async function init(){
    try{
      if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){ showErr('Config Supabase mancante.'); return; }
      sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const id = qs().get('id'); const recordId = qs().get('record_id');
      if(!id && !recordId){ showErr('Manca id preventivo o record_id.'); return; }
      if(id) await loadQuoteById(id); else await loadByRecord(recordId);
      bindUI(); recalcTotals(); renderAll();
    }catch(e){ showErr('Errore inizializzazione preventivo: ' + (e?.message || e)); }
  }

  async function buildStateFromQuoteRow(data){
    const state = emptyQuoteState(data.record_id);
    Object.assign(state, { id:data.id, status:data.status||'BOZZA', sent_at:data.sent_at||'', accepted_at:data.accepted_at||'', delivery_days:data.delivery_days??'', delivery_date:data.delivery_date||'', notes:data.notes||'', is_urgent:!!data.is_urgent, subtotal_ex_vat:Number(data.subtotal_ex_vat||0), vat_rate:Number(data.vat_rate||VAT_RATE), vat_total:Number(data.vat_total||0), grand_total:Number(data.grand_total||0), progress_percent:Number(data.progress_percent||0) });
    const { data:items, error } = await sb.from('quote_items').select('*').eq('quote_id', data.id).order('position',{ascending:true});
    if(error) throw error;
    (items||[]).forEach((x, idx)=>{ const code=x.rip_code||WORKS[idx]?.code||''; if(!code) return; state.items[code]={ id:x.id, rip_code:code, position:Number.isFinite(+x.position)?+x.position:idx, description:x.description||'', qty:Number(x.qty||1), unit_price_ex_vat:Number(x.unit_price_ex_vat||0), line_total_ex_vat:Number(x.line_total_ex_vat||0), line_progress_percent:Number(x.line_progress_percent||0), work_status:x.work_status||'DA_FARE', operatore:x.operatore||'', started_at:x.started_at||'', finished_at:x.finished_at||'' }; });
    return state;
  }
  async function loadQuoteById(id){ const { data, error } = await sb.from('quotes').select('*').eq('id', id).single(); if(error) throw error; currentQuoteId=data.id; await loadRecordData(data.record_id); quoteState=await buildStateFromQuoteRow(data); originalState=clone(quoteState); }
  async function loadByRecord(recordId){
    await loadRecordData(recordId);
    const { data, error } = await sb.from('quotes').select('*, quote_items(id)').eq('record_id', recordId).order('created_at',{ascending:false}).limit(20);
    if(error) throw error;
    const meaningful=(data||[]).find(q => Number(q.subtotal_ex_vat||0)>0 || !!q.notes || !!q.sent_at || !!q.accepted_at || !!q.delivery_days || !!q.delivery_date || !!q.is_urgent || ((q.status||'BOZZA')!=='BOZZA') || (Array.isArray(q.quote_items)&&q.quote_items.length>0));
    if(meaningful){ currentQuoteId=meaningful.id; quoteState=await buildStateFromQuoteRow(meaningful); originalState=clone(quoteState); try{ const u=new URL(location.href); u.searchParams.delete('record_id'); u.searchParams.set('id', meaningful.id); history.replaceState({},'',u.toString()); }catch{} return; }
    currentQuoteId=null; quoteState=emptyQuoteState(recordId); originalState=clone(quoteState);
  }
  async function loadRecordData(recordId){ const { data, error } = await sb.from('records').select('id,cliente,descrizione,modello').eq('id', recordId).single(); if(error) throw error; record=data; }

  function bindUI(){
    $('btnBack')?.addEventListener('click', ()=>history.back());
    $('btnOpenRecord')?.addEventListener('click', ()=>{ if(record?.id) location.href=`record.html?id=${encodeURIComponent(record.id)}`; });
    $('btnSave')?.addEventListener('click', saveAll);
    $('btnDelete')?.addEventListener('click', deleteQuote);
    $('btnUnlock')?.addEventListener('click', ()=>{ const p=prompt('Inserisci password per modificare il preventivo'); if(p===null) return; if(String(p)!==EDIT_PASSWORD){ alert('Password errata'); return; } isEditUnlocked=true; renderEditState(); showOk('Modifica sbloccata'); });
    ['status','sent_at','accepted_at','delivery_days','delivery_date','notes'].forEach(id=>{ $(id)?.addEventListener('input', ()=>{ quoteState[id]=$(id).value||''; touch(); }); $(id)?.addEventListener('change', ()=>{ quoteState[id]=$(id).value||''; touch(); }); });
    $('is_urgent')?.addEventListener('change', ()=>{ const urgentEl=$('is_urgent'); quoteState.is_urgent=!!(urgentEl && urgentEl.checked); touch(); renderTasks(); });
    window.addEventListener('beforeunload', ev=>{ if(isSaving || !isDirty()) return; ev.preventDefault(); ev.returnValue=''; });
  }
  function renderEditState(){ document.body.classList.toggle('edit-unlocked', isEditUnlocked); $('btnSave').disabled=!isEditUnlocked; if($('btnDelete')) $('btnDelete').disabled=!currentQuoteId || !isEditUnlocked; $('btnUnlock').textContent=isEditUnlocked?'🔓 Modifica attiva':'🔒 Sblocca modifiche'; $('lockState').textContent=isEditUnlocked?'MODIFICA ATTIVA':'SOLO LETTURA'; $('lockState').className='badge '+(isEditUnlocked?'bg-success':'bg-secondary'); ['status','sent_at','accepted_at','delivery_days','delivery_date','notes','is_urgent'].forEach(id=>{ const el=$(id); if(!el) return; el.disabled=!isEditUnlocked; }); document.querySelectorAll('[data-editable="1"]').forEach(el=>{ el.disabled=!isEditUnlocked; }); }
  function touch(){ recalcTotals(); renderQuoteHeader(); renderDirtyState(); }
  function renderDirtyState(){ const dirty=isDirty(); $('dirtyState').textContent=dirty?'Modifiche non salvate':'Salvato'; $('dirtyState').className='small '+(dirty?'text-danger':'text-muted'); }
  function renderAll(){ renderQuoteHeader(); renderTasks(); renderEditState(); renderDirtyState(); }
  function renderQuoteHeader(){ $('recCliente').textContent=record?.cliente||'—'; $('recDesc').textContent=record?.descrizione||'—'; $('recModel').textContent=record?.modello?`Modello: ${record.modello}`:''; $('quoteId').textContent=quoteState?.id||'NUOVO (non ancora salvato)'; const st=quoteState?.status||'BOZZA'; $('status').value=st; $('quoteStatusBadge').textContent=st; $('quoteStatusBadge').className='badge '+(st==='ACCETTATO'?'bg-success':st==='INVIATO'?'bg-primary':st==='ANNULLATO'?'bg-danger':'bg-secondary'); $('sent_at').value=quoteState?.sent_at||''; $('accepted_at').value=quoteState?.accepted_at||''; $('delivery_days').value=quoteState?.delivery_days??''; $('delivery_date').value=quoteState?.delivery_date||''; $('notes').value=quoteState?.notes||''; const urgentEl=$('is_urgent'); if(urgentEl) urgentEl.checked=!!quoteState?.is_urgent; const d=computeDueInfo(quoteState||{}); $('dueLabel').textContent=d.text; $('dueLabel').className='small mt-1 '+d.cls; const mini=$('urgentMiniBanner'); if(mini){ mini.classList.toggle('active', !!quoteState?.is_urgent); } const miniTop=$('urgentMiniBannerTop'); if(miniTop){ miniTop.style.display=quoteState?.is_urgent ? 'inline-flex' : 'none'; } }
  function ensureLocalItem(work, idx){ const existing=quoteState.items[work.code]; if(existing) return existing; const item={ id:null, rip_code:work.code, position:idx, description:work.free?'':work.text, qty:1, unit_price_ex_vat:0, line_total_ex_vat:0, line_progress_percent:0, work_status:'DA_FARE', operatore:'', started_at:'', finished_at:'' }; quoteState.items[work.code]=item; return item; }
  function renderTasks(){
    const tb=$('taskRows'); tb.innerHTML='';
    WORKS.forEach((w, idx)=>{ const item=quoteState.items[w.code]||null; const checked=!!item; const meta=statusMeta(item?.work_status||'DA_FARE'); const pct=checked?meta.pct:0; const tr=document.createElement('tr'); tr.className=`${checked?`row-${meta.v==='COMPLETATA'?'complete':meta.v==='IN_LAVORAZIONE'?'working':'todo'}`:'row-off'} ${quoteState.is_urgent?'row-urgent':''}`;
      tr.innerHTML=`<td class="text-center pt-3"><input data-editable="1" type="checkbox" class="form-check-input row-check" ${checked?'checked':''}></td><td class="rip-main"><div class="rip-title"><span class="rip-code">${esc(w.code)}</span>${w.free?`<input data-editable="1" class="form-control free-desc mt-1" placeholder="Descrizione lavorazione libera…" value="${esc(item?.description||'')}" ${checked?'':'disabled'}>`:esc(w.text)}</div><div class="rip-meta"><div class="meta-box"><label>Operatore</label><input data-editable="1" class="form-control row-operatore" value="${esc(item?.operatore||'')}" placeholder="Operatore" ${checked?'':'disabled'}></div><div class="meta-box"><label>Data inizio</label><input data-editable="1" type="date" class="form-control row-started" value="${esc(item?.started_at||'')}" ${checked?'':'disabled'}></div><div class="meta-box"><label>Data fine</label><input data-editable="1" type="date" class="form-control row-finished" value="${esc(item?.finished_at||'')}" ${checked?'':'disabled'}></div></div></td><td><select data-editable="1" class="form-select status-select row-status" ${checked?'':'disabled'}>${STATUS.map(s=>`<option value="${esc(s.v)}" ${(item?.work_status||'DA_FARE')===s.v?'selected':''}>${esc(s.label)}</option>`).join('')}</select><div class="mt-1"><span class="row-status-pill row-status-${esc(meta.v)}">${esc(meta.label)}</span></div></td><td><input data-editable="1" type="text" inputmode="decimal" class="form-control text-end row-price price-input" placeholder="0,00" value="${checked?esc(fmtMoney(item.unit_price_ex_vat)):''}" ${checked?'':'disabled'}></td><td class="line-progress-wrap"><div class="linebar"><div class="st-${meta.v}" style="width:${checked?Math.max(5,pct):0}%"></div></div><div class="small text-muted mt-1">${checked?`${pct}%`:''}</div></td>`;
      const check=tr.querySelector('.row-check'); const price=tr.querySelector('.row-price'); const status=tr.querySelector('.row-status'); const operatore=tr.querySelector('.row-operatore'); const started=tr.querySelector('.row-started'); const finished=tr.querySelector('.row-finished'); const freeDesc=tr.querySelector('.free-desc');
      check.addEventListener('change', ()=>{ if(check.checked) ensureLocalItem(w, idx); else delete quoteState.items[w.code]; recalcTotals(); renderTasks(); renderEditState(); renderDirtyState(); });
      price.addEventListener('input', ()=>{ const it=ensureLocalItem(w, idx); it.unit_price_ex_vat=parseNum(price.value); recalcTotals(); renderQuoteHeader(); renderDirtyState(); });
      price.addEventListener('blur', ()=>{ if(quoteState.items[w.code]) price.value=fmtMoney(quoteState.items[w.code].unit_price_ex_vat); });
      status.addEventListener('change', ()=>{ const it=ensureLocalItem(w, idx); it.work_status=status.value; if(it.work_status==='COMPLETATA' && !it.finished_at) it.finished_at=new Date().toISOString().slice(0,10); recalcTotals(); renderTasks(); renderEditState(); renderDirtyState(); });
      operatore.addEventListener('input', ()=>{ const it=ensureLocalItem(w, idx); it.operatore=operatore.value; renderDirtyState(); });
      started.addEventListener('change', ()=>{ const it=ensureLocalItem(w, idx); it.started_at=started.value||''; renderDirtyState(); });
      finished.addEventListener('change', ()=>{ const it=ensureLocalItem(w, idx); it.finished_at=finished.value||''; renderDirtyState(); });
      if(freeDesc) freeDesc.addEventListener('input', ()=>{ const it=ensureLocalItem(w, idx); it.description=freeDesc.value; renderDirtyState(); });
      tb.appendChild(tr);
    });
  }
  function recalcTotals(){ let subtotal=0, weightedProg=0, weightedBase=0; getSelectedItems().forEach(it=>{ const line=Number(it.unit_price_ex_vat||0)*Number(it.qty||1); it.line_total_ex_vat=line; it.line_progress_percent=statusMeta(it.work_status).pct; subtotal+=line; weightedBase+=line; weightedProg+=line*(it.line_progress_percent/100); }); const vat=subtotal*(VAT_RATE/100); const grand=subtotal+vat; const prog=weightedBase>0?(weightedProg/weightedBase)*100:0; quoteState.subtotal_ex_vat=subtotal; quoteState.vat_rate=VAT_RATE; quoteState.vat_total=vat; quoteState.grand_total=grand; quoteState.progress_percent=prog; $('subtotal').textContent=`€ ${fmtMoney(subtotal)}`; $('vat').textContent=`€ ${fmtMoney(vat)}`; $('grand').textContent=`€ ${fmtMoney(grand)}`; $('quoteProgressTxt').textContent=`${Math.round(prog)}%`; $('quoteProgBar').style.width=`${Math.max(0, Math.min(100, prog))}%`; }

  async function deleteQuote(){
    if(!currentQuoteId){ showErr('Questo preventivo non è ancora salvato.'); return; }
    if(!isEditUnlocked){ showErr('Prima sblocca le modifiche con la password.'); return; }
    const ok = confirm('Vuoi cancellare definitivamente questo preventivo?');
    if(!ok) return;
    clearErr();
    try{
      const { error: e1 } = await sb.from('quote_items').delete().eq('quote_id', currentQuoteId); if(e1) throw e1;
      const { error: e2 } = await sb.from('quotes').delete().eq('id', currentQuoteId); if(e2) throw e2;
      showOk('Preventivo cancellato');
      const recId = quoteState?.record_id || record?.id;
      currentQuoteId = null;
      quoteState = emptyQuoteState(recId);
      originalState = clone(quoteState);
      renderAll();
      setTimeout(()=>{ if(recId) location.href='preventivo.html?record_id='+encodeURIComponent(recId); else history.back(); }, 500);
    }catch(e){ showErr('Errore cancellazione preventivo: ' + (e?.message||e)); }
  }

  async function saveAll(){
    if(!isEditUnlocked){ showErr('Prima sblocca le modifiche con la password.'); return; }
    clearErr(); isSaving=true;
    try{
      recalcTotals();
      if(!hasMeaningfulData(quoteState)){ showErr('Preventivo non salvato: non ci sono voci RIP o dati utili compilati.'); return; }
      const qPayload={ record_id:quoteState.record_id, status:quoteState.status||'BOZZA', sent_at:quoteState.sent_at||null, accepted_at:quoteState.accepted_at||null, delivery_days:quoteState.delivery_days===''?null:parseInt(quoteState.delivery_days,10), delivery_date:quoteState.delivery_date||null, notes:quoteState.notes||null, is_urgent:!!quoteState.is_urgent, subtotal_ex_vat:Number(quoteState.subtotal_ex_vat||0), vat_rate:VAT_RATE, vat_total:Number(quoteState.vat_total||0), grand_total:Number(quoteState.grand_total||0), progress_percent:Number(quoteState.progress_percent||0) };
      if(!currentQuoteId){ const { data, error } = await sb.from('quotes').insert(qPayload).select().single(); if(error) throw error; currentQuoteId=data.id; quoteState.id=data.id; try{ const u=new URL(location.href); u.searchParams.delete('record_id'); u.searchParams.set('id', data.id); history.replaceState({},'',u.toString()); }catch{} }
      else { const { error } = await sb.from('quotes').update(qPayload).eq('id', currentQuoteId); if(error) throw error; }
      const existingIds=Object.values(originalState?.items||{}).map(x=>x.id).filter(Boolean);
      const currentItems=WORKS.map((w,idx)=>{ const it=quoteState.items[w.code]; if(!it) return null; return { id:it.id||undefined, quote_id:currentQuoteId, position:idx, rip_code:w.code, description:w.free?(it.description||''):w.text, qty:1, unit_price_ex_vat:Number(it.unit_price_ex_vat||0), line_total_ex_vat:Number(it.line_total_ex_vat||0), line_progress_percent:Number(it.line_progress_percent||0), work_status:it.work_status||'DA_FARE', operatore:it.operatore||null, started_at:it.started_at||null, finished_at:it.finished_at||null }; }).filter(Boolean);
      const keepIds=currentItems.map(x=>x.id).filter(Boolean); const deleteIds=existingIds.filter(id=>!keepIds.includes(id)); if(deleteIds.length){ const { error } = await sb.from('quote_items').delete().in('id', deleteIds); if(error) throw error; }
      for(const item of currentItems){ if(item.id){ const { error } = await sb.from('quote_items').update(item).eq('id', item.id); if(error) throw error; } else { delete item.id; const { data, error } = await sb.from('quote_items').insert(item).select().single(); if(error) throw error; quoteState.items[data.rip_code||item.rip_code].id=data.id; } }
      originalState=clone(quoteState); showOk('Preventivo salvato'); renderAll();
    }catch(e){ showErr(e?.message || e); }
    finally{ isSaving=false; }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
