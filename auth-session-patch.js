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
