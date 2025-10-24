/* openedit-bridge.js — aggiorna automaticamente body[data-record-id] */
(function(){
  const wrap = function(fn){
    return function(id){
      try { document.body.setAttribute('data-record-id', String(id||'')); } catch(e){}
      return fn.apply(this, arguments);
    };
  };
  const tryPatch = function(){ if (typeof window.openEdit === 'function'){ window.openEdit = wrap(window.openEdit); return true; } return false; };
  if (!tryPatch()){
    const iv = setInterval(()=>{ if(tryPatch()) clearInterval(iv); }, 200);
    setTimeout(()=>clearInterval(iv), 10000);
  }
})();