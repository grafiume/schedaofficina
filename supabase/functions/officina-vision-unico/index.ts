const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:cors});
const value=(v)=>typeof v==="string"?v.trim().slice(0,600):"";
function normDate(v){
const s=value(v);
let m=s.match(/^([0-3]?\d)[\/.-]([01]?\d)[\/.-](\d{2}|\d{4})$/);
if(m){const y=Number(m[3].length===2?"20"+m[3]:m[3]),mo=Number(m[2]),d=Number(m[1]),dt=new Date(Date.UTC(y,mo-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?String(d).padStart(2,"0")+"/"+String(mo).padStart(2,"0")+"/"+y:"";}
m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
if(m){const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(Date.UTC(y,mo-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?m[3]+"/"+m[2]+"/"+m[1]:"";}
return "";
}
const prompt="Leggi l'immagine come un lettore esperto di DDT e moduli di ingresso officina italiani. Non dipendere da posizioni fisse: i DDT cambiano da un fornitore all'altro.\nMODULO_ELIP: riconosci il modulo interno ELIP con etichette DATA INGRESSO, CLIENTE, TELEFONO e TIPO MACCHINA. Leggi solo i VALORI MANOSCRITTI a destra o nella riga immediatamente sotto. Ignora ELIP Tagliente prestampata, indirizzo e telefono della testata. Nel campo cliente non mettere il nome dell'officina; nel telefono non copiare quello prestampato se non è leggibile anche nella riga a penna. TIPO MACCHINA può essere scritto nella seconda riga sotto l'etichetta. DDT e dataDdt devono essere vuoti.\nDDT: cliente = azienda mittente/fornitore che emette il documento, non il destinatario ELIP TAGLIENTE SRL. numero DDT = numero sotto NUMERO / N. DDT / N. DOCUMENTO, mai numero cliente, telefono, P.IVA o quantità. dataDdt = data DOCUMENTO relativa al numero DDT, non data trasporto quando diversa. descrizione = articolo riportato nella tabella descrizione, compresa marca e modello. note = eventuale RIF., commessa, IN GARANZIA.\nRestituisci esclusivamente JSON con le chiavi documentType, cliente, telefono, descrizione, preventivo, ddt, dataDdt, note. documentType è DDT, MODULO_ELIP o ALTRO. Ogni valore è stringa. Non inventare e non usare informazioni esterne. Se non è leggibile lascia vuoto. dataDdt in GG/MM/AAAA.";
Deno.serve(async req=>{
if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
if(req.method!=="POST")return out({ok:false,error:"METHOD_NOT_ALLOWED"},405);
const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),36000);
try{
const body=await req.json().catch(()=>({}));const image=body?.image;
const mode=['DDT','MODULO_ELIP'].includes(body?.documentTypeHint)?body.documentTypeHint:'AUTO';
if(typeof image!=="string"||!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(image))return out({ok:false,error:"IMAGE_REQUIRED"},400);
if(image.length>14000000)return out({ok:false,error:"IMAGE_TOO_LARGE"},413);
const key=Deno.env.get("GEMINI_API_KEY");if(!key)return out({ok:false,error:"VISION_NOT_CONFIGURED"},503);
const match=image.match(/^data:([^;]+);base64,([\s\S]+)$/);
if(!match)return out({ok:false,error:"IMAGE_FORMAT"},400);
const selectedInstruction=mode==='DDT'?'\nIl tipo documento è stato selezionato manualmente come DDT di un fornitore. Concentrati su mittente, numero DDT, data e descrizione; non confondere il destinatario ELIP con il cliente.':mode==='MODULO_ELIP'?'\nIl tipo documento è stato selezionato manualmente come MODULO_ELIP manoscritto. Leggi soltanto i dati manoscritti accanto ai campi CLIENTE, TELEFONO, TIPO MACCHINA e MOTIVAZIONI, mai la testata prestampata. Lascia DDT e dataDdt vuoti.':'\nIl tipo non è stato specificato: riconoscilo automaticamente tra DDT e modulo ELIP.';
const requestData={contents:[{parts:[{text:prompt+selectedInstruction},{inline_data:{mime_type:match[1],data:match[2]}}]}],generationConfig:{responseMimeType:"application/json",temperature:0,maxOutputTokens:1400}};
let response,result;
const models=["gemini-3.5-flash-lite","gemini-3.5-flash-lite","gemini-3.6-flash"];
for(let attempt=0;attempt<models.length;attempt++){
  try{
    response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+models[attempt]+":generateContent",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify(requestData)});
    result=await response.json().catch(()=>({}));
  }catch(e){if(attempt===models.length-1)throw e;continue;}
  if(response.ok)break;
  const detail=String(result?.error?.message||"");
  const temporary=[429,500,502,503,504].includes(response.status)||/high demand|overloaded|unavailable/i.test(detail);
  if(!temporary||attempt===models.length-1)break;
  await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
}
if(!response?.ok)return out({ok:false,error:"VISION_PROVIDER_ERROR",detail:result?.error?.message||"Provider unavailable"},502);
const responseText=(result?.candidates?.[0]?.content?.parts||[]).map(x=>x?.text||"").join("").trim();
let raw;try{raw=JSON.parse(responseText)}catch{return out({ok:false,error:"VISION_INVALID_JSON"},502);}
if(!raw||typeof raw!=="object"||Array.isArray(raw))return out({ok:false,error:"VISION_INVALID_RESULT"},502);
const documentType=["DDT","MODULO_ELIP"].includes(raw.documentType)?raw.documentType:"ALTRO";
const x={documentType,cliente:value(raw.cliente),telefono:value(raw.telefono),descrizione:value(raw.descrizione),preventivo:value(raw.preventivo),ddt:value(raw.ddt),dataDdt:normDate(raw.dataDdt),note:value(raw.note)};
if(documentType==="MODULO_ELIP"){x.ddt="";x.dataDdt="";}
if(documentType==="DDT"&&/^\s*ELIP\s+TAGLIENTE\s*(SRL|S\.R\.L\.)?\s*$/i.test(x.cliente))x.cliente="";
// Non confondere il codice numerico cliente del fornitore con la ragione sociale.
if(documentType==="DDT"&&(/^\s*(?:(?:CODICE\s+)?CLIENTE\s*[:#-]?\s*)?\d+(?:[\s/.-]\d+)*\s*$/i.test(x.cliente)||!/\p{L}/u.test(x.cliente)))x.cliente="";
if(![x.cliente,x.telefono,x.descrizione,x.ddt,x.note].some(Boolean))return out({ok:false,error:"NO_FIELDS_RECOGNIZED",data:x},422);
return out({ok:true,data:x},200);
}catch(err){return out({ok:false,error:err?.name==="AbortError"?"VISION_TIMEOUT":"VISION_REQUEST_ERROR",detail:String(err?.message||err)},err?.name==="AbortError"?504:500);}finally{clearTimeout(timeout);}
});