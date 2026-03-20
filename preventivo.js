
function euro(v){
 return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v);
}

function generaPDF(){

 const data = {
  cliente:"Cliente Demo",
  dataArrivo:"10/03/2026",
  dataPreventivo:new Date().toLocaleDateString(),
  ddt:"DDT001",
  rip:["RIP01","RIP02","RIP03"],
  imponibile:1200,
  iva:264,
  totale:1464,
  consegna:"5 giorni"
 };

 document.getElementById("cliente").innerText=data.cliente;
 document.getElementById("dataArrivo").innerText=data.dataArrivo;
 document.getElementById("dataPreventivo").innerText=data.dataPreventivo;
 document.getElementById("ddt").innerText=data.ddt;
 document.getElementById("ripList").innerText=data.rip.join(", ");
 document.getElementById("imponibile").innerText=euro(data.imponibile);
 document.getElementById("iva").innerText=euro(data.iva);
 document.getElementById("totale").innerText=euro(data.totale);
 document.getElementById("consegna").innerText=data.consegna;

 window.print();
}
