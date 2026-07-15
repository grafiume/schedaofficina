(function(){
  'use strict';

  const CASSETTI = Array.from({ length: 80 }, (_,i)=>`A${i+1}`);
  const CHIUSI = new Set(['completata','chiusa','chiuso','consegnata']);

  function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function s(v){ return String(v ?? '').trim(); }
  function isClosed(v){ return CHIUSI.has(s(v).toLowerCase()); }
  function normCass(v){
    const x = s(v).toUpperCase();
    if (!x) return '';
    if (!/^A([1-9]|[1-7][0-9]|80)$/.test(x)) throw new Error('Cassetto non valido. Usa A1-A80.');
    return x;
  }

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

  function currentId(){
    return window.currentRecordId || window.recordId || window.editRecordId || window.selectedRecordId || window.state?.editing?.id || null;
  }

  async function getOccupied(sb, excludeId){
    let q = sb.from('records').select('id,cassetto,statoPratica').not('cassetto','is',null);
    if (excludeId != null) q = q.neq('id', excludeId);
    const { data, error } = await q;
    if (error) return [];
    return (data || [])
      .map(r => ({ cassetto: s(r.cassetto).toUpperCase(), stato: s(r.statoPratica) }))
      .filter(r => r.cassetto && !isClosed(r.stato));
  }

  async function primoLibero(excludeId){
    const sb = getSb();
    if (!sb) throw new Error('Connessione non pronta. Riprova tra qualche secondo.');
    const used = new Set((await getOccupied(sb, excludeId)).map(r => r.cassetto));
    const free = CASSETTI.find(c => !used.has(c));
    if (!free) throw new Error('Nessun cassetto libero disponibile.');
    return free;
  }

  async function isOccupied(cass, excludeId){
    const sb = getSb();
    if (!sb || !cass) return false;
    const used = await getOccupied(sb, excludeId);
    return used.some(r => r.cassetto === cass);
  }

  async function validateBeforeSave(input, stato, excludeId){
    const raw = s(input && input.value);
    if (!raw || isClosed(stato)) return true;
    let cass;
    try { cass = normCass(raw); }
    catch(err){ alert(err.message || 'Cassetto non valido.'); return false; }
    if (await isOccupied(cass, excludeId)) {
      alert(`Il cassetto ${cass} è già occupato.`);
      return false;
    }
    input.value = cass;
    return true;
  }

  async function liberaRecord(id){
    const sb = getSb();
    if (!sb || !id) return;
    try { await sb.from('records').update({ cassetto:null, cassetto_occupato:false }).eq('id', id); }
    catch(_e){}
  }

  function bind(){
    const eInput = document.getElementById('eCassetto');
    const nInput = document.getElementById('nCassetto');
    const eStato = document.getElementById('eStato');
    const nStato = document.getElementById('nStato');

    document.getElementById('btnSave')?.addEventListener('click', async (ev) => {
      const ok = await validateBeforeSave(eInput, eStato?.value, currentId());
      if (!ok) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      }
    }, true);

    document.getElementById('btnNewSave')?.addEventListener('click', async (ev) => {
      const ok = await validateBeforeSave(nInput, nStato?.value, null);
      if (!ok) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      }
    }, true);

    document.getElementById('btnEditCassAuto')?.addEventListener('click', async () => {
      try { if(eInput) eInput.value = await primoLibero(currentId()); }
      catch(err){ alert(err.message || 'Errore cassetto'); }
    });

    document.getElementById('btnNewCassAuto')?.addEventListener('click', async () => {
      try { if(nInput) nInput.value = await primoLibero(null); }
      catch(err){ alert(err.message || 'Errore cassetto'); }
    });

    document.getElementById('btnEditCassFree')?.addEventListener('click', async () => {
      if(eInput) eInput.value = '';
      await liberaRecord(currentId());
    });

    document.getElementById('btnNewCassClear')?.addEventListener('click', () => {
      if(nInput) nInput.value = '';
    });

    eStato?.addEventListener('change', () => { if (isClosed(eStato.value) && eInput) eInput.value = ''; });
    nStato?.addEventListener('change', () => { if (isClosed(nStato.value) && nInput) nInput.value = ''; });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();
