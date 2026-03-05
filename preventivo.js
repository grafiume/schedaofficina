/* Preventivo — editor
   - Prezzi liberi (IVA esclusa)
   - IVA fissa 22%
   - Lavorazioni selezionabili da libreria (categorie + lavorazioni), con fasi % cliccabili
*/

(function(){
  const VAT_RATE = 22;
  const DEFAULT_PHASES = [
    { name:'Preparazione', w:20 },
    { name:'Esecuzione', w:60 },
    { name:'Collaudo', w:20 },
  ];

  function $(id){ return document.getElementById(id); }
  function norm(s){ return (s||'').toString().trim().toLowerCase(); }

  function showErr(msg){ const el=$('errBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); } console.error(msg); }
  function clearErr(){ const el=$('errBanner'); if(el){ el.classList.add('d-none'); el.textContent=''; } }
  function showOk(msg){ const el=$('okBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); setTimeout(()=>{ try{ el.classList.add('d-none'); }catch{} }, 1600); } }

  function qs(){ return new URLSearchParams(location.search); }

  function todayISO(){ const d=new Date(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${dd}`; }

  function fmtMoney(n){
    const x = Number(n||0);
    return x.toLocaleString('it-IT', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  function parseNum(v){
    if(v===null||v===undefined) return 0;
    const s = (''+v).replace(',', '.').trim();
    const x = Number(s);
    return isFinite(x) ? x : 0;
  }

  function escapeHtml(s){
    return (s??'').toString()
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
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
    if(diff>0) return `Fine lavori: mancano ${diff} gg (prevista ${fmtDateISO(expected)})`;
    if(diff<0) return `Fine lavori: in ritardo di ${Math.abs(diff)} gg (prevista ${fmtDateISO(expected)})`;
    return `Fine lavori: scade oggi (${fmtDateISO(expected)})`;
  }

  function fmtDateISO(d){
    const x = (d instanceof Date) ? d : new Date(d);
    if(isNaN(x.getTime())) return '—';
    const dd=String(x.getDate()).padStart(2,'0');
    const mm=String(x.getMonth()+1).padStart(2,'0');
    const yy=x.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  let sb;
  let quote = null;
  let record = null;
  let items = []; // each: {id, task_id, description, qty, unit_price_ex_vat, line_total_ex_vat, progress_percent, phases:[]}

  let libModal, newTaskModal;

  async function init(){
    clearErr();
    try{
      if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){ showErr('Config Supabase mancante.'); return; }
      sb = sb || window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

      const id = qs().get('id');
      const record_id = qs().get('record_id');

      if(id){
        await loadQuoteById(id);
      } else if(record_id){
        await loadOrCreateQuoteForRecord(record_id);
      } else {
        showErr('Manca id preventivo o record_id.');
        return;
      }

      await loadRecord();
      await loadItems();
      bindUI();
      renderAll();

    } catch(e){
      showErr('Errore inizializzazione preventivo: ' + (e?.message||e));
    }
  }

  async function loadQuoteById(id){
    const { data, error } = await sb.from('quotes').select('*').eq('id', id).single();
    if(error) throw error;
    quote = data;
  }

  async function loadOrCreateQuoteForRecord(record_id){
    // prova a riaprire l'ultima BOZZA; altrimenti crea nuova
    const { data, error } = await sb
      .from('quotes')
      .select('*')
      .eq('record_id', record_id)
      .in('status', ['BOZZA','INVIATO','ACCETTATO'])
      .order('created_at', { ascending:false })
      .limit(1);
    if(error) throw error;

    if(data && data.length){
      quote = data[0];
      // se non è BOZZA, ne creiamo una nuova (così non sporchi lo storico)
      if(quote.status !== 'BOZZA'){
        quote = await createNewQuote(record_id);
      }
    } else {
      quote = await createNewQuote(record_id);
    }

    // aggiorna URL per includere id (pulito)
    try{
      const u = new URL(location.href);
      u.searchParams.delete('record_id');
      u.searchParams.set('id', quote.id);
      history.replaceState({}, '', u.toString());
    }catch{}
  }

  async function createNewQuote(record_id){
    const payload = {
      record_id,
      status: 'BOZZA',
      vat_rate: VAT_RATE,
      subtotal_ex_vat: 0,
      vat_total: 0,
      grand_total: 0,
      progress_percent: 0,
      notes: ''
    };
    const { data, error } = await sb.from('quotes').insert(payload).select().single();
    if(error) throw error;
    return data;
  }

  async function loadRecord(){
    const { data, error } = await sb.from('records').select('id,cliente,descrizione,modello').eq('id', quote.record_id).single();
    if(error) throw error;
    record = data;
  }

  async function loadItems(){
    const { data, error } = await sb
      .from('quote_items')
      .select('*')
      .eq('quote_id', quote.id)
      .order('position', { ascending:true });
    if(error) throw error;

    items = (data||[]).map(x=>({
      id: x.id,
      task_id: x.task_id,
      description: x.description,
      qty: x.qty,
      unit_price_ex_vat: x.unit_price_ex_vat,
      line_total_ex_vat: x.line_total_ex_vat,
      line_progress_percent: x.line_progress_percent
    }));

    // phases for all items
    if(items.length){
      const ids = items.map(i=>i.id);
      const ph = await sb.from('quote_item_phases').select('*').in('quote_item_id', ids).order('sort_order', { ascending:true });
      if(ph.error) throw ph.error;
      const by = new Map();
      (ph.data||[]).forEach(p=>{
        const arr = by.get(p.quote_item_id) || [];
        arr.push(p);
        by.set(p.quote_item_id, arr);
      });
      items.forEach(i=> i.phases = (by.get(i.id) || []).map(p=>({
        id: p.id,
        phase_name: p.phase_name,
        weight_percent: p.weight_percent,
        is_done: p.is_done
      })) );
    } else {
      items.forEach(i=> i.phases=[]);
    }
  }

  function bindUI(){
    $('btnBack')?.addEventListener('click', ()=>{
      // ritorno: se arrivo da record, preferisci la scheda; altrimenti lista preventivi
      try{
        if(document.referrer && document.referrer.includes('record.html')) location.href = 'record.html?id=' + encodeURIComponent(quote.record_id);
        else location.href = 'preventivi.html';
      }catch{ location.href='preventivi.html'; }
    });

    $('btnOpenRecord')?.addEventListener('click', ()=> location.href = 'record.html?id=' + encodeURIComponent(quote.record_id));
    $('btnSave')?.addEventListener('click', saveAll);

    $('btnAddFree')?.addEventListener('click', async ()=>{
      await addFreeLine();
      renderAll();
      showOk('Riga aggiunta');
    });

    $('btnLibrary')?.addEventListener('click', async ()=>{
      await openLibrary();
    });

    // header fields
    ['status','sent_at','accepted_at','delivery_days','delivery_date','notes'].forEach(id=>{
      $(id)?.addEventListener('change', ()=>{
        // solo render; salvataggio con bottone Salva
        renderHeaderComputed();
      });
    });

    // modals
    const libEl = $('libModal');
    if(libEl) libModal = new bootstrap.Modal(libEl, { backdrop:'static' });

    const ntEl = $('newTaskModal');
    if(ntEl) newTaskModal = new bootstrap.Modal(ntEl, { backdrop:'static' });

    $('btnInitDefaults')?.addEventListener('click', initDefaults);
    $('libSearch')?.addEventListener('input', ()=>renderLibrary(window.__lib_cache||{cats:[],tasks:[],phases:[]}));

    $('btnNewTask')?.addEventListener('click', async ()=>{
      await refreshNewTaskCats();
      $('newTaskTitle').value='';
      $('newTaskDesc').value='';
      newTaskModal?.show();
    });

    $('btnCreateTask')?.addEventListener('click', createTaskFromModal);
  }

  function renderAll(){
    // record
    $('recCliente').textContent = record?.cliente || '—';
    $('recDesc').textContent = record?.descrizione || '—';
    $('recModel').textContent = record?.modello ? ('Modello: ' + record.modello) : '';

    // quote info
    $('quoteId').textContent = quote?.id || '—';
    $('status').value = quote.status || 'BOZZA';
    $('sent_at').value = (quote.sent_at||'');
    $('accepted_at').value = (quote.accepted_at||'');
    $('delivery_days').value = (quote.delivery_days??'');
    $('delivery_date').value = (quote.delivery_date||'');
    $('notes').value = (quote.notes||'');

    renderHeaderComputed();
    renderItems();
    renderTotalsAndProgress();
  }

  function renderHeaderComputed(){
    const st = $('status')?.value || 'BOZZA';
    $('quoteStatusBadge').className = 'badge ' + (st==='ACCETTATO'?'bg-success':(st==='INVIATO'?'bg-primary':(st==='ANNULLATO'?'bg-danger':'bg-secondary')));
    $('quoteStatusBadge').textContent = st;

    const tempQuote = {
      sent_at: $('sent_at')?.value || null,
      accepted_at: $('accepted_at')?.value || null,
      delivery_days: parseNum($('delivery_days')?.value||0),
      delivery_date: $('delivery_date')?.value || null,
    };
    $('dueLabel').textContent = computeDueLabel(tempQuote);
  }

  function renderItems(){
    const tbody = $('itemsRows');
    if(!tbody) return;

    if(!items.length){
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Nessuna riga. Aggiungi una lavorazione.</td></tr>';
      return;
    }

    tbody.innerHTML='';
    items.forEach((it, idx)=>{
      const qty = Number(it.qty||1);
      const price = Number(it.unit_price_ex_vat||0);
      const lineTotal = qty * price;
      const prog = computeItemProgress(it);

      const tr = document.createElement('tr');
      tr.className='item-row';
      tr.innerHTML = `
        <td>
          <input class="form-control" data-desc value="${escapeHtml(it.description||'')}" />
          <div class="small text-muted mt-1" data-phbox></div>
        </td>
        <td><input class="form-control w-qty" type="number" min="0" step="1" data-qty value="${qty}" /></td>
        <td class="text-end"><input class="form-control w-price text-end" type="text" inputmode="decimal" data-price value="${fmtMoney(price)}" /></td>
        <td class="text-end"><span class="fw-semibold">€ ${fmtMoney(lineTotal)}</span></td>
        <td style="min-width:170px;">
          <div class="d-flex justify-content-between small"><span>${Math.round(prog)}%</span><span class="text-muted">fasi</span></div>
          <div class="progbar"><div style="width:${Math.max(0,Math.min(100,prog))}%;"></div></div>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary" data-fasi>Fasi</button>
          <button class="btn btn-sm btn-outline-danger" data-del>Rimuovi</button>
        </td>
      `;

      const descInp = tr.querySelector('[data-desc]');
      const qtyInp = tr.querySelector('[data-qty]');
      const priceInp= tr.querySelector('[data-price]');
      const delBtn = tr.querySelector('[data-del]');
      const fasiBtn= tr.querySelector('[data-fasi]');
      const phBox  = tr.querySelector('[data-phbox]');

      descInp.addEventListener('input', ()=>{ it.description = descInp.value; });
      qtyInp.addEventListener('input', ()=>{ it.qty = parseNum(qtyInp.value); renderTotalsAndProgress(); });
      priceInp.addEventListener('input', ()=>{
        // mantieni ciò che scrive; calcolo su blur o save
        const v = priceInp.value;
        it.unit_price_ex_vat = parseNum(v);
        renderTotalsAndProgress();
      });
      priceInp.addEventListener('blur', ()=>{ priceInp.value = fmtMoney(parseNum(priceInp.value)); });

      delBtn.addEventListener('click', async ()=>{
        if(!confirm('Rimuovere questa riga dal preventivo?')) return;
        await removeItem(it.id);
        await loadItems();
        renderAll();
      });

      fasiBtn.addEventListener('click', ()=>{
        togglePhasesEditor(it, phBox);
        renderTotalsAndProgress();
      });

      // render sintetico fasi completate
      const done = (it.phases||[]).filter(p=>p.is_done);
      phBox.innerHTML = done.length ? (done.map(p=>`<span class="badge bg-light text-dark border me-1">✓ ${escapeHtml(p.phase_name)} (${p.weight_percent}%)</span>`).join('')) : '<span class="text-muted">Fasi: nessuna completata</span>';

      tbody.appendChild(tr);
    });
  }

  function togglePhasesEditor(it, container){
    // se già aperto, chiudi
    if(container.__open){ container.__open=false; container.innerHTML = (it.phases||[]).filter(p=>p.is_done).length ? (it.phases.filter(p=>p.is_done).map(p=>`<span class="badge bg-light text-dark border me-1">✓ ${escapeHtml(p.phase_name)} (${p.weight_percent}%)</span>`).join('')) : '<span class="text-muted">Fasi: nessuna completata</span>'; return; }

    container.__open=true;

    if(!it.phases || !it.phases.length){
      // crea fasi standard in memoria (saranno create su DB al salvataggio)
      it.phases = DEFAULT_PHASES.map((p,idx)=>({ id:null, phase_name:p.name, weight_percent:p.w, is_done:false, sort_order:idx+1 }));
    }

    const wrap = document.createElement('div');
    wrap.className = 'mt-2';

    const pills = document.createElement('div');
    pills.className = 'd-flex flex-wrap gap-2';

    it.phases.forEach((p, idx)=>{
      const lab = document.createElement('label');
      lab.className='phase-pill clickable';
      lab.innerHTML = `<input class="form-check-input" type="checkbox" ${p.is_done?'checked':''} /> <span>${escapeHtml(p.phase_name)} <span class="text-muted">(${p.weight_percent}%)</span></span>`;
      const cb = lab.querySelector('input');
      cb.addEventListener('change', ()=>{
        p.is_done = cb.checked;
        renderTotalsAndProgress();
      });
      pills.appendChild(lab);
    });

    const addBtn = document.createElement('button');
    addBtn.type='button';
    addBtn.className='btn btn-sm btn-outline-primary';
    addBtn.textContent='Aggiungi fase';
    addBtn.addEventListener('click', ()=>{
      const name = prompt('Nome fase:');
      if(!name) return;
      const w = parseNum(prompt('Percentuale fase (0-100):', '10'));
      it.phases.push({ id:null, phase_name:name, weight_percent:Math.max(0,Math.min(100,w)), is_done:false, sort_order: (it.phases.length+1) });
      togglePhasesEditor(it, container); // chiudi
      togglePhasesEditor(it, container); // riapri
    });

    const hint = document.createElement('div');
    hint.className='small text-muted mt-2';
    hint.textContent='Suggerimento: le percentuali possono anche non fare 100. L’avanzamento è la somma delle fasi completate.';

    wrap.appendChild(pills);
    wrap.appendChild(document.createElement('div')).className='mt-2';
    wrap.appendChild(addBtn);
    wrap.appendChild(hint);

    container.innerHTML='';
    container.appendChild(wrap);
  }

  function computeItemProgress(it){
    const phases = it.phases || [];
    if(!phases.length) return 0;
    const done = phases.filter(p=>p.is_done).reduce((a,p)=>a+Number(p.weight_percent||0),0);
    return Math.max(0, Math.min(100, done));
  }

  function renderTotalsAndProgress(){
    const subtotal = items.reduce((sum,it)=> sum + (parseNum(it.qty||1) * parseNum(it.unit_price_ex_vat||0)), 0);
    const vat = subtotal * (VAT_RATE/100);
    const grand = subtotal + vat;

    $('subtotal').textContent = '€ ' + fmtMoney(subtotal);
    $('vat').textContent = '€ ' + fmtMoney(vat);
    $('grand').textContent = '€ ' + fmtMoney(grand);

    // progress quote: ponderato per importo (se totale=0, media semplice)
    let prog=0;
    if(subtotal>0){
      const num = items.reduce((sum,it)=>{
        const line = parseNum(it.qty||1) * parseNum(it.unit_price_ex_vat||0);
        const p = computeItemProgress(it);
        return sum + (line * (p/100));
      },0);
      prog = (num / subtotal) * 100;
    } else {
      const n = items.length;
      prog = n ? (items.reduce((s,it)=>s+computeItemProgress(it),0)/n) : 0;
    }

    prog = Math.max(0, Math.min(100, prog));
    $('quoteProgressTxt').textContent = Math.round(prog) + '%';
    $('quoteProgBar').style.width = prog + '%';

    // keep in memory for save
    quote.subtotal_ex_vat = subtotal;
    quote.vat_total = vat;
    quote.grand_total = grand;
    quote.progress_percent = prog;
  }

  async function addFreeLine(){
    const pos = (items.length ? (Math.max(...items.map(i=>i.position||0)) + 1) : 1);
    const payload = {
      quote_id: quote.id,
      position: items.length + 1,
      task_id: null,
      description: 'Nuova lavorazione',
      qty: 1,
      unit_price_ex_vat: 0,
      line_total_ex_vat: 0,
      line_progress_percent: 0
    };
    const { data, error } = await sb.from('quote_items').insert(payload).select().single();
    if(error) throw error;

    // crea fasi standard in DB
    const phasesPayload = DEFAULT_PHASES.map((p,idx)=>({
      quote_item_id: data.id,
      phase_name: p.name,
      weight_percent: p.w,
      is_done: false,
      sort_order: idx+1
    }));
    const ins = await sb.from('quote_item_phases').insert(phasesPayload);
    if(ins.error) throw ins.error;

    await loadItems();
  }

  async function removeItem(itemId){
    // cascata manuale: fasi -> item
    const d1 = await sb.from('quote_item_phases').delete().eq('quote_item_id', itemId);
    if(d1.error) throw d1.error;
    const d2 = await sb.from('quote_items').delete().eq('id', itemId);
    if(d2.error) throw d2.error;
  }

  async function saveAll(){
    clearErr();
    try{
      // aggiorna quote dal form
      quote.status = $('status').value;
      quote.sent_at = $('sent_at').value || null;
      quote.accepted_at = $('accepted_at').value || null;
      quote.delivery_days = $('delivery_days').value ? parseInt($('delivery_days').value,10) : null;
      quote.delivery_date = $('delivery_date').value || null;
      quote.notes = $('notes').value || '';

      // calcoli
      renderTotalsAndProgress();

      // salva righe
      for(let idx=0; idx<items.length; idx++){
        const it = items[idx];
        const qty = parseNum(it.qty||1);
        const price = parseNum(it.unit_price_ex_vat||0);
        const lineTotal = qty*price;
        const prog = computeItemProgress(it);

        const up = await sb.from('quote_items').update({
          position: idx+1,
          description: it.description,
          qty,
          unit_price_ex_vat: price,
          line_total_ex_vat: lineTotal,
          line_progress_percent: prog
        }).eq('id', it.id);
        if(up.error) throw up.error;

        // salva fasi: update/insert
        if(it.phases && it.phases.length){
          for(let pIdx=0; pIdx<it.phases.length; pIdx++){
            const p = it.phases[pIdx];
            if(p.id){
              const u = await sb.from('quote_item_phases').update({
                phase_name: p.phase_name,
                weight_percent: parseNum(p.weight_percent||0),
                is_done: !!p.is_done,
                sort_order: pIdx+1
              }).eq('id', p.id);
              if(u.error) throw u.error;
            } else {
              const ins = await sb.from('quote_item_phases').insert({
                quote_item_id: it.id,
                phase_name: p.phase_name,
                weight_percent: parseNum(p.weight_percent||0),
                is_done: !!p.is_done,
                sort_order: pIdx+1
              }).select().single();
              if(ins.error) throw ins.error;
              // aggiorna id in memoria
              p.id = ins.data.id;
            }
          }
        }
      }

      // salva testata quote con cache
      const uq = await sb.from('quotes').update({
        status: quote.status,
        sent_at: quote.sent_at,
        accepted_at: quote.accepted_at,
        delivery_days: quote.delivery_days,
        delivery_date: quote.delivery_date,
        notes: quote.notes,
        subtotal_ex_vat: quote.subtotal_ex_vat,
        vat_rate: VAT_RATE,
        vat_total: quote.vat_total,
        grand_total: quote.grand_total,
        progress_percent: quote.progress_percent
      }).eq('id', quote.id).select().single();
      if(uq.error) throw uq.error;
      quote = uq.data;

      showOk('Salvato');
      await loadItems();
      renderAll();

    }catch(e){
      showErr('Errore salvataggio preventivo: ' + (e?.message||e));
    }
  }

  // -------------------- Libreria lavorazioni (categorie + tasks) --------------------

  async function openLibrary(){
    clearErr();
    try{
      await loadLibrary();
      await refreshNewTaskCats();
      libModal?.show();
    }catch(e){
      showErr('Errore apertura libreria: ' + (e?.message||e));
    }
  }

  async function loadLibrary(){
    const cats = await sb.from('work_categories').select('*').order('sort_order', { ascending:true });
    if(cats.error) throw cats.error;

    const tasks = await sb.from('work_tasks').select('*').eq('is_active', true).order('sort_order', { ascending:true });
    if(tasks.error) throw tasks.error;

    // fasi template
    const taskIds = (tasks.data||[]).map(t=>t.id);
    let phases = { data: [] };
    if(taskIds.length){
      phases = await sb.from('work_task_phases_template').select('*').in('task_id', taskIds).order('sort_order', { ascending:true });
      if(phases.error) throw phases.error;
    }

    const payload = { cats: cats.data||[], tasks: tasks.data||[], phases: phases.data||[] };
    window.__lib_cache = payload;
    renderLibrary(payload);
  }

  function renderLibrary(payload){
    const box = $('libBox');
    if(!box) return;

    const q = norm($('libSearch')?.value);

    const cats = payload.cats || [];
    const tasks = payload.tasks || [];
    const phases = payload.phases || [];

    const phasesByTask = new Map();
    phases.forEach(p=>{
      const arr = phasesByTask.get(p.task_id) || [];
      arr.push(p);
      phasesByTask.set(p.task_id, arr);
    });

    box.innerHTML='';

    if(!cats.length){
      box.innerHTML = '<div class="alert alert-light border">Nessuna categoria presente. Premi “Inizializza categorie base”.</div>';
      return;
    }

    cats.forEach((c, idx)=>{
      const catTasks = tasks.filter(t=>t.category_id===c.id)
        .filter(t=>{
          if(!q) return true;
          return norm(t.title).includes(q) || norm(t.default_description).includes(q);
        });

      // se ricerca attiva e categoria vuota, non mostrarla
      if(q && !catTasks.length) return;

      const item = document.createElement('div');
      item.className='accordion-item';
      const hid = 'cat_' + c.id;
      item.innerHTML = `
        <h2 class="accordion-header" id="h_${hid}">
          <button class="accordion-button ${idx===0 && !q ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#c_${hid}" aria-expanded="${idx===0 && !q ? 'true':'false'}" aria-controls="c_${hid}">
            ${escapeHtml(c.name)}
          </button>
        </h2>
        <div id="c_${hid}" class="accordion-collapse collapse ${idx===0 && !q ? 'show':''}" aria-labelledby="h_${hid}">
          <div class="accordion-body">
            ${catTasks.length ? '<div class="list-group" data-list></div>' : '<div class="text-muted">Nessuna lavorazione in questa categoria.</div>'}
          </div>
        </div>
      `;
      box.appendChild(item);

      const list = item.querySelector('[data-list]');
      if(list){
        catTasks.forEach(t=>{
          const tpl = phasesByTask.get(t.id) || [];
          const tplTxt = tpl.length ? ('Fasi: ' + tpl.map(p=>`${p.phase_name} ${p.weight_percent}%`).join(' • ')) : 'Fasi: standard';

          const a = document.createElement('button');
          a.type='button';
          a.className='list-group-item list-group-item-action d-flex justify-content-between align-items-start';
          a.innerHTML = `
            <div>
              <div class="fw-semibold">${escapeHtml(t.title)}</div>
              <div class="small text-muted">${escapeHtml(t.default_description||'')}</div>
              <div class="small text-muted">${escapeHtml(tplTxt)}</div>
            </div>
            <div class="ms-2">
              <span class="badge bg-light text-dark border">Aggiungi</span>
            </div>
          `;
          a.addEventListener('click', async ()=>{
            await addTaskToQuote(t, tpl);
            await loadItems();
            renderAll();
            showOk('Aggiunta lavorazione');
          });
          list.appendChild(a);
        });
      }
    });
  }

  async function addTaskToQuote(task, tplPhases){
    // crea item
    const payload = {
      quote_id: quote.id,
      position: items.length + 1,
      task_id: task.id,
      description: task.title,
      qty: 1,
      unit_price_ex_vat: 0,
      line_total_ex_vat: 0,
      line_progress_percent: 0
    };
    const { data, error } = await sb.from('quote_items').insert(payload).select().single();
    if(error) throw error;

    // fasi
    let phasesPayload;
    if(tplPhases && tplPhases.length){
      phasesPayload = tplPhases.map((p,idx)=>({
        quote_item_id: data.id,
        phase_name: p.phase_name,
        weight_percent: p.weight_percent,
        is_done: false,
        sort_order: idx+1
      }));
    } else {
      phasesPayload = DEFAULT_PHASES.map((p,idx)=>({
        quote_item_id: data.id,
        phase_name: p.name,
        weight_percent: p.w,
        is_done: false,
        sort_order: idx+1
      }));
    }

    const ins = await sb.from('quote_item_phases').insert(phasesPayload);
    if(ins.error) throw ins.error;
  }

  async function initDefaults(){
    clearErr();
    try{
      // se ci sono già, non duplicare
      const existing = await sb.from('work_categories').select('id').limit(1);
      if(existing.error) throw existing.error;
      if(existing.data && existing.data.length){ showOk('Categorie già presenti'); await loadLibrary(); return; }

      const cats = [
        'ISOLAMENTO STATORE',
        'AVVOLGIMENTO STATORE',
        'ISOLAMENTO INDOTTO',
        'AVVOLGIMENTO INDOTTO',
        'MECCANICA / CUSCINETTI',
        'COLLAUDO / FINITURA'
      ].map((name,idx)=>({ name, sort_order: idx+1 }));

      const ins = await sb.from('work_categories').insert(cats).select();
      if(ins.error) throw ins.error;

      showOk('Categorie create');
      await loadLibrary();
      await refreshNewTaskCats();
    }catch(e){
      showErr('Errore inizializzazione categorie: ' + (e?.message||e));
    }
  }

  async function refreshNewTaskCats(){
    const sel = $('newTaskCat');
    if(!sel) return;
    const cats = await sb.from('work_categories').select('id,name').order('sort_order', { ascending:true });
    if(cats.error) throw cats.error;

    sel.innerHTML='';
    (cats.data||[]).forEach(c=>{
      const opt=document.createElement('option');
      opt.value=c.id;
      opt.textContent=c.name;
      sel.appendChild(opt);
    });
  }

  async function createTaskFromModal(){
    clearErr();
    try{
      const catId = $('newTaskCat').value;
      const title = ($('newTaskTitle').value||'').trim();
      const desc = ($('newTaskDesc').value||'').trim();
      if(!catId){ alert('Seleziona una categoria.'); return; }
      if(!title){ alert('Inserisci un titolo.'); return; }

      // calcola sort_order in categoria
      const existing = await sb.from('work_tasks').select('sort_order').eq('category_id', catId).order('sort_order', { ascending:false }).limit(1);
      if(existing.error) throw existing.error;
      const nextOrder = (existing.data && existing.data.length) ? (Number(existing.data[0].sort_order||0)+1) : 1;

      const tIns = await sb.from('work_tasks').insert({
        category_id: catId,
        title,
        default_description: desc,
        sort_order: nextOrder,
        is_active: true
      }).select().single();
      if(tIns.error) throw tIns.error;

      const phasesPayload = DEFAULT_PHASES.map((p,idx)=>({
        task_id: tIns.data.id,
        phase_name: p.name,
        weight_percent: p.w,
        sort_order: idx+1
      }));
      const pIns = await sb.from('work_task_phases_template').insert(phasesPayload);
      if(pIns.error) throw pIns.error;

      newTaskModal?.hide();
      showOk('Lavorazione creata');
      await loadLibrary();

    }catch(e){
      showErr('Errore creazione lavorazione: ' + (e?.message||e));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
