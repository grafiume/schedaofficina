// FILE: cassetti-officina.js
(function () {
'use strict';
const CASSETTI_OFFICINA = Array.from({ length: 80 }, (_, i) => `A${i + 1}`);
function getSb(client){return client||window.supabase||window.supabaseClient;}
function s(v){return String(v??'').trim();}
function normalizeCassetto(v){v=s(v).toUpperCase();if(!/^A([1-9]|[1-7][0-9]|80)$/.test(v)) throw 'Errore cassetto';return v;}
async function getRecordById(id,sb){sb=getSb(sb);return (await sb.from('records').select('*').eq('id',id).single()).data;}
async function getOccupied(sb){sb=getSb(sb);return (await sb.from('records').select('id,cassetto').eq('cassetto_occupato',true)).data||[];}
async function getPrimoLibero(sb){
  const {data}=await getSb(sb).rpc('get_primo_cassetto_libero');
  if(data) return data;
  const occ=await getOccupied(sb);
  const used=new Set(occ.map(x=>x.cassetto));
  return CASSETTI_OFFICINA.find(c=>!used.has(c));
}
async function assegnaPrimoLibero(id,sb){
  const cass=await getPrimoLibero(sb);
  return assegnaManuale(id,cass,sb);
}
async function assegnaManuale(id,cassetto,sb){
  sb=getSb(sb);
  const cass=normalizeCassetto(cassetto);
  return (await sb.from('records').update({
    cassetto:cass,
    cassetto_occupato:true
  }).eq('id',id).select().single()).data;
}
async function libera(id,sb){
  sb=getSb(sb);
  return (await sb.from('records').update({
    cassetto:null,
    cassetto_occupato:false
  }).eq('id',id)).data;
}
window.CassettiOfficina={assegnaPrimoLibero,assegnaManuale,libera};
})();