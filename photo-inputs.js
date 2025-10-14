// Handler per Galleria/Fotocamera + anteprima
(function(){
  const byId = id => document.getElementById(id);

  const btnGallery = byId('btnGallery');
  const btnCamera  = byId('btnCamera');
  const inpGallery = byId('photoInput');
  const inpCamera  = byId('photoCapture');
  const preview    = byId('photoPreview');

  if(btnGallery && inpGallery){
    btnGallery.addEventListener('click', () => inpGallery.click());
    inpGallery.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if(f && preview){
        const url = URL.createObjectURL(f);
        preview.src = url;
      }
    });
  }

  if(btnCamera && inpCamera){
    btnCamera.addEventListener('click', () => inpCamera.click());
    inpCamera.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if(f && preview){
        const url = URL.createObjectURL(f);
        preview.src = url;
      }
    });
  }
})();
