(function(){
  const FIELDS = [
    ['Descrizione',        'descrizione'],
    ['Modello',            'modello'],
    ['Cliente',            'cliente'],
    ['Telefono',           'telefono'],
    ['Email',              'email'],
    // --- tecnici ---
    ['Batt. collettore',   'battCollettore'],
    ['Lunghezza asse',     'lunghezzaAsse'],
    ['Lunghezza pacco',    'lunghezzaPacco'],
    ['Larghezza pacco',    'larghezzaPacco'],
    ['Punta',              'punta'],
    ['N. punte',           'numPunte'],
    // --- stato / documenti / date ---
    ['Stato pratica',      'statoPratica'],
    ['Preventivo',         'preventivoStato'],
    ['Documento Trasporto','docTrasporto'],
    ['Data apertura',      'dataApertura'],
    ['Data accettazione',  'dataAccettazione'],
    ['Data scadenza',      'dataScadenza'],
    ['Note',               'note'],
  ];

  function dmy(s){
    if(!s) return '';
    const t = String(s).split('T')[0];
    const a = t.split('-');
    return (a.length===3) ? `${a[2]}/${a[1]}/${a[0]}` : s;
  }
  function formatValue(key, val){
    if(['dataApertura','dataAccettazione','dataScadenza'].includes(key)) return dmy(val);
    return (val==null ? '' : String(val));
  }
  function container(){
    return document.getElementById('detailContent') ||
           document.querySelector('#dettaglioScheda') ||
           document.querySelector('.modal-body');
  }
  function render(record){
    const el = container();
    if(!el) return;
    const tbl = document.createElement('table');
    tbl.className = 'table table-sm';
    tbl.innerHTML = FIELDS.map(([label,key]) => (
      `<tr><th>${label}</th><td>${formatValue(key, record?.[key])}</td></tr>`
    )).join('');
    // preserva eventuale immagine già presente
    const img = el.querySelector('img#detailImg, img.img-fluid, img');
    el.innerHTML = '';
    if(img) el.appendChild(img);
    el.appendChild(tbl);
  }
  function patch(){
    const _open = window.apri;
    window.apri = async function(id){
      if(typeof _open==='function') await _open(id);
      try{
        const rec = (typeof window.getRecord==='function') ? await window.getRecord(id) : null;
        render(rec||{});
      }catch(e){ console.warn('[detail-fields-override] errore:', e?.message); }
    };
    console.log('[detail-fields-override] attivo — campi Dettaglio sovrascritti');
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', patch); }
  else{ patch(); }
})();