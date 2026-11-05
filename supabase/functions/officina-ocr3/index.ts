const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const out=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:cors});
const prompt="Leggi il testo presente in questo DOCUMENTO DI TRASPORTO italiano.\nTrascrivi fedelmente le righe leggibili: nome del fornitore o mittente, tipo documento, etichette NUMERO e DATA con i valori, righe DESCRIZIONE, eventuali RIF. o IN GARANZIA.\nConserva i nomi come stampati. Se NUMERO e DATA sono in colonne, trascrivili su righe distinte, ad esempio NUMERO, poi il valore, DATA, poi il valore.\nNon inventare. Non confondere ELIP TAGLIENTE SRL destinatario con il fornitore. Rispondi SOLO con testo OCR, senza spiegazioni né JSON.";
Deno.serve(async req=>{
if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
if(req.method!=="POST")return out({ok:false,error:"METHOD_NOT_ALLOWED"},405);
const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),35000);
try{
const body=await req.json().catch(()=>({}));const image=body?.image;
const match=typeof image==="string"?image.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/):null;
if(!match)return out({ok:false,error:"IMAGE_REQUIRED"},400);
if(image.length>14000000)return out({ok:false,error:"IMAGE_TOO_LARGE"},413);
const key=Deno.env.get("GEMINI_API_KEY");if(!key)return out({ok:false,error:"NOT_CONFIGURED"},503);
const payload={contents:[{parts:[{text:prompt},{inline_data:{mime_type:match[1],data:match[2]}}]}],generationConfig:{temperature:0,maxOutputTokens:1800}};
let r,j;
for(let attempt=0;attempt<3;attempt++){
r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify(payload),signal:ctl.signal});
j=await r.json().catch(()=>({}));
if(r.ok)break;
if(attempt===2||![429,500,502,503,504].includes(r.status))break;
await new Promise(done=>setTimeout(done,500*(attempt+1)));
}
if(!r.ok)return out({ok:false,error:"VISION_PROVIDER_ERROR",detail:j?.error?.message||"HTTP "+r.status},502);
const text=(j?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("").trim().slice(0,16000);
if(!text)return out({ok:false,error:"NO_TEXT"},422);
return out({ok:true,text},200);
}catch(e){return out({ok:false,error:e?.name==="AbortError"?"OCR_TIMEOUT":"OCR_ERROR",detail:String(e?.message||e)},e?.name==="AbortError"?504:500)}finally{clearTimeout(timer)}
});