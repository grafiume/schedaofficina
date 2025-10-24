/* SchedaOfficina – campo "Link preventivo" cliccabile
 * Requisiti: window.supabase (SDK v2) deve essere presente e loggato come al solito.
 */
(function () {
  const ALLOWED_BASE = /^https:\/\/grafiume\.github\.io\/preventivi-elip\/\?pvid=[0-9a-f-]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

  // Helper
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function findMountPoint() {
    // 1) Sezione "Dati scheda e cliente"
    const h = Array.from(document.querySelectorAll('h2,h3,legend')).find(x => /scheda.*cliente/i.test(x.textContent||""));
    if (h && h.parentElement) return h.parentElement;
    // 2) Vicino alla label "Preventivo"
    const lab = Array.from(document.querySelectorAll('label')).find(x => /preventivo/i.test(x.textContent||""));
    if (lab) return lab.closest('.form-group, .row, .col, form, .card') || lab.parentElement;
    // 3) Fallback: body
    return document.body;
  }
  function isValid(url) { return !url || ALLOWED_BASE.test(url.trim()); }

  // ID record e supabase client
  const rec = (window.elip_current || {});
  const recordId = rec.id || null;
  const sb = (window.supabase && typeof window.supabase.from === 'function') ? window.supabase : null;

  // UI elements
  const mount = findMountPoint();
  const wrap = document.createElement('div');
  wrap.style.marginTop = '8px';
  wrap.style.display = 'grid';
  wrap.style.gridTemplateColumns = '1fr auto auto';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';

  const label = document.createElement('label');
  label.textContent = 'Link preventivo';
  label.style.fontWeight = '600';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'https://grafiume.github.io/preventivi-elip/?pvid=...';
  input.value = rec.preventivo_url || '';
  input.className = 'form-control';
  input.style.minWidth = '280px';

  const save = document.createElement('button');
  save.textContent = 'Salva';
  save.className = 'btn btn-primary btn-sm';

  const go = document.createElement('a');
  go.textContent = 'Apri';
  go.className = 'btn btn-success btn-sm';
  go.target = '_blank';
  go.rel = 'noopener';

  function refreshGo() {
    const url = (input.value || '').trim();
    const ok = isValid(url);
    go.href = ok ? url : '#';
    go.disabled = !ok;
    go.setAttribute('aria-disabled', ok ? 'false' : 'true');
    go.style.opacity = ok ? '1' : '0.6';
    go.style.pointerEvents = ok ? 'auto' : 'none';
  }
  input.addEventListener('input', refreshGo);
  refreshGo();

  // Layout
  const row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '1fr auto auto';
  row.style.gap = '8px';
  row.append(input, save, go);

  const box = document.createElement('div');
  box.className = 'card';
  box.style.padding = '8px';
  box.style.marginTop = '8px';
  const head = document.createElement('div');
  head.textContent = 'Collegamento al preventivo';
  head.style.fontWeight = '700';
  head.style.marginBottom = '6px';

  box.append(head, row);

  // Posiziona senza rompere il layout
  if (mount && mount !== document.body) {
    mount.appendChild(box);
  } else {
    // fallback posizionato in basso a destra
    const flo = document.createElement('div');
    flo.style.position = 'fixed';
    flo.style.right = '16px';
    flo.style.bottom = '16px';
    flo.style.zIndex = 9999;
    flo.appendChild(box);
    document.body.appendChild(flo);
  }

  // Salvataggio
  save.onclick = async function () {
    const url = (input.value || '').trim();
    if (!recordId) return alert('ID scheda non rilevato');
    if (!isValid(url)) return alert('Inserisci un link valido (con ?pvid=UUID)');

    if (!sb) return alert('Client Supabase non trovato in pagina');

    save.disabled = true;
    save.textContent = 'Salvo...';
    try {
      const { error } = await sb.from('records').update({ preventivo_url: url || null }).eq('id', recordId);
      if (error) throw error;
      alert('Link salvato ✅');
    } catch (e) {
      console.error(e);
      alert('Errore salvataggio: ' + (e.message || e));
    } finally {
      save.disabled = false;
      save.textContent = 'Salva';
    }
  };
})();