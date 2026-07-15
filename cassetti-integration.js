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

  async function renderMap(container, input, excludeId){
    if (!container) return;
    const activeCass = s(input && input.value).toUpperCase();
    let used = new Set();
    try {
      const sb = getSb();
      if (sb) used = new Set((await getOccupied(sb, excludeId)).map(r => r.cassetto));
    } catch(_e) {}

    container.innerHTML = CASSETTI.map(function(c){
      const occupied = used.has(c);
      const active = activeCass === c;
      const cls = occupied ? 'occupied' : 'free';
      const label = occupied ? 'Occupato' : 'Libero';
      return '<div class="cass-box '+cls+(active ? ' active' : '')+'" data-cassetto="'+c+'" data-occupied="'+(occupied ? '1' : '0')+'" title="'+label+'">'+c+'<small>'+label+'</small></div>';
    }).join('');
  }

  function bindMapPick(container, input){
    if (!container || !input || container.dataset.boundCassPick === '1') return;
    container.dataset.boundCassPick = '1';
    container.addEventListener('click', function(ev){
      const box = ev.target.closest('.cass-box');
      if (!box) return;
      const cass = s(box.dataset.cassetto);
      const occupied = box.dataset.occupied === '1';
      const activeCass = s(input.value).toUpperCase();
      if (occupied && cass !== activeCass) {
        alert('Il cassetto ' + cass + ' è già occupato.');
        return;
      }
      input.value = cass;
      renderAllMapsSoon();
    });
  }

  let renderTimer = null;
  function renderAllMapsSoon(){
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderAllMaps, 120);
  }

  async function renderAllMaps(){
    const eInput = document.getElementById('eCassetto');
    const nInput = document.getElementById('nCassetto');
    await renderMap(document.getElementById('editCassMap'), eInput, currentId());
    await renderMap(document.getElementById('newCassMap'), nInput, null);
  }

  async function validateBeforeSave(input, stato, excludeId){
    const raw = s(input && input.value);
    if (!raw || isClosed(stato)) return true;
    let cass;
    try { cass = normCass(raw); }
    catch(err){ alert(err.message || 'Cassetto non valido.'); return false; }
    if (await isOccupied(cass, excludeId)) {
      alert('Il cassetto ' + cass + ' è già occupato.');
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
    const editMap = document.getElementById('editCassMap');
    const newMap = document.getElementById('newCassMap');

    bindMapPick(editMap, eInput);
    bindMapPick(newMap, nInput);

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
      try { if(eInput) eInput.value = await primoLibero(currentId()); renderAllMapsSoon(); }
      catch(err){ alert(err.message || 'Errore cassetto'); }
    });

    document.getElementById('btnNewCassAuto')?.addEventListener('click', async () => {
      try { if(nInput) nInput.value = await primoLibero(null); renderAllMapsSoon(); }
      catch(err){ alert(err.message || 'Errore cassetto'); }
    });

    document.getElementById('btnEditCassFree')?.addEventListener('click', async () => {
      if(eInput) eInput.value = '';
      await liberaRecord(currentId());
      renderAllMapsSoon();
    });

    document.getElementById('btnNewCassClear')?.addEventListener('click', () => {
      if(nInput) nInput.value = '';
      renderAllMapsSoon();
    });

    document.getElementById('btnNew')?.addEventListener('click', function(){ wait(250).then(renderAllMaps); });
    document.addEventListener('click', function(ev){
      if (ev.target && ev.target.closest && ev.target.closest('button[data-open],#homeRows button,#searchRows button')) {
        wait(500).then(renderAllMaps);
      }
    });

    eInput?.addEventListener('input', renderAllMapsSoon);
    nInput?.addEventListener('input', renderAllMapsSoon);
    eStato?.addEventListener('change', () => { if (isClosed(eStato.value) && eInput) eInput.value = ''; renderAllMapsSoon(); });
    nStato?.addEventListener('change', () => { if (isClosed(nStato.value) && nInput) nInput.value = ''; renderAllMapsSoon(); });

    renderAllMapsSoon();
    setTimeout(renderAllMaps, 1200);
    setTimeout(renderAllMaps, 3500);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once:true });
  else bind();
})();
