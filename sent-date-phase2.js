(function(){
  'use strict';

  function todayISO(){
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function labelFor(inputId){
    var input = document.getElementById(inputId);
    if(!input) return null;
    var wrap = input.closest('.col-md-4,.col-md-3,.col-md-6,.col-lg-3,.col-lg-4,.mb-3,div');
    return wrap ? wrap.querySelector('label') : null;
  }

  function relabel(){
    var e = labelFor('eScad');
    var n = labelFor('nScad');
    if(e) e.textContent = 'Data invio prev.';
    if(n) n.textContent = 'Data invio prev.';
  }

  function phase2HasWork(){
    var rows = document.getElementById('phase2Rows');
    if(!rows) return false;
    var fields = rows.querySelectorAll('input,textarea,select');
    for(var i=0; i<fields.length; i++){
      if(String(fields[i].value || '').trim()) return true;
    }
    return false;
  }

  function ensureSentDate(fieldId){
    var field = document.getElementById(fieldId);
    if(field && !field.value) field.value = todayISO();
  }

  function maybeSetEditSentDate(){
    if(phase2HasWork()) ensureSentDate('eScad');
  }

  function bind(){
    relabel();
    var phase2 = document.getElementById('phase2Rows') || document.getElementById('phase2Card');
    if(phase2 && !phase2.__sentDatePhase2Patched){
      phase2.__sentDatePhase2Patched = true;
      phase2.addEventListener('input', maybeSetEditSentDate, true);
      phase2.addEventListener('change', maybeSetEditSentDate, true);
    }
    ['btnSave','phase2SaveBtn','btnPhase2Save'].forEach(function(id){
      var btn = document.getElementById(id);
      if(btn && !btn.__sentDatePhase2Patched){
        btn.__sentDatePhase2Patched = true;
        btn.addEventListener('click', maybeSetEditSentDate, true);
      }
    });
  }

  function init(){
    bind();
    var tries = 0;
    var timer = setInterval(function(){
      tries++;
      bind();
      if(tries > 50) clearInterval(timer);
    }, 200);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
