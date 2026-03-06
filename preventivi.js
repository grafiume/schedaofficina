(function(){
  function $(id){ return document.getElementById(id); }
  function norm(s){ return (s||'').toString().trim().toLowerCase(); }
  function showErr(msg){ const el=$('errBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); } console.error(msg); }
  function clearErr(){ const el=$('errBanner'); if(el){ el.classList.add('d-none'); el.textContent=''; } }
  function fmtDate(d){ if(!d) return '—'; const x=new Date(d); if(isNaN(x.getTime())) return '—'; return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`; }
  function today0(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
  function money(n){ return Number(n||0).toLocaleString('it-IT', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function escapeHtml(s){ return (s??'').toString().replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
  function computeDueLabel(q){
    const now=today0(); let expected=null;
    if(q.delivery_date){ expected=new Date(q.delivery_date); expected.setHours(0,0,0,0); }
    else if(Number.isFinite(+q.delivery_days) && +q.delivery_days>0){ const base=q.accepted_at||q.sent_at||q.created_at||new Date().toISOString(); expected=new Date(base); expected.setHours(0,0,0,0); expected.setDate(expected.getDate()+(+q.delivery_days)); }
    if(!expected || isNaN(expected.getTime())) return '—';
    const diff=Math.round((expected.getTime()-now.getTime())/(1000*60*60*24));
    if(diff>0) return `mancano ${diff} gg`;
    if(diff<0) return `in ritardo di ${Math.abs(diff)} gg`;
    return 'scade oggi';
  }
  function badge(status){ const s=(status||'').toUpperCase(); if(s==='ACCETTATO') return '<span class="badge bg-success">ACCETTATO</span>'; if(s==='INVIATO') return '<span class="badge bg-primary">INVIATO</span>'; if(s==='URGENTE') return '<span class="badge bg-danger">URGENTE</span>'; if(s==='BOZZA') return '<span class="badge bg-secondary">BOZZA</span>'; if(s==='ANNULLATO') return '<span class="badge bg-dark">ANNULLATO</span>'; return `<span class="badge bg-secondary">${escapeHtml(s||'—')}</span>`; }
  function valDate(x){ const d = x ? new Date(x) : null; return d && !isNaN(d.getTime()) ? d.getTime() : -8640000000000000; }
  function sortRows(rows, order){
    const list = [...rows];
    if(order==='accepted_asc') return list.sort((a,b)=> valDate(a.accepted_at)-valDate(b.accepted_at));
    if(order==='accepted_desc') return list.sort((a,b)=> valDate(b.accepted_at)-valDate(a.accepted_at));
    if(order==='sent_asc') return list.sort((a,b)=> valDate(a.sent_at)-valDate(b.sent_at));
    if(order==='sent_desc') return list.sort((a,b)=> valDate(b.sent_at)-valDate(a.sent_at));
    if(order==='urgent_first') return list.sort((a,b)=> ((b.status==='URGENTE') - (a.status==='URGENTE')) || (valDate(b.created_at)-valDate(a.created_at)));
    return list.sort((a,b)=> valDate(b.created_at)-valDate(a.created_at));
  }
  let sb;
  async function load(){
    clearErr();
    const tbody=$('rows'); if(tbody) tbody.innerHTML='<tr><td colspan="8" class="text-center py-4 text-muted">Caricamento…</td></tr>';
    try{
      if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){ showErr('Config Supabase mancante.'); return; }
      sb = sb || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const qTxt=norm($('q')?.value); const status=$('status')?.value || ''; const order=$('order')?.value || 'urgent_first';
      let query = sb.from('quotes').select('id,record_id,status,sent_at,accepted_at,delivery_days,delivery_date,subtotal_ex_vat,progress_percent,created_at,records:records(id,cliente,descrizione,modello)').limit(1000).order('created_at',{ascending:false});
      if(status) query = query.eq('status', status); else query = query.in('status', ['BOZZA','INVIATO','ACCETTATO','URGENTE','ANNULLATO']);
      const {data,error}=await query; if(error) throw error;
      let rows=(data||[]).map(q=>({ id:q.id, record_id:q.record_id, status:q.status, sent_at:q.sent_at, accepted_at:q.accepted_at, delivery_days:q.delivery_days, delivery_date:q.delivery_date, subtotal_ex_vat:q.subtotal_ex_vat, progress_percent:q.progress_percent, created_at:q.created_at, cliente:q.records?.cliente||'—', descrizione:q.records?.descrizione||'—', modello:q.records?.modello||'' }));
      if(qTxt){ rows=rows.filter(x=>norm(`${x.cliente} ${x.descrizione} ${x.modello}`).includes(qTxt)); }
      rows = sortRows(rows, order);
      render(rows);
    }catch(e){ showErr('Errore caricamento preventivi: ' + (e?.message||e)); if(tbody) tbody.innerHTML='<tr><td colspan="8" class="text-center py-4 text-muted">Nessun dato</td></tr>'; }
  }
  function render(list){
    const tbody=$('rows'); if(!tbody) return;
    if(!list.length){ tbody.innerHTML='<tr><td colspan="8" class="text-center py-4 text-muted">Nessun preventivo trovato</td></tr>'; return; }
    tbody.innerHTML='';
    list.forEach(q=>{
      const prog=Math.max(0,Math.min(100,Number(q.progress_percent||0)));
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td><div class="fw-semibold">${escapeHtml(q.cliente)}</div><div class="small text-muted">${escapeHtml(q.modello||'')}</div></td>
        <td><div>${escapeHtml(q.descrizione)}</div><div class="small text-muted">creato ${fmtDate(q.created_at)}</div></td>
        <td class="nowrap">${badge(q.status)}</td>
        <td class="nowrap">${fmtDate(q.accepted_at)}</td>
        <td class="nowrap"><div class="small ${q.status==='URGENTE' ? 'text-danger fw-semibold' : ''}">${computeDueLabel(q)}</div><div class="small text-muted">${q.delivery_date?('data '+fmtDate(q.delivery_date)):(q.delivery_days?('+'+q.delivery_days+' gg'):'')}</div></td>
        <td class="nowrap" style="min-width:160px;"><div class="d-flex justify-content-between small"><span>${Math.round(prog)}%</span><span class="text-muted">lavoro</span></div><div class="progbar"><div style="width:${prog}%;"></div></div></td>
        <td class="text-end nowrap"><span class="fw-semibold">€ ${money(q.subtotal_ex_vat||0)}</span></td>
        <td class="text-end nowrap"><button class="btn btn-sm btn-outline-primary" data-open="${q.id}">Apri</button> <button class="btn btn-sm btn-outline-secondary" data-rec="${q.record_id}">Scheda</button></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-open]').forEach(b=>b.addEventListener('click',()=>location.href='preventivo.html?id='+encodeURIComponent(b.getAttribute('data-open'))));
    tbody.querySelectorAll('button[data-rec]').forEach(b=>b.addEventListener('click',()=>location.href='record.html?id='+encodeURIComponent(b.getAttribute('data-rec'))));
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    $('btnHome')?.addEventListener('click', ()=>location.href='index.html');
    $('btnRefresh')?.addEventListener('click', load);
    $('btnApply')?.addEventListener('click', load);
    load();
  });
})();
