// === ELIP TAGLIENTE • preventivo.js DETTATURA ===

(function(){

/* =========================
   CONFIG BASE
========================= */

const VAT_RATE = 22;

const WORKS = [
  { code:'RIP05', text:'SMONTAGGIO COMPLETO DEL MOTORE SISTEMATICO' },
  { code:'RIP29', text:'LAVAGGIO COMPONENTI, E TRATTAMENTO TERMICO AVVOLGIMENTI' },
  { code:'RIP06', text:'VERIFICHE MECCANICHE ALBERI E ALLOGIAMENTO CUSCINETTI E VERIFICHE ELETTRICHE AVVOLGIMENTI' },
  { code:'RIP07', text:'TORNITURA, SMICATURA ED EQUILIBRATURA ROTORE' },
  { code:'RIP22', text:'SOSTITUZIONE COLLETTORE CON RECUPERO AVVOLGIMENTO' },
  { code:'RIP01', text:'AVVOLGIMENTO INDOTTO CON RECUPERO COLLETTORE' },
  { code:'RIP01C', text:'AVVOLGIMENTO INDOTTO CON SOSTITUZIONE COLLETTORE' },
  { code:'RIP08', text:'ISOLAMENTO STATORE' },
  { code:'RIP02', text:'AVVOLGIMENTO STATORE' },
  { code:'RIP31', text:'LAVORAZIONI MECCANICHE ALBERO' },
  { code:'RIP32', text:'LAVORAZIONI MECCANICHE FLANGE' },
  { code:'RIP19', text:'SOSTITUZIONE SPAZZOLE' },
  { code:'RIP20', text:'SOSTITUZIONE MOLLE PREMISPAZZOLE' },
  { code:'RIP21', text:'SOSTITUZIONE CUSCINETTI' },
  { code:'RIP23', text:'SOSTITUZIONE TENUTA MECCANICA' },
  { code:'RIP26', text:'SOSTITUZIONE GUARNIZIONI' },
  { code:'RIP30', text:'MONTAGGIO, COLLAUDO E VERNICIATURA' },
  { code:'RIP16', text:'RICAMBI VARI' },
  { code:'RIP00', text:'LAVORAZIONE LIBERA', free:true },
];

function $(id){ return document.getElementById(id); }

/* =========================
   STATO
========================= */

let quoteState = {
  items:{}
};

function ensureItem(code){
  if(!quoteState.items[code]){
    quoteState.items[code] = {
      rip_code:code,
      unit_price_ex_vat:0
    };
  }
  return quoteState.items[code];
}

/* =========================
   DETTATURA
========================= */

function startVoice(mode){

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if(!SpeechRecognition){
    const txt = prompt("Detta o scrivi (es: RIP01 200 RIP02 100 oppure 450)");
    if(txt) processVoice(txt, mode);
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = 'it-IT';
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.start();

  rec.onresult = function(e){
    const txt = e.results[0][0].transcript;
    processVoice(txt, mode);
  };

  rec.onerror = function(){
    alert("Errore dettatura");
  };
}

/* =========================
   PARSER VOCALE
========================= */

function processVoice(text, mode){

  text = text.toUpperCase();

  console.log("DETTATO:", text);

  if(mode === 'total'){
    const num = extractNumber(text);
    if(num > 0){
      if(confirm("Impostare totale a € " + num + " ?")){
        quoteState.items = {};
        const it = ensureItem('RIP00');
        it.unit_price_ex_vat = num;
        render();
      }
    }
    return;
  }

  // modalità RIP

  const matches = text.match(/RIP\s?\d+[A-Z]?\s?\d+/g);

  if(!matches){
    alert("Nessuna voce RIP riconosciuta");
    return;
  }

  matches.forEach(m=>{
    const parts = m.replace("RIP","").trim().split(" ");
    const code = "RIP" + parts[0];
    const price = Number(parts[1]);

    if(!isNaN(price)){
      const it = ensureItem(code);
      it.unit_price_ex_vat = price;
    }
  });

  render();
}

/* =========================
   UTILITY
========================= */

function extractNumber(text){
  const n = text.match(/\d+/);
  return n ? Number(n[0]) : 0;
}

/* =========================
   RENDER BASE (SEMPLICE)
========================= */

function render(){

  console.log("STATO ATTUALE:", quoteState);

  // qui NON tocco il tuo render originale
  // ma forzo aggiornamento prezzi se presenti

  document.querySelectorAll('.price-input').forEach(inp=>{
    const code = inp.dataset.code;
    if(code && quoteState.items[code]){
      inp.value = quoteState.items[code].unit_price_ex_vat;
    }
  });

}

/* =========================
   BUTTON INIT
========================= */

document.addEventListener('DOMContentLoaded', ()=>{

  // aggiungo pulsanti dinamici se non esistono
  if(!$('btnVoiceRIP')){
    const b1 = document.createElement('button');
    b1.id = 'btnVoiceRIP';
    b1.innerText = "🎤 Voci RIP";
    b1.onclick = ()=>startVoice('rip');
    document.body.appendChild(b1);
  }

  if(!$('btnVoiceTOTAL')){
    const b2 = document.createElement('button');
    b2.id = 'btnVoiceTOTAL';
    b2.innerText = "🎤 Totale";
    b2.onclick = ()=>startVoice('total');
    document.body.appendChild(b2);
  }

});

})();
