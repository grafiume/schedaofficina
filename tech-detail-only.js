
(function(){
  const CARD_CLASS = 'tech-detail-card';

  function buildCard(){
    const wrap = document.createElement('div');
    wrap.className = 'card mt-3 ' + CARD_CLASS;
    wrap.innerHTML = `
      <div class="card-header fw-bold">Dati tecnici</div>
      <div class="card-body row g-2">
        <div class="col-6"><small class="text-muted">Batt. collettore</small><div id="d-battCollettore" class="fw-semibold"></div></div>
        <div class="col-6"><small class="text-muted">Lunghezza asse</small><div id="d-lungAsse" class="fw-semibold"></div></div>
        <div class="col-6"><small class="text-muted">Lunghezza pacco</small><div id="d-lungPacco" class="fw-semibold"></div></div>
        <div class="col-6"><small class="text-muted">Larghezza pacco</small><div id="d-largPacco" class="fw-semibold"></div></div>
        <div class="col-6"><small class="text-muted">Punta</small><div id="d-punta" class="fw-semibold"></div></div>
        <div class="col-6"><small class="text-muted">N.</small><div id="d-numPunte" class="fw-semibold"></div></div>
      </div>`;
    return wrap;
  }

  function findDetailContainer(){
    const selectors = [
      '#dettaglioScheda',
      '#detailPane',
      '#detail',
      '#dettaglio',
      '.detail-pane',
      '.detail-panel',
      '.modal-body .container',
      '.modal-body',
      '.offcanvas-body',
      '#detailView',
      '#detail-panel'
    ];
    for(const sel of selectors){
      const el = document.querySelector(sel);
      if(el) return el;
    }
    // fallback: try a wide column on the right
    const candidates = document.querySelectorAll('.col, .col-12, .col-md-8, .col-lg-8');
    return candidates[candidates.length-1] || null;
  }

  function clearCardsOutsideDetail(){
    // rimuovi qualsiasi card tecnica che non sia nel container di dettaglio
    const cards = document.querySelectorAll('.' + CARD_CLASS);
    for(const c of cards){
      const container = findDetailContainer();
      if(!container || !container.contains(c)) c.remove();
    }
  }

  function ensureCardInDetail(){
    const container = findDetailContainer();
    if(!container) return null;
    let card = container.querySelector('.' + CARD_CLASS);
    if(!card){
      card = buildCard();
      container.appendChild(card);
    }
    return card;
  }

  window.populateDettaglioTecnico = function(record){
    if(!record) return;
    const map = {
      '#d-battCollettore': 'battCollettore',
      '#d-lungAsse': 'lungAsse',
      '#d-lungPacco': 'lungPacco',
      '#d-largPacco': 'largPacco',
      '#d-punta': 'punta',
      '#d-numPunte': 'numPunte'
    };
    Object.entries(map).forEach(([sel,key])=>{
      const el = document.querySelector(sel);
      if(el) el.textContent = (record?.[key] ?? '').toString();
    });
  };

  function patchShowDettaglio(){
    const _show = window.showDettaglio;
    window.showDettaglio = async function(id){
      if(typeof _show === 'function') _show(id);
      // Dopo il render del dettaglio, assicura la card e popola
      setTimeout(async () => {
        clearCardsOutsideDetail();
        const card = ensureCardInDetail();
        let rec = null;
        try{
          if(typeof window.getRecord === 'function') rec = await window.getRecord(id);
        }catch{}
        window.populateDettaglioTecnico(rec);
      }, 50);
    };
  }

  function init(){
    clearCardsOutsideDetail();
    patchShowDettaglio();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
