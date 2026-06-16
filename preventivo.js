(function(){
  const VAT_RATE = 22;
  const WORKS = [
    { code:'RIP05', text:'SMONTAGGIO COMPLETO DEL MOTORE SISTEMATICO' },
    { code:'RIP29', text:'LAVAGGIO COMPONENTI, E TRATTAMENTO TERMICO AVVOLGIMENTI' },
    { code:'RIP06', text:'VERIFICHE MECCANICHE ALBERI E ALLOGIAMENTO CUSCINETTI E VERIFICHE ELETTRICHE AVVOLGIMENTI' },
    { code:'RIP07', text:'TORNITURA, SMICATURA ED EQUILIBRATURA ROTORE' },
    { code:'RIP22', text:'SOSTITUZIONE COLLETTORE CON RECUPERO AVVOLGIMENTO' },
    { code:'RIP01', text:'AVVOLGIMENTO INDOTTO CON RECUPERO COLLETTORE' },
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
  function showErr(msg){
    const el = $('errBanner');
    if(el){
      el.textContent = msg;
      el.classList.remove('d-none');
    }else{
      alert(msg);
    }
  }
  function clearErr(){
    const el = $('errBanner');
    if(el){
      el.classList.add('d-none');
      el.textContent = '';
    }
  }
  function showOk(msg){
    const el = $('okBanner');
    if(el){
      el.textContent = msg;
      el.classList.remove('d-none');
      setTimeout(()=>{ try{ el.classList.add('d-none'); }catch{} }, 1800);
    }
  }
  function parseNum(v){
    const raw = String(v ?? '').trim().replace(',', '.');
    const x = Number(raw);
    return isFinite(x) ? x : 0;
  }
  function fmtMoney(n){
    return Number(n || 0).toLocaleString('it-IT', {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    });
  }
  function statusMeta(v){ return STATUS.find(x => x.v === v) || STATUS[0]; }
  function today0(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
  function esc(s){
    return (s ?? '').toString()
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }
  function fmtDateISO(d){
    const x = (d instanceof Date) ? d : new Date(d);
    if(isNaN(x.getTime())) return '—';
    return `${String(x.getDate()).padStart(2,'0')}/${String(x.getMonth()+1).padStart(2,'0')}/${x.getFullYear()}`;
  }

  const PREVENTIVI_LIST_URL = 'https://grafiume.github.io/schedaofficina/preventivi.html';
  const MAIN_INDEX_URL = 'https://grafiume.github.io/schedaofficina/index.html';


  function getFreeDefaultDescription(code){
    return code === 'RIP00' ? 'LAVORAZIONE LIBERA' : 'LAVORAZIONE LIBERA';
  }
  function normalizeFreeDescription(code, value){
    const txt = String(value ?? '').trim();
    return txt || getFreeDefaultDescription(code);
  }

  function computeDueInfo(q){
    const now = today0();
    let expected = null;

    if(q.delivery_date){
      expected = new Date(q.delivery_date);
      expected.setHours(0,0,0,0);
    } else if(Number.isFinite(+q.delivery_days) && +q.delivery_days > 0){
      const base = q.accepted_at || q.sent_at || new Date().toISOString();
      expected = new Date(base);
      expected.setHours(0,0,0,0);
      expected.setDate(expected.getDate() + (+q.delivery_days));
    }

    if(!expected || isNaN(expected.getTime())){
      return { text:'Nessuna scadenza impostata', cls:'text-muted' };
    }

    const diff = Math.round((expected.getTime() - now.getTime()) / (1000*60*60*24));

    if(diff < 0){
      return { text:`${q.is_urgent ? 'URGENTE • ' : ''}in ritardo di ${Math.abs(diff)} gg • scadenza ${fmtDateISO(expected)}`, cls:'text-danger fw-semibold' };
    }
    if(diff === 0){
      return { text:`${q.is_urgent ? 'URGENTE • ' : ''}scade oggi • ${fmtDateISO(expected)}`, cls:q.is_urgent ? 'text-danger fw-semibold' : 'text-warning fw-semibold' };
    }
    if(diff <= 2 || q.is_urgent){
      return { text:`${q.is_urgent ? 'URGENTE • ' : ''}mancano ${diff} gg • scadenza ${fmtDateISO(expected)}`, cls:q.is_urgent ? 'text-danger fw-semibold' : 'text-warning fw-semibold' };
    }
    return { text:`Fine lavori prevista ${fmtDateISO(expected)} • mancano ${diff} gg`, cls:'text-muted' };
  }

  let sb = null;
  let record = null;
  let currentQuoteId = null;
  let quoteState = null;
  let originalState = null;
  let isEditUnlocked = false;
  let isSaving = false;
  let editPassword = '';

  let dictationDebounce = null;
  let dictationMode = 'rips';
  let lastAutoApplied = '';


  async function getCurrentSessionSafe(){
    if(!sb || !sb.auth) return null;
    try{
      const { data } = await sb.auth.getSession();
      return data?.session || null;
    }catch(_e){
      return null;
    }
  }

  function redirectToIndexLogin(){
    try{
      const returnTo = encodeURIComponent(location.pathname + location.search);
      location.href = 'index.html?returnTo=' + returnTo;
    }catch(_e){
      location.href = 'index.html';
    }
  }


  function emptyQuoteState(recordId){
    return {
      id:null,
      record_id:recordId,
      status:'BOZZA',
      sent_at:'',
      accepted_at:'',
      delivery_days:'',
      delivery_date:'',
      notes:'',
      is_urgent:false,
      subtotal_ex_vat:0,
      vat_rate:VAT_RATE,
      vat_total:0,
      grand_total:0,
      progress_percent:0,
      items:{}
    };
  }

  function isDirty(){
    return JSON.stringify(quoteState) !== JSON.stringify(originalState);
  }

  function getSelectedItems(){
    return WORKS.map(w => quoteState.items[w.code]).filter(Boolean);
  }

  function hasMeaningfulData(state){
    const items = Object.values(state?.items || {}).filter(it =>
      Number(it?.unit_price_ex_vat || 0) > 0 ||
      !!it?.operatore ||
      !!it?.started_at ||
      !!it?.finished_at ||
      !!it?.description
    ).length;

    return (
      items > 0 ||
      !!state.notes ||
      !!state.sent_at ||
      !!state.accepted_at ||
      !!state.delivery_days ||
      !!state.delivery_date ||
      !!state.is_urgent ||
      Number(state?.subtotal_ex_vat || 0) > 0 ||
      ((state.status || 'BOZZA') !== 'BOZZA')
    );
  }

  async function init(){
    try{
      if(!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
        showErr('Config Supabase mancante.');
        return;
      }

      sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const session = await getCurrentSessionSafe();
      if(!session){
        redirectToIndexLogin();
        return;
      }

      const id = qs().get('id');
      const recordId = qs().get('record_id');

      if(!id && !recordId){
        showErr('Manca id preventivo o record_id.');
        return;
      }

      if(id) await loadQuoteById(id);
      else await loadByRecord(recordId);

      ensureDictationBox();
      bindUI();
      bindDictationButtons();
      recalcTotals();
      renderAll();

      if(qs().get('preview_pdf') === '1'){
        await openPdfPreviewPopupMode();
        return;
      }
    }catch(e){
      console.error(e);
      showErr('Errore inizializzazione preventivo: ' + (e?.message || e));
    }
  }

  function normalizeRipCode(value){
    return String(value || '').toUpperCase().replace(/\s+/g, '');
  }

  async function buildStateFromQuoteRow(data){
    const state = emptyQuoteState(data.record_id);

    Object.assign(state, {
      id:data.id,
      status:data.status || 'BOZZA',
      sent_at:data.sent_at || '',
      accepted_at:data.accepted_at || '',
      delivery_days:data.delivery_days ?? '',
      delivery_date:data.delivery_date || '',
      notes:data.notes || '',
      is_urgent:!!data.is_urgent,
      subtotal_ex_vat:Number(data.subtotal_ex_vat || 0),
      vat_rate:Number(data.vat_rate || VAT_RATE),
      vat_total:Number(data.vat_total || 0),
      grand_total:Number(data.grand_total || 0),
      progress_percent:Number(data.progress_percent || 0)
    });

    const { data:items, error } = await sb
      .from('quote_items')
      .select('*')
      .eq('quote_id', data.id)
      .order('position', { ascending:true });

    if(error) throw error;

    (items || []).forEach((x, idx)=>{
      const rawCode = x.rip_code || x.code || x.codice || x.item_code || x.sku || WORKS[idx]?.code || '';
      const code = normalizeRipCode(rawCode) || WORKS[idx]?.code || '';
      if(!code || !WORKS.some(w => w.code === code)) return;

      state.items[code] = {
        id:x.id,
        rip_code:code,
        position:Number.isFinite(+x.position) ? +x.position : idx,
        description:x.description || '',
        qty:Number(x.qty || 1),
        unit_price_ex_vat:Number(x.unit_price_ex_vat || 0),
        line_total_ex_vat:Number(x.line_total_ex_vat || 0),
        line_progress_percent:Number(x.line_progress_percent || 0),
        work_status:x.work_status || 'DA_FARE',
        operatore:x.operatore || '',
        started_at:x.started_at || '',
        finished_at:x.finished_at || ''
      };
    });

    return state;
  }

  async function loadQuoteById(id){
    const { data, error } = await sb
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single();

    if(error) throw error;

    currentQuoteId = data.id;
    await loadRecordData(data.record_id);
    quoteState = await buildStateFromQuoteRow(data);
    originalState = clone(quoteState);
  }

  async function loadByRecord(recordId){
    await loadRecordData(recordId);

    const { data, error } = await sb
      .from('quotes')
      .select('*, quote_items(id)')
      .eq('record_id', recordId)
      .order('created_at', { ascending:false })
      .limit(20);

    if(error) throw error;

    const meaningful = (data || []).find(q =>
      Number(q.subtotal_ex_vat || 0) > 0 ||
      !!q.notes ||
      !!q.sent_at ||
      !!q.accepted_at ||
      !!q.delivery_days ||
      !!q.delivery_date ||
      !!q.is_urgent ||
      ((q.status || 'BOZZA') !== 'BOZZA') ||
      (Array.isArray(q.quote_items) && q.quote_items.length > 0)
    );

    if(meaningful){
      currentQuoteId = meaningful.id;
      quoteState = await buildStateFromQuoteRow(meaningful);
      originalState = clone(quoteState);

      try{
        const u = new URL(location.href);
        u.searchParams.delete('record_id');
        u.searchParams.set('id', meaningful.id);
        history.replaceState({}, '', u.toString());
      }catch{}

      return;
    }

    currentQuoteId = null;
    quoteState = emptyQuoteState(recordId);
    originalState = clone(quoteState);
  }

  async function loadRecordData(recordId){
    const { data, error } = await sb
      .from('records')
      .select('*')
      .eq('id', recordId)
      .single();

    if(error) throw error;
    record = data;
  }

  function bindUI(){
    $('btnBack')?.addEventListener('click', ()=>{
      location.href = PREVENTIVI_LIST_URL;
    });

    $('btnMainIndex')?.addEventListener('click', ()=>{
      location.href = MAIN_INDEX_URL;
    });

    $('btnOpenRecord')?.addEventListener('click', ()=>{
      if(record?.id){
        location.href = `record.html?id=${encodeURIComponent(record.id)}`;
      }
    });

    $('btnSave')?.addEventListener('click', saveAll);
    $('btnDelete')?.addEventListener('click', deleteQuote);
    $('btnUnlock')?.addEventListener('click', unlockEdit);
    $('btnPdf')?.addEventListener('click', downloadQuotePdf);
    $('btnInvia')?.addEventListener('click', sendQuoteUnified);

    ['status','sent_at','accepted_at','delivery_days','delivery_date','notes'].forEach(id=>{
      $(id)?.addEventListener('input', ()=>{
        quoteState[id] = $(id).value || '';

        if(id === 'sent_at' && $(id).value){
          quoteState.status = 'INVIATO';
          if($('status')) $('status').value = 'INVIATO';
        }
        if(id === 'accepted_at' && $(id).value){
          quoteState.status = 'ACCETTATO';
          if($('status')) $('status').value = 'ACCETTATO';
        }

        touch();
      });
      $(id)?.addEventListener('change', ()=>{
        quoteState[id] = $(id).value || '';

        if(id === 'sent_at' && $(id).value){
          quoteState.status = 'INVIATO';
          if($('status')) $('status').value = 'INVIATO';
        }
        if(id === 'accepted_at' && $(id).value){
          quoteState.status = 'ACCETTATO';
          if($('status')) $('status').value = 'ACCETTATO';
        }

        touch();
      });
    });

    $('is_urgent')?.addEventListener('change', ()=>{
      const urgentEl = $('is_urgent');
      quoteState.is_urgent = !!(urgentEl && urgentEl.checked);
      touch();
      renderTasks();
    });

    window.addEventListener('beforeunload', ev=>{
      if(isSaving || !isDirty()) return;
      ev.preventDefault();
      ev.returnValue = '';
    });
  }

  function bindDictationButtons(){
    [
      ['btnDictateRips', 'rips'],
      ['btnDictateTotal', 'total'],
      ['btnDictateRips2', 'rips'],
      ['btnDictateTotal2', 'total']
    ].forEach(([id, mode])=>{
      const btn = $(id);
      if(!btn) return;
      btn.disabled = !isEditUnlocked;
      btn.onclick = (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        openDictationBox(mode);
      };
    });
  }

  async function unlockEdit(){
    clearErr();

    const p = prompt('Inserisci password per modificare il preventivo');
    if(p === null) return;

    try{
      const { data, error } = await sb.rpc('quote_can_edit', {
        p_password: String(p)
      });

      if(error) throw error;

      if(data !== true){
        showErr('Password errata.');
        return;
      }

      editPassword = String(p);
      isEditUnlocked = true;
      renderEditState();
      bindDictationButtons();
      showOk('Modifica sbloccata');
    }catch(e){
      showErr('Errore verifica password: ' + (e?.message || e));
    }
  }

  function renderEditState(){
    document.body.classList.toggle('edit-unlocked', isEditUnlocked);

    if($('btnSave')) $('btnSave').disabled = !isEditUnlocked;
    if($('btnDelete')) $('btnDelete').disabled = !currentQuoteId || !isEditUnlocked;
    if($('btnUnlock')) $('btnUnlock').textContent = isEditUnlocked ? '🔓 Modifica attiva' : '🔒 Sblocca modifiche';

    const lock = $('lockState');
    if(lock){
      lock.textContent = isEditUnlocked ? 'MODIFICA ATTIVA' : 'SOLO LETTURA';
      lock.className = 'top-pill ' + (isEditUnlocked ? 'green' : 'gray');
    }

    ['status','sent_at','accepted_at','delivery_days','delivery_date','notes','is_urgent'].forEach(id=>{
      const el = $(id);
      if(!el) return;
      el.disabled = !isEditUnlocked;
    });

    document.querySelectorAll('[data-editable="1"]').forEach(el=>{
      el.disabled = !isEditUnlocked;
    });

    document.querySelectorAll('.btn-dictation').forEach(el=>{
      el.disabled = !isEditUnlocked;
    });
  }

  function touch(){
    recalcTotals();
    renderQuoteHeader();
    renderDirtyState();
  }

  function renderDirtyState(){
    const dirty = isDirty();
    $('dirtyState').textContent = dirty ? 'Modifiche non salvate' : 'Salvato';
    $('dirtyState').className = 'label ' + (dirty ? 'text-danger' : '');
  }

  function renderAll(){
    renderQuoteHeader();
    renderTasks();
    renderEditState();
    renderDirtyState();
  }

  function renderQuoteHeader(){
    $('recCliente').textContent = record?.cliente || '—';
    $('recDesc').textContent = record?.descrizione || '—';
    $('recModel').textContent = record?.modello ? `Modello: ${record.modello}` : '';
    $('quoteId').textContent = quoteState?.id || 'NUOVO (non ancora salvato)';

    const st = quoteState?.status || 'BOZZA';
    $('status').value = st;

    const statusBadge = $('quoteStatusBadge');
    if(statusBadge){
      statusBadge.textContent = st;
      statusBadge.className = 'top-pill ' + (
        st === 'ACCETTATO' ? 'green' :
        st === 'INVIATO' ? 'blue' :
        st === 'ANNULLATO' ? 'red' : 'gray'
      );
    }

    $('sent_at').value = quoteState?.sent_at || '';
    $('accepted_at').value = quoteState?.accepted_at || '';
    $('delivery_days').value = quoteState?.delivery_days ?? '';
    $('delivery_date').value = quoteState?.delivery_date || '';
    $('notes').value = quoteState?.notes || '';

    const urgentEl = $('is_urgent');
    if(urgentEl) urgentEl.checked = !!quoteState?.is_urgent;

    const d = computeDueInfo(quoteState || {});
    $('dueLabel').textContent = d.text;
    $('dueLabel').className = 'due-banner ' + d.cls;

    const miniTop = $('urgentMiniBannerTop');
    if(miniTop){
      miniTop.style.display = quoteState?.is_urgent ? 'inline-flex' : 'none';
    }
  }

  function ensureLocalItem(work, idx){
    const existing = quoteState.items[work.code];
    if(existing) return existing;

    const item = {
      id:null,
      rip_code:work.code,
      position:idx,
      description:work.free ? getFreeDefaultDescription(work.code) : work.text,
      qty:1,
      unit_price_ex_vat:0,
      line_total_ex_vat:0,
      line_progress_percent:0,
      work_status:'DA_FARE',
      operatore:'',
      started_at:'',
      finished_at:''
    };

    quoteState.items[work.code] = item;
    return item;
  }

  function renderTasks(){
    const tb = $('taskRows');
    if(!tb) return;
    tb.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'repairs-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:42px;"></th>
          <th>Voce RIP</th>
          <th style="width:180px;">Stato</th>
          <th style="width:130px;">Prezzo</th>
          <th style="width:150px;">Avanz.</th>
        </tr>
      </thead>
      <tbody></tbody>`;

    const tbody = table.querySelector('tbody');

    WORKS.forEach((w, idx)=>{
      const item = quoteState.items[w.code] || null;
      const checked = !!item;
      const meta = statusMeta(item?.work_status || 'DA_FARE');
      const pct = checked ? meta.pct : 0;

      const tr = document.createElement('tr');
      tr.className = `row-card ${checked ? `row-${meta.v === 'COMPLETATA' ? 'complete' : meta.v === 'IN_LAVORAZIONE' ? 'working' : 'todo'}` : 'row-off'} ${quoteState.is_urgent ? 'row-urgent' : ''}`;

      tr.innerHTML = `
        <td colspan="5">
          <div class="row-inner">
            <div class="check-wrap">
              <input data-editable="1" type="checkbox" class="form-check-input row-check" ${checked ? 'checked' : ''}>
            </div>
            <div class="rip-main">
              <div class="rip-head">
                <span class="badge badge-rip">${esc(w.code)}</span>
                <div class="rip-name">${w.free ? `<input data-editable="1" class="form-control free-desc" placeholder="Descrizione lavorazione libera…" value="${esc(item?.description || getFreeDefaultDescription(w.code))}" ${checked ? '' : 'disabled'}>` : esc(w.text)}</div>
              </div>
              <div class="mini-grid">
                <div class="mini-box">
                  <label>Operatore</label>
                  <input data-editable="1" class="form-control row-operatore" value="${esc(item?.operatore || '')}" placeholder="Operatore" ${checked ? '' : 'disabled'}>
                </div>
                <div class="mini-box">
                  <label>Data inizio</label>
                  <input data-editable="1" type="date" class="form-control row-started" value="${esc(item?.started_at || '')}" ${checked ? '' : 'disabled'}>
                </div>
                <div class="mini-box">
                  <label>Data fine</label>
                  <input data-editable="1" type="date" class="form-control row-finished" value="${esc(item?.finished_at || '')}" ${checked ? '' : 'disabled'}>
                </div>
              </div>
            </div>
            <div class="status-stack">
              <select data-editable="1" class="form-select status-select row-status" ${checked ? '' : 'disabled'}>
                ${STATUS.map(s=>`<option value="${esc(s.v)}" ${(item?.work_status || 'DA_FARE') === s.v ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
              </select>
            </div>
            <div class="price-wrap">
              <input data-editable="1" type="text" inputmode="decimal" class="form-control text-end row-price price-input" placeholder="0,00" value="${checked ? esc(fmtMoney(item.unit_price_ex_vat)) : ''}" ${checked ? '' : 'disabled'}>
            </div>
            <div class="progress-stack">
              <div class="linebar"><div class="st-${meta.v}" style="width:${checked ? Math.max(5, pct) : 0}%"></div></div>
              <div class="progress-pct">${checked ? `${pct}%` : ''}</div>
            </div>
          </div>
        </td>`;

      const check = tr.querySelector('.row-check');
      const price = tr.querySelector('.row-price');
      const status = tr.querySelector('.row-status');
      const operatore = tr.querySelector('.row-operatore');
      const started = tr.querySelector('.row-started');
      const finished = tr.querySelector('.row-finished');
      const freeDesc = tr.querySelector('.free-desc');

      check.addEventListener('change', ()=>{
        if(check.checked) ensureLocalItem(w, idx);
        else delete quoteState.items[w.code];
        recalcTotals();
        renderTasks();
        renderEditState();
        renderDirtyState();
      });

      price.addEventListener('input', ()=>{
        const it = ensureLocalItem(w, idx);
        it.unit_price_ex_vat = parseNum(price.value);
        recalcTotals();
        renderQuoteHeader();
        renderDirtyState();
      });

      price.addEventListener('blur', ()=>{
        if(quoteState.items[w.code]){
          price.value = fmtMoney(quoteState.items[w.code].unit_price_ex_vat);
        }
      });

      status.addEventListener('change', ()=>{
        const it = ensureLocalItem(w, idx);
        it.work_status = status.value;
        if(it.work_status === 'COMPLETATA' && !it.finished_at){
          it.finished_at = new Date().toISOString().slice(0,10);
        }
        recalcTotals();
        renderTasks();
        renderEditState();
        renderDirtyState();
      });

      operatore.addEventListener('input', ()=>{
        const it = ensureLocalItem(w, idx);
        it.operatore = operatore.value;
        renderDirtyState();
      });

      started.addEventListener('change', ()=>{
        const it = ensureLocalItem(w, idx);
        it.started_at = started.value || '';
        renderDirtyState();
      });

      finished.addEventListener('change', ()=>{
        const it = ensureLocalItem(w, idx);
        it.finished_at = finished.value || '';
        renderDirtyState();
      });

      if(freeDesc){
        freeDesc.addEventListener('input', ()=>{
          const it = ensureLocalItem(w, idx);
          it.description = normalizeFreeDescription(w.code, freeDesc.value);
          renderDirtyState();
        });
        freeDesc.addEventListener('blur', ()=>{
          const it = ensureLocalItem(w, idx);
          it.description = normalizeFreeDescription(w.code, freeDesc.value);
          freeDesc.value = it.description;
        });
      }

      tbody.appendChild(tr);
    });

    tb.appendChild(table);
  }

  function recalcTotals(){
    let subtotal = 0;
    let weightedProg = 0;
    let weightedBase = 0;

    getSelectedItems().forEach(it=>{
      const line = Number(it.unit_price_ex_vat || 0) * Number(it.qty || 1);
      it.line_total_ex_vat = line;
      it.line_progress_percent = statusMeta(it.work_status).pct;
      subtotal += line;
      weightedBase += line;
      weightedProg += line * (it.line_progress_percent / 100);
    });

    const vat = subtotal * (VAT_RATE / 100);
    const grand = subtotal + vat;
    const prog = weightedBase > 0 ? (weightedProg / weightedBase) * 100 : 0;

    quoteState.subtotal_ex_vat = subtotal;
    quoteState.vat_rate = VAT_RATE;
    quoteState.vat_total = vat;
    quoteState.grand_total = grand;
    quoteState.progress_percent = prog;

    if($('subtotal')) $('subtotal').textContent = `€ ${fmtMoney(subtotal)}`;
    if($('vat')) $('vat').textContent = `€ ${fmtMoney(vat)}`;
    if($('grand')) $('grand').textContent = `€ ${fmtMoney(grand)}`;
    if($('quoteProgressTxt')) $('quoteProgressTxt').textContent = `${Math.round(prog)}%`;
    if($('quoteProgBar')) $('quoteProgBar').style.width = `${Math.max(0, Math.min(100, prog))}%`;
  }

  function buildQuotePayload(){
    return {
      id: currentQuoteId || null,
      record_id: quoteState.record_id,
      status: quoteState.status || 'BOZZA',
      sent_at: quoteState.sent_at || null,
      accepted_at: quoteState.accepted_at || null,
      delivery_days: quoteState.delivery_days === '' ? null : parseInt(quoteState.delivery_days, 10),
      delivery_date: quoteState.delivery_date || null,
      notes: quoteState.notes || null,
      is_urgent: !!quoteState.is_urgent,
      subtotal_ex_vat: Number(quoteState.subtotal_ex_vat || 0),
      vat_rate: VAT_RATE,
      vat_total: Number(quoteState.vat_total || 0),
      grand_total: Number(quoteState.grand_total || 0),
      progress_percent: Number(quoteState.progress_percent || 0)
    };
  }

  function buildItemsPayload(){
    return WORKS.map((w, idx)=>{
      const it = quoteState.items[w.code];
      if(!it) return null;

      return {
        position: idx,
        rip_code: w.code,
        description: w.free ? normalizeFreeDescription(w.code, it.description) : w.text,
        qty: 1,
        unit_price_ex_vat: Number(it.unit_price_ex_vat || 0),
        line_total_ex_vat: Number(it.line_total_ex_vat || 0),
        line_progress_percent: Number(it.line_progress_percent || 0),
        work_status: it.work_status || 'DA_FARE',
        operatore: it.operatore || null,
        started_at: it.started_at || null,
        finished_at: it.finished_at || null
      };
    }).filter(Boolean);
  }

  async function deleteQuote(){
    if(!currentQuoteId){
      showErr('Questo preventivo non è ancora salvato.');
      return;
    }

    if(!isEditUnlocked || !editPassword){
      showErr('Prima sblocca le modifiche con la password.');
      return;
    }

    const ok = confirm('Vuoi cancellare definitivamente questo preventivo?');
    if(!ok) return;

    clearErr();

    try{
      const { error } = await sb.rpc('delete_quote_with_password', {
        p_password: editPassword,
        p_quote_id: currentQuoteId
      });

      if(error) throw error;

      showOk('Preventivo cancellato');

      const recId = quoteState?.record_id || record?.id;
      currentQuoteId = null;
      quoteState = emptyQuoteState(recId);
      originalState = clone(quoteState);
      renderAll();

      setTimeout(()=>{
        if(recId){
          location.href = 'preventivo.html?record_id=' + encodeURIComponent(recId);
        } else {
          history.back();
        }
      }, 500);
    }catch(e){
      showErr('Errore cancellazione preventivo: ' + (e?.message || e));
    }
  }

  async function saveAll(){
    if(!isEditUnlocked || !editPassword){
      showErr('Prima sblocca le modifiche con la password.');
      return;
    }

    clearErr();
    isSaving = true;

    try{
      recalcTotals();

      if(!hasMeaningfulData(quoteState)){
        showErr('Preventivo non salvato: non ci sono voci RIP o dati utili compilati.');
        return;
      }

      const qPayload = buildQuotePayload();
      const itemsPayload = buildItemsPayload();

      const { data, error } = await sb.rpc('save_quote_with_password', {
        p_password: editPassword,
        p_quote: qPayload,
        p_items: itemsPayload
      });

      if(error) throw error;
      if(!data) throw new Error('Salvataggio non riuscito.');

      currentQuoteId = data;
      quoteState.id = data;

      try{
        const u = new URL(location.href);
        u.searchParams.delete('record_id');
        u.searchParams.set('id', data);
        history.replaceState({}, '', u.toString());
      }catch{}

      const { data: savedRow, error: savedErr } = await sb
        .from('quotes')
        .select('*')
        .eq('id', currentQuoteId)
        .single();

      if(savedErr) throw savedErr;

      quoteState = await buildStateFromQuoteRow(savedRow);
      originalState = clone(quoteState);

      showOk('Preventivo salvato');
      renderAll();
    }catch(e){
      showErr(e?.message || e);
    }finally{
      isSaving = false;
    }
  }

  function ensureDictationBox(){
    if($('dictationOverlay')) return;

    const wrap = document.createElement('div');
    wrap.id = 'dictationOverlay';
    wrap.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(15,23,42,.45);
      display:none;
      align-items:center;
      justify-content:center;
      z-index:99999;
      padding:18px;
    `;

    wrap.innerHTML = `
      <div style="
        width:min(100%,680px);
        background:#fff;
        border-radius:20px;
        box-shadow:0 24px 60px rgba(0,0,0,.18);
        padding:18px;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;">
          <div>
            <div id="dictationBoxTitle" style="font-size:1.1rem;font-weight:800;">Dettatura</div>
            <div id="dictationBoxHelp" style="font-size:.9rem;color:#667085;margin-top:4px;"></div>
          </div>
          <button type="button" id="dictationClose" style="
            border:1px solid #d0d5dd;
            background:#fff;
            border-radius:10px;
            padding:8px 12px;
            font-weight:700;
            cursor:pointer;
          ">Chiudi</button>
        </div>

        <textarea id="dictationLiveInput" rows="4" style="
          width:100%;
          border:1px solid #d0d5dd;
          border-radius:14px;
          padding:12px;
          font-size:16px;
          outline:none;
          resize:vertical;
        "></textarea>

        <div style="margin-top:10px;font-size:.9rem;color:#667085;">
          Il testo resta nella finestra finché non premi Conferma. Puoi correggerlo anche a mano.
        </div>

        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;flex-wrap:wrap;">
          <button type="button" id="dictationCancel" style="border:1px solid #d0d5dd;background:#fff;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;">Annulla</button>
          <button type="button" id="dictationConfirm" style="border:1px solid #ff7a00;background:#ff7a00;color:#fff;border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer;">Conferma</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    $('dictationClose').addEventListener('click', closeDictationBox);
    $('dictationCancel').addEventListener('click', closeDictationBox);
    $('dictationConfirm').addEventListener('click', confirmDictationBox);
    $('dictationLiveInput').addEventListener('input', onDictationTyping);
  }

  function openDictationBox(mode){
    if(!isEditUnlocked){
      showErr('Prima sblocca le modifiche con la password.');
      return;
    }

    const ov = $('dictationOverlay');
    const input = $('dictationLiveInput');
    if(!ov || !input){
      showErr('Finestra dettatura non disponibile.');
      return;
    }

    dictationMode = mode;
    lastAutoApplied = '';

    $('dictationBoxTitle').textContent = mode === 'rips' ? 'Detta voci RIP' : 'Detta totale riparazione';
    $('dictationBoxHelp').textContent = mode === 'rips'
      ? 'Esempio: RIP01 250 RIP02 90 RIP21 45'
      : 'Esempio: 450 euro';

    input.value = '';
    input.placeholder = mode === 'rips'
      ? 'Detta o scrivi qui: RIP01 250 RIP02 90'
      : 'Detta o scrivi qui: 450 euro';

    ov.style.display = 'flex';

    setTimeout(()=>{
      try{ input.focus(); }catch{}
    }, 120);
  }

  function closeDictationBox(){
    clearTimeout(dictationDebounce);
    const ov = $('dictationOverlay');
    if(ov) ov.style.display = 'none';
  }

  function onDictationTyping(){
    clearTimeout(dictationDebounce);
    lastAutoApplied = '';
  }

  function confirmDictationBox(){
    const input = $('dictationLiveInput');
    if(!input){
      showErr('Campo dettatura non disponibile.');
      return;
    }

    const text = String(input.value || '').trim();
    if(!text){
      showErr('Inserisci o detta un contenuto prima di confermare.');
      return;
    }

    const ok = applyDictation(dictationMode, text);
    if(ok){
      lastAutoApplied = text;
      closeDictationBox();
    }
  }

  function applyDictation(mode, transcript){
    const clean = normalizeVoiceText(transcript);
    if(!clean) return false;

    if(mode === 'rips') return applyRipDictation(clean);
    return applyTotalDictation(clean);
  }

  function normalizeVoiceText(text){
    return String(text || '')
      .toUpperCase()
      .replace(/[€]/g, ' EURO ')
      .replace(/,/g, '.')
      .replace(/RIP\s+/g, 'RIP')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function applyRipDictation(clean){
    const validCodes = new Set(WORKS.map(w=>w.code));
    const regex = /(RIP\d{1,2}[A-Z]?)(?:\s+(\d+(?:\.\d+)?))?/g;
    const matches = [...clean.matchAll(regex)];

    if(!matches.length){
      showErr('Nessun codice RIP riconosciuto. Esempio: RIP01 250 RIP02 90');
      return false;
    }

    const applied = [];

    matches.forEach(match=>{
      const code = String(match[1] || '').trim();
      const amount = match[2] != null ? parseNum(match[2]) : null;
      if(!validCodes.has(code)) return;

      const work = WORKS.find(w=>w.code === code);
      const idx = WORKS.findIndex(w=>w.code === code);
      const it = ensureLocalItem(work, idx);

      if(amount !== null && amount > 0){
        it.unit_price_ex_vat = amount;
      }

      applied.push(amount !== null && amount > 0 ? `${code} € ${fmtMoney(amount)}` : code);
    });

    if(!applied.length){
      showErr('I codici dettati non corrispondono alle voci RIP disponibili.');
      return false;
    }

    recalcTotals();
    renderAll();
    showOk('Dettatura acquisita: ' + applied.join(' • '));
    return true;
  }

  function applyTotalDictation(clean){
    const match = clean.match(/(\d+(?:\.\d+)?)/);
    if(!match){
      showErr('Nessun totale riconosciuto. Esempio: 450 euro');
      return false;
    }

    const total = parseNum(match[1]);
    if(!(total > 0)){
      showErr('Totale non valido.');
      return false;
    }

    const hasExisting = getSelectedItems().length > 0;
    if(hasExisting){
      const ok = confirm('Vuoi sostituire le voci attuali con un totale unico di riparazione?');
      if(!ok) return false;
    }

    quoteState.items = {};
    const work = WORKS.find(w=>w.code === 'RIP00');
    const idx = WORKS.findIndex(w=>w.code === 'RIP00');
    const it = ensureLocalItem(work, idx);
    it.description = 'TOTALE RIPARAZIONE';
    it.unit_price_ex_vat = total;
    it.work_status = 'DA_FARE';

    recalcTotals();
    renderAll();
    showOk('Totale riparazione impostato a € ' + fmtMoney(total));
    return true;
  }

  function firstFilled(obj, keys){
    if(!obj) return '';
    for(const key of keys){
      const val = obj[key];
      if(val == null) continue;
      const str = String(val).trim();
      if(str) return str;
    }
    return '';
  }

  function normalizeWhatsAppPhone(value){
    const raw = String(value || '').trim();
    if(!raw) return '';
    let cleaned = raw.replace(/[^\d+]/g, '');
    if(cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
    if(cleaned.startsWith('+')) return cleaned.slice(1);
    if(cleaned.startsWith('3') && cleaned.length >= 9) return '39' + cleaned;
    return cleaned;
  }

  function getClientEmail(){
    return firstFilled(record, ['email','e_mail','mail','cliente_email','email_cliente','pec']);
  }

  function getClientPhone(){
    return firstFilled(record, ['cellulare','telefono','telefono1','telefono_1','telefono_cliente','tel','whatsapp','cell']);
  }

  function getClientDdt(){
    return firstFilled(record, [
      'docTrasporto',
      'doc_trasporto',
      'documento_trasporto',
      'ddt',
      'numero_ddt',
      'n_ddt',
      'ddt_numero',
      'ddt_cliente',
      'rif_ddt',
      'riferimento_ddt'
    ]);
  }

  function getQuoteDateLabel(){
    return quoteState?.sent_at || new Date().toISOString().slice(0,10);
  }

  function getDeliveryEstimateText(){
    const parts = [];
    if(quoteState?.delivery_days !== '' && quoteState?.delivery_days != null){
      const gg = parseInt(quoteState.delivery_days, 10);
      if(Number.isFinite(gg) && gg > 0) parts.push(`${gg} giorni`);
    }
    if(quoteState?.delivery_date) parts.push(`entro il ${fmtDateISO(quoteState.delivery_date)}`);
    if(quoteState?.is_urgent) parts.push('priorità urgente');
    return parts.join(' • ') || 'Da concordare';
  }

  function getQuoteItemsForPdf(){
    return WORKS.map((w, idx)=>{
      const it = quoteState?.items?.[w.code];
      if(!it) return null;
      const desc = w.free ? normalizeFreeDescription(w.code, it.description) : w.text;
      return {
        position:Number.isFinite(+it.position) ? +it.position : idx,
        code:w.code,
        description:desc
      };
    }).filter(Boolean).sort((a,b)=>a.position-b.position);
  }

  function buildQuoteFilename(){
    const cliente = (record?.cliente || 'cliente').toString().trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g,'');
    const id = (currentQuoteId || 'nuovo').toString().replace(/[^a-z0-9_-]+/gi,'_');
    return `preventivo_${cliente || 'cliente'}_${id}.pdf`;
  }

  async function getLogoDataUrl(){
    const img = document.querySelector('.brand-logo');
    if(!img || !img.src) return '';
    return await new Promise(resolve=>{
      const tmp = new Image();
      tmp.crossOrigin = 'anonymous';
      tmp.onload = ()=>{
        try{
          const canvas = document.createElement('canvas');
          canvas.width = tmp.naturalWidth || tmp.width;
          canvas.height = tmp.naturalHeight || tmp.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(tmp, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        }catch(_e){
          resolve('');
        }
      };
      tmp.onerror = ()=>resolve('');
      tmp.src = img.src;
    });
  }

  
  async function openPdfPreviewPopupMode(){
    const pdf = await generateQuotePdfBlob();
    const blob = pdf?.blob;
    if(!(blob instanceof Blob)){
      throw new Error('PDF non generato correttamente');
    }

    const blobUrl = URL.createObjectURL(blob);
    const safeTitle = 'Anteprima PDF preventivo';

    document.title = safeTitle;
    document.body.style.margin = '0';
    document.body.innerHTML = `<iframe id="pdfPreviewFrame" src="${blobUrl}#zoom=100" style="position:fixed;inset:0;width:100%;height:100%;border:0;background:#52525b;"></iframe>`;

    document.getElementById('btnOpenPdfTab')?.addEventListener('click', ()=>window.open(blobUrl, '_blank'));
    document.getElementById('btnClosePdfPreview')?.addEventListener('click', ()=>window.close());

    window.addEventListener('beforeunload', ()=>{
      try{ URL.revokeObjectURL(blobUrl); }catch(_e){}
    }, { once:true });
  }

async function generateQuotePdfBlob(){
    recalcTotals();

    const jspdfNs = window.jspdf;
    if(!jspdfNs || !jspdfNs.jsPDF){
      throw new Error('Libreria PDF non caricata.');
    }

    const doc = new jspdfNs.jsPDF({ orientation:'p', unit:'mm', format:'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = 16;

    doc.setFillColor(255,122,0);
    doc.rect(0, 0, pageW, 9, 'F');

    const logo = await getLogoDataUrl();
    if(logo){
      try{ doc.addImage(logo, 'PNG', margin, 10, 78, 19); }catch{}
    }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31,41,55);
    doc.setFontSize(18);
    doc.text('PREVENTIVO', pageW - margin, 18, { align:'right' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31,41,55);
    doc.text('Elip Tagliente Srl', pageW - margin, 24, { align:'right' });

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(102,112,133);
    doc.text('Via Conchia 54/E, Monopoli (BA)', pageW - margin, 29, { align:'right' });
    doc.text('Email: info@eliptagliente.it', pageW - margin, 33.5, { align:'right' });
    doc.text('TEL: +39 080 777 090 - +39 080 887 6756', pageW - margin, 38, { align:'right' });
    y = 44;

    doc.setDrawColor(230,233,238);
    doc.line(margin, y, pageW - margin, y);
    y += 8;

    const ddt = getClientDdt();
    const topRows = [
      ['Ragione sociale cliente', record?.cliente || '—'],
      ['Descrizione', record?.descrizione || '—'],
      ['Modello', record?.modello || '—'],
      ['Data Arrivo Merci', fmtDateISO(record?.data_arrivo || record?.created_at)],
      ['Data Invio', fmtDateISO(quoteState?.sent_at || new Date())],
      ['DDT', ddt || '—'],
      ['Tempo di consegna stimato', getDeliveryEstimateText()]
    ];

    doc.setFontSize(10.5);
    topRows.forEach(([label, value])=>{
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71,84,103);
      doc.text(`${label}:`, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(31,41,55);
      const wrapped = doc.splitTextToSize(String(value || '—'), pageW - margin - 54);
      doc.text(wrapped, margin + 54, y);
      y += Math.max(6, wrapped.length * 5);
    });

    y += 2;
    doc.setFillColor(255,242,230);
    doc.roundedRect(margin, y, pageW - margin*2, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255,122,0);
    doc.setFontSize(11);
    doc.text('Lavorazioni previste', margin + 4, y + 6.6);
    y += 14;

    const items = getQuoteItemsForPdf();
    const body = items.length
      ? items.map((it, idx)=>[String(idx + 1), it.code, it.description])
      : [['1', 'RIP00', 'Totale riparazione']];

    doc.autoTable({
      startY:y,
      margin:{ left:margin, right:margin },
      head:[['#', 'Codice', 'Descrizione lavorazione']],
      body,
      theme:'grid',
      styles:{ font:'helvetica', fontSize:9.5, textColor:[31,41,55], lineColor:[230,233,238], lineWidth:0.2, cellPadding:2.6 },
      headStyles:{ fillColor:[255,122,0], textColor:[255,255,255], fontStyle:'bold' },
      columnStyles:{ 0:{ cellWidth:10 }, 1:{ cellWidth:28 }, 2:{ cellWidth:'auto' } }
    });

    y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : y + 20;

    const blockW = 74;
    const boxX = pageW - margin - blockW;
    doc.setFillColor(250,251,252);
    doc.roundedRect(boxX, y, blockW, 28, 3, 3, 'F');
    doc.setDrawColor(230,233,238);
    doc.roundedRect(boxX, y, blockW, 28, 3, 3, 'S');

    const lines = [
      ['Totale imponibile', `€ ${fmtMoney(quoteState?.subtotal_ex_vat || 0)}`],
      [`IVA ${VAT_RATE}%`, `€ ${fmtMoney(quoteState?.vat_total || 0)}`],
      ['Totale complessivo', `€ ${fmtMoney(quoteState?.grand_total || 0)}`]
    ];

    let yy = y + 7;
    lines.forEach((line, index)=>{
      doc.setFont('helvetica', index === 2 ? 'bold' : 'normal');
      doc.setFontSize(index === 2 ? 10.5 : 9.5);
      doc.setTextColor(71,84,103);
      doc.text(line[0], boxX + 4, yy);
      doc.setTextColor(31,41,55);
      doc.text(line[1], boxX + blockW - 4, yy, { align:'right' });
      yy += 7;
    });

    const footerY = pageH - 16;
    doc.setDrawColor(230,233,238);
    doc.line(margin, footerY - 5, pageW - margin, footerY - 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.7);
    doc.setTextColor(102,112,133);
    doc.text('Elip Tagliente Srl • Via Conchia 54/E, Monopoli (BA)', margin, footerY);
    doc.text('info@eliptagliente.it • +39 080 777 090 - +39 080 887 6756', pageW - margin, footerY, { align:'right' });

    const blob = doc.output('blob');
    return {
      blob,
      filename: buildQuoteFilename(),
      subject: `Preventivo ELIP TAGLIENTE ${record?.cliente || ''}`.trim(),
      quoteDate: fmtDateISO(getQuoteDateLabel())
    };
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  }

  function buildShareText(){
    return [
      `Preventivo ELIP TAGLIENTE`,
      `Cliente: ${record?.cliente || '—'}`,
      `Data: ${fmtDateISO(getQuoteDateLabel())}`,
      getClientDdt() ? `DDT: ${getClientDdt()}` : '',
      `Imponibile: € ${fmtMoney(quoteState?.subtotal_ex_vat || 0)}`,
      `IVA ${VAT_RATE}%: € ${fmtMoney(quoteState?.vat_total || 0)}`,
      `Totale: € ${fmtMoney(quoteState?.grand_total || 0)}`,
      `Consegna stimata: ${getDeliveryEstimateText()}`
    ].filter(Boolean).join('\n');
  }

  async function saveIfNeededForSharing(){
    if(isDirty() && isEditUnlocked){
      await saveAll();
    }
  }

  async function downloadQuotePdf(){
    try{
      clearErr();
      await saveIfNeededForSharing();
      const pdf = await generateQuotePdfBlob();
      downloadBlob(pdf.blob, pdf.filename);
      showOk('PDF preventivo generato');
    }catch(e){
      showErr('Errore creazione PDF: ' + (e?.message || e));
    }
  }

  function ensureSendOverlay(){
    if($('sendOverlay')) return;

    const wrap = document.createElement('div');
    wrap.id = 'sendOverlay';
    wrap.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(15,23,42,.45);
      display:none;
      align-items:center;
      justify-content:center;
      z-index:99999;
      padding:18px;
    `;

    wrap.innerHTML = `
      <div style="
        width:min(100%,520px);
        background:#fff;
        border-radius:20px;
        box-shadow:0 24px 60px rgba(0,0,0,.18);
        padding:18px;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;">
          <div>
            <div style="font-size:1.1rem;font-weight:800;">Invia preventivo</div>
            <div style="font-size:.9rem;color:#667085;margin-top:4px;">Scegli come condividere il PDF del preventivo.</div>
          </div>
          <button type="button" id="sendClose" style="
            border:1px solid #d0d5dd;
            background:#fff;
            border-radius:10px;
            padding:8px 12px;
            font-weight:700;
            cursor:pointer;
          ">Chiudi</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:14px;">
          <button type="button" id="sendNative" style="border:1px solid #ff7a00;background:#ff7a00;color:#fff;border-radius:12px;padding:12px 14px;font-weight:800;cursor:pointer;">Condividi</button>
          <button type="button" id="sendEmail" style="border:1px solid #d0d5dd;background:#fff;border-radius:12px;padding:12px 14px;font-weight:700;cursor:pointer;">Email</button>
          <button type="button" id="sendWhatsapp" style="border:1px solid #d0d5dd;background:#fff;border-radius:12px;padding:12px 14px;font-weight:700;cursor:pointer;">WhatsApp</button>
          <button type="button" id="sendDownload" style="border:1px solid #d0d5dd;background:#fff;border-radius:12px;padding:12px 14px;font-weight:700;cursor:pointer;">Scarica PDF</button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    $('sendClose')?.addEventListener('click', closeSendOverlay);
    wrap.addEventListener('click', (ev)=>{
      if(ev.target === wrap) closeSendOverlay();
    });

    $('sendNative')?.addEventListener('click', async ()=>{
      try{
        await shareQuoteNative();
        closeSendOverlay();
      }catch(e){
        showErr('Errore condivisione: ' + (e?.message || e));
      }
    });

    $('sendEmail')?.addEventListener('click', async ()=>{
      try{
        await sendQuoteByEmail();
        closeSendOverlay();
      }catch(e){
        showErr('Errore invio email: ' + (e?.message || e));
      }
    });

    $('sendWhatsapp')?.addEventListener('click', async ()=>{
      try{
        await sendQuoteByWhatsApp();
        closeSendOverlay();
      }catch(e){
        showErr('Errore invio WhatsApp: ' + (e?.message || e));
      }
    });

    $('sendDownload')?.addEventListener('click', async ()=>{
      try{
        clearErr();
        await saveIfNeededForSharing();
        const pdf = await generateQuotePdfBlob();
        downloadBlob(pdf.blob, pdf.filename);
        showOk('PDF scaricato');
        closeSendOverlay();
      }catch(e){
        showErr('Errore download PDF: ' + (e?.message || e));
      }
    });
  }

  function closeSendOverlay(){
    const ov = $('sendOverlay');
    if(ov) ov.style.display = 'none';
  }

  function canNativeSharePdf(file){
    return !!(navigator.share && navigator.canShare && navigator.canShare({ files:[file] }));
  }

  async function shareQuoteNative(){
    clearErr();
    await saveIfNeededForSharing();
    const pdf = await generateQuotePdfBlob();
    const file = new File([pdf.blob], pdf.filename, { type:'application/pdf' });

    if(canNativeSharePdf(file)){
      await navigator.share({
        files:[file],
        title:pdf.subject,
        text:'Invio preventivo ELIP TAGLIENTE'
      });
      showOk('Condivisione aperta');
      return true;
    }

    return false;
  }

  async function sendQuoteUnified(){
    try{
      clearErr();
      const pdf = await generateQuotePdfBlob();
      const file = new File([pdf.blob], pdf.filename, { type:'application/pdf' });

      if(canNativeSharePdf(file)){
        await saveIfNeededForSharing();
        await navigator.share({
          files:[file],
          title:pdf.subject,
          text:'Invio preventivo ELIP TAGLIENTE'
        });
        showOk('Condivisione aperta');
        return;
      }

      ensureSendOverlay();
      const nativeBtn = $('sendNative');
      if(nativeBtn){
        nativeBtn.style.display = canNativeSharePdf(file) ? '' : 'none';
      }
      const ov = $('sendOverlay');
      if(ov) ov.style.display = 'flex';
    }catch(e){
      showErr('Errore apertura invio: ' + (e?.message || e));
    }
  }

  async function sendQuoteByEmail(){
    try{
      clearErr();
      await saveIfNeededForSharing();
      const pdf = await generateQuotePdfBlob();
      const file = new File([pdf.blob], pdf.filename, { type:'application/pdf' });
      const body = buildShareText();
      if(navigator.canShare && navigator.canShare({ files:[file] }) && navigator.share){
        await navigator.share({
          files:[file],
          title:pdf.subject,
          text:'Seleziona Mail per inviare il preventivo in PDF.'
        });
        showOk('Condivisione aperta');
        return;
      }

      downloadBlob(pdf.blob, pdf.filename);
      const to = encodeURIComponent(getClientEmail());
      const subject = encodeURIComponent(pdf.subject);
      const mailBody = encodeURIComponent(body + '\n\nIn allegato il PDF del preventivo.');
      location.href = `mailto:${to}?subject=${subject}&body=${mailBody}`;
      showOk('Email preparata. Allega il PDF scaricato se necessario.');
    }catch(e){
      showErr('Errore invio email: ' + (e?.message || e));
    }
  }

  async function sendQuoteByWhatsApp(){
    try{
      clearErr();
      await saveIfNeededForSharing();
      const pdf = await generateQuotePdfBlob();
      const file = new File([pdf.blob], pdf.filename, { type:'application/pdf' });
      const message = buildShareText();
      if(navigator.canShare && navigator.canShare({ files:[file] }) && navigator.share){
        await navigator.share({
          files:[file],
          title:pdf.subject,
          text:'Seleziona WhatsApp per inviare il preventivo in PDF.'
        });
        showOk('Condivisione aperta');
        return;
      }

      downloadBlob(pdf.blob, pdf.filename);
      const phone = normalizeWhatsAppPhone(getClientPhone());
      const waBase = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
      location.href = `${waBase}?text=${encodeURIComponent(message + '\n\nTi inviamo anche il PDF del preventivo.')}`;
      showOk('WhatsApp aperto. Allega il PDF scaricato se necessario.');
    }catch(e){
      showErr('Errore invio WhatsApp: ' + (e?.message || e));
    }
  }



  // ===== IMPORTAZIONE ASSISTITA DA FOTO =====
  const OCR_ROW_ORDER = WORKS.filter(w => !w.free).map(w => ({ code:w.code, text:w.text }));
  let ocrModal = null;
  let ocrResults = [];
  let ocrPreviewUrl = '';

  function getOcrRefs(){
    return {
      modalEl: $('ocrModal'),
      openBtn: $('btnOcrPhoto'),
      pickLibBtn: $('btnChooseOcrFromLibrary'),
      pickCamBtn: $('btnChooseOcrFromCamera'),
      fileLib: $('ocrPhotoInput'),
      fileCam: $('ocrPhotoCameraInput'),
      preview: $('ocrPreview'),
      busy: $('ocrBusy'),
      summary: $('ocrSummary'),
      rows: $('ocrRows'),
      total: $('ocrDetectedTotal'),
      confirm: $('btnConfirmOcrImport')
    };
  }

  function ensureOcrModal(){
    const refs = getOcrRefs();
    if(!window.bootstrap || !refs.modalEl) return null;
    if(!ocrModal) ocrModal = new bootstrap.Modal(refs.modalEl);
    return ocrModal;
  }

  function defaultOcrRows(){
    return OCR_ROW_ORDER.map(r => ({ code:r.code, text:r.text, checked:false, amountText:'', amount:0 }));
  }

  function resetOcrState(){
    ocrResults = defaultOcrRows();
    renderOcrResultsTable();
    renderOcrSummary('Seleziona manualmente le righe corrette e inserisci i prezzi.');
    renderOcrTotal();
  }

  function revokeOcrPreview(){
    if(ocrPreviewUrl){
      try{ URL.revokeObjectURL(ocrPreviewUrl); }catch(_e){}
      ocrPreviewUrl = '';
    }
  }

  function bindOcrUi(){
    const refs = getOcrRefs();
    if(!refs.openBtn || !refs.modalEl) return;

    refs.openBtn.addEventListener('click', ()=>{
      clearErr();
      resetOcrState();
      ensureOcrModal()?.show();
    });

    refs.pickLibBtn?.addEventListener('click', ()=> refs.fileLib?.click());
    refs.pickCamBtn?.addEventListener('click', ()=> refs.fileCam?.click());

    refs.fileLib?.addEventListener('change', ev => handleOcrFile(ev.target.files?.[0] || null, 'libreria'));
    refs.fileCam?.addEventListener('change', ev => handleOcrFile(ev.target.files?.[0] || null, 'fotocamera'));

    refs.confirm?.addEventListener('click', applyOcrResults);

    refs.modalEl.addEventListener('hidden.bs.modal', ()=>{
      if(refs.fileLib) refs.fileLib.value = '';
      if(refs.fileCam) refs.fileCam.value = '';
    });
  }

  async function handleOcrFile(file, sourceLabel='foto'){
    const refs = getOcrRefs();
    if(!file) return;
    revokeOcrPreview();
    ocrPreviewUrl = URL.createObjectURL(file);
    if(refs.preview){
      refs.preview.src = ocrPreviewUrl;
      refs.preview.classList.remove('d-none');
    }
    if(refs.busy){
      refs.busy.textContent = `Foto caricata da ${sourceLabel}. Per affidabilità totale, seleziona le righe corrette e inserisci i prezzi.`;
    }
    renderOcrSummary('Modalità assistita attiva: nessuna riga viene importata automaticamente.');
    resetOcrState();
  }

  function renderOcrSummary(msg){
    const el = getOcrRefs().summary;
    if(el) el.textContent = msg || 'Nessuna analisi eseguita.';
  }

  function renderOcrTotal(){
    const total = ocrResults.filter(r => r.checked).reduce((a,r)=>a+(Number(r.amount)||0),0);
    const el = getOcrRefs().total;
    if(el) el.textContent = `€ ${fmtMoney(total)}`;
  }

  function renderOcrResultsTable(){
    const box = getOcrRefs().rows;
    if(!box) return;
    box.innerHTML = '';

    ocrResults.forEach((row, idx)=>{
      const wrap = document.createElement('div');
      wrap.className = 'ocr-row';
      wrap.innerHTML = `
        <div><input type="checkbox" class="form-check-input ocr-row-check" data-idx="${idx}" ${row.checked ? 'checked' : ''}></div>
        <div><span class="badge text-bg-secondary">${esc(row.code)}</span></div>
        <div class="ocr-desc">${esc(row.text)}</div>
        <div class="ocr-price"><input type="text" inputmode="decimal" class="form-control form-control-sm text-end ocr-row-price" data-idx="${idx}" value="${esc(row.amountText || '')}" placeholder="0,00"></div>
      `;
      box.appendChild(wrap);
    });

    box.querySelectorAll('.ocr-row-check').forEach(input=>{
      input.addEventListener('change', ()=>{
        const idx = Number(input.dataset.idx);
        if(!Number.isInteger(idx) || !ocrResults[idx]) return;
        ocrResults[idx].checked = !!input.checked;
        renderOcrTotal();
      });
    });

    box.querySelectorAll('.ocr-row-price').forEach(input=>{
      input.addEventListener('input', ()=>{
        const idx = Number(input.dataset.idx);
        if(!Number.isInteger(idx) || !ocrResults[idx]) return;
        ocrResults[idx].amountText = input.value;
        ocrResults[idx].amount = parseNum(input.value);
        renderOcrTotal();
      });
      input.addEventListener('blur', ()=>{
        const idx = Number(input.dataset.idx);
        if(!Number.isInteger(idx) || !ocrResults[idx]) return;
        const val = parseNum(input.value);
        ocrResults[idx].amount = val;
        ocrResults[idx].amountText = val > 0 ? fmtMoney(val) : '';
        input.value = ocrResults[idx].amountText;
        renderOcrTotal();
      });
    });
  }

  function applyOcrResults(){
    try{
      const selected = ocrResults.filter(r => r.checked && Number(r.amount) > 0);
      if(!selected.length){
        showErr('Seleziona almeno una RIP e inserisci un prezzo valido prima di confermare.');
        return;
      }

      selected.forEach(sel=>{
        const work = WORKS.find(w => w.code === sel.code);
        if(!work) return;
        const idx = WORKS.findIndex(w => w.code === sel.code);
        const it = ensureLocalItem(work, idx);
        it.unit_price_ex_vat = Number(sel.amount || 0);
      });

      recalcTotals();
      renderAll();
      ensureOcrModal()?.hide();
      showOk('Importazione da foto applicata.');
    }catch(e){
      showErr('Errore importazione da foto: ' + (e?.message || e));
    }
  }


  document.addEventListener('DOMContentLoaded', init);
})();
