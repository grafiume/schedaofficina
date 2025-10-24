/* openedit-bridge.js — imposta body[data-record-id] quando viene chiamata openEdit(id) */
(function(){
  const wrap = (fn) => function(id){
    try{ document.body.dataset.recordId = String(id||''); }catch(e){}
    return fn.apply(this, arguments);
  };
  function patch(){
    if (typeof window.openEdit === 'function'){
      window.openEdit = wrap(window.openEdit);
      return true;
    }
    return false;
  }
  if (!patch()){
    const iv = setInterval(()=>{ if (patch()) clearInterval(iv); }, 200);
    setTimeout(()=>clearInterval(iv), 10000);
  }
})();
