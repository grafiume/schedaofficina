(function(){
  'use strict';

  function norm(v){
    return (v == null ? '' : String(v)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }

  function isAcceptedOpen(record){
    return !!(record && record.dataAccettazione) && norm(record.statoPratica).indexOf('completata') < 0;
  }

  function countAcceptedOpen(rows){
    return (rows || []).filter(isAcceptedOpen).length;
  }

  function setAccCount(rows){
    var el = document.getElementById('kpiAcc');
    if(el) el.textContent = countAcceptedOpen(rows);
  }

  function bindAccButton(){
    var btn = document.getElementById('kpiAccBtn');
    if(!btn || btn.__acceptedOpenOnlyPatched) return;
    btn.__acceptedOpenOnlyPatched = true;
    btn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      if(ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      var all = (window.state && Array.isArray(window.state.all)) ? window.state.all : [];
      if(typeof window.renderHome === 'function') window.renderHome(all.filter(isAcceptedOpen));
    }, true);
  }

  function patchRenderHome(){
    if(typeof window.renderHome !== 'function' || window.renderHome.__acceptedOpenCountPatched) return false;
    var original = window.renderHome;
    window.renderHome = function(rows){
      original.apply(this, arguments);
      setAccCount(rows);
      bindAccButton();
    };
    window.renderHome.__acceptedOpenCountPatched = true;
    return true;
  }

  function init(){
    bindAccButton();
    var tries = 0;
    var timer = setInterval(function(){
      tries++;
      bindAccButton();
      if(patchRenderHome() || tries > 50) clearInterval(timer);
    }, 100);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
