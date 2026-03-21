
(function(){
  'use strict';

  const CASSETTI = Array.from({length:50}, (_,i)=>`A${i+1}`);
  const CHIUSI = new Set(['completata','chiusa','chiuso','consegnata']);

  function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function s(v){ return String(v ?? '').trim(); }
  function normCass(v){
    const x = s(v).toUpperCase();
    if (!x) return '';
    if (!/^A([1-9]|[1-4][0-9]|50)$/.test(x)) throw new Error('Cassetto non valido. Usa A1-A50.');
    return x;
  }
  function isClosed(v){ return CHIUSI.has(s(v).toLowerCase()); }

  function getSb(){
    if (window.sb) return window.sb;
    if (window.supabaseClient) return window.supabaseClient;
    if (window._sb) return window._sb;
    if (window.supabase && window.SUPABASE_URL && (window.SUPABASE_ANON_KEY || window.SUPABASE_KEY)) {
      try {
        window._sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY || window.SUPABASE_KEY);
        return window._sb;
      } catch(e){}
    }
    return null;
  }

  async function rpcPrimoLibero(sb){
    try{
      const { data, error } = await sb.rpc('get_primo_cassetto_libero');
      if (!error && data) return data;
    }catch(e){}
    return null;
  }

  async function getOccupied(sb, excludeId){
    let q = sb.from('records').select('id,cassetto,cassetto_occupato').eq('cassetto_occupato', true).not('cassetto','is',null);
    if (excludeId != null) q = q.neq('id', excludeId);
    const { data, error } = await q;
    if (error) throw error;
    return (data||[]).map(r => ({...r, cassetto:s(r.cassetto).toUpperCase()})).filter(r => r.cassetto);
  }

  async function getPrimoLibero(sb, excludeId){
    const viaRpc = await rpcPrimoLibero(sb);
    if (viaRpc) return viaRpc;
    const used = new Set((await getOccupied(sb, excludeId)).map(r => r.cassetto));
    const free = CASSETTI.find(c => !used.has(c));
    if (!free) throw new Error('Nessun cassetto libero disponibile.');
    return free;
  }

  async function renderMap(container, activeCass){
    if (!container) return;
    const sb = getSb();
    if (!sb) return;
    let rows = [];
    try {
      const { data, error } = await sb.rpc('get_mappa_cassetti');
      if (!error && Array.isArray(data)) rows = data;
    } catch(e){}
    if (!rows.length){
      const occ = await getOccupied(sb);
      const map = new Map(occ.map(r => [r.cassetto, true]));
      rows = CASSETTI.map(c => ({ cassetto:c, occupato:!!map.get(c), record_id:null }));
    }
    container.innerHTML = rows.map(r => {
      const c = s(r.cassetto).toUpperCase();
      const cls = r.occupato ? 'occupied' : 'free';
      const active = c && activeCass === c ? 'active' : '';
      return `<div class="cass-box ${cls} ${active}" data-cassetto="${c}">${c}<small>${r.occupato ? 'Occupato' : 'Libero'}</small></div>`;
    }).join('');
  }

  function bindMapPick(container, input){
    if (!container || !input || container.dataset.boundCassPick === '1') return;
    container.dataset.boundCassPick = '1';
    container.addEventListener('click', (ev) => {
      const box = ev.target.closest('.cass-box');
      if (!box) return;
      const cass = s(box.dataset.cassetto);
      input.value = cass;
      [...container.querySelectorAll('.cass-box')].forEach(el => el.classList.toggle('active', el === box));
    });
  }

  async function ensureOccupancyById(recordId, cassValue, statoValue){
    const sb = getSb();
    if (!sb || !recordId) return;
    const cass = normCass(cassValue || '');
    const closed = isClosed(statoValue);
    const payload = closed || !cass
      ? { cassetto: null, cassetto_occupato: false }
      : { cassetto: cass, cassetto_occupato: true };

    const { error } = await sb.from('records').update(payload).eq('id', recordId);
    if (error) throw error;
  }

  async function findLatestRecordFromNewForm() {
    const sb = getSb();
    if (!sb) return null;

    const cliente = s(document.getElementById('nCliente')?.value);
    const descrizione = s(document.getElementById('nDescrizione')?.value);
    const modello = s(document.getElementById('nModello')?.value);
    const ddt = s(document.getElementById('nDDT')?.value);

    const candidates = [];
    if (ddt) candidates.push(['ddt', ddt]);
    if (cliente) candidates.push(['cliente', cliente]);
    if (descrizione) candidates.push(['descrizione', descrizione]);
    if (modello) candidates.push(['modello', modello]);

    const dateFields = ['created_at','createdAt','data','apertura','data_apertura','inserted_at'];

    for (const [field, value] of candidates) {
      try {
        let query = sb.from('records').select('*').eq(field, value).limit(10);
        for (const dateField of dateFields) {
          try {
            const res = await query.order(dateField, { ascending:false });
            if (!res.error && res.data && res.data.length) return res.data[0];
          } catch(e){}
        }
        const res = await query;
        if (!res.error && res.data && res.data.length) return res.data[0];
      } catch(e){}
    }
    return null;
  }

  function guessCurrentRecordId(){
    return window.currentRecordId || window.recordId || window.editRecordId || window.selectedRecordId || null;
  }

  async function setupButtons(){
    const sb = getSb();
    if (!sb) { setTimeout(setupButtons, 800); return; }

    const eInput = document.getElementById('eCassetto');
    const nInput = document.getElementById('nCassetto');
    const eStato = document.getElementById('eStato');
    const nStato = document.getElementById('nStato');

    const editMap = document.getElementById('editCassMap');
    const newMap = document.getElementById('newCassMap');
    bindMapPick(editMap, eInput);
    bindMapPick(newMap, nInput);

    async function refreshAllMaps(){
      await renderMap(editMap, s(eInput?.value).toUpperCase());
      await renderMap(newMap, s(nInput?.value).toUpperCase());
    }

    document.getElementById('btnEditCassAuto')?.addEventListener('click', async () => {
      try {
        eInput.value = await getPrimoLibero(sb, guessCurrentRecordId());
        await refreshAllMaps();
      } catch(err){ alert(err.message || 'Errore cassetto'); }
    });

    document.getElementById('btnEditCassFree')?.addEventListener('click', async () => {
      try {
        const id = guessCurrentRecordId();
        eInput.value = '';
        if (id) await ensureOccupancyById(id, '', 'Completata');
        await refreshAllMaps();
      } catch(err){ alert(err.message || 'Errore liberazione cassetto'); }
    });

    document.getElementById('btnNewCassAuto')?.addEventListener('click', async () => {
      try {
        nInput.value = await getPrimoLibero(sb, null);
        await refreshAllMaps();
      } catch(err){ alert(err.message || 'Errore cassetto'); }
    });

    document.getElementById('btnNewCassClear')?.addEventListener('click', async () => {
      nInput.value = '';
      await refreshAllMaps();
    });

    // Persist edit after existing app save
    document.getElementById('btnSave')?.addEventListener('click', async () => {
      try{
        const idBefore = guessCurrentRecordId();
        await wait(900);
        const idAfter = guessCurrentRecordId() || idBefore;
        if (!idAfter) return;
        await ensureOccupancyById(idAfter, eInput?.value, eStato?.value);
        await refreshAllMaps();
      }catch(err){
        console.error('Errore post-save cassetto edit', err);
      }
    });

    // Persist new after existing app save
    document.getElementById('btnNewSave')?.addEventListener('click', async () => {
      try{
        await wait(1200);
        const rec = await findLatestRecordFromNewForm();
        if (!rec || !rec.id) { await refreshAllMaps(); return; }
        await ensureOccupancyById(rec.id, nInput?.value, nStato?.value);
        await refreshAllMaps();
      }catch(err){
        console.error('Errore post-save cassetto new', err);
      }
    });

    // Auto-liberazione se stato edit passa a Completata
    eStato?.addEventListener('change', async () => {
      if (isClosed(eStato.value)) {
        eInput.value = '';
        await refreshAllMaps();
      }
    });

    // Auto-assegnazione soft on open new modal if empty
    document.getElementById('btnNew')?.addEventListener('click', async () => {
      await wait(200);
      if (nInput && !s(nInput.value)) {
        try { nInput.value = await getPrimoLibero(sb, null); } catch(e){}
      }
      await refreshAllMaps();
    });

    // Keep map synced when user types manually
    [eInput, nInput].forEach(inp => inp && inp.addEventListener('input', refreshAllMaps));

    await refreshAllMaps();
    setInterval(refreshAllMaps, 15000);
  }

  document.addEventListener('DOMContentLoaded', setupButtons);
})();
