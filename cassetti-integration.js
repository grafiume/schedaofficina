(function(){
  'use strict';

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

  function guessCurrentRecordId(){
    return window.currentRecordId || window.recordId || window.editRecordId || window.selectedRecordId || null;
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

  function bindUppercase(input){
    if (!input || input.dataset.boundCassUpper === '1') return;
    input.dataset.boundCassUpper = '1';
    input.addEventListener('blur', () => {
      const v = s(input.value).toUpperCase();
      input.value = v;
    });
  }

  async function setup(){
    const eInput = document.getElementById('eCassetto');
    const nInput = document.getElementById('nCassetto');
    const eStato = document.getElementById('eStato');
    const nStato = document.getElementById('nStato');

    bindUppercase(eInput);
    bindUppercase(nInput);

    document.getElementById('btnSave')?.addEventListener('click', async () => {
      try {
        const idBefore = guessCurrentRecordId();
        await wait(900);
        const idAfter = guessCurrentRecordId() || idBefore;
        if (!idAfter) return;
        await ensureOccupancyById(idAfter, eInput?.value, eStato?.value);
      } catch(err) {
        console.error('Errore post-save cassetto edit', err);
      }
    });

    document.getElementById('btnNewSave')?.addEventListener('click', async () => {
      try {
        await wait(1200);
        const rec = await findLatestRecordFromNewForm();
        if (!rec || !rec.id) return;
        await ensureOccupancyById(rec.id, nInput?.value, nStato?.value);
      } catch(err) {
        console.error('Errore post-save cassetto new', err);
      }
    });

    eStato?.addEventListener('change', () => {
      if (isClosed(eStato.value) && eInput) eInput.value = '';
    });

    nStato?.addEventListener('change', () => {
      if (isClosed(nStato.value) && nInput) nInput.value = '';
    });
  }

  document.addEventListener('DOMContentLoaded', setup);
})();
