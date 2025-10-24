/* preventivo-link-field.v2.js ... (see comments inside) */
(function () {
  const ALLOWED_BASE = /^https:\/\/grafiume\.github\.io\/preventivi-elip\/\?pvid=[0-9a-f-]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  function getParam(names) {
    try { const p = new URLSearchParams(location.search); for (const n of names) { const v = p.get(n); if (v) return v; } } catch {}
    return null;
  }
  function getRecordId() {
    if (window.elip_current && window.elip_current.id) return String(window.elip_current.id);
    const sel = ['input[name="id"]','input#id','input#record-id','[data-record-id]','input[name="record_id"]','input[name="scheda_id"]'];
    for (const s of sel) { const el = document.querySelector(s); if (el) { const val = el.getAttribute('data-record-id') || el.value; if (val) return String(val); } }
    const q = getParam(['id','schedaId','record','rid']); if (q) return String(q);
    const manual = window.prompt("ID scheda non rilevato. Incolla l'UUID della scheda:"); return manual ? String(manual.trim()) : null;
  }
  function findMountPoint() {
    const h = Array.from(document.querySelectorAll('h2,h3,legend')).find(x => /scheda.*cliente/i.test(x.textContent||""));
    if (h && h.parentElement) return h.parentElement;
    const lab = Array.from(document.querySelectorAll('label')).find(x => /preventivo/i.test(x.textContent||""));
    if (lab) return lab.closest('.form-group, .row, .col, form, .card') || lab.parentElement;
    return document.body;
  }
  function isValid(url) { return !url || ALLOWED_BASE.test(url.trim()); }

  const recordId = getRecordId();
  const sb = (window.supabase && typeof window.supabase.from === 'function') ? window.supabase : null;
  const rec = window.elip_current || {};
  const mount = findMountPoint();

  const box = document.createElement('div'); box.className='card'; box.style.padding='8px'; box.style.marginTop='8px';
  const head = document.createElement('div'); head.textContent='Collegamento al preventivo'; head.style.fontWeight='700'; head.style.marginBottom='6px';
  const input = document.createElement('input'); input.type='text'; input.placeholder='https://grafiume.github.io/preventivi-elip/?pvid=...'; input.value=rec.preventivo_url||''; input.className='form-control'; input.style.minWidth='280px';
  const save = document.createElement('button'); save.textContent='Salva'; save.className='btn btn-primary btn-sm'; save.style.marginLeft='8px';
  const go = document.createElement('a'); go.textContent='Apri'; go.className='btn btn-success btn-sm'; go.target='_blank'; go.rel='noopener'; go.style.marginLeft='8px';

  function refreshGo(){ const url=(input.value||'').trim(); const ok=isValid(url); go.href= ok ? url : '#'; go.style.opacity= ok ? '1':'0.6'; go.style.pointerEvents= ok ? 'auto':'none'; }
  input.addEventListener('input', refreshGo); refreshGo();

  const row=document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.append(input,save,go);
  box.append(head,row);

  if (mount && mount !== document.body) mount.appendChild(box);
  else { const flo=document.createElement('div'); flo.style.position='fixed'; flo.style.right='16px'; flo.style.bottom='16px'; flo.style.zIndex=9999; flo.appendChild(box); document.body.appendChild(flo); }

  save.onclick = async function(){
    const url=(input.value||'').trim();
    if (!recordId) return alert('ID scheda non rilevato');
    if (!isValid(url)) return alert('Inserisci un link valido (con ?pvid=UUID)');
    if (!sb) return alert('Client Supabase non trovato in pagina');
    save.disabled=true; save.textContent='Salvo...';
    try {
      const { error } = await sb.from('records').update({ preventivo_url: url || null }).eq('id', recordId);
      if (error) throw error;
      alert('Link salvato ✅');
    } catch(e){ console.error(e); alert('Errore salvataggio: ' + (e.message||e)); }
    finally{ save.disabled=false; save.textContent='Salva'; }
  };
})();
