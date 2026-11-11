// Solo simulazione nel browser. NON applica la sicurezza a processi reali.
const allowed = new Set(['read_public_feed','calculate']);
const denied = new Set(['disable_guardian','read_secrets','execute_shell']);
const hosts = new Set(['www.nist.gov','openai.com','www.anthropic.com']);
export function decide(action, paused=false){
  if(paused) return {decision:'DENY',risk:'critical',reason:'Agente già in pausa'};
  if(!action || typeof action.tool!=='string') return {decision:'DENY',risk:'critical',reason:'Azione non valida'};
  if(denied.has(action.tool)) return {decision:'DENY',risk:'critical',reason:'Strumento vietato'};
  if(action.tool==='http_get'){
    try{const u=new URL(action.target);
      if(u.protocol==='https:' && !u.username && !u.password && hosts.has(u.hostname.toLowerCase()))
        return {decision:'ALLOW',risk:'info',reason:'Host HTTPS autorizzato'};
    }catch{}
    return {decision:'DENY',risk:'critical',reason:'Destinazione di rete non autorizzata'};
  }
  return allowed.has(action.tool)
    ?{decision:'ALLOW',risk:'info',reason:'Azione dimostrativa consentita'}
    :{decision:'DENY',risk:'critical',reason:'Strumento non autorizzato'};
}
