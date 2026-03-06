(function(){
  function $(id){ return document.getElementById(id); }
  function norm(s){ return (s||'').toString().trim().toLowerCase(); }
  function showErr(msg){ const el=$('errBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); } console.error(msg); }
  function clearErr(){ const el=$('errBanner'); if(el){ el.classList.add('d-none'); el.textContent=''; } }
  function fmtDate(d){ if(!d) return '—'; const x=new Date(d); if(isNaN(x.getTime())) return '—'; return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`; }
  function today0(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
  function money(n){ return Number(n||0).toLocaleString('it-IT', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function escapeHtml(s){ return (s??'').toString().replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
  function computeDue(q){
    const now=today0(); let expected=null;
    if(q.delivery_date){ expected=new Date(q.delivery_date); expected.setHours(0,0,0,0); }
    else if(Number.isFinite(+q.delivery_days) && +q.delivery_days>0){ const base=q.accepted_at||q.sent_at||q.created_at||new Date().toISOString(); expected=new Date(base); expected.setHours(0,0,0,0); expected.setDate(expected.getDate()+(+q.delivery_days)); }
    if(!expected || isNaN(expected.getTime())) return {label:'—', sub:'', statusLabel:'', urgent:false, days:null, tone:'due-ok'};
    const diff=Math.round((expected.getTime()-now.getTime())/(1000*60*60*24));
    if(diff<0) return {label:fmtDate(expected), sub:`SCADUTO · ${Math.abs(diff)} gg`, statusLabel:'SCADUTO', urgent:true, days:diff, tone:'due-over'};
    if(diff===0) return {label:fmtDate(expected), sub:'OGGI · 0 gg', statusLabel:'OGGI', urgent:!!q.is_urgent, days:0, tone:'due-today'};
    if(diff===1) return {label:fmtDate(expected), sub:'DOMANI · 1 gg', statusLabel:'DOMANI', urgent:!!q.is_urgent, days:1, tone:'due-tomorrow'};
    return {label:fmtDate(expected), sub:`mancano ${diff} gg`, statusLabel:'', urgent:!!q.is_urgent, days:diff, tone:'due-ok'};
  }
  function badge(status){ const s=(status||'').toUpperCase(); if(s==='ACCETTATO') return '<span class="badge bg-success">ACCETTATO</span>'; if(s==='INVIATO') return '<span class="badge bg-primary">INVIATO</span>'; if(s==='BOZZA') return '<span class="badge bg-secondary">BOZZA</span>'; if(s==='ANNULLATO') return '<span class="badge bg-danger">ANNULLATO</span>'; return `<span class="badge bg-secondary">${escapeHtml(s||'—')}</span>`; }
  function isMeaningfulQuote(q){ return Number(q.subtotal_ex_vat||0) > 0 || !!q.notes || !!q.sent_at || !!q.accepted_at || !!q.delivery_days || !!q.delivery_date || !!q.is_urgent || ((q.status||'') !== 'BOZZA'); }
  let sb;
  async function load(){
    clearErr();
    const tbody=$('rows'); if(tbody) tbody.innerHTML='<tr><td colspan="7" class="text-center py-4 text-muted">Caricamento…</td></tr>'; updateDashboard([]);
    try{
      if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){ showErr('Config Supabase mancante.'); return; }
      sb = sb || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const qTxt=norm($('q')?.value); const status=$('status')?.value || ''; const order=$('order')?.value || 'urgent_first'; const urgentFilter=$('urgentFilter')?.value || ''; const dueFilter=$('dueFilter')?.value || ''; 
      let query = sb.from('quotes').select('id,record_id,status,is_urgent,sent_at,accepted_at,delivery_days,delivery_date,subtotal_ex_vat,progress_percent,created_at,notes,quote_items(id),records:records(id,cliente,descrizione,modello)').limit(500);
      if(status) query = query.eq('status', status); else query = query.in('status', ['BOZZA','INVIATO','ACCETTATO','ANNULLATO']);
      if(order==='accepted_asc') query=query.order('accepted_at',{ascending:true,nullsFirst:false});
      else if(order==='accepted_desc') query=query.order('accepted_at',{ascending:false,nullsFirst:false});
      else if(order==='sent_asc') query=query.order('sent_at',{ascending:true,nullsFirst:false});
      else if(order==='sent_desc') query=query.order('sent_at',{ascending:false,nullsFirst:false});
      else query=query.order('created_at',{ascending:false,nullsFirst:false});
      const {data,error}=await query; if(error) throw error;
      let rows=(data||[]).map(q=>({
        id:q.id, record_id:q.record_id, status:q.status, is_urgent:!!q.is_urgent, sent_at:q.sent_at, accepted_at:q.accepted_at, delivery_days:q.delivery_days, delivery_date:q.delivery_date, subtotal_ex_vat:q.subtotal_ex_vat, progress_percent:q.progress_percent, created_at:q.created_at, notes:q.notes,
        item_count:Array.isArray(q.quote_items)?q.quote_items.length:0,
        cliente:q.records?.cliente||'—', descrizione:q.records?.descrizione||'—', modello:q.records?.modello||''
      }));
      rows=rows.filter(isMeaningfulQuote);
      if(qTxt){ rows=rows.filter(x=>norm(`${x.cliente} ${x.descrizione} ${x.modello}`).includes(qTxt)); }
      if(urgentFilter==='urgent') rows=rows.filter(x=>x.is_urgent);
      if(urgentFilter==='normal') rows=rows.filter(x=>!x.is_urgent);
      if(dueFilter){ rows=rows.filter(x=>{ const d=computeDue(x); if(dueFilter==='overdue') return d.days !== null && d.days < 0; if(dueFilter==='today') return d.days === 0; if(dueFilter==='tomorrow') return d.days === 1; if(dueFilter==='ontime') return d.days !== null && d.days > 1; return true; }); }
      if(order==='urgent_first') rows.sort((a,b)=> (Number(b.is_urgent)-Number(a.is_urgent)) || ((computeDue(a).days??99999)-(computeDue(b).days??99999)) || (new Date(b.created_at)-new Date(a.created_at)) );
      render(rows); updateDashboard(rows);
    }catch(e){ showErr('Errore caricamento preventivi: ' + (e?.message||e)); if(tbody) tbody.innerHTML='<tr><td colspan="8" class="text-center py-4 text-muted">Nessun dato</td></tr>'; }
  }
  function render(list){
    const tbody=$('rows'); if(!tbody) return;
    if(!list.length){ tbody.innerHTML='<tr><td colspan="7" class="text-center py-4 text-muted">Nessun preventivo trovato</td></tr>'; return; }
    tbody.innerHTML='';
    list.forEach(q=>{
      const prog=Math.max(0,Math.min(100,Number(q.progress_percent||0)));
      const due=computeDue(q);
      const tr=document.createElement('tr');
      if(q.is_urgent) tr.className='row-urgent';
      tr.innerHTML=`
        <td><div class="fw-semibold">${escapeHtml(q.cliente)}</div><div class="small text-muted">${escapeHtml(q.modello||'')}</div></td>
        <td><div>${escapeHtml(q.descrizione)}</div><div class="small text-muted">creato ${fmtDate(q.created_at)}</div></td>
        <td class="nowrap"><div class="state-stack">${badge(q.status)}${q.is_urgent?'<span class="urgent-tag">URG</span>':''}</div></td>
        <td class="nowrap"><div class="small fw-semibold ${due.tone==='due-over'?'text-danger':due.tone==='due-today'?'text-warning':due.tone==='due-tomorrow'?'text-primary':'text-body'}">${escapeHtml(due.label)}</div><div class="small ${due.tone==='due-over'?'text-danger':due.tone==='due-today'?'text-warning':due.tone==='due-tomorrow'?'text-primary':'text-muted'}">${escapeHtml(due.sub)}</div></td>
        <td class="nowrap" style="min-width:160px;"><div class="d-flex justify-content-between small"><span>${Math.round(prog)}%</span><span class="text-muted">lavoro</span></div><div class="progbar"><div style="width:${prog}%;"></div></div></td>
        <td class="text-end nowrap"><span class="fw-semibold">€ ${money(q.subtotal_ex_vat||0)}</span></td>
        <td class="text-end nowrap"><button class="btn btn-sm btn-outline-primary" data-open="${q.id}">Apri</button> <button class="btn btn-sm btn-outline-secondary" data-rec="${q.record_id}">Scheda</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-open]').forEach(b=>b.addEventListener('click',()=>location.href='preventivo.html?id='+encodeURIComponent(b.getAttribute('data-open'))));
    tbody.querySelectorAll('button[data-rec]').forEach(b=>b.addEventListener('click',()=>location.href='record.html?id='+encodeURIComponent(b.getAttribute('data-rec'))));
  }

  function updateDashboard(rows){
    const counts={overdue:0,today:0,urgent:0,accepted:0};
    (rows||[]).forEach(x=>{
      const d=computeDue(x);
      if(d.days!==null){ if(d.days<0) counts.overdue++; else if(d.days===0) counts.today++; }
      if(x.is_urgent) counts.urgent++;
      if(String(x.status||'').toUpperCase()==='ACCETTATO') counts.accepted++;
    });
    if($('dashOverdue')) $('dashOverdue').textContent=String(counts.overdue);
    if($('dashToday')) $('dashToday').textContent=String(counts.today);
    if($('dashUrgent')) $('dashUrgent').textContent=String(counts.urgent);
    if($('dashAccepted')) $('dashAccepted').textContent=String(counts.accepted);

    const currentDashboard = (()=>{
      const st=($('status')?.value||'').toUpperCase();
      const urg=$('urgentFilter')?.value||'';
      const due=$('dueFilter')?.value||'';
      if(urg==='urgent' && !due && !st) return 'urgent';
      if(st==='ACCETTATO' && !due && !urg) return 'accepted';
      if(due==='overdue' && !urg && !st) return 'overdue';
      if(due==='today' && !urg && !st) return 'today';
      return '';
    })();
    document.querySelectorAll('.dash-card').forEach(btn=>btn.classList.toggle('active', currentDashboard===btn.dataset.dashboard));
  }
  function bindDashboard(){
    document.querySelectorAll('.dash-card').forEach(btn=>btn.addEventListener('click', ()=>{
      const mode=btn.dataset.dashboard||'';
      const status=$('status');
      const urgent=$('urgentFilter');
      const due=$('dueFilter');
      if(!status || !urgent || !due) return;

      const current = (()=>{
        const st=(status.value||'').toUpperCase();
        if(urgent.value==='urgent' && !due.value && !st) return 'urgent';
        if(st==='ACCETTATO' && !due.value && !urgent.value) return 'accepted';
        if(due.value==='overdue' && !urgent.value && !st) return 'overdue';
        if(due.value==='today' && !urgent.value && !st) return 'today';
        return '';
      })();

      if(current===mode){
        status.value='';
        urgent.value='';
        due.value='';
      }else{
        status.value='';
        urgent.value='';
        due.value='';
        if(mode==='urgent') urgent.value='urgent';
        else if(mode==='accepted') status.value='ACCETTATO';
        else if(mode==='overdue') due.value='overdue';
        else if(mode==='today') due.value='today';
      }
      load();
    }));
  }

  document.addEventListener('DOMContentLoaded', ()=>{ $('btnHome')?.addEventListener('click', ()=>location.href='index.html'); $('btnRefresh')?.addEventListener('click', load); $('btnApply')?.addEventListener('click', load); bindDashboard(); load(); });
})();
