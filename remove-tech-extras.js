
/**
 * remove-tech-extras.js
 * Rimuove QUALSIASI card "Dati tecnici" dalle schermate Home/Ricerca/Modifica,
 * lasciandola solo dentro il vero "Dettaglio scheda".
 *
 * Usa euristiche non invasive: cerca una card con header "Dati tecnici" e la rimuove
 * se NON è dentro un contenitore di dettaglio.
 */
(function(){
  const CARD_SELECTOR = '.card .card-header';
  const DETAIL_SELECTORS = [
    '#dettaglioScheda',
    '#detailPane',
    '#detail',
    '#dettaglio',
    '.detail-pane',
    '.detail-panel',
    '.modal-body',
    '.offcanvas-body',
    '#detailView',
    '#detail-panel'
  ];

  function isInsideDetail(node){
    if(!node) return false;
    for(const sel of DETAIL_SELECTORS){
      const container = document.querySelector(sel);
      if(container && container.contains(node)) return true;
    }
    return false;
  }

  function cleanup(){
    document.querySelectorAll(CARD_SELECTOR).forEach(h => {
      const title = (h.textContent||'').trim().toLowerCase();
      if(title === 'dati tecnici'){
        const card = h.closest('.card');
        if(card && !isInsideDetail(card)){
          card.remove();
        }
      }
    });
  }

  // Prima pulizia e al variare dell'hash (spa-like)
  function init(){
    cleanup();
    window.addEventListener('hashchange', cleanup);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
