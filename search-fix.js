/* search-fix.js
   - Filtri tecnici con match ESATTO (trim + case-insensitive)
   - Lettura campi form (per placeholder o name)
   - Applica/Reset con bind singolo
   - Niente duplicati: pulizia tbody prima del render
*/
(function () {
  if (window.__searchFixBound) return;
  window.__searchFixBound = true;

  // --- 1) EQ esatto per i filtri tecnici
  const el = {
  batt:  pick(['[name="battCollettore"]','input[placeholder="Batt. collettore"]']),
  asse:  pick(['[name="lunghezzaAsse"]','input[placeholder="Lunghezza asse"]']),
  pacL:  pick(['[name="lunghezzaPacco"]','input[placeholder="Lunghezza pacco"]']),
  pacW:  pick(['[name="larghezzaPacco"]','input[placeholder="Larghezza pacco"]']),
  punta: pick(['[name="punta"]','select']),
  num:   pick(['[name="numPunte"]','input[placeholder="N."]']),
  // ✅ versioni compatibili per i pulsanti
  btnApply: document.querySelector('button.apply-filters') 
          || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Applica')),
  btnReset: document.querySelector('button.reset-filters') 
          || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().includes('Reset'))
};

  // --- 2) Helper selettori: prova id/name/placeholder
  const pick = (sels) => sels.map(s=>document.querySelector(s)).find(Boolean);

  const el = {
    batt:  pick(['[name="battCollettore"]','input[placeholder="Batt. collettore"]']),
    asse:  pick(['[name="lunghezzaAsse"]','input[placeholder="Lunghezza asse"]']),
    pacL:  pick(['[name="lunghezzaPacco"]','input[placeholder="Lunghezza pacco"]']),
    pacW:  pick(['[name="larghezzaPacco"]','input[placeholder="Larghezza pacco"]']),
    punta: pick(['[name="punta"]','select']),
    num:   pick(['[name="numPunte"]','input[placeholder="N."]']),
    btnApply: pick(['button.apply-filters','button:has(> span):contains("Applica filtri")','button']),
    btnReset: pick(['button.reset-filters','button:has(> span):contains("Reset")','button'])
  };

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

  // --- 3) Hook render: pulisci tbody per evitare duplicati
  function clearTableBody(){
    const tbody = document.querySelector('#searchTable tbody, table.table tbody, table tbody');
    if (tbody) tbody.innerHTML = '';
  }
  // wrap di lista() se esiste
  if (typeof window.lista === 'function') {
    const origLista = window.lista;
    window.lista = async function(...args){
      clearTableBody();
      return await origLista.apply(this, args);
    };
  }

  // --- 4) Bind Applica / Reset (una sola volta)
  el.btnApply?.addEventListener('click', (e)=>{
    // evita submit form o doppi bind
    e.preventDefault();
    readTechFilters();
    if (typeof window.lista === 'function') window.lista();
    else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }, { once:false });

  el.btnReset?.addEventListener('click', (e)=>{
    e.preventDefault();
    // svuota UI
    ['batt','asse','pacL','pacW','num'].forEach(k=>{ if(el[k]) el[k].value = ''; });
    if (el.punta) el.punta.value = '(tutte)';
    // svuota filtri e ricarica
    window.techFilters = {};
    if (typeof window.lista === 'function') window.lista();
    else if (typeof window.refreshDashboard === 'function') window.refreshDashboard();
  }, { once:false });

  console.log('[search-fix] attivo');
})();
