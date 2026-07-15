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

// Preventivo: quando viene salvato/inviato, copia il totale imponibile in
// records.importoConcordato se quel campo e ancora vuoto.
(function patchPreventivoImportoConcordato(){
  'use strict';

  function isPreventivoPage(){
    return /preventivo\.html$/i.test(location.pathname) || !!document.getElementById('subtotal');
  }
  function db(){
    if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    if(!window.__elipImportoPreventivoDb){
      window.__elipImportoPreventivoDb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
    return window.__elipImportoPreventivoDb;
  }
  function parseMoney(v){
    if(v == null) return 0;
    var s = String(v).trim();
    if(!s) return 0;
    s = s.replace(/\s+/g, '').replace(/[^\d,.-]/g, '');
    if(s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    var n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  function formatMoney(v){
    var n = Number(v || 0);
    return Number.isFinite(n) && n > 0 ? n.toFixed(2).replace('.', ',') : null;
  }
  async function quoteFromPage(){
    var client = db();
    if(!client) return null;
    var params = new URLSearchParams(location.search);
    var id = params.get('id');
    var recordId = params.get('record_id');

    if(id){
      var byId = await client.from('quotes').select('id,record_id,subtotal_ex_vat,grand_total,created_at').eq('id', id).single();
      if(!byId.error && byId.data) return byId.data;
    }
    if(recordId){
      var latest = await client.from('quotes').select('id,record_id,subtotal_ex_vat,grand_total,created_at').eq('record_id', recordId).order('created_at', { ascending:false }).limit(1);
      if(!latest.error && latest.data && latest.data[0]) return latest.data[0];
    }
    return null;
  }
  async function syncOnce(){
    var client = db();
    if(!client) return;
    var q = await quoteFromPage();
    if(!q || !q.record_id) return;

    var amount = parseMoney(q.subtotal_ex_vat) || parseMoney(q.grand_total);
    if(!(amount > 0)) return;

    try{
      var current = await client.from('records').select('id,importoConcordato').eq('id', q.record_id).single();
      if(!current.error && parseMoney(current.data && current.data.importoConcordato) > 0) return;
    }catch(_e){}

    try{
      await client.from('records').update({ importoConcordato: formatMoney(amount) }).eq('id', q.record_id);
    }catch(_e){}
  }
  function scheduleSync(){
    [700, 1800, 3500, 6000].forEach(function(ms){
      window.setTimeout(function(){ syncOnce().catch(function(){}); }, ms);
    });
  }
  function bind(){
    if(!isPreventivoPage()) return;
    ['btnSave','btnInvia','btnPdf'].forEach(function(id){
      var btn = document.getElementById(id);
      if(btn && !btn.__elipImportoSync){
        btn.__elipImportoSync = true;
        btn.addEventListener('click', scheduleSync);
      }
    });
    scheduleSync();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();

// Scheda avanzamento: stampa senza &nbsp; visibili, con DDT/NOTE, e rende
// "Salva avanzamento" equivalente al salvataggio della scheda.
(function patchAvanzamentoStampaESalva(){
  'use strict';

  function isIndexPage(){
    return /index\.html$/i.test(location.pathname) || !!document.getElementById('page-edit');
  }
  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function textOf(id){
    var el = document.getElementById(id);
    return el ? (el.value || el.textContent || '').trim() : '';
  }
  function fmtDate(v){
    if(!v) return '';
    var s = String(v);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      var p = s.slice(0, 10).split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    return s;
  }
  function num(v){
    var n = Number(String(v || '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  function euro(v){
    return Number(v || 0).toLocaleString('it-IT', { style:'currency', currency:'EUR' });
  }
  function selectedRecord(){
    return (window.state && window.state.editing) ? window.state.editing : {};
  }
  function collectRows(){
    var rows = [];
    document.querySelectorAll('#phase2Rows tr').forEach(function(tr){
      var row = {
        code: (tr.children[0] && tr.children[0].textContent || '').trim(),
        description: (tr.children[1] && tr.children[1].textContent || '').trim(),
        checked: !!tr.querySelector('[data-field="checked"]')?.checked,
        ore: tr.querySelector('[data-field="ore"]')?.value || '',
        addetto: tr.querySelector('[data-field="addetto"]')?.value || '',
        dataEntrata: tr.querySelector('[data-field="dataEntrata"]')?.value || '',
        dataUscita: tr.querySelector('[data-field="dataUscita"]')?.value || '',
        prezzo: tr.querySelector('[data-field="prezzo"]')?.value || ''
      };
      rows.push(row);
    });
    return rows;
  }
  function printSheet(){
    var r = selectedRecord();
    var rows = collectRows();
    var ore = rows.reduce(function(s,row){ return s + num(row.ore); }, 0);
    var prezzo = rows.reduce(function(s,row){ return s + num(row.prezzo); }, 0);
    var htmlRows = rows.map(function(row){
      return '<tr><td>'+esc(row.code)+'</td><td>'+esc(row.description)+'</td><td>'+(row.checked ? 'X' : '')+'</td><td>'+esc(row.ore)+'</td><td>'+esc(row.addetto)+'</td><td>'+esc(fmtDate(row.dataEntrata))+'</td><td>'+esc(fmtDate(row.dataUscita))+'</td><td>'+esc(row.prezzo)+'</td></tr>';
    }).join('');
    var doc = '<!doctype html><html><head><meta charset="utf-8"><title>Scheda avanzamento lavori</title><style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;color:#111;font-size:11px}.head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:3px solid #ff6b00;padding-bottom:8px;margin-bottom:10px}.brand{font-size:24px;font-weight:800}.brand span{display:block;color:#ff6b00;font-size:13px;letter-spacing:4px}.title{font-size:24px;font-weight:800;text-align:center}.info{font-size:10px;line-height:1.45}.grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:0;border:1px solid #111;border-bottom:0}.box{border-right:1px solid #111;border-bottom:1px solid #111;padding:7px;min-height:34px}.box:nth-child(3n){border-right:0}.lbl{font-weight:700;display:block;margin-bottom:5px}.desc{border:1px solid #111;border-top:0;padding:7px;min-height:34px}.extra{display:grid;grid-template-columns:1fr 2fr;border-left:1px solid #111;border-right:1px solid #111}.extra div{border-bottom:1px solid #111;padding:7px;min-height:30px}.extra div:first-child{border-right:1px solid #111}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #111;padding:5px;vertical-align:middle}th{background:#fff3e8;font-weight:800;text-align:center}td:nth-child(1),td:nth-child(3),td:nth-child(4),td:nth-child(8){text-align:center}.tot{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}.tot div{border:1px solid #111;padding:8px 14px;font-weight:800}.sign{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.sign div{border:1px solid #111;min-height:64px;padding:7px}.foot{text-align:center;font-weight:800;margin-top:12px;border-top:2px solid #ff6b00;padding-top:8px}</style></head><body><div class="head"><div class="brand">ELIP TAGLIENTE<span>MOTORI ELETTRICI</span></div><div class="title">SCHEDA RIPARAZIONE /<br>AVANZAMENTO LAVORI</div><div class="info">Via Conchia, 54/E - 70043 Monopoli (BA)<br>080.777.090 - 080.887.67.56<br>info@eliptagliente.it<br>www.eliptagliente.it</div></div><div class="grid"><div class="box"><span class="lbl">CLIENTE</span>'+esc(textOf('eCliente') || r.cliente)+'</div><div class="box"><span class="lbl">TELEFONO</span>'+esc(textOf('eTel') || r.telefono)+'</div><div class="box"><span class="lbl">DATA</span>'+esc(fmtDate(textOf('eApertura') || r.dataApertura))+'</div><div class="box"><span class="lbl">CASSETTO</span>'+esc(textOf('eCassetto') || r.cassetto || r.cassetto_storico)+'</div><div class="box"><span class="lbl">N. PREVENTIVO</span></div><div class="box"><span class="lbl">Q.TA</span></div></div><div class="desc"><span class="lbl">DESCRIZIONE/TIPO</span>'+esc(textOf('eDescrizione') || r.descrizione)+'</div><div class="extra"><div><span class="lbl">DDT</span>'+esc(textOf('eDDT') || r.docTrasporto)+'</div><div><span class="lbl">NOTE</span>'+esc(textOf('eNote') || r.note)+'</div></div><table><thead><tr><th>COD</th><th>DESCRIZIONE LAVORI</th><th>X</th><th>ORE</th><th>ADDETTO</th><th>DATA ENTRATA</th><th>DATA USCITA</th><th>PREZZO</th></tr></thead><tbody>'+htmlRows+'</tbody></table><div class="tot"><div>ORE TOTALI: '+ore.toLocaleString('it-IT',{maximumFractionDigits:2})+'</div><div>TOTALE PREZZO: '+euro(prezzo)+'</div></div><div class="sign"><div><strong>ESITO COLLAUDO</strong><br><br>&#9633; POSITIVO &nbsp;&nbsp; &#9633; NEGATIVO</div><div><strong>FIRMA RESPONSABILE</strong><br><br><br>DATA ____________________</div></div><div class="foot">GRAZIE PER AVER SCELTO LA NOSTRA OFFICINA</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>';
    var w = window.open('', '_blank');
    if(!w) return;
    w.document.open();
    w.document.write(doc);
    w.document.close();
  }
  function bind(){
    if(!isIndexPage()) return;
    document.addEventListener('click', function(ev){
      var printBtn = ev.target && ev.target.closest && ev.target.closest('#phase2PrintBtn');
      if(printBtn){
        ev.preventDefault();
        ev.stopImmediatePropagation();
        printSheet();
        return;
      }
      var saveBtn = ev.target && ev.target.closest && ev.target.closest('#phase2SaveBtn');
      if(saveBtn && !saveBtn.disabled){
        window.setTimeout(function(){
          if(typeof window.saveEdit === 'function') window.saveEdit(true);
        }, 1600);
      }
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
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

// Ricerca: abilita Return/Invio su tutti i campi della schermata ricerca.
(function patchAllSearchFieldsEnterKey(){
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
