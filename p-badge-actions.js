// Azioni intelligenti sulla P preventivo in Home/Ricerca.
// P grigia: apre la scheda cliente. P arancione/verde: apre anteprima preventivo/scheda lavoro.
(function(){
  'use strict';

  function closestRow(el){
    return el && el.closest ? el.closest('tr') : null;
  }

  function openButton(row){
    if(!row) return null;
    var buttons = row.querySelectorAll('button');
    for(var i=0;i<buttons.length;i++){
      if(String(buttons[i].textContent || '').trim().toLowerCase() === 'apri') return buttons[i];
    }
    return row.querySelector('button.btn-outline-primary,button');
  }

  function isGray(badge){
    return badge.classList.contains('p-gray') && !badge.classList.contains('p-orange') && !badge.classList.contains('p-green') && !badge.classList.contains('p-yellow');
  }

  function isPreviewable(badge){
    return badge.classList.contains('p-orange') || badge.classList.contains('p-green') || badge.classList.contains('p-yellow');
  }

  function waitForPreviewAndClick(){
    var attempts = 0;
    var timer = setInterval(function(){
      attempts += 1;
      var edit = document.getElementById('page-edit');
      var visible = edit && !edit.classList.contains('d-none');
      var btn = document.getElementById('phase2PrintBtn');
      if(visible && btn){
        clearInterval(timer);
        btn.click();
        return;
      }
      if(attempts >= 40) clearInterval(timer);
    }, 250);
  }

  function handleBadgeClick(ev){
    var badge = ev.target && ev.target.closest ? ev.target.closest('.badge-p') : null;
    if(!badge) return;

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    var row = closestRow(badge);
    var btn = openButton(row);
    if(!btn){
      alert('Non riesco ad aprire questa scheda. Usa il pulsante Apri.');
      return;
    }

    if(isGray(badge)){
      btn.click();
      return;
    }

    if(isPreviewable(badge)){
      btn.click();
      waitForPreviewAndClick();
      return;
    }

    btn.click();
  }

  function style(){
    if(document.getElementById('pBadgeActionsStyle')) return;
    var s = document.createElement('style');
    s.id = 'pBadgeActionsStyle';
    s.textContent = '.badge-p{cursor:pointer!important}.badge-p:focus{outline:2px solid #222;outline-offset:2px}';
    document.head.appendChild(s);
  }

  document.addEventListener('click', handleBadgeClick, true);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', style, { once:true });
  else style();
})();
