// UI + logica
(function(){
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const rowsEl = $('#rows');
  const qEl = $('#q');
  const chkExact = $('#chkExact');

  const kpiTot = $('#kpiTot');
  const kpiAttesa = $('#kpiAttesa');
  const kpiLav = $('#kpiLav');
  const kpiChiuse = $('#kpiChiuse');

  const pageHome = $('#page-home');
  const pageEdit = $('#page-edit');
  const formTitle = $('#formTitle');
  const closedStamp = $('#closedStamp');
  const recIdEl = $('#recId');

  const f = {
    id: null,
    cliente: $('#f_cliente'),
    telefono: $('#f_telefono'),
    descrizione: $('#f_descrizione'),
    ddt: $('#f_ddt'),
    marca: $('#f_marca'),
    modello: $('#f_modello'),
    battcoll: $('#f_battcoll'),
    stato: $('#f_stato'),
    dataApertura: $('#f_dataApertura'),
    dataAccettazione: $('#f_dataAccettazione'),
    dataFine: $('#f_dataFine'),
    note: $('#f_note')
  };

  function fmtIT(d){
    try{
      if (!d) return '';
      const date = new Date(d);
      if (isNaN(date)) return '';
      return date.toLocaleDateString('it-IT');
    }catch(_){ return ''; }
  }

  function renderKPIs(list){
    kpiTot.textContent = list.length;
    kpiAttesa.textContent = list.filter(r => (r.stato||'').toLowerCase().includes('attesa')).length;
    kpiLav.textContent = list.filter(r => (r.stato||'').toLowerCase().includes('lavorazione')).length;
    const chiuseByDate = list.filter(r => {
      const stato = (r.stato||'').toLowerCase();
      if (stato.includes('completata') || stato.includes('chiusa')) return true;
      if (r.dataFine) return true;
      return false;
    }).length;
    kpiChiuse.textContent = chiuseByDate;
  }

  function rowHTML(r){
    const stato = (r.stato || '').trim();
    const badgeClass = /completata|chiusa/i.test(stato) ? 'green' : (/attesa/i.test(stato) ? 'orange' : 'gray');
    const dataStr = fmtIT(r.dataApertura || r.created_at);
    return \`
      <tr data-id="\${r.id}">
        <td>\${dataStr}</td>
        <td>\${r.cliente || ''}</td>
        <td>\${r.descrizione || ''}</td>
        <td><span class="badge \${badgeClass}">\${stato || '—'}</span></td>
        <td>
          <button class="btn btn-small" data-action="open">Apri</button>
        </td>
      </tr>\`;
  }

  async function reload(){
    try{
      rowsEl.innerHTML = '<tr><td class="small" colspan="5">Carico…</td></tr>';
      const list = await window.api.listRecords(qEl.value, chkExact.checked);
      renderKPIs(list);
      if (!list.length){
        rowsEl.innerHTML = '<tr><td class="small" colspan="5">Nessun record…</td></tr>';
        return;
      }
      rowsEl.innerHTML = list.map(rowHTML).join('');
    }catch(e){
      console.error(e);
      rowsEl.innerHTML = '<tr><td class="small" colspan="5">Errore: '+(e.message||e)+' </td></tr>';
    }
  }

  function showHome(){
    pageEdit.classList.add('hidden');
    pageHome.classList.remove('hidden');
  }
  function showEdit(){
    pageHome.classList.add('hidden');
    pageEdit.classList.remove('hidden');
  }

  async function openById(id){
    try{
      const r = await window.api.getRecord(id);
      f.id = r.id;
      f.cliente.value = r.cliente || '';
      f.telefono.value = r.telefono || '';
      f.descrizione.value = r.descrizione || '';
      f.ddt.value = r.ddt || '';
      f.marca.value = r.marca || '';
      f.modello.value = r.modello || '';
      f.battcoll.value = r.battcoll || '';
      f.stato.value = r.stato || 'In attesa';
      f.dataApertura.value = (r.dataApertura||'').split('T')[0] || '';
      f.dataAccettazione.value = (r.dataAccettazione||'').split('T')[0] || '';
      f.dataFine.value = (r.dataFine||'').split('T')[0] || '';
      f.note.value = r.note || '';
      recIdEl.textContent = r.id || '—';
      formTitle.textContent = 'Modifica scheda';
      closedStamp.classList.toggle('hidden', !(r.dataFine || /completata|chiusa/i.test(r.stato||'')));
      showEdit();
    }catch(e){
      alert('Errore apertura: '+(e.message||e));
    }
  }

  function newRecord(){
    f.id = null;
    for (const k in f){
      if (k === 'id') continue;
      if (f[k] instanceof HTMLInputElement || f[k] instanceof HTMLTextAreaElement || f[k] instanceof HTMLSelectElement){
        f[k].value = '';
      }
    }
    f.stato.value = 'In attesa';
    recIdEl.textContent = '—';
    formTitle.textContent = 'Nuova scheda';
    closedStamp.classList.add('hidden');
    showEdit();
  }

  async function save(){
    const payload = {
      id: f.id, // consente upsert
      cliente: f.cliente.value.trim() || null,
      telefono: f.telefono.value.trim() || null,
      descrizione: f.descrizione.value.trim() || null,
      ddt: f.ddt.value.trim() || null,
      marca: f.marca.value.trim() || null,
      modello: f.modello.value.trim() || null,
      battcoll: f.battcoll.value.trim() || null,
      stato: f.stato.value,
      dataApertura: f.dataApertura.value || null,
      dataAccettazione: f.dataAccettazione.value || null,
      dataFine: f.dataFine.value || null,
      note: f.note.value || null
    };
    try{
      const saved = await window.api.upsertRecord(payload);
      await reload();
      showHome();
    }catch(e){
      alert('Errore salvataggio: '+(e.message||e));
    }
  }

  // events
  $('#btnSearch').addEventListener('click', reload);
  $('#btnReload').addEventListener('click', reload);
  $('#btnReset').addEventListener('click', () => {
    qEl.value = '';
    chkExact.checked = false;
    reload();
    showHome();
  });
  $('#btnNew').addEventListener('click', newRecord);
  $('#btnBack').addEventListener('click', showHome);
  $('#btnSave').addEventListener('click', save);
  qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') reload(); });
  chkExact.addEventListener('change', reload);

  // delegate table row open
  rowsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="open"]');
    if (btn){
      const id = e.target.closest('tr')?.dataset?.id;
      if (id) openById(id);
    }
  });

  reload();
})();