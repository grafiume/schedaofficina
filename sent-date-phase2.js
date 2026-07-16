(function(){
  'use strict';

  function labelFor(inputId){
    var input = document.getElementById(inputId);
    if(!input) return null;
    var wrap = input.closest('.col-md-4,.col-md-3,.col-md-6,.col-lg-3,.col-lg-4,.mb-3,div');
    return wrap ? wrap.querySelector('label') : null;
  }

  function relabel(){
    var e = labelFor('eScad');
    var n = labelFor('nScad');
    if(e) e.textContent = 'Data invio P.';
    if(n) n.textContent = 'Data invio P.';
  }

  function copyAcceptedDateIfNeeded(){
    var sent = document.getElementById('eScad');
    var acc = document.getElementById('eAcc');
    if(sent && acc && !sent.value && acc.value) sent.value = acc.value;
  }

  function bind(){
    relabel();
    var acc = document.getElementById('eAcc');
    if(acc && !acc.__sentDatePhase2Patched){
      acc.__sentDatePhase2Patched = true;
      acc.addEventListener('change', copyAcceptedDateIfNeeded, true);
      acc.addEventListener('input', copyAcceptedDateIfNeeded, true);
    }
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
