
/**
 * detail-and-pdf-tech.js
 * - Aggiunge i campi tecnici (battCollettore, lungAsse, lungPacco, largPacco, punta, numPunte)
 *   dentro la modale "Dettaglio scheda".
 * - Genera un PDF completo includendo anche i campi tecnici.
 *
 * Requisiti:
 *  - esiste window.showDettaglio(id) che apre la modale e una funzione getRecord(id)
 *  - opzionale: getPhotos(id) per inserire l'immagine (prende la prima se presente)
 *  - jsPDF disponibile come window.jspdf.jsPDF (UMD)
 */

(function(){
  let __lastDetailId = null;
  let __lastDetailRecord = null;

  function formatLabelValue(label, value){
    const tr = document.createElement('tr');
    tr.innerHTML = `<th style="width:40%;font-weight:600;">${label}</th><td>${value ?? ''}</td>`;
    return tr;
  }

  function ensureTechTable(container){
    // crea una tabella "Dati tecnici" se non esiste già
    const existing = container.querySelector('table.tech-table');
    if(existing) return existing;
    const title = document.createElement('div');
    title.textContent = 'Dati tecnici';
    title.style.fontWeight = '700';
    title.style.marginTop = '12px';
    title.style.marginBottom = '4px';

    const tbl = document.createElement('table');
    tbl.className = 'table tech-table';
    tbl.style.marginBottom = '12px';

    container.appendChild(title);
    container.appendChild(tbl);
    return tbl;
  }

  async function renderTechInDetail(id, record){
    // trova il body della modale Dettaglio
    const body = document.querySelector('.modal-body') || document.querySelector('#detail, #dettaglioScheda, #detailPane');
    if(!body) return;
    const tbl = ensureTechTable(body);
    tbl.innerHTML = '';

    const r = record || {};
    const rows = [
      ['Batt. collettore', r.battCollettore],
      ['Lunghezza asse',   r.lungAsse],
      ['Lunghezza pacco',  r.lungPacco],
      ['Larghezza pacco',  r.largPacco],
      ['Punta',            r.punta],
      ['N. punte',         r.numPunte],
    ];
    for(const [lab,val] of rows){
      tbl.appendChild(formatLabelValue(lab, (val ?? '').toString()));
    }
  }

  async function getFirstImageDataUrl(id){
    try{
      if(typeof window.getPhotos === 'function'){
        const p = await window.getPhotos(id);
        const img = (p && p.images && p.images[0]) ? p.images[0] : null;
        if(img && img.startsWith('data:image')) return img;
      }
      // Prova dall'anteprima nel dettaglio
      const preview = document.querySelector('.modal-body img, #photoPreview, .preview img');
      if(preview && preview.src) return preview.src;
    }catch(e){}
    return null;
  }

  async function makePdf(record, id){
    if(!window.jspdf || !window.jspdf.jsPDF){
      alert('jsPDF non disponibile.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p','pt','a4');
    let x = 48, y = 56, lh = 18;

    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.text('Scheda riparazioni — Riepilogo', x, y); y += 28;

    doc.setFontSize(12);
    doc.setFont('helvetica','bold');
    function row(label, value){
      doc.text(label + ' :', x, y);
      doc.setFont('helvetica','normal');
      doc.text(String(value ?? ''), x+150, y);
      doc.setFont('helvetica','bold');
      y += lh;
    }

    // campi base (se presenti nel record)
    row('Descrizione', record?.descrizione);
    row('Modello',     record?.modello);
    row('Cliente',     record?.cliente);
    row('Stato pratica', record?.statoPratica);
    row('Preventivo',  record?.preventivoStato);
    row('Data apertura', record?.dataApertura);
    row('Batt. collettore', record?.battCollettore);
    row('Lunghezza asse',   record?.lungAsse);
    row('Lunghezza pacco',  record?.lungPacco);
    row('Larghezza pacco',  record?.largPacco);
    row('Punta',            record?.punta);
    row('N. punte',         record?.numPunte);
    // separatore
    y += 10;
    doc.setFontSize(14); doc.text('Dati tecnici', x, y); y += lh;
    doc.setFontSize(12);

    row('Batt. collettore', record?.battCollettore);
    row('Lunghezza asse',   record?.lungAsse);
    row('Lunghezza pacco',  record?.lungPacco);
    row('Larghezza pacco',  record?.largPacco);
    row('Punta',            record?.punta);
    row('N. punte',         record?.numPunte);

    // immagine (se presente)
    const dataUrl = await getFirstImageDataUrl(id);
    if(dataUrl){
      try{
        y += 10;
        const imgWidth = 480;
        const imgHeight = 320;
        doc.addImage(dataUrl, 'JPEG', x, y, imgWidth, imgHeight, null, 'FAST');
      }catch(e){ /* alcuni browser potrebbero richiedere PNG*/ 
        try{ doc.addImage(dataUrl, 'PNG', x, y, 480, 320, null, 'FAST'); }catch(_){}
      }
    }

    doc.save(`Scheda-${(record?.descrizione||'')}-${(record?.modello||'')}.pdf`);
  }

  function interceptPdfButton(){
    // intercetta il bottone "PDF" dentro la modale
    const btns = Array.from(document.querySelectorAll('button, a'));
    const target = btns.find(b => (b.textContent||'').trim().toUpperCase() === 'PDF');
    if(target){
      target.onclick = async (e) => {
        e.preventDefault();
        const rec = __lastDetailRecord;
        const id = __lastDetailId;
        await makePdf(rec, id);
      };
    }
  }

  // Patch showDettaglio per salvare record/id e renderizzare i campi tecnici
  function patchShowDettaglio(){
    const _show = window.showDettaglio;
    window.showDettaglio = async function(id){
      __lastDetailId = id;
      if(typeof _show === 'function') _show(id);
      setTimeout(async () => {
        try{
          if(typeof window.getRecord === 'function'){
            __lastDetailRecord = await window.getRecord(id);
          }
          await renderTechInDetail(id, __lastDetailRecord);
          interceptPdfButton();
        }catch(e){
          console.warn('[detail-and-pdf-tech] errore:', e?.message);
        }
      }, 80);
    };
  }

  function init(){
    patchShowDettaglio();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
