/* Preventivo — editor (NUOVA IMPLEMENTAZIONE)
   - Prezzi LIBERI (IVA esclusa)
   - IVA fissa 22%
   - Elenco lavorazioni RIP fisso (cliccabile)
   - Stato riga (Opzione A): DA_FARE / IN_LAVORAZIONE / COMPLETATA
   - Barra avanzamento per riga: ROSSA / GIALLA / VERDE
*/

(function(){
  const VAT_RATE = 22;

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
  function showOk(msg){ const el=$('okBanner'); if(el){ el.textContent=msg; el.classList.remove('d-none'); setTimeout(()=>{ try{ el.classList.add('d-none'); }catch{} }, 1400); } }

  function parseNum(v){
    if(v===null||v===undefined) return 0;
    const s = (''+v).replace(',', '.').trim();
    const x = Number(s);
    return isFinite(x) ? x : 0;
  }

  function fmtMoney(n){
    const x = Number(n||0);
    return x.toLocaleString('it-IT', { minimumFractionDigits:2, maximumFractionDigits:2 });
  }

  function statusMeta(v){ return STATUS.find(x=>x.v===v) || STATUS[0]; }
  function deriveStatus(it){
    if(!it) return 'DA_FARE';
    if(it.finished_at) return 'COMPLETATA';
    if(it.started_at) return 'IN_LAVORAZIONE';
    return it.work_status || 'DA_FARE';
  }

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

  let sb;
  let quote=null;
  let record=null;
  let itemsByCode = new Map(); // code -> item

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
        await loadOrCreateQuoteForRecord(record_id);
      } else {
        showErr('Manca id preventivo o record_id.');
        return;
      }

      await loadRecord();
      await loadItems();
      bindUI();
      renderAll();

    }catch(e){
      showErr('Errore inizializzazione preventivo: ' + (e?.message||e));
    }
  }

  async function loadQuoteById(id){
    const { data, error } = await sb.from('quotes').select('*').eq('id', id).single();
    if(error) throw error;
    quote = data;
  }


  async function chooseBestQuoteForRecord(record_id){
    const { data, error } = await sb
      .from('quotes')
      .select('*')
      .eq('record_id', String(record_id));
    if(error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const norm = (v)=> String(v || '').trim().toUpperCase();
    const active = rows.filter(r => norm(r.status) !== 'ANNULLATO');
    if(!active.length) return null;

    const scoreDate = (r)=> new Date(r.accepted_at || r.sent_at || r.updated_at || r.created_at || 0).getTime();
    const scoreDraftDate = (r)=> new Date(r.updated_at || r.created_at || 0).getTime();

    const sentOrAccepted = active
      .filter(r => ['INVIATO','ACCETTATO'].includes(norm(r.status)))
      .sort((a,b)=> scoreDate(b)-scoreDate(a));
    if(sentOrAccepted.length) return sentOrAccepted[0];

    const ids = active.map(r=>r.id).filter(Boolean);
    let counts = new Map();
    if(ids.length){
      const { data: itemsData } = await sb
        .from('quote_items')
        .select('quote_id')
        .in('quote_id', ids);
      for(const row of (itemsData||[])){
        const k = row.quote_id;
        counts.set(k, (counts.get(k)||0)+1);
      }
    }

    const isMeaningful = (r)=> {
      const n = counts.get(r.id) || 0;
      return n > 0 || Number(r.subtotal_ex_vat||0) > 0 || Number(r.grand_total||0) > 0 || !!r.sent_at || !!r.accepted_at;
    };

    const drafts = active.filter(r => norm(r.status) === 'BOZZA' || !norm(r.status));
    const meaningfulDrafts = drafts.filter(isMeaningful).sort((a,b)=> scoreDraftDate(b)-scoreDraftDate(a));
    if(meaningfulDrafts.length) return meaningfulDrafts[0];

    return drafts.sort((a,b)=> scoreDraftDate(b)-scoreDraftDate(a))[0] || null;
  }

  async function loadOrCreateQuoteForRecord(record_id){
    // Comportamento definitivo richiesto:
    // 1) Se esiste un preventivo INVIATO o ACCETTATO -> apri quello più recente
    // 2) Altrimenti, se esiste una BOZZA -> apri l'ultima BOZZA
    // 3) Se non esiste nulla -> crea una nuova BOZZA
    // Nota: carichiamo tutte le righe del record e decidiamo in JS per evitare filtri DB troppo rigidi.

    quote = await chooseBestQuoteForRecord(record_id);

    // 3) Se non esiste nulla, crea una BOZZA nuova
    if(!quote){
      quote = await createNewQuote(record_id);
    }

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
      status:'BOZZA',
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
    (data||[]).forEach(x=>{
      const code = x.rip_code || (String(x.description||'').trim().split(' ')[0] || '').trim();
      if(code){
        itemsByCode.set(code, {
          id: x.id,
          rip_code: code,
          description: x.description,
          unit_price_ex_vat: x.unit_price_ex_vat,
          qty: x.qty,
          work_status: x.work_status || 'DA_FARE',
          operator_department: x.operator_department || '',
          started_at: x.started_at || '',
          finished_at: x.finished_at || ''
        });
      }
    });
  }

  function bindUI(){
    $('btnBack')?.addEventListener('click', ()=> history.back());
    $('btnOpenRecord')?.addEventListener('click', ()=>{
      if(!quote?.record_id) return;
      location.href = `record.html?id=${encodeURIComponent(quote.record_id)}`;
    });

    $('btnSave')?.addEventListener('click', saveAll);

    $('status')?.addEventListener('change', ()=>{
      quote.status = $('status').value;
      renderQuoteHeader();
    });

    ['sent_at','accepted_at','delivery_days','delivery_date','notes'].forEach(id=>{
      $(id)?.addEventListener('change', ()=>{
        quote[id] = $(id).value || null;
        renderQuoteHeader();
      });
    });
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
    $('quoteId').textContent = quote?.id || '—';

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

      const tr = document.createElement('tr');

      // lavorazione / descrizione (prima)
      const tdDesc = document.createElement('td');
      if(w.free){
        const inp = document.createElement('input');
        inp.className = 'form-control';
        inp.placeholder = 'Descrizione lavorazione libera…';
        inp.value = (item?.description ?? '') || '';
        inp.disabled = !checked;
        inp.addEventListener('input', ()=>{
          if(!itemsByCode.get(w.code)) return;
          itemsByCode.get(w.code).description = inp.value;
          recalcTotals();
        });
        tdDesc.appendChild(inp);
      } else {
        tdDesc.textContent = `${w.text}`;
      }
      tr.appendChild(tdDesc);

      // codice RIP (dopo descrizione)
      const tdCode = document.createElement('td');
      tdCode.className = 'text-muted fw-semibold nowrap';
      tdCode.textContent = w.code;
      tr.appendChild(tdCode);

      // checkbox (dopo codice)
      const tdC = document.createElement('td');
      tdC.className = 'text-center';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'form-check-input';
      cb.checked = checked;
      cb.addEventListener('change', async ()=>{
        try{
          if(cb.checked){
            await ensureItem(w, idx);
          } else {
            await removeItem(w.code);
          }
          await loadItems();
          renderTasks();
          recalcTotals();
        } catch(e){
          showErr(e?.message||e);
        }
      });
      tdC.appendChild(cb);
      tr.appendChild(tdC);

      // prezzo
      const tdPrice = document.createElement('td');
      tdPrice.className = 'text-end';
      const price = document.createElement('input');
      price.type = 'text';
      price.inputMode = 'decimal';
      price.className = 'form-control text-end';
      price.placeholder = '0,00';
      price.value = item ? fmtMoney(item.unit_price_ex_vat) : '';
      price.disabled = !checked;
      price.addEventListener('input', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it) return;
        it.unit_price_ex_vat = parseNum(price.value);
        recalcTotals();
      });
      price.addEventListener('blur', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it) return;
        price.value = fmtMoney(it.unit_price_ex_vat);
      });
      tdPrice.appendChild(price);
      tr.appendChild(tdPrice);

      // operatore / reparto
      const tdOp = document.createElement('td');
      const op = document.createElement('input');
      op.type = 'text';
      op.className = 'form-control';
      op.placeholder = 'Operatore / Reparto';
      op.value = item?.operator_department || '';
      op.disabled = !checked;
      op.addEventListener('input', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it) return;
        it.operator_department = op.value;
      });
      tdOp.appendChild(op);
      tr.appendChild(tdOp);

      // data inizio
      const tdStart = document.createElement('td');
      const startInp = document.createElement('input');
      startInp.type = 'date';
      startInp.className = 'form-control';
      startInp.value = item?.started_at || '';
      startInp.disabled = !checked;
      startInp.addEventListener('change', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it) return;
        it.started_at = startInp.value || '';
        if(it.finished_at && !it.started_at) it.started_at = it.finished_at;
        it.work_status = deriveStatus(it);
        renderTasks();
        recalcTotals();
      });
      tdStart.appendChild(startInp);
      tr.appendChild(tdStart);

      // data fine
      const tdEnd = document.createElement('td');
      const endInp = document.createElement('input');
      endInp.type = 'date';
      endInp.className = 'form-control';
      endInp.value = item?.finished_at || '';
      endInp.disabled = !checked;
      endInp.addEventListener('change', ()=>{
        const it = itemsByCode.get(w.code);
        if(!it) return;
        it.finished_at = endInp.value || '';
        if(it.finished_at && !it.started_at) it.started_at = it.finished_at;
        it.work_status = deriveStatus(it);
        renderTasks();
        recalcTotals();
      });
      tdEnd.appendChild(endInp);
      tr.appendChild(tdEnd);

      // stato (derivato dalle date)
      const tdSt = document.createElement('td');
      const currentStatus = checked ? deriveStatus(item) : 'DA_FARE';
      const stBadge = document.createElement('span');
      stBadge.className = 'badge ' + (currentStatus==='COMPLETATA' ? 'bg-success' : currentStatus==='IN_LAVORAZIONE' ? 'text-dark bg-warning' : 'bg-danger');
      stBadge.textContent = currentStatus.replaceAll('_',' ');
      tdSt.appendChild(stBadge);
      tr.appendChild(tdSt);

      // avanzamento bar
      const tdProg = document.createElement('td');
      const meta = statusMeta(currentStatus);
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

  async function ensureItem(w, idx){
    if(itemsByCode.get(w.code)) return;

    const desc = w.free ? '' : `${w.text}`;
    const payload = {
      quote_id: quote.id,
      position: idx,
      rip_code: w.code,
      description: desc,
      qty: 1,
      unit_price_ex_vat: 0,
      line_total_ex_vat: 0,
      line_progress_percent: 0,
      work_status: 'DA_FARE',
      operator_department: '',
      started_at: null,
      finished_at: null
    };

    let data, error;
    ({ data, error } = await sb.from('quote_items').insert(payload).select().single());
    if(error){
      // compatibilità con DB non ancora aggiornato: ritenta senza le colonne nuove
      const fallback = {
        quote_id: quote.id,
        position: idx,
        rip_code: w.code,
        description: desc,
        qty: 1,
        unit_price_ex_vat: 0,
        line_total_ex_vat: 0,
        line_progress_percent: 0,
        work_status: 'DA_FARE'
      };
      ({ data, error } = await sb.from('quote_items').insert(fallback).select().single());
    }
    if(error) throw error;

    itemsByCode.set(w.code, {
      id: data.id,
      rip_code: w.code,
      description: data.description,
      unit_price_ex_vat: data.unit_price_ex_vat,
      qty: data.qty,
      work_status: data.work_status,
      operator_department: data.operator_department || '',
      started_at: data.started_at || '',
      finished_at: data.finished_at || ''
    });
  }

  async function removeItem(code){
    const it = itemsByCode.get(code);
    if(!it) return;
    const { error } = await sb.from('quote_items').delete().eq('id', it.id);
    if(error) throw error;
    itemsByCode.delete(code);
  }

  function recalcTotals(){
    // subtotal
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

      const pct = statusMeta(deriveStatus(it)).pct;
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

    // aggiorna quote cache in memoria
    quote.subtotal_ex_vat = subtotal;
    quote.vat_rate = VAT_RATE;
    quote.vat_total = vat;
    quote.grand_total = grand;
    quote.progress_percent = prog;
  }

  async function saveAll(){
    clearErr();
    try{
      // salva quote
      const qPayload = {
        status: quote.status || 'BOZZA',
        sent_at: $('sent_at').value || null,
        accepted_at: $('accepted_at').value || null,
        delivery_days: $('delivery_days').value ? parseInt($('delivery_days').value, 10) : null,
        delivery_date: $('delivery_date').value || null,
        notes: $('notes').value || null,
        subtotal_ex_vat: quote.subtotal_ex_vat || 0,
        vat_rate: VAT_RATE,
        vat_total: quote.vat_total || 0,
        grand_total: quote.grand_total || 0,
        progress_percent: quote.progress_percent || 0,
      };

      {
        const { error } = await sb.from('quotes').update(qPayload).eq('id', quote.id);
        if(error) throw error;
      }

      // salva items selezionati
      const updates = [];
      WORKS.forEach((w, idx)=>{
        const it = itemsByCode.get(w.code);
        if(!it) return;
        const pct = statusMeta(deriveStatus(it)).pct;
        const lineTotal = Number(it.unit_price_ex_vat||0) * Number(it.qty||1);
        updates.push({
          id: it.id,
          position: idx,
          rip_code: w.code,
          description: (w.free ? (it.description||`${w.code} ${w.text}`) : `${w.code} ${w.text}`),
          qty: 1,
          unit_price_ex_vat: Number(it.unit_price_ex_vat||0),
          line_total_ex_vat: lineTotal,
          line_progress_percent: pct,
          work_status: deriveStatus(it),
          operator_department: it.operator_department || null,
          started_at: it.started_at || null,
          finished_at: it.finished_at || null
        });
      });

      // aggiorna in batch
      for(const u of updates){
        let { error } = await sb.from('quote_items').update(u).eq('id', u.id);
        if(error){
          const fallback = {
            position: u.position,
            rip_code: u.rip_code,
            description: u.description,
            qty: u.qty,
            unit_price_ex_vat: u.unit_price_ex_vat,
            line_total_ex_vat: u.line_total_ex_vat,
            line_progress_percent: u.line_progress_percent,
            work_status: u.work_status
          };
          ({ error } = await sb.from('quote_items').update(fallback).eq('id', u.id));
        }
        if(error) throw error;
      }

      showOk('Salvato correttamente');
      await loadItems();
      renderAll();

    }catch(e){
      showErr(e?.message||e);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
