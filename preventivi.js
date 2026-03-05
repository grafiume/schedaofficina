/* Preventivi — lista (Scheda Officina)
   - Stati: INVIATO / ACCETTATO
   - Ordinamento default: accettazione desc
   - IVA fissa 22%
*/

(function(){
  const VAT_RATE = 22;

  function $(id){ return document.getElementById(id); }
  function norm(s){ return (s||'').toString().trim().toLowerCase(); }
  function showErr(msg){ const el=$('errBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); } console.error(msg); }
  function clearErr(){ const el=$('errBanner'); if(el){ el.classList.add('d-none'); el.textContent=''; } }

  function fmtDate(d){
    if(!d) return '—';
    const x = new Date(d);
    if(isNaN(x.getTime())) return '—';
    const dd=String(x.getDate()).padStart(2,'0');
    const mm=String(x.getMonth()+1).padStart(2,'0');
    const yy=x.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  function today0(){ const d=new Date(); d.setHours(0,0,0,0); return d; }

  function computeDueLabel(q){
    const now = today0();
    let expected=null;

    if(q.delivery_date){
      expected = new Date(q.delivery_date);
      expected.setHours(0,0,0,0);
    } else if(Number.isFinite(+q.delivery_days) && +q.delivery_days>0){
      let base = q.accepted_at || q.sent_at || new Date().toISOString();
      expected = new Date(base);
      expected.setHours(0,0,0,0);
      expected.setDate(expected.getDate() + (+q.delivery_days));
    }

    if(!expected || isNaN(expected.getTime())) return '—';
    const diff = Math.round((expected.getTime()-now.getTime())/(1000*60*60*24));
    if(diff>0) return `mancano ${diff} gg`;
    if(diff<0) return `in ritardo di ${Math.abs(diff)} gg`;
    return 'scade oggi';
  }

  function money(n){
    const x = Number(n||0);
    return x.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  let sb;

  async function load(){
    clearErr();

    const tbody = $('rows');
    if(tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Caricamento…</td></tr>';

    try{
      if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){ showErr('Config Supabase mancante.'); return; }
      sb = sb || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

      const qTxt = norm($('q')?.value);
      const status = $('status')?.value || '';
      const order = $('order')?.value || 'accepted_desc';

      let query = sb
        .from('quotes')
        .select('id,record_id,status,sent_at,accepted_at,delivery_days,delivery_date,subtotal_ex_vat,progress_percent,created_at,records:records(id,cliente,descrizione,modello)')
        .in('status', status ? [status] : ['INVIATO','ACCETTATO'])
        .limit(500);

      // ordine
      if(order==='accepted_asc') query = query.order('accepted_at', { ascending:true, nullsFirst:false });
      else if(order==='accepted_desc') query = query.order('accepted_at', { ascending:false, nullsFirst:false });
      else if(order==='sent_asc') query = query.order('sent_at', { ascending:true, nullsFirst:false });
      else if(order==='sent_desc') query = query.order('sent_at', { ascending:false, nullsFirst:false });

      const { data, error } = await query;
      if(error) throw error;

      let rows = (data||[]).map(q=>{
        const r = q.records || {};
        return {
          id: q.id,
          record_id: q.record_id,
          status: q.status,
          sent_at: q.sent_at,
          accepted_at: q.accepted_at,
          delivery_days: q.delivery_days,
          delivery_date: q.delivery_date,
          subtotal_ex_vat: q.subtotal_ex_vat,
          progress_percent: q.progress_percent,
          cliente: r.cliente || '—',
          descrizione: r.descrizione || '—',
          modello: r.modello || ''
        };
      });

      if(qTxt){
        rows = rows.filter(x=>{
          const blob = norm(`${x.cliente} ${x.descrizione} ${x.modello}`);
          return blob.includes(qTxt);
        });
      }

      render(rows);
    }catch(e){
      showErr('Errore caricamento preventivi: ' + (e?.message||e));
      const tbody = $('rows');
      if(tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Nessun dato</td></tr>';
    }
  }

  function badge(status){
    const s = (status||'').toUpperCase();
    if(s==='ACCETTATO') return '<span class="badge bg-success">ACCETTATO</span>';
    if(s==='INVIATO') return '<span class="badge bg-primary">INVIATO</span>';
    if(s==='BOZZA') return '<span class="badge bg-secondary">BOZZA</span>';
    return `<span class="badge bg-secondary">${s||'—'}</span>`;
  }

  function render(list){
    const tbody = $('rows');
    if(!tbody) return;

    if(!list.length){
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Nessun preventivo trovato</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    list.forEach(q=>{
      const prog = Math.max(0, Math.min(100, Number(q.progress_percent||0)));
      const due = computeDueLabel(q);
      const accepted = fmtDate(q.accepted_at);
      const total = money(q.subtotal_ex_vat||0);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="fw-semibold">${escapeHtml(q.cliente)}</div>
          <div class="small text-muted">${escapeHtml(q.modello||'')}</div>
        </td>
        <td>${escapeHtml(q.descrizione)}</td>
        <td class="nowrap">${badge(q.status)}</td>
        <td class="nowrap">${accepted}</td>
        <td class="nowrap">
          <div class="small">${due}</div>
          <div class="small text-muted">${q.delivery_date?('data '+fmtDate(q.delivery_date)):(q.delivery_days?('+'+q.delivery_days+' gg'):'')}</div>
        </td>
        <td class="nowrap" style="min-width:160px;">
          <div class="d-flex justify-content-between small"><span>${Math.round(prog)}%</span><span class="text-muted">lavoro</span></div>
          <div class="progbar"><div style="width:${prog}%;"></div></div>
        </td>
        <td class="text-end nowrap"><span class="fw-semibold">€ ${total}</span></td>
        <td class="text-end nowrap">
          <button class="btn btn-sm btn-outline-primary" data-open="${q.id}">Apri</button>
          <button class="btn btn-sm btn-outline-secondary" data-rec="${q.record_id}">Scheda</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-open]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id=b.getAttribute('data-open');
        location.href = 'preventivo.html?id=' + encodeURIComponent(id);
      });
    });
    tbody.querySelectorAll('button[data-rec]').forEach(b=>{
      b.addEventListener('click', ()=>{
        const id=b.getAttribute('data-rec');
        location.href = 'record.html?id=' + encodeURIComponent(id);
      });
    });
  }

  function escapeHtml(s){
    return (s??'').toString()
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const home=$('btnHome'); if(home) home.addEventListener('click', ()=>location.href='index.html');
    const refresh=$('btnRefresh'); if(refresh) refresh.addEventListener('click', load);
    const apply=$('btnApply'); if(apply) apply.addEventListener('click', load);

    // default ordine: accettazione desc
    const order=$('order'); if(order && !order.value) order.value='accepted_desc';

    load();
  });
})();
