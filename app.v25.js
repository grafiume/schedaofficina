// app.v25.js aggiornato (senza Priorità)

document.addEventListener('DOMContentLoaded', ()=>{
  const H=(id,fn)=>{ const el=document.getElementById(id); if(el) el.addEventListener('click',fn); };

  H('btnHome', ()=>console.log('Home'));
  H('btnRicerca', ()=>console.log('Ricerca'));
  H('btnPreventivi', ()=>console.log('Preventivi'));
  // btnPrioritaReport RIMOSSO
});
