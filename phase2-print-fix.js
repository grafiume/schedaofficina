// Anteprima stampa corretta per scheda avanzamento lavori.
// Aggiunge DDT/NOTE, celle vuote pulite e pulsanti Stampa/Condividi/Chiudi.
(function(){
  'use strict';

  function rec(){ return window.state && window.state.editing ? window.state.editing : {}; }
  function esc(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
  function cell(v){ return esc(v == null ? '' : v); }
  function textOf(id){
    var el = document.getElementById(id);
    return el ? (el.value || el.textContent || '').trim() : '';
  }
  function fmtDate(v){
    if(!v) return '';
    var s = String(v);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      var p = s.slice(0,10).split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    }
    return s;
  }
  function num(v){
    var n = Number(String(v || '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  function euro(v){ return Number(v || 0).toLocaleString('it-IT',{style:'currency',currency:'EUR'}); }
  function collectRows(){
    var rows = [];
    document.querySelectorAll('#phase2Rows tr').forEach(function(tr){
      rows.push({
        code: (tr.children[0] && tr.children[0].textContent || '').trim(),
        description: (tr.children[1] && tr.children[1].textContent || '').trim(),
        checked: !!(tr.querySelector('[data-field="checked"]') || {}).checked,
        ore: (tr.querySelector('[data-field="ore"]') || {}).value || '',
        addetto: (tr.querySelector('[data-field="addetto"]') || {}).value || '',
        dataEntrata: (tr.querySelector('[data-field="dataEntrata"]') || {}).value || '',
        dataUscita: (tr.querySelector('[data-field="dataUscita"]') || {}).value || '',
        prezzo: (tr.querySelector('[data-field="prezzo"]') || {}).value || ''
      });
    });
    return rows;
  }
  function buildDocument(){
    var r = rec();
    var rows = collectRows();
    var ore = rows.reduce(function(s,row){ return s + num(row.ore); }, 0);
    var prezzo = rows.reduce(function(s,row){ return s + num(row.prezzo); }, 0);
    var title = 'Scheda avanzamento lavori';
    var htmlRows = rows.map(function(row){
      return '<tr>'+
        '<td>'+cell(row.code)+'</td>'+
        '<td>'+cell(row.description)+'</td>'+
        '<td>'+(row.checked ? 'X' : '')+'</td>'+
        '<td>'+cell(row.ore)+'</td>'+
        '<td>'+cell(row.addetto)+'</td>'+
        '<td>'+cell(fmtDate(row.dataEntrata))+'</td>'+
        '<td>'+cell(fmtDate(row.dataUscita))+'</td>'+
        '<td>'+cell(row.prezzo)+'</td>'+
      '</tr>';
    }).join('');

    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title><style>'+css()+'</style></head><body>'+toolbar()+
      '<main class="sheet" id="sheet"><div class="head"><div class="brand">ELIP TAGLIENTE<span>MOTORI ELETTRICI</span></div><div class="title">SCHEDA RIPARAZIONE /<br>AVANZAMENTO LAVORI</div><div class="info">Via Conchia, 54/E - 70043 Monopoli (BA)<br>080.777.090 - 080.887.67.56<br>info@eliptagliente.it<br>www.eliptagliente.it</div></div>'+ 
      '<div class="grid"><div class="box"><span class="lbl">CLIENTE</span>'+cell(textOf('eCliente') || r.cliente)+'</div><div class="box"><span class="lbl">TELEFONO</span>'+cell(textOf('eTel') || r.telefono)+'</div><div class="box"><span class="lbl">DATA</span>'+cell(fmtDate(textOf('eApertura') || r.dataApertura))+'</div><div class="box"><span class="lbl">CASSETTO</span>'+cell(textOf('eCassetto') || r.cassetto || r.cassetto_storico)+'</div><div class="box"><span class="lbl">N. PREVENTIVO</span></div><div class="box"><span class="lbl">Q.TA</span></div></div>'+ 
      '<div class="desc"><span class="lbl">DESCRIZIONE/TIPO</span>'+cell(textOf('eDescrizione') || r.descrizione)+'</div>'+ 
      '<div class="extra"><div><span class="lbl">DDT</span>'+cell(textOf('eDDT') || r.docTrasporto)+'</div><div><span class="lbl">NOTE</span>'+cell(textOf('eNote') || r.note)+'</div></div>'+ 
      '<table><thead><tr><th>COD</th><th>DESCRIZIONE LAVORI</th><th>X</th><th>ORE</th><th>ADDETTO</th><th>DATA ENTRATA</th><th>DATA USCITA</th><th>PREZZO</th></tr></thead><tbody>'+htmlRows+'</tbody></table>'+ 
      '<div class="tot"><div>ORE TOTALI: '+ore.toLocaleString('it-IT',{maximumFractionDigits:2})+'</div><div>TOTALE PREZZO: '+euro(prezzo)+'</div></div>'+ 
      '<div class="sign"><div><strong>ESITO COLLAUDO</strong><br><br><span class="checkline">&#9633; POSITIVO</span><span class="checkline">&#9633; NEGATIVO</span></div><div><strong>FIRMA RESPONSABILE</strong><br><br><br>DATA ____________________</div></div><div class="foot">GRAZIE PER AVER SCELTO LA NOSTRA OFFICINA</div></main>'+script()+'</body></html>';
  }
  function toolbar(){
    return '<div class="toolbar"><button id="printBtn">Stampa</button><button id="shareBtn">Condividi</button><button id="closeBtn">Chiudi anteprima</button></div>';
  }
  function css(){
    return '@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;font-size:11px;margin:0;background:#f3f4f6}.toolbar{position:sticky;top:0;z-index:5;display:flex;gap:8px;justify-content:center;padding:10px;background:#fff;border-bottom:1px solid #ddd}.toolbar button{border:1px solid #333;background:#fff;border-radius:6px;padding:8px 14px;font-weight:700}.toolbar button:first-child{background:#ff6b00;border-color:#ff6b00;color:#fff}.sheet{width:210mm;min-height:297mm;margin:12px auto;padding:10mm;background:#fff}.head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:3px solid #ff6b00;padding-bottom:8px;margin-bottom:10px}.brand{font-size:24px;font-weight:800}.brand span{display:block;color:#ff6b00;font-size:13px;letter-spacing:4px}.title{font-size:24px;font-weight:800;text-align:center}.info{font-size:10px;line-height:1.45}.grid{display:grid;grid-template-columns:2fr 1fr 1fr;border:1px solid #111;border-bottom:0}.box{border-right:1px solid #111;border-bottom:1px solid #111;padding:7px;min-height:34px}.box:nth-child(3n){border-right:0}.lbl{font-weight:700;display:block;margin-bottom:5px}.desc{border:1px solid #111;border-top:0;padding:7px;min-height:34px}.extra{display:grid;grid-template-columns:1fr 2fr;border-left:1px solid #111;border-right:1px solid #111}.extra div{border-bottom:1px solid #111;padding:7px;min-height:30px}.extra div:first-child{border-right:1px solid #111}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #111;padding:5px;vertical-align:middle;height:23px}th{background:#fff3e8;font-weight:800;text-align:center}td:nth-child(1),td:nth-child(3),td:nth-child(4),td:nth-child(8){text-align:center}.tot{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}.tot div{border:1px solid #111;padding:8px 14px;font-weight:800}.sign{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.sign div{border:1px solid #111;min-height:64px;padding:7px}.checkline{display:inline-block;margin-right:24px}.foot{text-align:center;font-weight:800;margin-top:12px;border-top:2px solid #ff6b00;padding-top:8px}@media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;padding:0;width:auto;min-height:auto}}';
  }
  function script(){
    return '<script>(function(){function htmlFile(){return new File([document.documentElement.outerHTML],"scheda-avanzamento-lavori.html",{type:"text/html"})}document.getElementById("printBtn").onclick=function(){window.print()};document.getElementById("closeBtn").onclick=function(){window.close();setTimeout(function(){history.back()},150)};document.getElementById("shareBtn").onclick=async function(){try{var f=htmlFile();if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({title:document.title,files:[f]});return}if(navigator.share){await navigator.share({title:document.title,text:"Scheda avanzamento lavori"});return}}catch(e){}window.print()}})()<\/script>';
  }
  function openPreview(){
    var w = window.open('', '_blank');
    if(!w){ alert('Anteprima bloccata dal browser. Consenti i popup per stampare.'); return; }
    w.document.open();
    w.document.write(buildDocument());
    w.document.close();
  }

  document.addEventListener('click', function(ev){
    var btn = ev.target && ev.target.closest && ev.target.closest('#phase2PrintBtn');
    if(!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    openPreview();
  }, true);
})();
