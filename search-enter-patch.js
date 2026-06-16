(function(){
  'use strict';

  function bindSearchEnter(){
    var q = document.getElementById('q');
    if (!q || q.__elipSearchEnterPatched) return;

    q.__elipSearchEnterPatched = true;
    q.addEventListener('keydown', function(ev){
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      var btn = document.getElementById('btnDoSearch');
      if (btn) btn.click();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSearchEnter, { once: true });
  } else {
    bindSearchEnter();
  }
})();
