
// Apertura preventivo dalla schermata modifica scheda
// Usa preventivo_url se presente

const qBtn = document.getElementById('btnQuoteOpen');
if(qBtn){
  qBtn.onclick = ()=>{
    try{
      const raw = (window.r?.preventivo_url || '').trim();

      if(raw){
        if(/^https?:\/\//i.test(raw)){
          location.href = raw;
          return;
        }

        if(/^[0-9a-fA-F-]{36}$/.test(raw)){
          location.href = 'https://grafiume.github.io/preventivi-elip/?pvid=' + encodeURIComponent(raw);
          return;
        }
      }

      location.href = 'preventivo.html?record_id=' + encodeURIComponent(window.r.id);

    }catch(e){
      console.error("Preventivo open error", e);
    }
  };
}
