/* preventivo-link-lite.js — integra il campo preventivo come la "finestrella" */
(function(){
  if (window.__SO_PREV_LITE_INIT) return; window.__SO_PREV_LITE_INIT = true;

  const SUPA_URL = "https://pedmdiljgjgswhfwedno.supabase.co";
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZG1kaWxqZ2pnc3doZndlZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjgxNTIsImV4cCI6MjA3NTY0NDE1Mn0.4p2T8BJHGjVsj1Bx22Mk1mbYmfh7MX5WpCwxhwi4CmQ";

  function qp(){ try { const p = new URLSearchParams(location.search); return p.get('rid') || p.get('id'); } catch(_) { return null; } }
  function recordId(){ 
    if (window.ELIP_RECORD_ID) return String(window.ELIP_RECORD_ID);
    const b = document.body; if (b && b.dataset && b.dataset.recordId) return String(b.dataset.recordId);
    return qp();
  }

  const recId = recordId();
  const input = document.getElementById('preventivo_url');
  const help  = document.getElementById('prev_help');
  const btnS  = document.getElementById('btn_prev_save');
  const btnO  = document.getElementById('btn_prev_open');

  function isUrl(v){ return !v || /^https?:\/\//i.test((v||'').trim()); }
  function setOpen(){ const v=(input.value||'').trim(); btnO.href = (isUrl(v) && v) ? v : '#'; btnO.style.opacity = btnO.href==='#' ? .6 : 1; btnO.style.pointerEvents = btnO.href==='#' ? 'none' : 'auto'; }

  async function getLink(id){
    const r = await fetch(`${SUPA_URL}/rest/v1/records?select=preventivo_url&id=eq.${encodeURIComponent(id)}`,{
      headers:{ "apikey":SUPA_KEY, "Authorization":"Bearer "+SUPA_KEY }
    });
    if (!r.ok) return "";
    const a = await r.json().catch(()=>[]);
    return (Array.isArray(a)&&a[0]&&a[0].preventivo_url) ? a[0].preventivo_url : "";
  }
  async function saveLink(id,link){
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

  // Stato iniziale
  if (!recId){ btnS.disabled=true; help.textContent="ID scheda non disponibile: usa data-record-id sul <body>, oppure window.ELIP_RECORD_ID o ?rid=UUID"; }

  // Precarica dal DB
  (async () => {
    if (!recId) return;
    try {
      const cur = await getLink(recId);
      if (cur) { input.value = cur; setOpen(); help.textContent = "Link caricato ✔"; }
    } catch {}
  })();

  // Gestione pulsanti
  input.addEventListener('input', setOpen);
  setOpen();

  btnS.addEventListener('click', async () => {
    const link = (input.value||'').trim();
    if (!recId){ help.textContent="ID scheda non disponibile"; return; }
    if (!isUrl(link)){ help.textContent="Inserisci un link http/https valido oppure lascia vuoto"; return; }
    const old = btnS.textContent; btnS.disabled=true; btnS.textContent="Salvo..."; help.textContent="";
    try {
      await saveLink(recId, link||null);
      help.style.color="#0a0"; help.textContent="Link salvato ✔";
    } catch(e){
      console.error(e); help.style.color="#c00"; help.textContent="Errore salvataggio: " + (e.message||e);
    } finally {
      btnS.disabled=false; btnS.textContent=old; setTimeout(()=>{help.style.color="#666"},2000);
    }
  });
})();