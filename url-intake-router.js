// url-intake-router.js
// Graziano — router robusto per leggere pvid/pvno/id sia da query (?pvid=...)
// che da hash (#pvid=...), prima di qualsiasi auto-NUOVO.
// Inserisci questo script PRIMA dell'avvio della tua app.

(function(){
  if (window.__URL_INTAKE_ROUTER__) return;
  window.__URL_INTAKE_ROUTER__ = true;

  function getParamFromURL() {
    // 1) scegli raw: search oppure hash
    var raw = '';
    if (location.search && location.search.length > 1) {
      raw = location.search.slice(1);
    } else if (location.hash && location.hash.length > 1) {
      raw = location.hash.slice(1);
    }
    try {
      var p = new URLSearchParams(raw);
      return p.get('pvid') || p.get('pvno') || p.get('id') || p.get('pv') || null;
    } catch(e){
      // Fallback semplice (vecchi browser)
      var m = raw.match(/(?:^|[&#?])(pvid|pvno|id|pv)=([^&#]+)/i);
      return m ? decodeURIComponent(m[2]) : null;
    }
  }

  function isUUID(v){
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));
  }

  // Espone un hook globale che la tua app può richiamare per aprire il preventivo.
  // Implementa altrove window.__openPreventivo(record) che si aspetta l'oggetto row (record) già caricato.
  // In alternativa, se hai già una funzione tipo openPreventivoByIdOrNumero, usa quella al posto del blocco Supabase qui sotto.
  async function openByKey(key){
    // Richiede client Supabase globale: window.supabase
    if (!window.supabase) return console.warn('[url-intake-router] supabase client non trovato');
    var rec = null;
    if (isUUID(key)) {
      var r1 = await window.supabase.from('preventivi').select('*').eq('id', key).maybeSingle();
      if (!r1.error && r1.data) rec = r1.data;
    }
    if (!rec) {
      var r2 = await window.supabase.from('preventivi').select('*').eq('numero', key).maybeSingle();
      if (!r2.error && r2.data) rec = r2.data;
    }
    if (rec) {
      if (typeof window.__openPreventivo === 'function') {
        window.__openPreventivo(rec);
      } else if (typeof window.openPreventivoByIdOrNumero === 'function') {
        // Compat
        window.openPreventivoByIdOrNumero(key);
      } else {
        console.log('[url-intake-router] Record caricato:', rec);
        alert('Preventivo caricato: ' + (rec.numero || rec.id));
      }
    } else {
      alert('Preventivo non trovato per chiave: ' + key);
    }
  }

  // Mantieni query/hash quando modifichi history
  var _replaceState = history.replaceState;
  history.replaceState = function(state, title, url){
    try {
      if (typeof url === 'string') {
        var base = location.pathname;
        var keep = location.search + location.hash;
        // solo se la chiamata cerca di troncare, ripristina parametri
        if (url === base || url === base + '/' || url.indexOf('?') === -1 && url.indexOf('#') === -1) {
          url = base + keep;
        }
      }
    } catch(e){}
    return _replaceState.apply(this, arguments);
  };

  // Avvio precoce: prima del tuo init che eventualmente crea "Nuovo"
  document.addEventListener('DOMContentLoaded', function(){
    var key = getParamFromURL();
    if (key) {
      // Flag globale per impedire "auto-nuovo" in altre parti della app
      window.__URL_INTENT_HAS_TARGET__ = true;
      // Prova ad aprire appena supabase è pronto
      var tryOpen = function(){
        if (window.supabase) {
          openByKey(key);
        } else {
          setTimeout(tryOpen, 50);
        }
      };
      tryOpen();
    }
  });

  // Helper per i tuoi punti d'ingresso: chiama shouldAutoNew() prima di creare un record nuovo
  window.shouldAutoNew = function(){
    // se arrivo con un link profondo, NON creare un nuovo preventivo
    if (window.__URL_INTENT_HAS_TARGET__) return false;
    // consenti eventuale comportamento standard
    return true;
  };
})();
