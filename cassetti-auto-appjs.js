// === CASSETTI AUTO INTEGRATION (APP.JS COMPAT) ===
(function(){
  const CASSETTI = Array.from({ length: 80 },(_,i)=>`A${i+1}`);

  function norm(v){ return String(v||'').trim().toUpperCase(); }
  function isClosed(stato){ return String(stato||'').toLowerCase().includes('completata'); }

  async function getOccupied(){
    const {data}=await sb.from('records').select('id,cassetto').not('cassetto','is',null);
    return new Set((data||[]).map(r=>norm(r.cassetto)));
  }

  async function buildDropdown(input){
    if(!input) return;
    const used = await getOccupied();

    const list = document.createElement('datalist');
    list.id = input.id + '_list';

    CASSETTI.forEach(c=>{
      const opt=document.createElement('option');
      opt.value = c + (used.has(c)?' ❌':'');
      if(used.has(c)) opt.disabled=true;
      list.appendChild(opt);
    });

    input.setAttribute('list', list.id);
    input.parentNode.appendChild(list);
  }

  async function validateUnique(cassetto, currentId){
    if(!cassetto) return true;
    const {data}=await sb.from('records')
      .select('id')
      .eq('cassetto',cassetto);

    return !(data && data.some(r=>r.id!==currentId));
  }

  async function patchSave(){
    const origSave = window.saveEdit;

    window.saveEdit = async function(closeAfter=true){
      const cassetto = document.getElementById('eCassetto')?.value;
      const stato = document.getElementById('eStato')?.value;

      if(isClosed(stato)){
        document.getElementById('eCassetto').value='';
      }

      const valid = await validateUnique(cassetto, window.state.editing?.id);
      if(!valid){ alert('Cassetto già occupato'); return; }

      return origSave(closeAfter);
    }
  }

  async function init(){
    await buildDropdown(document.getElementById('eCassetto'));
    await buildDropdown(document.getElementById('nCassetto'));
    await patchSave();
  }

  document.addEventListener('DOMContentLoaded', init);
})();