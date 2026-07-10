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

// Patch data chiusura e storico cassetto liberato.
(function(){
  'use strict';

  window.__closureOpenedWasClosed = false;

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
      const [y,m,d] = s.split('-');
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
    const x = String(v || '').trim().toUpperCase().replace(/\s*❌.*$/, '');
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
    const storico = sanitizeCassettoInput(record?.cassetto_storico || record?.cassettoStorico || '');
    const data = record?.data_liberazione_cassetto || record?.dataLiberazioneCassetto || '';
    hint.textContent = storico ? `Storico cassetto liberato: ${storico}${data ? ' il ' + fmtIT(data) : ''}` : '';
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
  function releaseCassettoIfClosed(){
    const isClosed = norm(val('eStato')).includes('completata');
    const cass = sanitizeCassettoInput(val('eCassetto'));
    if(!isClosed || !cass) return;
    setV('eCassetto', '');
    try{
      const record = selectedRecord();
      const db = getDb();
      if(record?.id && db){
        db.from('records').update({
          cassetto_storico: cass,
          data_liberazione_cassetto: todayISO(),
          cassetto_occupato: false
        }).eq('id', record.id).then(()=>{});
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
      releaseCassettoIfClosed();
      await saveClosureDate();
      return originalSaveEdit.apply(this, arguments);
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
    const btnSave = document.getElementById('btnSave');
    if(btnSave && !btnSave.__releasedCassettoCapture){
      btnSave.__releasedCassettoCapture = true;
      btnSave.addEventListener('click', releaseCassettoIfClosed, true);
    }
  });
})();
