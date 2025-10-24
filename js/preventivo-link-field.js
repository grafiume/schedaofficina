/* preventivo-link-field.standalone.js
 * Campo "Link preventivo" cliccabile per SchedaOfficina — versione STANDALONE
 * - Non richiede window.supabase (usa REST PostgREST direttamente)
 * - Nessun prompt: se non trova l'ID scheda, disabilita "Salva" e mostra istruzioni
 * - Include già URL e KEY del progetto SchedaOfficina
 *
 * Config inclusa (modifica se cambi progetto):
 */
(function(){
  const SUPA_URL = "https://pedmdiljgjgswhfwedno.supabase.co";   // Progetto SchedaOfficina
  const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZG1kaWxqZ2pnc3doZndlZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjgxNTIsImV4cCI6MjA3NTY0NDE1Mn0.4p2T8BJHGjVsj1Bx22Mk1mbYmfh7MX5WpCwxhwi4CmQ";

  const ALLOWED_BASE = /^https:\/\/grafiume\.github\.io\/preventivi-elip\/\?pvid=[0-9a-f-]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

  // --- helper ID scheda (passivo, no prompt)
  function getParam(names) { try { const p = new URLSearchParams(location.search); for (const n of names) { const v = p.get(n); if (v) return v; } } catch {} return null; }
  function detectRecordId() {
    if (window.ELIP_RECORD_ID) return String(window.ELIP_RECORD_ID);
    if (window.elip_current && window.elip_current.id) return String(window.elip_current.id);
    if (document.body && document.body.dataset && document.body.dataset.recordId) return String(document.body.dataset.recordId);
    const any = document.querySelector('[data-record-id]'); if (any) { const v = any.getAttribute('data-record-id'); if (v) return String(v); }
    const sel = ['input[name="id"]','input#id','input#record-id','input[name="record_id"]','input[name="scheda_id"]'];
    for (const s of sel) { const el = document.querySelector(s); if (el && el.value) return String(el.value); }
    const q = getParam(['id','schedaId','record','rid']); if (q) return String(q);
    return null;
  }
  function isValid(url) { return !url || ALLOWED_BASE.test(url.trim()); }
  function findMountPoint() {
    const h = Array.from(document.querySelectorAll('h2,h3,legend')).find(x => /scheda.*cliente/i.test((x.textContent||""))); if (h && h.parentElement) return h.parentElement;
    const lab = Array.from(document.querySelectorAll('label')).find(x => /preventivo/i.test((x.textContent||""))); if (lab) return lab.closest('.form-group, .row, .col, form, .card') || lab.parentElement;
    return document.body;
  }

  // --- REST helpers
  async function restPatchRecord(recordId, values){
    const base = (SUPA_URL || "").replace(/\/+$/,"");
    const key  = SUPA_KEY || "";
    if (!base || !key) return { error: { message: "Configurazione REST mancante (SUPA_URL/KEY)" } };

    const url = `${base}/rest/v1/records?id=eq.${encodeURIComponent(recordId)}`;
    const r = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(values)
    });
    if (r.ok) return { error: null };
    return { error: { message: await r.text().catch(()=> String(r.status)) } };
  }

  // --- Stato
  const recordId = detectRecordId();
  const rec = window.elip_current || {};

  // --- UI
  const mount = findMountPoint();
  const box = document.createElement('div'); box.className='card'; box.style.padding='8px'; box.style.marginTop='8px';
  const head = document.createElement('div'); head.textContent='Collegamento al preventivo'; head.style.fontWeight='700'; head.style.marginBottom='6px';

  const input = document.createElement('input');
  input.type='text';
  input.placeholder='https://grafiume.github.io/preventivi-elip/?pvid=...';
  input.value = rec.preventivo_url || '';
  input.className='form-control';
  input.style.minWidth='280px';

  const save = document.createElement('button'); save.textContent='Salva'; save.className='btn btn-primary btn-sm'; save.style.marginLeft='8px';
  const go   = document.createElement('a');     go.textContent='Apri';  go.className='btn btn-success btn-sm'; go.target='_blank'; go.rel='noopener'; go.style.marginLeft='8px';

  const help = document.createElement('div'); help.style.fontSize='12px'; help.style.color='#666'; help.style.marginTop='6px';

  function refreshGo() {
    const url = (input.value||'').trim();
    const ok = isValid(url);
    go.href = ok ? url : '#';
    go.style.opacity = ok ? '1' : '0.6';
    go.style.pointerEvents = ok ? 'auto' : 'none';
  }
  input.addEventListener('input', refreshGo);
  refreshGo();

  const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.append(input, save, go);
  box.append(head, row, help);

  if (mount && mount !== document.body) mount.appendChild(box);
  else { const flo=document.createElement('div'); flo.style.position='fixed'; flo.style.right='16px'; flo.style.bottom='16px'; flo.style.zIndex=9999; flo.appendChild(box); document.body.appendChild(flo); }

  if (!recordId) { save.disabled = true; help.textContent = 'ID scheda non disponibile: imposta window.ELIP_RECORD_ID o un attributo data-record-id sulla pagina.'; }

  save.onclick = async function(){
    const url = (input.value||'').trim();
    if (!isValid(url)) { help.textContent = 'URL non valido: incolla un link con ?pvid=UUID.'; return; }
    if (!recordId)   { help.textContent = 'ID scheda non disponibile (vedi messaggio sopra).'; return; }
    save.disabled = true; const old = save.textContent; save.textContent='Salvo...'; help.textContent='';
    try {
      const { error } = await restPatchRecord(recordId, { preventivo_url: url || null });
      if (error) throw error;
      help.style.color='#0a0'; help.textContent='Link salvato ✔';
    } catch(e) {
      console.error(e);
      help.style.color='#c00'; help.textContent='Errore salvataggio: ' + (e.message || e);
    } finally {
      save.disabled=false; save.textContent=old; setTimeout(()=>{help.style.color='#666';},2000);
    }
  };
})();
