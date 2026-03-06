
// Preventivo collegato - versione corretta
// Se esiste preventivo_url apre preventivi-elip, altrimenti apre il modulo interno

try{
  const b = document.getElementById('btnQuote');
  if(b){
    b.onclick = ()=>{
      const raw = (window.data?.preventivo_url || '').trim();

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

      const id = new URLSearchParams(location.search).get('id');
      location.href = 'preventivo.html?record_id=' + encodeURIComponent(id);
    };
  }
}catch(e){
  console.error("Preventivo link error", e);
}
