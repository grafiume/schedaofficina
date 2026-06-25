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

// Patch data chiusura: salva automaticamente la data quando una scheda diventa Completata.
(function(){
  'use strict';

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
  function selectedRecord(){
    const id = window.state?.editing?.id;
    return id ? (window.state?.all || []).find(r => r.id === id) || window.state.editing : null;
  }
  function updateClosureUi(){
    const isClosed = norm(val('eStato')).includes('completata');
    let closureDate = val('eChiusura');
    if(isClosed && !closureDate){
      closureDate = selectedRecord()?.dataChiusura || todayISO();
      setV('eChiusura', closureDate);
    }
    if(!isClosed){
      closureDate = '';
      setV('eChiusura', '');
    }

    const banner = document.getElementById('closedBanner');
    if(banner){
      banner.classList.toggle('d-none', !isClosed);
      banner.textContent = isClosed ? 'Chiusa il ' + fmtIT(closureDate) : 'Chiusa';
    }
    const hint = document.getElementById('closedHint');
    if(hint){
      hint.textContent = isClosed ? 'Data chiusura: ' + fmtIT(closureDate) : '';
    }
  }
  async function saveClosureDate(){
    const record = selectedRecord();
    if(!record?.id) return;
    const db = getDb();
    if(!db) return;
    const isClosed = norm(val('eStato')).includes('completata');
    const dataChiusura = isClosed ? (val('eChiusura') || record.dataChiusura || todayISO()) : null;
    setV('eChiusura', dataChiusura);
    try{
      const { error } = await db.from('records').update({ dataChiusura }).eq('id', record.id);
      if(!error){
        record.dataChiusura = dataChiusura;
        if(window.state?.editing) window.state.editing.dataChiusura = dataChiusura;
      }
    }catch(_e){}
  }
  async function mergeClosureDates(){
    const rows = window.state?.all || [];
    if(!rows.length) return;
    const db = getDb();
    if(!db) return;
    try{
      const ids = rows.map(r => r.id).filter(Boolean);
      const { data, error } = await db.from('records').select('id,dataChiusura').in('id', ids);
      if(error || !Array.isArray(data)) return;
      const byId = new Map(data.map(r => [r.id, r.dataChiusura || null]));
      rows.forEach(r => {
        if(byId.has(r.id)) r.dataChiusura = byId.get(r.id);
      });
    }catch(_e){}
  }

  const originalOpenEdit = window.openEdit;
  if(typeof originalOpenEdit === 'function'){
    window.openEdit = function(id){
      const result = originalOpenEdit.apply(this, arguments);
      const record = selectedRecord();
      setV('eChiusura', record?.dataChiusura || '');
      updateClosureUi();
      return result;
    };
  }

  const originalSaveEdit = window.saveEdit;
  if(typeof originalSaveEdit === 'function'){
    window.saveEdit = async function(closeAfter){
      updateClosureUi();
      await saveClosureDate();
      return originalSaveEdit.apply(this, arguments);
    };
  }

  const originalLoadAll = window.loadAll;
  if(typeof originalLoadAll === 'function'){
    window.loadAll = async function(){
      const result = await originalLoadAll.apply(this, arguments);
      await mergeClosureDates();
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const stato = document.getElementById('eStato');
    if(stato) stato.addEventListener('change', updateClosureUi);
  });
})();
