/**
 * filters-exact-guard.js (safe/simplified)
 * Applica filtri SOLO su click "Applica" o "Reset" e demanda il render a lista().
 * Nessun wrap, nessun listener su input durante la digitazione.
 * Metti QUESTO file come ULTIMO <script> prima di </body>.
 */
(function(){
  if (window.__EXACT_GUARD_INIT__) return;
  window.__EXACT_GUARD_INIT__ = true;

  // helper mini
  const $ = s => document.querySelector(s);
  const norm = v => (v==null) ? '' : String(v).trim();

  // legge i campi (usa underscore, con fallback a trattino)
  function readUI(){
    const get = (id,alt) => {
      const el = document.getElementById(id) || (alt ? document.getElementById(alt) : null);
      return norm(el ? el.value : '');
    };
    return {
      battCollettore: get('f_battCollettore','f-battCollettore'),
      lunghezzaAsse:  get('f_lunghezzaAsse','f-lunghezzaAsse'),
      lunghezzaPacco: get('f_lunghezzaPacco','f-lunghezzaPacco'),
      larghezzaPacco: get('f_larghezzaPacco','f-larghezzaPacco'),
      punta:          get('f_punta','f-punta'),
      numPunte:       get('f_numPunte','f-numPunte')
    };
  }

  // true se esiste almeno 1 filtro (puntualizza "punta (tutte)")
  function hasAny(f){
    const puntaOk = f.punta && f.punta !== '' &&
                    f.punta.toLowerCase() !== 'tutte' &&
                    f.punta.toLowerCase() !== 'punta (tutte)';
    return !!(f.battCollettore || f.lunghezzaAsse || f.lunghezzaPacco || f.larghezzaPacco || pontaOk || f.numPunte);
  }

  // applica alla tua pipeline: copia su techFilters e chiama lista()
  function applyToApp(f){
    // se esiste la tua struttura globale, copio i valori (esatti)
    if (typeof window.techFilters === 'object' && window.techFilters){
      window.techFilters.battCollettore = f.battCollettore || '';
      window.techFilters.lunghezzaAsse  = f.lunghezzaAsse  || '';
      window.techFilters.lunghezzaPacco = f.lunghezzaPacco || '';
      window.techFilters.larghezzaPacco = f.larghezzaPacco || '';
      window.techFilters.punta          = f.punta          || '';
      window.techFilters.numPunte       = f.numPunte       || '';
    }
    // ricalcola con la TUA lista() (che hai già impostato su match esatto)
    if (typeof window.lista === 'function') window.lista();
    else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }

  // reset globale: svuota campi + techFilters + lista()
  function doReset(){
    const ids = [
      'f_battCollettore','f-battCollettore',
      'f_lunghezzaAsse','f-lunghezzaAsse',
      'f_lunghezzaPacco','f-lunghezzaPacco',
      'f_larghezzaPacco','f-larghezzaPacco',
      'f_numPunte','f-numPunte',
      'f_punta','f-punta'
    ];

    ids.forEach(id=>{
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT'){ el.selectedIndex = 0; el.value = ''; }
      else { el.value = ''; }
      // propaga eventi al resto della UI se serve
      el.dispatchEvent(new Event('input',  {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    });

    // azzera techFilters
    if (typeof window.techFilters === 'object' && window.techFilters){
      Object.keys(window.techFilters).forEach(k=> window.techFilters[k] = '');
    }

    // evento opzionale per altri moduli
    try { document.dispatchEvent(new CustomEvent('filters:reset')); } catch(_){}

    // ricarica lista completa
    if (typeof window.lista === 'function') window.lista();
    else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }

  // BIND: SOLO bottoni
  function bind(){
    const btnApply = document.getElementById('btnApplyFilters');
    if (btnApply){
      // rimuovi eventuali listener duplicati
      const clone = btnApply.cloneNode(true);
      btnApply.replaceWith(clone);
      clone.id = 'btnApplyFilters';
      clone.addEventListener('click', (e)=>{
        // lascia fare ai tuoi handler eventuali (se presenti) e poi forza esatto
        setTimeout(()=>{
          const f = readUI();
          // Se vuoi ZERO risultati mentre digiti parziale, non reagiamo all'input.
          // Qui si applica SOLO su click, quindi niente "1" che prende "12".
          applyToApp(f);
        }, 0);
      }, {capture:true});
    }

    const btnReset = document.getElementById('btnResetFilters');
    if (btnReset){
      const clone = btnReset.cloneNode(true);
      btnReset.replaceWith(clone);
      clone.id = 'btnResetFilters';
      clone.addEventListener('click', (e)=>{
        e.preventDefault();
        setTimeout(doReset, 0);
      }, {capture:true});
    }

    console.log('[filters-exact-guard] pronto (apply/reset-only, no wrapping)');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

})();
