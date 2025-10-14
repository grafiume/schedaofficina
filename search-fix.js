/* search-fix.js — definitivo (match esatto + fix Safari + no duplicati) */
(function () {
  if (window.__searchFixBound) return;
  window.__searchFixBound = true;

  // --- 1) EQ esatto per i filtri tecnici
  const eq = (a,b)=> String(a??'').trim().toLowerCase() === String(b??'').trim().toLowerCase();
  window.matchTechFilters = function (r) {
    const w = window.techFilters || {};
    if (w.battCollettore && !eq(r.battCollettore, w.battCollettore)) return false;
    if (w.lunghezzaAsse && !eq(r.lunghezzaAsse, w.lunghezzaAsse)) return false;
    if (w.lunghezzaPacco && !eq(r.lunghezzaPacco, w.lunghezzaPacco)) return false;
    if (w.larghezzaPacco && !eq(r.larghezzaPacco, w.larghezzaPacco)) return false;
    if (w.punta && w.punta !== '(tutte)' && !eq(r.punta, w.punta)) return false;
    if (w.numPunte && !eq(r.numPunte, w.numPunte)) return false;
    return true;
  };

  // --- 2) Helper per selezionare elementi (id, name, placeholder)
  const pick = sels => sels.map(s=>document.querySelector(s)).find(Boolean);

  const el = {
    batt:  pick(['[name="battCollettore"]','input[placeholder="Batt. collettore"]']),
    asse:  pick(['[name="lunghezzaAsse"]','input[placeholder="Lunghezza asse"]']),
    pacL:  pick(['[name="lunghezzaPacco"]','input[placeholder="Lunghezza pacco"]']),
    pacW:  pick(['[name="larghezzaPacco"]','input[placeholder="Larghezza pacco"]']),
    punta: pick(['[name="punta"]','select']),
    num:   pick(['[name="numPunte"]','input[placeholder="N."]']),
    // pulsanti compatibili Safari
    btnApply: document.querySelector('button.apply-filters')
           || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Applica')),
    btnReset: document.querySelector('button.reset-filters')
           || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Reset'))
  };

  // --- 3) Leggi valori filtri tecnici
  function readTechFilters(){
    window.techFilters = {
      battCollettore: (el.batt?.value ?? '').trim(),
      lunghezzaAsse:  (el.asse?.value ?? '').trim(),
      lunghezzaPacco: (el.pacL?.value ?? '').trim(),
      larghezzaPacco: (el.pacW?.value ?? '').trim(),
      punta:          (el.punta?.value ?? '').trim(),
      numPunte:       (el.num?.value ?? '').trim(),
    };
    console.log('[techFilters]', window.techFilters);
  }

  // --- 4) Pulisci la tabella prima del render (evita duplicati)
  function clearTableBody(){
    const tbody = document.querySelector('#searchTable tbody, table.table tbody, table tbody');
    if (tbody) tbody.innerHTML = '';
  }

  if (typeof window.lista === 'function') {
    const origLista = window.lista;
    window.lista = async function(...args){
      clearTableBody();
      return await origLista.apply(this, args);
    };
  }

  // --- 5) Bind pulsanti una sola volta
  el.btnApply?.addEventListener('click', e=>{
    e.preventDefault();
    readTechFilters();
    if (typeof window.lista === 'function') window.lista();
    else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
  });

  el.btnReset?.addEventListener('click', e=>{
    e.preventDefault();
    ['batt','asse','pacL','pacW','num'].forEach(k=>{ if(el[k]) el[k].value=''; });
    if (el.punta) el.punta.value='(tutte)';
    window.techFilters = {};
    if (typeof window.lista === 'function') window.lista();
    else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
  });

  console.log('[search-fix] attivo');
})();
