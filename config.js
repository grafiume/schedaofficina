// === Supabase config (ELIP Scheda) ===
// Chiavi ANON pubbliche per il frontend.
window.SUPABASE_URL = 'https://pedmdiljgjgswhfwedno.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZG1kaWxqZ2pnc3doZndlZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjgxNTIsImV4cCI6MjA3NTY0NDE1Mn0.4p2T8BJHGjVsj1Bx22Mk1mbYmfh7MX5WpCwxhwi4CmQ';

// Regola officina: dataArrivo deve sempre seguire dataApertura.
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

// Ricerca: Invio nei campi principali avvia il pulsante corretto.
(function patchSearchEnterKeys(){
  'use strict';

  var mainSearchIds = ['q', 'cassettoSearch', 'noteExact'];
  var technicalFilterIds = ['fBatt', 'fAsse', 'fPacco', 'fLarg', 'fPunta', 'fNP'];

  function clickButton(buttonId){
    var btn = document.getElementById(buttonId);
    if (btn) btn.click();
  }

  function bindField(fieldId, buttonId){
    var field = document.getElementById(fieldId);
    if (!field || field.__elipReturnPatched) return;
    Object.defineProperty(field, '__elipReturnPatched', { value: true });
    field.addEventListener('keydown', function(ev){
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      clickButton(buttonId);
    });
  }

  function bindAll(){
    mainSearchIds.forEach(function(id){ bindField(id, 'btnDoSearch'); });
    technicalFilterIds.forEach(function(id){ bindField(id, 'btnApply'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAll, { once: true });
  } else {
    bindAll();
  }
})();
