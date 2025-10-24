
/* preventivo-link-lite.v4.js — forza apertura stessa scheda su TUTTI i device */
(function(){
  if (window.__SO_PREV_LITE_INIT) return; window.__SO_PREV_LITE_INIT = true;

  const SUPA_URL = "https://pedmdiljgjgswhfwedno.supabase.co";
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZG1kaWxqZ2pnc3doZndlZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjgxNTIsImV4cCI6MjA3NTY0NDE1Mn0.4p2T8BJHGjVsj1Bx22Mk1mbYmfh7MX5WpCwxhwi4CmQ";

  function getRidFromURL(){ try { const p=new URLSearchParams(location.search); return p.get('rid')||p.get('id')||null; } catch { return null; } }
  function getRidFromBody(){ const b=document.body; return (b && b.dataset && b.dataset.recordId) ? String(b.dataset.recordId) : null; }
  function currentRecordId(){ return getRidFromBody() || getRidFromURL() || (window.ELIP_RECORD_ID ? String(window.ELIP_RECORD_ID) : null); }

  async function getLink(id){
    const r = await fetch(`${SUPA_URL}/rest/v1/records?select=preventivo_url&id=eq.${encodeURIComponent(id)}`,{
      headers:{ "apikey":SUPA_KEY, "Authorization":"Bearer "+SUPA_KEY }
    });
    if (!r.ok) return "";
    const a = await r.json().catch(()=>[]);
    return (Array.isArray(a) && a[0] && a[0].preventivo_url) ? a[0].preventivo_url : "";
  }
  async function saveLink(id, link){
    const r = await fetch(`${SUPA_URL}/rest/v1/records?id=eq.${encodeURIComponent(id)}`,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        "apikey":SUPA_KEY,
        "Authorization":"Bearer "+SUPA_KEY,
        "Prefer":"return=minimal"
      },
      body: JSON.stringify({ preventivo_url: link || null })
    });
    if (!r.ok) throw new Error(await r.text().catch(()=>String(r.status)));
  }

  const input = document.getElementById('preventivo_url');
  const help  = document.getElementById('prev_help');
  const btnS  = document.getElementById('btn_prev_save');
  const btnO  = document.getElementById('btn_prev_open');
  if (!input || !btnS || !btnO){ console.warn('preventivo-link-lite: elementi non trovati'); return; }

  function isUrl(v){ return !!v && /^https?:\/\//i.test((v||'').trim()); }
  function normalize(v){ try{ return new URL((v||'').trim()).toString(); }catch{ return (v||'').trim(); } }
  function refreshOpen(){
    const v = normalize(input.value||"");
    btnO.dataset.href = v;
    if (isUrl(v)){ btnO.style.opacity=1; btnO.style.pointerEvents='auto'; }
    else { btnO.style.opacity=.6; btnO.style.pointerEvents='none'; }
  }
  input.addEventListener('input', refreshOpen);

  let activeRecordId = null;
  async function loadFor(id){
    if (!id){ btnS.disabled=true; help.textContent='ID scheda non disponibile'; input.value=''; refreshOpen(); activeRecordId=null; return; }
    btnS.disabled=false; activeRecordId = id;
    help.style.color='#666'; help.textContent='';
    try {
      const cur = await getLink(id);
      input.value = cur || '';
      refreshOpen();
      if (cur) help.textContent = 'Link caricato ✔';
    } catch(e){
      console.error(e);
      help.textContent='Impossibile caricare il link';
    }
  }

  btnS.addEventListener('click', async () => {
    const id = activeRecordId || currentRecordId();
    if (!id){ help.textContent='ID scheda non disponibile'; return; }
    const link = normalize(input.value||"");
    if (link && !isUrl(link)){ help.textContent='Inserisci un link http/https valido'; return; }
    const old=btnS.textContent; btnS.disabled=true; btnS.textContent='Salvo...'; help.textContent='';
    try {
      await saveLink(id, link || null);
      help.style.color='#0a0'; help.textContent='Link salvato ✔';
    } catch(e){
      console.error(e); help.style.color='#c00'; help.textContent='Errore salvataggio: '+(e.message||e);
    } finally { btnS.disabled=false; btnS.textContent=old; setTimeout(()=>{help.style.color='#666'},2000); }
  });

  // FORZA apertura stessa scheda su TUTTE le piattaforme (desktop + iOS)
  btnO.removeAttribute('target');
  btnO.addEventListener('click', function(ev){
    const href = btnO.dataset.href || normalize(input.value||"");
    if (!isUrl(href)) return;
    ev.preventDefault();
    try { window.location.replace(href); }
    catch(_) { window.location.href = href; }
  });

  // osserva cambio record
  const obs = new MutationObserver(() => {
    const id = currentRecordId();
    if (id !== activeRecordId) loadFor(id);
  });
  obs.observe(document.body, { attributes:true, attributeFilter:['data-record-id'] });
  (function pollRid(){
    let last=null;
    setInterval(()=>{
      const now = getRidFromURL();
      if (now !== last){ last = now; const id = currentRecordId(); if (id !== activeRecordId) loadFor(id); }
    }, 500);
  })();

  loadFor(currentRecordId());
})();
