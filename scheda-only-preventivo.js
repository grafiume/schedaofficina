// Gestione preventivo solo dalla scheda riparazione.
// Disattiva l'uso operativo di preventivo.html e preventivi.html senza appesantire il caricamento.
(function(){
  'use strict';

  function db(){
    if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    if(!window.__schedaOnlyPreventivoDb){
      window.__schedaOnlyPreventivoDb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
    return window.__schedaOnlyPreventivoDb;
  }
  function record(){ return window.state && window.state.editing ? window.state.editing : null; }
  function parseMoney(v){
    if(v == null) return 0;
    var s = String(v).trim();
    if(!s) return 0;
    s = s.replace(/\s+/g,'').replace(/[^\d,.-]/g,'');
    if(s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g,'').replace(',', '.');
    else s = s.replace(',', '.');
    var n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  function formatMoney(n){
    var v = Number(n || 0);
    return Number.isFinite(v) && v > 0 ? v.toFixed(2) : '';
  }
  function phase2Total(){
    var sum = 0;
    document.querySelectorAll('#phase2Rows [data-field="prezzo"]').forEach(function(el){
      sum += parseMoney(el.value);
    });
    return sum;
  }
  function currentImporto(){
    var input = document.getElementById('eImportoConcordato');
    var amount = parseMoney(input && input.value);
    if(amount > 0) return amount;
    amount = phase2Total();
    if(amount > 0 && input) input.value = formatMoney(amount);
    return amount;
  }
  function setStatus(msg){
    var st = document.getElementById('phase2Status');
    if(st) st.textContent = msg;
  }
  async function latestQuote(client, recordId){
    try{
      var res = await client.from('quotes').select('id,record_id,status,notes,created_at').eq('record_id', recordId).order('created_at', { ascending:false }).limit(1);
      if(!res.error && res.data && res.data[0]) return res.data[0];
    }catch(_e){}
    return null;
  }
  async function savePreventivoInsideScheda(){
    var r = record();
    if(!r || !r.id){
      alert('Apri la scheda cliente per gestire il preventivo.');
      return;
    }
    var client = db();
    if(!client){
      alert('Connessione Supabase non pronta. Riprova tra qualche secondo.');
      return;
    }
    var amount = currentImporto();
    if(!(amount > 0)){
      alert('Inserisci un importo concordato oppure i prezzi nella scheda avanzamento.');
      return;
    }
    var amountText = formatMoney(amount);
    try{
      await client.from('records').update({ importoConcordato: amount }).eq('id', r.id);
      r.importoConcordato = amountText;

      if(typeof window.syncAutoQuoteForRecord === 'function'){
        await window.syncAutoQuoteForRecord(Object.assign({}, r, { importoConcordato: amountText }), amountText);
      }else{
        var quote = await latestQuote(client, r.id);
        var vat = Math.round(amount * 22) / 100;
        var payload = { subtotal_ex_vat: amount, vat_rate: 22, vat_total: vat, grand_total: amount + vat };
        if(quote && quote.id){
          await client.from('quotes').update(payload).eq('id', quote.id);
        }else{
          payload.record_id = r.id;
          payload.status = 'BOZZA';
          payload.notes = '';
          await client.from('quotes').insert(payload);
        }
      }

      setStatus('Preventivo salvato nella scheda. Importo concordato aggiornato.');
      alert('Preventivo salvato nella scheda.');
    }catch(e){
      alert('Errore salvataggio preventivo nella scheda: ' + (e.message || e));
    }
  }
  function prepareButtons(){
    var nav = document.getElementById('btnPreventivi');
    if(nav){
      nav.style.display = 'none';
      nav.disabled = true;
      nav.title = 'I preventivi ora si gestiscono dalla scheda cliente';
    }
    var btn = document.getElementById('btnQuoteOpen');
    if(btn){
      btn.textContent = 'Salva preventivo nella scheda';
      btn.classList.remove('btn-outline-primary');
      btn.classList.add('btn-outline-success');
      btn.title = 'Salva importo e preventivo direttamente su questa scheda';
    }
  }
  function bind(){
    prepareButtons();
    window.setTimeout(prepareButtons, 1000);
    window.setTimeout(prepareButtons, 3000);

    document.addEventListener('click', function(ev){
      var target = ev.target;
      if(!target || !target.closest) return;
      var nav = target.closest('#btnPreventivi');
      var quoteBtn = target.closest('#btnQuoteOpen');
      var badge = target.closest('.badge-p');

      if(nav){
        ev.preventDefault();
        ev.stopImmediatePropagation();
        alert('Ora i preventivi si gestiscono direttamente dalla scheda cliente.');
        return;
      }
      if(badge){
        ev.preventDefault();
        ev.stopImmediatePropagation();
        alert('Apri la scheda con il pulsante Apri: il preventivo ora si gestisce da li.');
        return;
      }
      if(quoteBtn){
        ev.preventDefault();
        ev.stopImmediatePropagation();
        savePreventivoInsideScheda();
      }
    }, true);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();
