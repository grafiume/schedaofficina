// app-photos.js
(function(){
  function currentId(){
    const f = document.getElementById('recordForm');
    if(!f) return (window.cur && window.cur.id) || null;
    const d = Object.fromEntries(new FormData(f).entries());
    return d.id || d.numero || (window.cur && window.cur.id) || null;
  }
  document.addEventListener('DOMContentLoaded', ()=>{
    const cam = document.getElementById('cameraInput');
    if(!cam) return;
    cam.addEventListener('change', async (e)=>{
      const file = e.target.files && e.target.files[0];
      const rid = currentId() || String(Date.now());
      if(!file) return;
      if(typeof window.uploadPhotoToCloud === 'function'){
        const url = await window.uploadPhotoToCloud(file, rid);
        const prev = document.getElementById('photoPreview');
        if(prev && url){ prev.src = window.cacheBust ? window.cacheBust(url) : url; }
        if(typeof window.updateEmptyHint === 'function') window.updateEmptyHint();
      }
      e.target.value = '';
    });
  });
})();
