/* Preventivo — editor
   - Modifiche solo su SALVA
   - Accesso in visualizzazione per tutti
   - Modifica/salvataggio protetti da password frontend
   - Operatore + data entrata + data fine per ogni lavorazione

   NOTA SICUREZZA:
   La password frontend evita modifiche accidentali lato UI, ma non sostituisce
   una protezione server/RLS vera. Per blindare davvero il salvataggio serve
   anche una policy Supabase dedicata.
*/

(function(){
  const VAT_RATE = 22;
  const EDIT_PASSWORD = String(window.QUOTE_EDIT_PASSWORD || '').trim();

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
  function showErr(msg){ const el=$('errBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); } console.error(msg); }
  function clearErr(){ const el=$('errBanner'); if(el){ el.classList.add('d-none'); el.textContent=''; } }
  function showOk(msg){ const el=$('okBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); setTimeout(()=>{ try{ el.classList.add('d-none'); }catch{} }, 1600); } }

  function parseNum(v){
    if(v===null||v===undefined) return 0;
    const s = (''+v).replace(',', '.').trim();
    const x = Number(s);
    return isFinite(x) ? x : 0;
  }

  function fmtMoney(n){
    return Number(n||0).toLocaleString('it-IT', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  function statusMeta(v){ return STATUS.find(x=>x.v===v) || STATUS[0]; }

  function today0(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
  function fmtDateISO(d){
    const x = (d instanceof Date) ? d : new Date(d);
    if(isNaN(x.getTime())) return '—';
    const dd=String(x.getDate()).padStart(2,'0');
    const mm=String(x.getMonth()+1).padStart(2,'0');
    const yy=x.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }

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

  function cloneQuote(src){
    return {
      id: src?.id || null,
      record_id: src?.record_id || null,
      status: src?.status || 'BOZZA',
      sent_at: src?.sent_at || null,
      accepted_at: src?.accepted_at || null,
      delivery_days: src?.delivery_days ?? null,
      delivery_date: src?.delivery_date || null,
      notes: src?.notes || '',
      subtotal_ex_vat: Number(src?.subtotal_ex_vat || 0),
      vat_rate: Number(src?.vat_rate || VAT_RATE),
      vat_total: Number(src?.vat_total || 0),
      grand_total: Number(src?.grand_total || 0),
      progress_percent: Number(src?.progress_percent || 0),
      created_at: src?.created_at || null,
      updated_at: src?.updated_at || null,
    };
  }

  function normalizeItem(x){
    const code = x.rip_code || (String(x.description||'').trim().split(' ')[0] || '').trim();
    return {
      id: x.id || null,
      rip_code: code,
      description: x.description || '',
      unit_price_ex_vat: Number(x.unit_price_ex_vat || 0),
      qty: Number(x.qty || 1),
      work_status: x.work_status || 'DA_FARE',
      operatore: x.operatore || '',
      started_at: x.started_at || null,
      finished_at: x.finished_at || null,
    };
  }

  let sb;
  let quote=null;
  let record=null;
  let itemsByCode = new Map();
  let dbItemIdsByCode = new Map();
  let deletedItemIds = new Set();
  let editUnlocked = false;
  let dirty = false;

  async function init(){
    clearErr();
    try{
      if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){ showErr('Config Supabase mancante.'); return; }
      sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

      const id = qs().get('id');
      const record_id = qs().get('record_id');

      if(id){
        await loadQuoteById(id);
      } else if(record_id){
        await loadLatestQuoteOrDraft(record_id);
      } else {
        showErr('Manca id preventivo o record_id.');
        return;
      }

      await loadRecord();
      if(quote.id) await loadItems();
      bindUI();
      renderAll();
      updateEditMode();
    }catch(e){
      showErr('Errore inizializzazione preventivo: ' + (e?.message||e));
    }
  }

  async function loadQuoteById(id){
    const { data, error } = await sb.from('quotes').select('*').eq('id', id).single();
    if(error) throw error;
    quote = cloneQuote(data);
  }

  async function loadLatestQuoteOrDraft(record_id){
    let found = null;

    {
      const { data, error } = await sb
        .from('quotes')
        .select('*')
        .eq('record_id', record_id)
        .in('status', ['INVIATO','ACCETTATO'])
        .order('created_at', { ascending:false })
        .limit(1);
      if(error) throw error;
      if(data && data.length) found = data[0];
    }

    if(!found){
      const { data, error } = await sb
        .from('quotes')
        .select('*')
        .eq('record_id', record_id)
        .eq('status', 'BOZZA')
        .order('created_at', { ascending:false })
        .limit(1);
      if(error) throw error;
      if(data && data.length) found = data[0];
    }

    if(found){
      quote = cloneQuote(found);
      try{
        const u = new URL(location.href);
        u.searchParams.delete('record_id');
        u.searchParams.set('id', quote.id);
        history.replaceState({}, '', u.toString());
      }catch{}
      return;
    }

    quote = cloneQuote({
      id: null,
      record_id,
      status:'BOZZA',
      vat_rate: VAT_RATE,
      subtotal_ex_vat: 0,
      vat_total: 0,
      grand_total: 0,
      progress_percent: 0,
      notes: ''
    });
  }

  async function createQuoteOnSave(){
    const payload = {
      record_id: quote.record_id,
      status: quote.status || 'BOZZA',
      sent_at: quote.sent_at || null,
      accepted_at: quote.accepted_at || null,
      delivery_days: quote.delivery_days ?? null,
      delivery_date: quote.delivery_date || null,
      notes: quote.notes || null,
      subtotal_ex_vat: quote.subtotal_ex_vat || 0,
      vat_rate: VAT_RATE,
      vat_total: quote.vat_total || 0,
      grand_total: quote.grand_total || 0,
      progress_percent: quote.progress_percent || 0,
    };
    const { data, error } = await sb.from('quotes').insert(payload).select().single();
    if(error) throw error;
    quote = cloneQuote(data);
    try{
      const u = new URL(location.href);
      u.searchParams.delete('record_id');
      u.searchParams.set('id', quote.id);
      history.replaceState({}, '', u.toString());
    }catch{}
  }

  async function loadRecord(){
    const { data, error } = await sb
      .from('records')
      .select('id,cliente,descrizione,modello')
      .eq('id', quote.record_id)
      .single();
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

    itemsByCode = new Map();
    dbItemIdsByCode = new Map();
    deletedItemIds = new Set();

    (data||[]).forEach(x=>{
      const item = normalizeItem(x);
      if(item.rip_code){
        itemsByCode.set(item.rip_code, item);
        if(item.id) dbItemIdsByCode.set(item.rip_code, item.id);
      }
    });
  }

  function bindUI(){
    $('btnBack')?.addEventListener('click', ()=> history.back());
    $('btnOpenRecord')?.addEventListener('click', ()=>{
      if(!quote?.record_id) return;
      location.href = `record.html?id=${encodeURIComponent(quote.record_id)}`;
    });

    $('btnUnlock')?.addEventListener('click', onUnlockClick);
    $('btnSave')?.addEventListener('click', saveAll);

    $('status')?.addEventListener('change', ()=>{
      if(!canEdit()) return renderQuoteHeader();
      quote.status = $('status').value;
      markDirty();
      renderQuoteHeader();
    });

    ['sent_at','accepted_at','delivery_days','delivery_date','notes'].forEach(id=>{
      $(id)?.addEventListener('input', ()=>{
        if(!canEdit()) return renderQuoteHeader();
        quote[id] = $(id).value || null;
        markDirty();
        renderQuoteHeader();
      });
      $(id)?.addEventListener('change', ()=>{
        if(!canEdit()) return renderQuoteHeader();
        quote[id] = $(id).value || null;
        markDirty();
        renderQuoteHeader();
      });
    });

    window.addEventListener('beforeunload', (e)=>{
      if(!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function onUnlockClick(){
    clearErr();
    if(editUnlocked){
      editUnlocked = false;
      updateEditMode();
      return;
    }

    if(!EDIT_PASSWORD){
      editUnlocked = true;
      updateEditMode();
      showOk('Modifica sbloccata');
      return;
    }

    const typed = window.prompt('Inserisci password preventivi');
    if(typed === null) return;
    if(String(typed) !== EDIT_PASSWORD){
      showErr('Password errata.');
      return;
    }

    editUnlocked = true;
    updateEditMode();
    showOk('Modifica sbloccata');
  }

  function canEdit(){
    return !!editUnlocked;
  }

  function markDirty(){ dirty = true; }
  function clearDirty(){ dirty = false; }

  function updateEditMode(){
    const locked = !canEdit();
    document.body.classList.toggle('view-locked', locked);

    const state = $('lockState');
    if(state){
      state.textContent = locked ? 'BLOCCATO' : 'SBLOCCATO';
      state.className = 'badge lock-badge ' + (locked ? 'bg-secondary' : 'bg-success');
    }

    const btnUnlock = $('btnUnlock');
    if(btnUnlock) btnUnlock.textContent = locked ? 'Sblocca modifiche' : 'Blocca modifiche';

    const btnSave = $('btnSave');
    if(btnSave) btnSave.disabled = locked;

    ['status','sent_at','accepted_at','delivery_days','delivery_date','notes'].forEach(id=>{
      const el = $(id);
      if(el) el.disabled = locked;
    });

    renderTasks();
  }

  function renderAll(){
    renderQuoteHeader();
    renderTasks();
    recalcTotals();
  }

  function renderQuoteHeader(){
    $('recCliente').textContent = record?.cliente || '—';
    $('recDesc').textContent = record?.descrizione || '—';
    $('recModel').textContent = record?.modello ? `Modello: ${record.modello}` : '';
    $('quoteId').textContent = quote?.id || 'Nuovo preventivo (non salvato)';

    const st = quote?.status || 'BOZZA';
    $('status').value = st;

    const badge = $('quoteStatusBadge');
    if(badge){
      badge.textContent = st;
      badge.className = 'badge ' + (st==='ACCETTATO' ? 'bg-success' : st==='INVIATO' ? 'bg-primary' : st==='ANNULLATO' ? 'bg-danger' : 'bg-secondary');
    }

    $('sent_at').value = quote?.sent_at || '';
    $('accepted_at').value = quote?.accepted_at || '';
    $('delivery_days').value = (quote?.delivery_days ?? '');
    $('delivery_date').value = quote?.delivery_date || '';
    $('notes').value = quote?.notes || '';
    $('dueLabel').textContent = computeDueLabel(quote||{});
  }

  function renderTasks(){
    const tb = $('taskRows');
    if(!tb) return;
    tb.innerHTML = '';

    WORKS.forEach((w, idx)=>{
      const item = itemsByCode.get(w.code);
      const checked = !!item;
      const locked = !canEdit();

      const tr = document.createElement('tr');

      const tdDesc = document.createElement('td');
      if(w.free){
        const inp = document.createElement('input');
        inp.className = 'form-control';
        inp.placeholder = 'Descrizione lavorazione libera…';
        inp.value = (item?.description ?? '') || '';
        inp.disabled = locked || !checked;
        inp.addEventListener('input', ()=>{
          const it = itemsByCode.get(w.code);
          if(!it || locked) return;
          it.description = inp.value;
          markDirty();
        });
        tdDesc.appendChild(inp);
      } else {
        tdDesc.textContent = w.text;
      }
      tr.appendChild(tdDesc);

      const tdCode = document.createElement('td');
      tdCode.className = 'text-muted fw-semibold nowrap';
      tdCode.textContent = w.code;
      tr.appendChild(tdCode);

      const tdC = document.createElement('td');
      tdC.className = 'text-center';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'form-check-input';
      cb.checked = checked;
      cb.disabled = locked;
      cb.addEventListener('change', ()=>{
        if(locked){ cb.checked = checked; return; }
        if(cb.checked){
          const baseDesc = w.free ? '' : w.text;
          itemsByCode.set(w.code, {
            id: dbItemIdsByCode.get(w.code) || null,
            rip_code: w.code,
            description: item?.description || baseDesc,
            unit_price_ex_vat: Number(item?.unit_price_ex_vat || 0),
            qty: 1,
            work_status: item?.work_status || 'DA_FARE',
            operatore: item?.operatore || '',
            started_at: item?.started_at || null,
            finished_at: item?.finished_at || null,
          });
          deletedItemIds.delete(dbItemIdsByCode.get(w.code));
        } else {
          const dbId = dbItemIdsByCode.get(w.code);
          if(dbId) deletedItemIds.add(dbId);
          itemsByCode.delete(w.code);
        }
        markDirty();
        renderTasks();
        recalcTotals();
      });
      tdC.appendChild(cb);
      tr.appendChild(tdC);

      const tdPrice = document.createElement('td');
      tdPrice.className = 'text-end';
      const price = document.createElement('input');
      price.type = 'text';
      price.inputMode = 'decimal';
      price.className = 'form-control text-end';
      price.placeholder = '0,00';
      price.value = item ? fmtMoney(item.unit_price_ex_vat) : '';
      price.disabled = locked || !checked;
      price.addEventListener('input', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it || locked) return;
        it.unit_price_ex_vat = parseNum(price.value);
        markDirty();
        recalcTotals();
      });
      price.addEventListener('blur', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it) return;
        price.value = fmtMoney(it.unit_price_ex_vat);
      });
      tdPrice.appendChild(price);
      tr.appendChild(tdPrice);

      const tdSt = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'form-select';
      STATUS.forEach(s=>{
        const o = document.createElement('option');
        o.value = s.v;
        o.textContent = s.label;
        sel.appendChild(o);
      });
      sel.value = item?.work_status || 'DA_FARE';
      sel.disabled = locked || !checked;
      sel.addEventListener('change', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it || locked) return;
        it.work_status = sel.value;
        markDirty();
        recalcTotals();
        renderTasks();
      });
      tdSt.appendChild(sel);
      tr.appendChild(tdSt);

      const tdOper = document.createElement('td');
      const oper = document.createElement('input');
      oper.type = 'text';
      oper.className = 'form-control';
      oper.placeholder = 'Operatore';
      oper.value = item?.operatore || '';
      oper.disabled = locked || !checked;
      oper.addEventListener('input', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it || locked) return;
        it.operatore = oper.value;
        markDirty();
      });
      tdOper.appendChild(oper);
      tr.appendChild(tdOper);

      const tdStart = document.createElement('td');
      const start = document.createElement('input');
      start.type = 'date';
      start.className = 'form-control';
      start.value = item?.started_at || '';
      start.disabled = locked || !checked;
      start.addEventListener('change', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it || locked) return;
        it.started_at = start.value || null;
        markDirty();
      });
      tdStart.appendChild(start);
      tr.appendChild(tdStart);

      const tdEnd = document.createElement('td');
      const end = document.createElement('input');
      end.type = 'date';
      end.className = 'form-control';
      end.value = item?.finished_at || '';
      end.disabled = locked || !checked;
      end.addEventListener('change', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it || locked) return;
        it.finished_at = end.value || null;
        markDirty();
      });
      tdEnd.appendChild(end);
      tr.appendChild(tdEnd);

      const tdProg = document.createElement('td');
      const meta = statusMeta(item?.work_status || 'DA_FARE');
      const pct = checked ? meta.pct : 0;
      const bar = document.createElement('div');
      bar.className = 'linebar';
      const fill = document.createElement('div');
      const wPct = checked ? Math.max(5, pct) : 0;
      fill.style.width = checked ? `${wPct}%` : '0%';
      fill.className = `st-${meta.v}`;
      bar.appendChild(fill);
      const lab = document.createElement('div');
      lab.className = 'small text-muted mt-1';
      lab.textContent = checked ? `${pct}%` : '';
      tdProg.appendChild(bar);
      tdProg.appendChild(lab);
      tr.appendChild(tdProg);

      tb.appendChild(tr);
    });
  }

  function recalcTotals(){
    let subtotal = 0;
    let wSum = 0;
    let wProg = 0;

    WORKS.forEach(w=>{
      const it = itemsByCode.get(w.code);
      if(!it) return;
      const price = Number(it.unit_price_ex_vat||0);
      const qty = Number(it.qty||1);
      const lineTotal = price * qty;
      subtotal += lineTotal;

      const pct = statusMeta(it.work_status).pct;
      wSum += lineTotal;
      wProg += lineTotal * (pct/100);
    });

    const vat = subtotal * (VAT_RATE/100);
    const grand = subtotal + vat;
    const prog = wSum>0 ? (wProg / wSum) * 100 : 0;

    $('subtotal').textContent = `€ ${fmtMoney(subtotal)}`;
    $('vat').textContent = `€ ${fmtMoney(vat)}`;
    $('grand').textContent = `€ ${fmtMoney(grand)}`;
    $('quoteProgressTxt').textContent = `${Math.round(prog)}%`;
    const pb = $('quoteProgBar');
    if(pb) pb.style.width = `${Math.max(0, Math.min(100, prog))}%`;

    quote.subtotal_ex_vat = subtotal;
    quote.vat_rate = VAT_RATE;
    quote.vat_total = vat;
    quote.grand_total = grand;
    quote.progress_percent = prog;
  }

  async function saveAll(){
    clearErr();
    if(!canEdit()){
      showErr('Preventivo bloccato: serve password per salvare o modificare.');
      return;
    }

    try{
      quote.status = $('status').value || 'BOZZA';
      quote.sent_at = $('sent_at').value || null;
      quote.accepted_at = $('accepted_at').value || null;
      quote.delivery_days = $('delivery_days').value ? parseInt($('delivery_days').value, 10) : null;
      quote.delivery_date = $('delivery_date').value || null;
      quote.notes = $('notes').value || null;
      recalcTotals();

      if(!quote.id){
        await createQuoteOnSave();
      } else {
        const qPayload = {
          status: quote.status || 'BOZZA',
          sent_at: quote.sent_at || null,
          accepted_at: quote.accepted_at || null,
          delivery_days: quote.delivery_days ?? null,
          delivery_date: quote.delivery_date || null,
          notes: quote.notes || null,
          subtotal_ex_vat: quote.subtotal_ex_vat || 0,
          vat_rate: VAT_RATE,
          vat_total: quote.vat_total || 0,
          grand_total: quote.grand_total || 0,
          progress_percent: quote.progress_percent || 0,
        };
        const { error } = await sb.from('quotes').update(qPayload).eq('id', quote.id);
        if(error) throw error;
      }

      for(const id of deletedItemIds){
        const { error } = await sb.from('quote_items').delete().eq('id', id);
        if(error) throw error;
      }
      deletedItemIds = new Set();

      for(const [code, it] of itemsByCode.entries()){
        const w = WORKS.find(x=>x.code===code);
        const pct = statusMeta(it.work_status).pct;
        const lineTotal = Number(it.unit_price_ex_vat||0) * Number(it.qty||1);
        const idx = WORKS.findIndex(x=>x.code===code);
        const description = w?.free ? (it.description || `${code} ${w.text}`) : `${code} ${w?.text || it.description || ''}`.trim();
        const payload = {
          quote_id: quote.id,
          position: idx,
          rip_code: code,
          description,
          qty: 1,
          unit_price_ex_vat: Number(it.unit_price_ex_vat||0),
          line_total_ex_vat: lineTotal,
          line_progress_percent: pct,
          work_status: it.work_status || 'DA_FARE',
          operatore: it.operatore || null,
          started_at: it.started_at || null,
          finished_at: it.finished_at || null,
        };

        if(it.id){
          const { error } = await sb.from('quote_items').update(payload).eq('id', it.id);
          if(error) throw error;
        } else {
          const { data, error } = await sb.from('quote_items').insert(payload).select().single();
          if(error) throw error;
          it.id = data.id;
          dbItemIdsByCode.set(code, data.id);
        }
      }

      await loadItems();
      recalcTotals();
      renderAll();
      clearDirty();
      showOk('Salvato');
    }catch(e){
      showErr(e?.message||e);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
