// Read-only UI for verified official alerts. No external emergency commands.
let client=null, user=null, onlyCritical=false, bound=false, records=[],feeds=[];
const el=id=>document.getElementById(id);
const text=(parent,className,content)=>{const node=document.createElement('div');node.className=className;node.textContent=String(content??'');parent.append(node);return node;};
const date=s=>{try{return new Date(s).toLocaleString('it-IT')}catch{return 'Data non disponibile'}};
const linkAllowed=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.toString():null}catch{return null}};
export async function attachWorldAlerts(sb,me){
 client=sb;user=me;
 if(!bound){
  bound=true;
  el('worldRefresh').onclick=()=>refresh();
  el('worldFilter').onclick=()=>{onlyCritical=!onlyCritical;el('worldFilter').textContent=onlyCritical?'Mostra tutti gli eventi':'Mostra solo alta priorità';draw();};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&user)refresh();});
  setInterval(()=>{if(document.visibilityState==='visible'&&user)refresh();},120000);
 }
 await refresh();
}
async function refresh(){
 if(!user||!client)return;
 const state=el('worldState');state.textContent='AGGIORNAMENTO';
 try{
  const [a,b]=await Promise.all([
   client.from('ai_guardian_world_alerts').select('id,source,headline,category,severity,area,event_at,source_url,created_at').order('event_at',{ascending:false}).limit(70),
   client.from('ai_guardian_feed_status').select('source,last_checked_at,last_success_at,last_error,items_seen').order('source')
  ]);
  if(a.error)throw a.error;if(b.error)throw b.error;
  records=a.data||[];feeds=b.data||[];
  const ok=feeds.filter(x=>x.last_success_at&&!x.last_error).length;
  state.textContent=`${ok}/${feeds.length} FONTI OK`;
  draw();
 }catch(e){
  state.textContent='CONTROLLO NON DISPONIBILE';
  const list=el('worldFeedList');list.replaceChildren();text(list,'muted','Impossibile leggere gli avvisi: '+String(e?.message||e));
 }
}
function draw(){
 const list=el('worldFeedList');list.replaceChildren();
 el('worldCount').textContent=String(records.length);
 el('worldCritical').textContent=String(records.filter(x=>x.severity==='critical').length);
 if(feeds.length){
  const latest=feeds.filter(x=>x.last_success_at).map(x=>Date.parse(x.last_success_at)).filter(Number.isFinite);
  const last=latest.length?Math.max(...latest):null;
  text(list,'muted',last?'Ultimo controllo riuscito: '+date(last):'Nessuna sincronizzazione completata.');
  const failed=feeds.filter(x=>x.last_error);
  if(failed.length)text(list,'muted',`Attenzione: ${failed.length} fonti non disponibili. Il controllo potrebbe essere incompleto.`);
 }
 const shown=onlyCritical?records.filter(x=>x.severity==='critical'):records;
 if(!shown.length){
  text(list,'tip',records.length?'Nessun evento con priorità alta tra quelli registrati.':'Nessun evento registrato nelle categorie e soglie monitorate. NON significa assenza di emergenze nel mondo.');
  return;
 }
 for(const r of shown.slice(0,40)){
  const card=document.createElement('div');card.className='alert';
  const pri=r.severity==='critical'?'PRIORITÀ ALTA':r.severity==='warning'?'DA MONITORARE':'INFORMAZIONE';
  text(card,'alerttitle '+(r.severity==='critical'?'danger':'ok'),`${pri} · ${r.category} · ${r.source}`);
  text(card,'',r.headline);
  text(card,'alerttime',`${r.area||'Area da verificare'} · Evento: ${date(r.event_at||r.created_at)}`);
  const href=linkAllowed(r.source_url);
  if(href){const a=document.createElement('a');a.textContent='Apri comunicazione originale';a.href=href;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
  list.append(card);
 }
}
