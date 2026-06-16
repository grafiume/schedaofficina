// === Supabase config (ELIP Scheda) ===
// Attenzione: queste sono chiavi ANON pubbliche (safe per frontend).
// Assicurati che le RLS delle tabelle siano impostate correttamente.

window.SUPABASE_URL = 'https://pedmdiljgjgswhfwedno.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZG1kaWxqZ2pnc3doZndlZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjgxNTIsImV4cCI6MjA3NTY0NDE1Mn0.4p2T8BJHGjVsj1Bx22Mk1mbYmfh7MX5WpCwxhwi4CmQ';

// Regola officina: dataArrivo deve sempre seguire dataApertura.
// Questo wrapper intercetta le scritture frontend su public.records e copia
// dataApertura dentro dataArrivo per insert, upsert e update.
(function patchDataArrivoFromApertura(){
  'use strict';

  function syncPayload(payload){
    if (!payload || typeof payload !== 'object') return payload;
    if (Array.isArray(payload)) return payload.map(syncPayload);
    if (Object.prototype.hasOwnProperty.call(payload, 'dataApertura')) {
      payload.dataArrivo = payload.dataApertura || null;
    }
    return payload;
  }

  function wrapTable(table){
    if (!table || table.__dataArrivoPatched) return table;
    ['insert', 'upsert', 'update'].forEach(function(method){
      if (typeof table[method] !== 'function') return;
      var original = table[method].bind(table);
      table[method] = function(payload){
        return original(syncPayload(payload));
      };
    });
    Object.defineProperty(table, '__dataArrivoPatched', { value: true });
    return table;
  }

  function patchSupabaseFactory(){
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return false;
    if (window.supabase.__dataArrivoFactoryPatched) return true;

    var originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function(){
      var client = originalCreateClient.apply(window.supabase, arguments);
      if (!client || typeof client.from !== 'function' || client.__dataArrivoClientPatched) return client;

      var originalFrom = client.from.bind(client);
      client.from = function(tableName){
        var table = originalFrom(tableName);
        return tableName === 'records' ? wrapTable(table) : table;
      };
      Object.defineProperty(client, '__dataArrivoClientPatched', { value: true });
      return client;
    };
    Object.defineProperty(window.supabase, '__dataArrivoFactoryPatched', { value: true });
    return true;
  }

  if (!patchSupabaseFactory()) {
    document.addEventListener('DOMContentLoaded', patchSupabaseFactory, { once: true });
  }
})();

// Correzione telefono nei PDF preventivo: mantiene il codice preventivo esistente
// e corregge il testo passato a jsPDF quando la libreria e pronta.
(function patchPreventivoPhoneInPdf(){
  'use strict';

  var phonePattern = /080 887 675(?!6)/g;
  var fixedPhone = '080 887 6756';

  function fixText(value){
    if (typeof value === 'string') return value.replace(phonePattern, fixedPhone);
    if (Array.isArray(value)) return value.map(fixText);
    return value;
  }

  function patchJsPdf(){
    var jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF || !jsPDF.API || typeof jsPDF.API.text !== 'function') return false;
    if (jsPDF.API.text.__elipPhonePatched) return true;

    var originalText = jsPDF.API.text;
    var patchedText = function(){
      var args = Array.prototype.slice.call(arguments);
      args[0] = fixText(args[0]);
      return originalText.apply(this, args);
    };
    Object.defineProperty(patchedText, '__elipPhonePatched', { value: true });
    jsPDF.API.text = patchedText;
    return true;
  }

  if (patchJsPdf()) return;

  var attempts = 0;
  var timer = window.setInterval(function(){
    attempts += 1;
    if (patchJsPdf() || attempts > 80) window.clearInterval(timer);
  }, 50);
})();

// Ricerca: consente di premere Invio nel campo principale invece del pulsante Cerca.
(function patchSearchEnterKey(){
  'use strict';

  function bindSearchEnter(){
    var q = document.getElementById('q');
    if (!q || q.__elipSearchEnterPatched) return;

    q.__elipSearchEnterPatched = true;
    q.addEventListener('keydown', function(ev){
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var btn = document.getElementById('btnDoSearch');
      if (btn) btn.click();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSearchEnter, { once: true });
  } else {
    bindSearchEnter();
  }
})();
