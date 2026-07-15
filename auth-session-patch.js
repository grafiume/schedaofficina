// Patch leggero: mantiene login solo email+password, nessun PIN,
// e mostra sempre l'utente autenticato in modo piu chiaro.
(function(){
  'use strict';

  // Compatibilita per un refuso storico in app.v25.js: String#endswith.
  // Il metodo nativo corretto e endsWith, ma questa alias evita errori runtime
  // durante la scelta della foto principale dopo upload.
  if (typeof String.prototype.endswith !== 'function') {
    Object.defineProperty(String.prototype, 'endswith', {
      value: function(searchString, position) {
        return this.endsWith(searchString, position);
      },
      configurable: true,
      writable: true
    });
  }

  function byId(id){ return document.getElementById(id); }

  async function getSession(){
    try{
      if (!window.sb || !window.sb.auth) return null;
      const { data } = await window.sb.auth.getSession();
      return data?.session || null;
    }catch(_e){
      return null;
    }
  }

  function renderAuthState(session){
    const hint = byId('authUserHint');
    const info = byId('authInfo');
    const openBtn = byId('btnAuthOpen');
    const logoutBtn = byId('btnLogout');
    const email = session?.user?.email || '';
    const logged = !!email;

    if (hint) hint.textContent = logged ? ('Accesso attivo: ' + email) : 'Nessuna sessione attiva';
    if (info) info.textContent = logged
      ? 'Accesso gia attivo. Nessun PIN turno richiesto su questo dispositivo.'
      : 'Inserisci email e password Supabase dell\'operatore. Nessun PIN turno richiesto.';
    if (openBtn) openBtn.classList.toggle('d-none', logged);
    if (logoutBtn) logoutBtn.classList.toggle('d-none', !logged);
  }

  function patchUpdateAuthButtons(){
    if (typeof window.updateAuthButtons !== 'function') return;
    const original = window.updateAuthButtons;
    window.updateAuthButtons = function(session){
      try{ original(session); }catch(_e){}
      renderAuthState(session || null);
    };
  }

  async function boot(){
    patchUpdateAuthButtons();
    renderAuthState(await getSession());

    try{
      window.sb?.auth?.onAuthStateChange?.((_event, session) => {
        renderAuthState(session || null);
      });
    }catch(_e){}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();

// Patch importo concordato: se manca, lo compila dal totale del preventivo collegato.
(function(){
  'use strict';

  function getDb(){
    if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    if(!window.__quoteImportoDb){
      window.__quoteImportoDb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
    return window.__quoteImportoDb;
  }
  function selectedRecord(){
    const id = window.state?.editing?.id;
    return id ? (window.state?.all || []).find(r => r.id === id) || window.state.editing : null;
  }
  function parseMoney(v){
    if(v == null) return null;
    let s = String(v).trim();
    if(!s) return null;
    s = s.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
    if(s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function formatMoney(v){
    const n = Number(v || 0);
    return Number.isFinite(n) && n > 0 ? n.toFixed(2).replace('.', ',') : '';
  }
  function setImporto(value, record){
    const el = document.getElementById('eImportoConcordato');
    if(el) el.value = value || '';
    if(record) record.importoConcordato = value || null;
    if(window.state?.editing) window.state.editing.importoConcordato = value || null;
  }
  async function selectQuotes(db, recordId){
    const selects = [
      'id,record_id,status,notes,subtotal_ex_vat,grand_total,accepted_at,created_at',
      'id,record_id,status,notes,subtotal_ex_vat,accepted_at,created_at'
    ];
    for(const cols of selects){
      try{
        const res = await db.from('quotes').select(cols).eq('record_id', recordId).order('created_at', { ascending:false }).limit(20);
        if(!res.error) return res.data || [];
      }catch(_e){}
    }
    return [];
  }
  async function sumQuoteItems(db, quoteId){
    const selects = [
      'qty,unit_price_ex_vat,line_total_ex_vat',
      'quantity,unit_price,total',
      'quantita,prezzo,totale'
    ];
    for(const cols of selects){
      try{
        const res = await db.from('quote_items').select(cols).eq('quote_id', quoteId).limit(200);
        if(res.error) continue;
        const sum = (res.data || []).reduce(function(total, item){
          const line = parseMoney(item.line_total_ex_vat ?? item.total ?? item.totale);
          if(line && line > 0) return total + line;
          const qty = parseMoney(item.qty ?? item.quantity ?? item.quantita) || 1;
          const unit = parseMoney(item.unit_price_ex_vat ?? item.unit_price ?? item.prezzo) || 0;
          return total + (qty * unit);
        }, 0);
        if(sum > 0) return sum;
      }catch(_e){}
    }
    return null;
  }
  function quoteRank(q){
    const st = String(q?.status || '').toUpperCase();
    if(st === 'ACCETTATO' || q?.accepted_at) return 4;
    if(st === 'INVIATO') return 3;
    if(st === 'BOZZA') return 2;
    return 1;
  }
  async function getQuoteTotal(recordId){
    const db = getDb();
    if(!db || !recordId) return null;
    const quotes = await selectQuotes(db, recordId);
    quotes.sort(function(a,b){
      const ranked = quoteRank(b) - quoteRank(a);
      return ranked || String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    for(const q of quotes){
      const subtotal = parseMoney(q.subtotal_ex_vat);
      if(subtotal && subtotal > 0) return subtotal;
      const itemSum = await sumQuoteItems(db, q.id);
      if(itemSum && itemSum > 0) return itemSum;
      const grand = parseMoney(q.grand_total);
      if(grand && grand > 0) return grand;
    }
    return null;
  }
  async function fillImportoFromQuote(persist){
    const record = selectedRecord();
    const input = document.getElementById('eImportoConcordato');
    const current = parseMoney(input?.value || record?.importoConcordato);
    if(current && current > 0) return current;
    const amount = await getQuoteTotal(record?.id);
    if(!(amount > 0)) return null;

    const value = formatMoney(amount);
    setImporto(value, record);

    if(persist && record?.id){
      const db = getDb();
      try{ await db?.from('records').update({ importoConcordato:value }).eq('id', record.id); }catch(_e){}
    }
    return amount;
  }

  const originalOpenEdit = window.openEdit;
  if(typeof originalOpenEdit === 'function' && !originalOpenEdit.__quoteImportoPatched){
    window.openEdit = function(){
      const result = originalOpenEdit.apply(this, arguments);
      fillImportoFromQuote(true).catch(function(e){ console.warn('importo da preventivo non caricato', e); });
      return result;
    };
    Object.defineProperty(window.openEdit, '__quoteImportoPatched', { value:true });
  }

  const originalSaveEdit = window.saveEdit;
  if(typeof originalSaveEdit === 'function' && !originalSaveEdit.__quoteImportoPatched){
    window.saveEdit = async function(){
      await fillImportoFromQuote(false);
      return originalSaveEdit.apply(this, arguments);
    };
    Object.defineProperty(window.saveEdit, '__quoteImportoPatched', { value:true });
  }
})();

// Patch data chiusura e storico cassetto liberato.
(function(){
  'use strict';

  window.__closureOpenedWasClosed = false;
  window.__lastKnownEditCassetto = '';

  function norm(v){
    return (v ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function todayISO(){
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
  }
  function fmtIT(v){
    if(!v) return '';
    const s = String(v);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      const [y,m,d] = s.slice(0, 10).split('-');
      return [d,m,y].join('/');
    }
    return s;
  }
  function getDb(){
    if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    if(!window.__closureDateDb){
      window.__closureDateDb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
    return window.__closureDateDb;
  }
  function val(id){
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  function setV(id, value){
    const el = document.getElementById(id);
    if(el) el.value = value || '';
  }
  function sanitizeCassettoInput(v){
    const x = String(v || '').trim().toUpperCase().replace(/\s*[\u2716\u274C].*$/, '');
    return x || null;
  }
  function ensureReleasedCassHint(){
    let hint = document.getElementById('releasedCassHint');
    if(hint) return hint;
    const cass = document.getElementById('eCassetto');
    if(!cass || !cass.parentElement) return null;
    hint = document.createElement('div');
    hint.id = 'releasedCassHint';
    hint.className = 'form-text text-muted';
    cass.parentElement.appendChild(hint);
    return hint;
  }
  function renderReleasedCassHint(record){
    const hint = ensureReleasedCassHint();
    if(!hint) return;
    const isClosed = norm(val('eStato') || record?.statoPratica || '').includes('completata');
    const storico = sanitizeCassettoInput(record?.cassetto_storico || record?.cassettoStorico || '');
    hint.textContent = (isClosed && storico) ? `Storico ${storico}` : '';
  }
  function rememberEditCassetto(value){
    const cass = sanitizeCassettoInput(value);
    if(cass) window.__lastKnownEditCassetto = cass;
    return cass;
  }
  async function loadReleasedCassHint(record){
    renderReleasedCassHint(record);
    const db = getDb();
    if(!db || !record?.id) return;
    try{
      const { data, error } = await db
        .from('records')
        .select('cassetto_storico,data_liberazione_cassetto')
        .eq('id', record.id)
        .single();
      if(!error && data){
        record.cassetto_storico = data.cassetto_storico;
        record.data_liberazione_cassetto = data.data_liberazione_cassetto;
        renderReleasedCassHint(record);
      }
    }catch(_e){}
  }
  async function releaseCassettoIfClosed(){
    const isClosed = norm(val('eStato')).includes('completata');
    const record = selectedRecord();
    const cass = rememberEditCassetto(val('eCassetto')) || sanitizeCassettoInput(record?.cassetto || '') || sanitizeCassettoInput(window.__lastKnownEditCassetto || '');
    if(!isClosed || !cass) return;
    setV('eCassetto', '');
    try{
      const db = getDb();
      if(record?.id && db){
        await db.from('records').update({
          cassetto_storico: cass,
          data_liberazione_cassetto: todayISO(),
          cassetto_occupato: false
        }).eq('id', record.id);
        record.cassetto_storico = cass;
        record.data_liberazione_cassetto = todayISO();
        record.cassetto_occupato = false;
        renderReleasedCassHint(record);
      }
    }catch(_e){}
  }
  function selectedRecord(){
    const id = window.state?.editing?.id;
    return id ? (window.state?.all || []).find(r => r.id === id) || window.state.editing : null;
  }
  function updateClosureUi(autoFillNewCompletion){
    const isClosed = norm(val('eStato')).includes('completata');
    let closureDate = val('eChiusura');
    const record = selectedRecord();

    if(!isClosed){
      window.__closureOpenedWasClosed = false;
      closureDate = '';
      setV('eChiusura', '');
    }

    if(isClosed && !closureDate){
      closureDate = record?.dataChiusura || '';
      if(!closureDate && autoFillNewCompletion && !window.__closureOpenedWasClosed){
        closureDate = todayISO();
      }
      setV('eChiusura', closureDate);
    }

    const banner = document.getElementById('closedBanner');
    if(banner){
      banner.classList.toggle('d-none', !isClosed);
      banner.textContent = isClosed && closureDate ? 'Chiusa il ' + fmtIT(closureDate) : 'Chiusa';
    }
    const hint = document.getElementById('closedHint');
    if(hint){
      hint.textContent = isClosed && closureDate ? 'Data chiusura: ' + fmtIT(closureDate) : '';
    }
    renderReleasedCassHint(record);
  }
  async function saveClosureDate(){
    const record = selectedRecord();
    if(!record?.id) return;
    const db = getDb();
    if(!db) return;
    const isClosed = norm(val('eStato')).includes('completata');
    const dataChiusura = isClosed
      ? (val('eChiusura') || record.dataChiusura || (window.__closureOpenedWasClosed ? null : todayISO()))
      : null;
    setV('eChiusura', dataChiusura);
    try{
      const { error } = await db.from('records').update({ dataChiusura }).eq('id', record.id);
      if(!error){
        record.dataChiusura = dataChiusura;
        if(window.state?.editing) window.state.editing.dataChiusura = dataChiusura;
      }
    }catch(_e){}
  }
  const originalOpenEdit = window.openEdit;
  if(typeof originalOpenEdit === 'function'){
    window.openEdit = function(id){
      const result = originalOpenEdit.apply(this, arguments);
      const record = selectedRecord();
      window.__closureOpenedWasClosed = norm(record?.statoPratica).includes('completata');
      window.__lastKnownEditCassetto = sanitizeCassettoInput(record?.cassetto || val('eCassetto') || '') || '';
      setV('eChiusura', record?.dataChiusura || '');
      updateClosureUi(false);
      loadReleasedCassHint(record);
      return result;
    };
  }

  const originalSaveEdit = window.saveEdit;
  if(typeof originalSaveEdit === 'function'){
    window.saveEdit = async function(closeAfter){
      updateClosureUi(true);
      await releaseCassettoIfClosed();
      await saveClosureDate();
      const result = await originalSaveEdit.apply(this, arguments);
      await loadReleasedCassHint(selectedRecord());
      return result;
    };
  }

  const originalLoadAll = window.loadAll;
  if(typeof originalLoadAll === 'function'){
    window.loadAll = async function(){
      return originalLoadAll.apply(this, arguments);
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const stato = document.getElementById('eStato');
    if(stato) stato.addEventListener('change', () => updateClosureUi(true));
    const cass = document.getElementById('eCassetto');
    if(cass && !cass.__rememberCassettoInput){
      cass.__rememberCassettoInput = true;
      cass.addEventListener('input', () => rememberEditCassetto(cass.value));
      cass.addEventListener('change', () => rememberEditCassetto(cass.value));
    }
    const btnSave = document.getElementById('btnSave');
    if(btnSave && !btnSave.__releasedCassettoCapture){
      btnSave.__releasedCassettoCapture = true;
      btnSave.addEventListener('click', () => { releaseCassettoIfClosed(); }, true);
    }
  });
})();
