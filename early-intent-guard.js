// early-intent-guard.js
// Inserisci QUESTO file come PRIMO <script> nello <head>, PRIMA di QUALSIASI altro JS.
// Scopo: catturare pvid/pvno/id/pv da query o hash e bloccare l'auto-nuovo.

(function(){
  if (window.__EARLY_INTENT_GUARD__) return;
  window.__EARLY_INTENT_GUARD__ = true;

  function getRaw(){
    if (location.search && location.search.length > 1) return location.search.slice(1);
    if (location.hash && location.hash.length > 1) return location.hash.slice(1);
    return '';
  }
  var raw = getRaw();

  function getParam(k){
    try {
      var p = new URLSearchParams(raw);
      return p.get(k);
    } catch(e){
      var m = raw.match(new RegExp('(?:^|[&#?])'+k+'=([^&#]+)','i'));
      return m ? decodeURIComponent(m[1]) : null;
    }
  }

  var key = getParam('pvid') || getParam('pvno') || getParam('id') || getParam('pv');
  if (key) {
    // Flag per fermare qualsiasi auto-nuovo.
    window.__URL_INTENT_HAS_TARGET__ = true;
    // Memorizza la chiave in sessionStorage per il loader tardivo.
    sessionStorage.setItem('pv.deep.link.key', key);
    // Memorizza anche raw per eventuale ripristino URL.
    sessionStorage.setItem('pv.deep.link.raw', raw);
  }

  // Patcha replaceState per non perdere query/hash
  var _replaceState = history.replaceState;
  history.replaceState = function(state, title, url){
    try {
      if (typeof url === 'string') {
        var base = location.pathname;
        var keep = location.search + location.hash;
        if (url === base || url === base + '/' || (url.indexOf('?') === -1 && url.indexOf('#') === -1)) {
          url = base + keep;
        }
      }
    } catch(e){}
    return _replaceState.apply(this, arguments);
  };
})();