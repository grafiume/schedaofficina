/* preventivo-link-lite.v4.js — integra il campo preventivo_url (salva/apri) */
(function(){
  if (window.__ELIP_PREV_LITE__) return; window.__ELIP_PREV_LITE__=true;
  const SUPA_URL = window.SUPABASE_URL;
  const SUPA_KEY = window.SUPABASE_ANON_KEY;

  const $ = (id)=>document.getElementById(id);
  const input = $('preventivo_url');
  const help  = $('prev_help');
  const btnS  = $('btn_prev_save');
  const btnO  = $('btn_prev_open');
  if(!input||!btnS||!btnO){ console.warn('preventivo-link: elementi mancanti'); return; }

  function ridFromBody(){ return document.body?.dataset?.recordId || null; }
  function ridFromURL(){ try{ const p=new URLSearchParams(location.search); return p.get('rid')||p.get('id'); }catch{return null;} }
  function ridFromGlobal(){ return window.ELIP_RECORD_ID || null; }
  function currentRid(){ return ridFromBody() || ridFromURL() || ridFromGlobal(); }

  function isUrl(v){ return !!v && /^https?:\/\//i.test((v||'').trim()); }
  function norm(v){ try{ return new URL((v||'').trim()).toString(); }catch{ return (v||'').trim(); } }

  async function fetchJSON(url, opt){
    const r = await fetch(url, opt);
    if(!r.ok) throw new Error(await r.text());
    return r.json().catch(()=>null);
  }

  async function load(id){
    if(!id){ input.value=''; help.textContent='ID scheda non disponibile: apri una scheda.'; btnS.disabled=true; btnO.href='#'; btnO.style.pointerEvents='none'; return; }
    btnS.disabled=false; help.textContent='';
    try{
      const data = await fetchJSON(`${SUPA_URL}/rest/v1/records?select=preventivo_url&id=eq.${encodeURIComponent(id)}`, {
        headers:{ apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}` }
      });
      const url = (Array.isArray(data)&&data[0]&&data[0].preventivo_url)||'';
      input.value = url;
      setupOpen();
      if(url) help.textContent='Link caricato ✔';
    }catch(e){ help.textContent='Impossibile caricare il link'; }
  }

  function setupOpen(){
    const v = norm(input.value||'');
    if(isUrl(v)){ btnO.href=v; btnO.style.opacity=1; btnO.style.pointerEvents='auto'; }
    else { btnO.href='#'; btnO.style.opacity=.6; btnO.style.pointerEvents='none'; }
  }
  input.addEventListener('input', setupOpen);

  btnS.addEventListener('click', async ()=>{
    const id = currentRid();
    if(!id){ help.textContent='ID scheda non disponibile'; return; }
    const v = norm(input.value||'');
    if(v && !isUrl(v)){ help.textContent='Inserisci un link http/https valido'; return; }
    const old=btnS.textContent; btnS.disabled=true; btnS.textContent='Salvo...'; help.textContent='';
    try{
      await fetch(`${SUPA_URL}/rest/v1/records?id=eq.${encodeURIComponent(id)}`,{
        method:'PATCH',
        headers:{ 'content-type':'application/json', apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}`, Prefer:'return=minimal' },
        body: JSON.stringify({ preventivo_url: v || null })
      });
      help.style.color='#0a0'; help.textContent='Link salvato ✔';
    }catch(e){ help.style.color='#c00'; help.textContent='Errore salvataggio'; }
    finally{ btnS.disabled=false; btnS.textContent=old; setTimeout(()=>help.style.color='#666', 1500); }
  });

  // iOS: apri nella stessa scheda
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  btnO.addEventListener('click', function(ev){
    const href = norm(input.value||'');
    if(!isUrl(href)) return;
    if(isIOS){ ev.preventDefault(); location.href = href; }
  });

  // osserva cambio scheda
  const obs = new MutationObserver(()=>{
    const id = currentRid();
    if(id) load(id);
  });
  obs.observe(document.body, { attributes:true, attributeFilter:['data-record-id'] });

  load(currentRid());
})();
