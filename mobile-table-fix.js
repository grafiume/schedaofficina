(function(){
  'use strict';

  function inject(){
    if(document.getElementById('mobileTableFixStyle')) return;
    var s = document.createElement('style');
    s.id = 'mobileTableFixStyle';
    s.textContent = [
      '#page-home .table-responsive,#page-search .table-responsive{display:block;width:100%;max-width:100%;overflow-x:auto!important;overflow-y:visible;-webkit-overflow-scrolling:touch;}',
      '#tblHome,#tblSearch{min-width:1180px!important;width:1180px!important;table-layout:fixed!important;}',
      '@media (min-width:1400px){#tblHome,#tblSearch{width:100%!important;min-width:1180px!important;}}',
      '#tblHome th,#tblSearch th,#tblHome td,#tblSearch td{box-sizing:border-box;}',
      '#tblHome td:nth-child(6),#tblSearch td:nth-child(6){text-align:left!important;}',
      '#tblHome td:nth-child(6) .badge-p,#tblSearch td:nth-child(6) .badge-p{display:flex!important;margin:5px 0 0 0!important;vertical-align:top;}',
      '#tblHome td:nth-child(6),#tblSearch td:nth-child(6){line-height:1.25;}',
      '@media (max-width:991.98px){#page-home,#page-search{max-width:100%;overflow-x:hidden;}#page-home .container,#page-search.container,#page-search{max-width:100%;}#tblHome,#tblSearch{min-width:1180px!important;width:1180px!important;}#tblHome th,#tblSearch th{font-size:13px!important;}#tblHome td,#tblSearch td{font-size:13px!important;}#tblHome .thumb.thumb-home,#tblSearch .thumb.thumb-home{width:132px!important;height:132px!important;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject, { once:true });
  else inject();
})();
