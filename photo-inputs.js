// photo-inputs.js — compatibile iPhone (nessun click JS)
(function(){
  const prev = document.getElementById('photoPreview');
  function setPreview(file){
    if (!file || !prev) return;
    const url = URL.createObjectURL(file);
    prev.src = url;
  }
  document.getElementById('photoInput')?.addEventListener('change', e=>{
    setPreview(e.target.files?.[0]);
  });
  document.getElementById('photoCapture')?.addEventListener('change', e=>{
    setPreview(e.target.files?.[0]);
  });
})();