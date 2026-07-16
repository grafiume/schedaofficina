(function(){
  'use strict';

  var sortState = { field: 'dataApertura', dir: 'desc' };
  var currentHomeRows = [];
  var originalRenderHome = null;

  function norm(v){
    return (v == null ? '' : String(v)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }

  function fmtIT(d){
    if(!d) return '';
    if (typeof window.fmtIT === 'function') return window.fmtIT(d);
    var s = String(d);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)){
      var p = s.split('-');
      return [p[2].slice(0,2), p[1], p[0]].join('/');
    }
    return s;
  }

  function fmtShort(d){
    var full = fmtIT(d);
    if(!full) return '';
    var p = String(full).split('/');
    if(p.length === 3 && p[2].length === 4) return [p[0], p[1], p[2].slice(-2)].join('/');
    return full;
  }

  function dateVal(row, field){
    var v = row && row[field];
    return v ? String(v).slice(0,10) : '';
  }

  function statusOrder(s){
    s = norm(s);
    if(s.indexOf('attesa') >= 0) return 1;
    if(s.indexOf('lavorazione') >= 0) return 2;
    if(s.indexOf('completata') >= 0) return 3;
    return 9;
  }

  function defaultOrder(a,b){
    var d = String(b.dataApertura || '').localeCompare(String(a.dataApertura || ''));
    if(d) return d;
    return statusOrder(a.statoPratica) - statusOrder(b.statoPratica);
  }

  function sortRows(rows){
    return (rows || []).slice().sort(function(a,b){
      var av = dateVal(a, sortState.field);
      var bv = dateVal(b, sortState.field);
      if(av || bv){
        var cmp = av.localeCompare(bv);
        if(cmp) return cmp * (sortState.dir === 'asc' ? 1 : -1);
      }
      return defaultOrder(a,b);
    });
  }

  function injectStyle(){
    if(document.getElementById('homeAcceptanceViewStyle')) return;
    var s = document.createElement('style');
    s.id = 'homeAcceptanceViewStyle';
    s.textContent = [
      '.p-yellow,.p-orange{background:#f28c28!important}',
      '.p-gray{background:#9aa0a6!important}',
      '.p-green{background:#2eaf61!important}',
      '.table-sortbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;background:#f8f9fa;border:1px solid #e1e5e8;border-radius:6px;padding:.45rem .65rem}',
      '.sortbar-label{font-weight:700;color:#222;margin-right:.2rem}',
      '.btn-sort{border:1px solid #adb5bd;background:#fff;color:#495057;border-radius:999px;padding:.25rem .8rem;font-size:.88rem;line-height:1.35}',
      '.btn-sort.active{background:#263238;border-color:#263238;color:#fff;font-weight:700}',
      '.table-app{table-layout:fixed;width:100%}',
      '.table-app th{white-space:normal;text-align:center;line-height:1.12;font-size:.92rem}',
      '.table-app td{white-space:normal;word-break:break-word;overflow-wrap:anywhere;line-height:1.22}',
      '#tblHome th:nth-child(1),#tblSearch th:nth-child(1){width:12%}',
      '#tblHome th:nth-child(2),#tblHome th:nth-child(3),#tblHome th:nth-child(4),#tblSearch th:nth-child(2),#tblSearch th:nth-child(3),#tblSearch th:nth-child(4){width:7%}',
      '#tblHome th:nth-child(5),#tblSearch th:nth-child(5){width:6%}',
      '#tblHome th:nth-child(6),#tblHome th:nth-child(7),#tblHome th:nth-child(8),#tblSearch th:nth-child(6),#tblSearch th:nth-child(7),#tblSearch th:nth-child(8){width:14%}',
      '#tblHome th:nth-child(9),#tblSearch th:nth-child(9){width:8%}',
      '#tblHome th:nth-child(10),#tblSearch th:nth-child(10){width:7%}',
      '#tblHome td:nth-child(2),#tblHome td:nth-child(3),#tblHome td:nth-child(4),#tblHome td:nth-child(5),#tblHome td:nth-child(8),#tblHome td:nth-child(9),#tblHome td:nth-child(10),#tblSearch td:nth-child(2),#tblSearch td:nth-child(3),#tblSearch td:nth-child(4),#tblSearch td:nth-child(5),#tblSearch td:nth-child(8),#tblSearch td:nth-child(9),#tblSearch td:nth-child(10){text-align:center}',
      '.table-app th,.table-app td{border-right:1px solid #e1e5e8}',
      '.table-app th:last-child,.table-app td:last-child{border-right:0}',
      '.status-compact{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:54px}',
      '.status-dot{width:14px;height:14px;border-radius:50%;display:inline-block}',
      '.status-label{font-size:11px;line-height:1.05;color:#495057;text-align:center;max-width:68px}',
      '.status-attesa{background:#9aa0a6}',
      '.status-lavorazione{background:#f28c28}',
      '.status-completata{background:#2eaf61}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function header(tableId){
    var tr = document.querySelector('#' + tableId + ' thead tr');
    if(!tr) return;
    tr.innerHTML = '<th class="thumb-cell">Foto</th><th class="text-center">Data<br>ing.</th><th class="text-center">Data invio<br>P.</th><th class="text-center">Data<br>acc.</th><th>Cassetto</th><th>Cliente</th><th>Descrizione</th><th>Modello</th><th>Stato</th><th class="text-end">Azioni</th>';
  }

  function statusMeta(record){
    var s = norm(record && record.statoPratica);
    if(s.indexOf('completata') >= 0) return { cls:'status-completata', lines:['Completata'] };
    if(s.indexOf('lavorazione') >= 0) return { cls:'status-lavorazione', lines:['In','lavorazione'] };
    return { cls:'status-attesa', lines:['In','attesa'] };
  }

  function renderStatusCell(td, record){
    if(!td) return;
    var meta = statusMeta(record);
    td.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'status-compact';
    var dot = document.createElement('span');
    dot.className = 'status-dot ' + meta.cls;
    var label = document.createElement('span');
    label.className = 'status-label';
    label.innerHTML = meta.lines.map(function(x){ return String(x); }).join('<br>');
    wrap.appendChild(dot);
    wrap.appendChild(label);
    td.appendChild(wrap);
  }

  function quoteInfo(record){
    var q = window.state && window.state.quoteMap ? window.state.quoteMap[record.id] : null;
    var st = String(q && q.status || '').toUpperCase();
    return {
      exists: !!(q && q.id),
      accepted: st === 'ACCETTATO' || !!(q && q.accepted_at)
    };
  }

  function recolorP(tr, record){
    var badge = tr && tr.querySelector('.badge-p');
    if(!badge || !record) return;
    var q = quoteInfo(record);
    var accepted = !!(record.dataAccettazione || q.accepted);
    badge.classList.remove('p-gray','p-yellow','p-blue','p-orange','p-green','p-red');
    if(accepted){
      badge.classList.add('p-green');
      badge.title = 'Preventivo accettato';
    } else if(q.exists){
      badge.classList.add('p-orange');
      badge.title = 'Preventivo emesso/inviato';
    } else {
      badge.classList.add('p-gray');
      badge.title = 'Preventivo non ancora emesso';
    }
    badge.setAttribute('aria-label', badge.title);
  }

  function transformRows(tbodyId, rows){
    var tb = document.getElementById(tbodyId);
    if(!tb) return;
    Array.prototype.forEach.call(tb.querySelectorAll('tr'), function(tr, i){
      var record = rows && rows[i];
      if(!record || tr.children.length < 8) return;
      tr.children[1].textContent = fmtShort(record.dataApertura);
      if(tr.children.length === 8){
        var tdInvio = document.createElement('td');
        tdInvio.textContent = fmtShort(record.dataScadenza);
        tr.insertBefore(tdInvio, tr.children[2]);
        var tdAcc = document.createElement('td');
        tdAcc.textContent = fmtShort(record.dataAccettazione);
        tr.insertBefore(tdAcc, tr.children[3]);
      } else {
        tr.children[2].textContent = fmtShort(record.dataScadenza);
        tr.children[3].textContent = fmtShort(record.dataAccettazione);
      }
      renderStatusCell(tr.children[8], record);
      recolorP(tr, record);
    });
  }

  function ensureKpiAcc(){
    if(document.getElementById('kpiAccBtn')) return;
    var lav = document.getElementById('kpiLavBtn');
    var comp = document.getElementById('kpiCompBtn');
    if(!lav || !comp) return;
    var btn = lav.cloneNode(true);
    btn.id = 'kpiAccBtn';
    btn.classList.remove('border-top-orange');
    btn.classList.add('border-top-green');
    var label = btn.querySelector('.small');
    var val = btn.querySelector('.h4');
    if(label) label.textContent = 'Accettate';
    if(val){ val.id = 'kpiAcc'; val.textContent = '0'; }
    comp.parentNode.insertBefore(btn, comp);
    btn.addEventListener('click', function(){
      if(originalRenderHome && window.state && Array.isArray(window.state.all)){
        window.renderHome(window.state.all.filter(function(r){ return !!r.dataAccettazione; }));
      }
    });
  }

  function updateKpiAcc(rows){
    var el = document.getElementById('kpiAcc');
    if(el) el.textContent = (rows || []).filter(function(r){ return !!r.dataAccettazione; }).length;
  }

  function ensureSortbar(){
    if(document.getElementById('homeSortbar')) return;
    var anchor = document.getElementById('errBanner');
    if(!anchor || !anchor.parentNode) return;
    var bar = document.createElement('div');
    bar.className = 'table-sortbar mb-2';
    bar.id = 'homeSortbar';
    bar.innerHTML = '<span class="sortbar-label">Ordina:</span><button class="btn-sort" type="button" id="sortDataIng">Data ing.</button><button class="btn-sort" type="button" id="sortDataInvioP">Data invio P.</button><button class="btn-sort" type="button" id="sortDataAcc">Data acc.</button><button class="btn-sort" type="button" id="sortCresc">Cresc.</button><button class="btn-sort" type="button" id="sortDecr">Decr.</button>';
    anchor.parentNode.insertBefore(bar, anchor.nextSibling);

    document.getElementById('sortDataIng').addEventListener('click', function(){ sortState.field='dataApertura'; renderCurrent(); });
    document.getElementById('sortDataInvioP').addEventListener('click', function(){ sortState.field='dataScadenza'; renderCurrent(); });
    document.getElementById('sortDataAcc').addEventListener('click', function(){ sortState.field='dataAccettazione'; renderCurrent(); });
    document.getElementById('sortCresc').addEventListener('click', function(){ sortState.dir='asc'; renderCurrent(); });
    document.getElementById('sortDecr').addEventListener('click', function(){ sortState.dir='desc'; renderCurrent(); });
  }

  function bindHomeReload(){
    var btn = document.getElementById('btnHome');
    if(!btn || btn.__homeReloadAllPatched) return;
    btn.__homeReloadAllPatched = true;
    btn.addEventListener('click', function(){
      currentHomeRows = [];
      setTimeout(function(){
        if(typeof window.loadAll === 'function') window.loadAll();
        else if(window.state && Array.isArray(window.state.all) && typeof window.renderHome === 'function') window.renderHome(window.state.all);
      }, 0);
    });
  }

  function sortButtonState(){
    function on(id, active){ var el=document.getElementById(id); if(el) el.classList.toggle('active', !!active); }
    on('sortDataIng', sortState.field === 'dataApertura');
    on('sortDataInvioP', sortState.field === 'dataScadenza');
    on('sortDataAcc', sortState.field === 'dataAccettazione');
    on('sortCresc', sortState.dir === 'asc');
    on('sortDecr', sortState.dir === 'desc');
  }

  function renderCurrent(){
    if(originalRenderHome) window.renderHome(currentHomeRows.length ? currentHomeRows : (window.state && window.state.all || []));
  }

  function callOriginalRenderHome(sorted){
    var previous = window.byHomeOrder;
    window.byHomeOrder = function(){ return 0; };
    try { originalRenderHome(sorted); }
    finally {
      if(previous) window.byHomeOrder = previous;
      else { try { delete window.byHomeOrder; } catch(e) {} }
    }
  }

  function patchRenderHome(){
    if(typeof window.renderHome !== 'function' || window.renderHome.__acceptancePatched) return false;
    originalRenderHome = window.renderHome;
    window.renderHome = function(rows){
      currentHomeRows = Array.isArray(rows) ? rows.slice() : [];
      var sorted = sortRows(currentHomeRows);
      callOriginalRenderHome(sorted);
      header('tblHome');
      transformRows('homeRows', sorted);
      ensureKpiAcc();
      updateKpiAcc(currentHomeRows);
      ensureSortbar();
      bindHomeReload();
      sortButtonState();
      var empty = document.querySelector('#homeRows td[colspan]');
      if(empty) empty.setAttribute('colspan','10');
    };
    window.renderHome.__acceptancePatched = true;
    return true;
  }

  function patchSearch(){
    header('tblSearch');
    function runAfterSearch(){
      setTimeout(function(){
        var rows = [];
        try{
          if(window.state && Array.isArray(window.state.all) && typeof window.getSearchFilters === 'function' && typeof window.matchRow === 'function'){
            var f = window.getSearchFilters();
            rows = sortRows(window.state.all.filter(function(r){ return window.matchRow(r,f); }));
          }
        }catch(e){}
        transformRows('searchRows', rows);
        var empty = document.querySelector('#searchRows td[colspan]');
        if(empty) empty.setAttribute('colspan','10');
      }, 0);
    }
    ['btnDoSearch','btnApply'].forEach(function(id){
      var btn = document.getElementById(id);
      if(btn && !btn.__acceptanceSearchPatched){
        btn.__acceptanceSearchPatched = true;
        btn.addEventListener('click', runAfterSearch);
      }
    });
  }

  function init(){
    injectStyle();
    ensureKpiAcc();
    ensureSortbar();
    bindHomeReload();
    header('tblHome');
    header('tblSearch');
    patchSearch();
    var tries = 0;
    var timer = setInterval(function(){
      tries++;
      if(patchRenderHome() || tries > 40) clearInterval(timer);
    }, 100);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
