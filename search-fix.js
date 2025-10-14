/* search-fix.js — definitivo (match esatto + fix Safari + no duplicati) */
/* search-fix.js — DOM filter (exact match + no duplicates), compatibile Safari */
(function () {
  if (window.__searchFixBound2) return;
  window.__searchFixBound2 = true;

  // ---- helpers -------------------------------------------------------------
  const norm = s => String(s ?? '').trim();
  const eq   = (a,b) => norm(a).toLowerCase() === norm(b).toLowerCase();

  // prova a prendere i campi filtro per name o placeholder (come da UI)
  const pick = sels => sels.map(s=>document.querySelector(s)).find(Boolean);
  const el = {
    batt:  pick(['[name="battCollettore"]','input[placeholder="Batt. collettore"]']),
    asse:  pick(['[name="lunghezzaAsse"]','input[placeholder="Lunghezza asse"]']),
    pacL:  pick(['[name="lunghezzaPacco"]','input[placeholder="Lunghezza pacco"]']),
    pacW:  pick(['[name="larghezzaPacco"]','input[placeholder="Larghezza pacco"]']),
    punta: pick(['[name="punta"]','select']),
    num:   pick(['[name="numPunte"]','input[placeholder="N."]']),
  };

  // trova i pulsanti "Applica filtri" e "Reset" senza selector avanzati
  function findButtonByText(txt){
    txt = txt.toLowerCase();
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find(b => (b.textContent || '').toLowerCase().includes(txt)) || null;
  }
  const btnApply = document.querySelector('button.apply-filters') || findButtonByText('applica');
  const btnReset = document.querySelector('button.reset-filters')  || findButtonByText('reset');

  // mappa colonne per nome leggendo l'intestazione
  function getColMap(){
    const ths = document.querySelectorAll('table thead th');
    const map = {};
    Array.from(ths).forEach((th, i) => {
      const key = th.textContent.trim().toLowerCase();
      map[key] = i;
    });
    return map;
  }

  // legge il valore di una colonna dalla riga usando il testo della TH
  function getCell(row, colTitle, colMap){
    const idx = colMap[colTitle.toLowerCase()];
    if (idx == null) return '';
    const td = row.children[idx];
    return td ? td.textContent : '';
  }

  // deduplica righe per ID (prima colonna si chiama di solito "id")
  function dedupeRows(tbody, colMap){
    const seen = new Set();
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach(r=>{
      const id = getCell(r, 'id', colMap) || r.getAttribute('data-id') || '';
      if (!id) return;
      if (seen.has(id)) r.remove();
      else seen.add(id);
    });
  }

  // applica i filtri direttamente sul DOM della tabella
  function filterTable(){
    const table = document.querySelector('table');
    if (!table) return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;

    const colMap = getColMap();

    // dedupe ad ogni run
    dedupeRows(tbody, colMap);

    const want = {
      battCollettore: norm(el.batt?.value),
      lunghezzaAsse:  norm(el.asse?.value),
      lunghezzaPacco: norm(el.pacL?.value),
      larghezzaPacco: norm(el.pacW?.value),
      punta:          norm(el.punta?.value),
      numPunte:       norm(el.num?.value),
    };

    Array.from(tbody.querySelectorAll('tr')).forEach(row=>{
      const r = {
        battCollettore: getCell(row, 'battCollettore', colMap) || getCell(row, 'batt. collettore', colMap),
        lunghezzaAsse:  getCell(row, 'lunghezzaAsse',  colMap) || getCell(row, 'lunghezza asse', colMap),
        lunghezzaPacco: getCell(row, 'lunghezzaPacco', colMap) || getCell(row, 'lunghezza pacco', colMap),
        larghezzaPacco: getCell(row, 'larghezzaPacco', colMap) || getCell(row, 'larghezza pacco', colMap),
        punta:          getCell(row, 'punta', colMap),
        numPunte:       getCell(row, 'numPunte', colMap) || getCell(row, 'n. punte', colMap) || getCell(row, 'n.', colMap)
      };

      let show = true;
      if (want.battCollettore && !eq(r.battCollettore, want.battCollettore)) show = false;
      if (want.lunghezzaAsse  && !eq(r.lunghezzaAsse,  want.lunghezzaAsse))  show = false;
      if (want.lunghezzaPacco && !eq(r.lunghezzaPacco, want.lunghezzaPacco)) show = false;
      if (want.larghezzaPacco && !eq(r.larghezzaPacco, want.larghezzaPacco)) show = false;
      if (want.punta && want.punta !== '(tutte)' && !eq(r.punta, want.punta)) show = false;
      if (want.numPunte && !eq(r.numPunte, want.numPunte)) show = false;

      row.style.display = show ? '' : 'none';
    });
  }

  // bind bottoni una sola volta
  btnApply && btnApply.addEventListener('click', e=>{
    e.preventDefault();
    filterTable();
  });

  btnReset && btnReset.addEventListener('click', e=>{
    e.preventDefault();
    if (el.batt) el.batt.value = '';
    if (el.asse) el.asse.value = '';
    if (el.pacL) el.pacL.value = '';
    if (el.pacW) el.pacW.value = '';
    if (el.num)  el.num.value  = '';
    if (el.punta) el.punta.value = '(tutte)';
    filterTable();
  });

  // prima esecuzione dopo il render iniziale
  setTimeout(filterTable, 0);

  console.log('[search-fix DOM] attivo');
})();
