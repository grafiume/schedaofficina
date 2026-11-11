import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { decide } from './rules.js';
import { attachWorldAlerts } from './world-alerts.js';
const $ = id=>document.getElementById(id);
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL)
 && (/^sb_publishable_/.test(SUPABASE_PUBLISHABLE_KEY) || /^eyJ/.test(SUPABASE_PUBLISHABLE_KEY));
let sb, me, agent, allAlerts=[];
const show=(id,on)=>$(id).classList.toggle('hide',!on);
const feedback=(t)=>{$('feedback').textContent=t;};
const err=(e)=>feedback('Errore: '+String(e?.message||e));

async function init(){
 show('setupView',!configured);show('loginView',false);show('appView',false);
 if(!configured){feedback('Configurazione mancante.');return;}
 try{
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.119.0');
  sb=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,flowType:'implicit'}});
  const {data:{session},error}=await sb.auth.getSession();if(error)throw error;
  await renderSession(session);
  sb.auth.onAuthStateChange((_event,newSession)=>{queueMicrotask(()=>renderSession(newSession).catch(err));});
 }catch(e){err(e);}
}
async function renderSession(session){
 me=session?.user||null;show('loginView',!me);show('appView',!!me);
 if(me){feedback('Connesso: '+me.email);await loadData();await attachWorldAlerts(sb,me);}
}
async function loadData(){
 if(!me||!sb)return;
 let {data:agents,error:agentErr}=await sb.from('ai_guardian_agents').select('*').eq('name','demo-agent').limit(1);
 if(agentErr)throw agentErr;
 if(!agents?.length){const r=await sb.from('ai_guardian_agents').insert({owner_id:me.id,name:'demo-agent'}).select('*').single();if(r.error){
    if(r.error.code==='23505') {const rr=await sb.from('ai_guardian_agents').select('*').eq('name','demo-agent').single();if(rr.error)throw rr.error;agent=rr.data;}
    else throw r.error;
  }else agent=r.data;
 }else agent=agents[0];
 const r=await sb.from('ai_guardian_alerts').select('id,severity,category,message,is_demo,created_at').order('created_at',{ascending:false}).limit(25);
 if(r.error)throw r.error;allAlerts=r.data||[];render();
}
function render(){
 if(!agent)return;
 $('agentStatus').textContent=agent.paused?'⛔ IN PAUSA':'🟢 ATTIVO';
 $('agentStatus').className='status '+(agent.paused?'danger':'ok');
 $('agentInfo').textContent=agent.paused?('Motivo: '+(agent.pause_reason||'pausa operatore')):'Disponibile per simulazioni. Nessun agente esterno collegato.';
 $('pauseBtn').disabled=agent.paused;$('resumeBtn').disabled=!agent.paused;
 $('totalCount').textContent=String(allAlerts.length);
 $('criticalCount').textContent=String(allAlerts.filter(a=>a.severity==='critical').length);
 const root=$('alertsList');root.replaceChildren();
 if(!allAlerts.length){const p=document.createElement('p');p.className='muted';p.textContent='Nessun evento.';root.append(p);return;}
 for(const a of allAlerts){
  const card=document.createElement('div');card.className='alert';
  const title=document.createElement('div');title.className='alerttitle '+(a.severity==='critical'?'danger':'ok');
  title.textContent=(a.severity==='critical'?'⛔ ':'✅ ')+a.category+' · '+(a.is_demo?'SIMULAZIONE':'EVENTO');
  const msg=document.createElement('div');msg.textContent=a.message;
  const time=document.createElement('div');time.className='alerttime';time.textContent=new Date(a.created_at).toLocaleString('it-IT');
  card.append(title,msg,time);root.append(card);
 }
}
async function audit(severity,category,message){
 const res=await sb.from('ai_guardian_alerts').insert({owner_id:me.id,agent_id:agent.id,severity,category,message,is_demo:true});
 if(res.error)throw res.error;
}
async function setPaused(pause,why){
 const r=await sb.from('ai_guardian_agents').update({paused:pause,pause_reason:pause?why:null,updated_at:new Date().toISOString()}).eq('id',agent.id).eq('owner_id',me.id).select().single();
 if(r.error)throw r.error;
 agent=r.data;
}
async function scenario(action){
 if(!agent)return;
 try{
  const decision=decide(action,agent.paused);
  if(decision.decision==='DENY'){
    if(!agent.paused)await setPaused(true,decision.reason);
    await audit('critical','AZIONE BLOCCATA · TEST',`${action.tool}: ${decision.reason}`);
    feedback('ALLARME DI PROVA: operazione non eseguita.');
  }else{
    await audit('info','AZIONE CONSENTITA · TEST',`${action.tool}: ${decision.reason}`);
    feedback('Simulazione registrata.');
  }
  await loadData();
 }catch(e){err(e);}
}
async function manualPause(pause){
 try{if(!pause && !confirm('Ripristinare soltanto demo-agent?'))return;
  await setPaused(pause,pause?'Pausa manuale del proprietario':'');
  await audit(pause?'critical':'info',pause?'STOP MANUALE · TEST':'RIPRISTINO · TEST',pause?'L’agente dimostrativo è stato messo in pausa':'Ripristino dell’agente dimostrativo');
  await loadData();feedback('Stato demo aggiornato.');
 }catch(e){err(e);}
}
$('loginForm').addEventListener('submit',async e=>{
 e.preventDefault();const email=$('emailInput').value.trim();if(!email||!sb)return;
 $('loginBtn').disabled=true;
 try{const r=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}});if(r.error)throw r.error;feedback('Se il tuo account è autorizzato, riceverai un link via email.');}
 catch(e){err(e);}finally{$('loginBtn').disabled=false;}
});
$('safeBtn').onclick=()=>scenario({tool:'read_public_feed'});
$('badBtn').onclick=()=>scenario({tool:'disable_guardian'});
$('hostBtn').onclick=()=>scenario({tool:'http_get',target:'https://not-allowed.invalid'});
$('auditBtn').onclick=()=>loadData().catch(err);
$('pauseBtn').onclick=()=>manualPause(true);
$('resumeBtn').onclick=()=>manualPause(false);
$('logoutBtn').onclick=async()=>{if(sb){const r=await sb.auth.signOut();if(r.error)err(r.error);else feedback('Sessione terminata.');}};
$('exportBtn').onclick=()=>{
 const report={type:'AI_GUARDIAN_DEMO',exported_at:new Date().toISOString(),agent:{name:'demo-agent',paused:agent?.paused},note:'Non è un rapporto di incidenti reali. Eventi generati manualmente nella simulazione.',alerts:allAlerts};
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='guardian_private_demo.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
init();
