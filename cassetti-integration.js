(function(){
  'use strict';

  const CASSETTI = Array.from({ length: 80 }, (_,i)=>`A${i+1}`);
  const CHIUSI = new Set(['completata','chiusa','chiuso','consegnata']);

  function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function s(v){ return String(v ?? '').trim(); }
  function normCass(v){
    const x = s(v).toUpperCase();
    if (!x) return '';
    if (!/^A([1-9]|[1-7][0-9]|80)$/.test(x)) throw new Error('Cassetto non valido. Usa A1-A80.');
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

  function guessCurrentRecordId(){
    return window.currentRecordId
      || window.recordId
      || window.editRecordId
      || window.selectedRecordId
      || window.state?.editing?.id
      || null;
  }

  async function getOccupied(sb, excludeId){
    let q = sb
      .from('records')
      .select('id,cassetto,statoPratica')
      .not('cassetto','is',null);

    if (excludeId != null) q = q.neq('id', excludeId);

    const { data, error } = await q;
    if (error) throw error;

    return (data || [])
      .map(r => ({
        id: r.id,
        cassetto: s(r.cassetto).toUpperCase(),
        statoRaw: s(r.statoPratica)
      }))
      .filter(r => r.cassetto)
      .filter(r => !isClosed(r.statoRaw));
  }

  async function isCassOccupied(sb, cass, excludeId){
    const occ = await getOccupied(sb, excludeId);
    return occ.some(r => r.cassetto === cass);
  }

  async function getPrimoLibero(sb, excludeId){
    const used = new Set((await getOccupied(sb, excludeId)).map(r => r.cassetto));
    const free = CASSETTI.find(c => !used.has(c));
    if (!free) throw new Error('Nessun cassetto libero disponibile.');
    return free;
  }

  async function renderMap(container, activeCass, excludeId){
    if (!container) return;
    const sb = getSb();
    if (!sb) return;

    let rows = [];
    try {
      const occ = await getOccupied(sb, excludeId);
      const map = new Map(occ.map(r => [r.cassetto, true]));
      rows = CASSETTI.map(c => ({ cassetto:c, occupato:!!map.get(c) }));
    } catch(e){
      console.error('Errore mappa cassetti', e);
      rows = CASSETTI.map(c => ({ cassetto:c, occupato:false }));
    }

    container.innerHTML = rows.map(r => {
      const c = s(r.cassetto).toUpperCase();
      const cls = r.occupato ? 'occupied' : 'free';
      const active = c && activeCass === c ? 'active' : '';
      const title = r.occupato ? 'Occupato' : 'Libero';
      return `<div class="cass-box ${cls} ${active}" data-cassetto="${c}" data-occupied="${r.occupato ? '1' : '0'}" title="${title}">${c}<small>${title}</small></div>`;
    }).join('');
  }

  function bindMapPick(container, input){
    if (!container || !input || container.dataset.boundCassPick === '1') return;
    container.dataset.boundCassPick = '1';

    container.addEventListener('click', (ev) => {
      const box = ev.target.closest('.cass-box');
      if (!box) return;

      const cass = s(box.dataset.cassetto);
      const occupied = box.dataset.occupied === '1';
      const activeCass = s(input.value).toUpperCase();

      if (occupied && cass !== activeCass) {
        alert(`Il cassetto ${cass} è già occupato.`);
        return;
      }

      input.value = cass;
      [...container.querySelectorAll('.cass-box')].forEach(el => el.classList.toggle('active', el === box));
    });
  }

  async function ensureOccupancyById(recordId, cassValue, statoValue){
    const sb = getSb();
    if (!sb || !recordId) return;

    const cass = normCass(cassValue || '');
    const closed = isClosed(statoValue);

    if (!closed && cass) {
      const occupied = await isCassOccupied(sb, cass, recordId);
      if (occupied) {
        throw new Error(`Il cassetto ${cass} è già occupato da un'altra scheda.`);
      }
    }

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
    if (ddt) candidates.push(['docTrasporto', ddt]);
    if (cliente) candidates.push(['cliente', cliente]);
    if (descrizione) candidates.push(['descrizione', descrizione]);
    if (modello) candidates.push(['modello', modello]);

    for (const [field, value] of candidates) {
      try {
        const res = await sb.from('records')
          .select('*')
          .eq(field, value)
          .order('dataApertura', { ascending:false })
          .limit(10);
        if (!res.error && res.data && res.data.length) return res.data[0];
      } catch(e){}
    }
    return null;
  }

  async function validateInputBeforeSave(input, statoValue, excludeId){
    const sb = getSb();
    if (!sb) return true;

    const raw = s(input?.value);
    if (!raw) return true;
    if (isClosed(statoValue)) return true;

    let cass;
    try {
      cass = normCass(raw);
    } catch(err) {
      alert(err.message || 'Cassetto non valido.');
      return false;
    }

    const occupied = await isCassOccupied(sb, cass, excludeId);
    if (occupied) {
      alert(`Il cassetto ${cass} è già occupato.`);
      return false;
    }

    input.value = cass;
    return true;
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
      await renderMap(editMap, s(eInput?.value).toUpperCase(), guessCurrentRecordId());
      await renderMap(newMap, s(nInput?.value).toUpperCase(), null);
    }

    // CAPTURE PHASE: stop invalid save before app.js runs
    document.getElementById('btnSave')?.addEventListener('click', async (ev) => {
      const ok = await validateInputBeforeSave(eInput, eStato?.value, guessCurrentRecordId());
      if (!ok) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        await refreshAllMaps();
        return false;
      }
    }, true);

    document.getElementById('btnNewSave')?.addEventListener('click', async (ev) => {
      const ok = await validateInputBeforeSave(nInput, nStato?.value, null);
      if (!ok) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        await refreshAllMaps();
        return false;
      }
    }, true);

    document.getElementById('btnEditCassAuto')?.addEventListener('click', async () => {
      try {
        await refreshAllMaps();
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
        await refreshAllMaps();
        nInput.value = await getPrimoLibero(sb, null);
        await refreshAllMaps();
      } catch(err){ alert(err.message || 'Errore cassetto'); }
    });

    document.getElementById('btnNewCassClear')?.addEventListener('click', async () => {
      nInput.value = '';
      await refreshAllMaps();
    });

    // bubble phase after app save
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

    eStato?.addEventListener('change', async () => {
      if (isClosed(eStato.value)) eInput.value = '';
      await refreshAllMaps();
    });

    nStato?.addEventListener('change', async () => {
      if (isClosed(nStato.value)) nInput.value = '';
      await refreshAllMaps();
    });

    document.getElementById('btnNew')?.addEventListener('click', async () => {
      await wait(200);
      await refreshAllMaps();
    });

    [eInput, nInput].forEach(inp => inp && inp.addEventListener('input', refreshAllMaps));

    await refreshAllMaps();
    setInterval(refreshAllMaps, 15000);
  }

  document.addEventListener('DOMContentLoaded', setupButtons);
})();
