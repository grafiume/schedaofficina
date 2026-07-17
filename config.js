// === Supabase config (ELIP Scheda) ===
// Chiavi ANON pubbliche per il frontend.
window.SUPABASE_URL = 'https://pedmdiljgjgswhfwedno.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZG1kaWxqZ2pnc3doZndlZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjgxNTIsImV4cCI6MjA3NTY0NDE1Mn0.4p2T8BJHGjVsj1Bx22Mk1mbYmfh7MX5WpCwxhwi4CmQ';

// Regole officina prima del salvataggio su records:
// - dataArrivo segue dataApertura
// - importoConcordato viene inviato come numero valido per Supabase, con punto decimale.
// - se viene inserito un importo concordato e manca la data accettazione, usa la data di oggi.
// - quando l'importo concordato crea l'accettazione automatica, crea anche Data invio P. uguale.
// - se l'operatore cancella manualmente data invio P. su schede gia accettate, resta vuota.
(function patchRecordsPayload(){
  'use strict';

  function todayISO(){
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function normalizeMoney(value){
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    var s = String(value).trim();
    if (!s) return null;
    s = s.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function syncPayload(payload){
    if (!payload || typeof payload !== 'object') return payload;
    if (Array.isArray(payload)) return payload.map(syncPayload);
    if (Object.prototype.hasOwnProperty.call(payload, 'dataApertura')) {
      payload.dataArrivo = payload.dataApertura || null;
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'importoConcordato')) {
      var amount = normalizeMoney(payload.importoConcordato);
      var autoAccepted = false;
      payload.importoConcordato = amount;
      if (amount > 0 && Object.prototype.hasOwnProperty.call(payload, 'dataAccettazione') && !payload.dataAccettazione) {
        payload.dataAccettazione = todayISO();
        autoAccepted = true;
      }
      if (amount > 0 && autoAccepted && !payload.dataScadenza) {
        payload.dataScadenza = payload.dataAccettazione;
      }
    }
    return payload;
  }

  function wrapTable(table){
    if (!table || table.__recordsPayloadPatched) return table;
    ['insert', 'upsert', 'update'].forEach(function(method){
      if (typeof table[method] !== 'function') return;
      var original = table[method].bind(table);
      table[method] = function(payload){
        return original(syncPayload(payload));
      };
    });
    Object.defineProperty(table, '__recordsPayloadPatched', { value: true });
    return table;
  }

  function patchSupabaseFactory(){
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return false;
    if (window.supabase.__recordsPayloadFactoryPatched) return true;

    var originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function(){
      var client = originalCreateClient.apply(window.supabase, arguments);
      if (!client || typeof client.from !== 'function' || client.__recordsPayloadClientPatched) return client;

      var originalFrom = client.from.bind(client);
      client.from = function(tableName){
        var table = originalFrom(tableName);
        return tableName === 'records' ? wrapTable(table) : table;
      };
      Object.defineProperty(client, '__recordsPayloadClientPatched', { value: true });
      return client;
    };
    Object.defineProperty(window.supabase, '__recordsPayloadFactoryPatched', { value: true });
    return true;
  }

  if (!patchSupabaseFactory()) {
    document.addEventListener('DOMContentLoaded', patchSupabaseFactory, { once: true });
  }
})();

// Fase 2: la colonna X non serve piu, resta solo compatibilita dati nascosta.
(function hidePhase2XColumn(){
  'use strict';
  function addStyle(){
    if (document.getElementById('phase2NoXStyle')) return;
    var s = document.createElement('style');
    s.id = 'phase2NoXStyle';
    s.textContent = '#phase2Card th:nth-child(3),#phase2Card td:nth-child(3){display:none!important}#phase2Card .table{min-width:1040px!important}#phase2Card .phase-desc{min-width:360px!important}';
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addStyle, { once:true });
  else addStyle();
})();

// Carica la nuova anteprima stampa della scheda avanzamento lavori.
(function loadPhase2PrintFix(){
  'use strict';
  function load(){
    if (document.querySelector('script[data-elip-phase2-print-fix]')) return;
    var s = document.createElement('script');
    s.src = './phase2-print-fix.js?v=4';
    s.defer = true;
    s.dataset.elipPhase2PrintFix = '1';
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();

// Click sulla P preventivo: grigia apre scheda, arancione/verde apre anteprima.
(function loadPBadgeActions(){
  'use strict';
  function load(){
    if (document.querySelector('script[data-elip-p-badge-actions]')) return;
    var s = document.createElement('script');
    s.src = './p-badge-actions.js?v=1';
    s.async = false;
    s.dataset.elipPBadgeActions = '1';
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();

// Fase 2/Data invio preventivo: etichetta e copia dalla data accettazione solo quando viene inserita.
(function loadSentDatePhase2(){
  'use strict';
  function load(){
    if (document.querySelector('script[data-elip-sent-date-phase2]')) return;
    var s = document.createElement('script');
    s.src = './sent-date-phase2.js?v=4';
    s.async = false;
    s.dataset.elipSentDatePhase2 = '1';
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();

// Home/Ricerca: data accettazione in lista, ordinamento date e colori P preventivo.
(function loadHomeAcceptanceView(){
  'use strict';
  function load(){
    if (document.querySelector('script[data-elip-home-acceptance-view]')) return;
    var s = document.createElement('script');
    s.src = './home-acceptance-view.js?v=8';
    s.async = false;
    s.dataset.elipHomeAcceptanceView = '1';
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();

// Accettate: mostra solo schede accettate ancora aperte/in corso.
(function loadAcceptedOpenFilter(){
  'use strict';
  function load(){
    if (document.querySelector('script[data-elip-accepted-open-filter]')) return;
    var s = document.createElement('script');
    s.src = './accepted-open-filter.js?v=1';
    s.async = false;
    s.dataset.elipAcceptedOpenFilter = '1';
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
})();

// Mobile/tablet: tabella larga e scroll orizzontale, P preventivo sotto al cliente.
(function loadMobileTableFix(){
  'use strict';
  function load(){
    if (document.querySelector('script[data-elip-mobile-table-fix]')) return;
    var s = document.createElement('script');
    s.src = './mobile-table-fix.js?v=1';
    s.async = false;
    s.dataset.elipMobileTableFix = '1';
    document.head.appendChild(s);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once:true });
  else load();
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
