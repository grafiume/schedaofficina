// record.js – pagina pubblica di sola lettura per singolo record (?id=<uuid>)
// Usa config.js esistente (SUPABASE_URL, SUPABASE_ANON_KEY)
(function(){
  'use strict';
  function fmt(d){
    if(!d) return '';
    const s = String(d);
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){
      const [y,m,dd] = s.split('-');
      return [dd,m,y].join('/');
    }
    return s;
  }
  const qs = new URLSearchParams(location.search);
  const id = qs.get('id');
  const supabase = window.supabase?.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  const alertBox = document.getElementById('alert');
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');

  function showAlert(type, msg){
    alertBox.className = 'alert alert-' + type;
    alertBox.textContent = msg;
    alertBox.classList.remove('d-none');
  }
  function L(id, v){ const el=document.getElementById(id); if(el) el.textContent = v ?? '—'; }

  async function run(){
    if(!id){ showAlert('warning','ID non specificato nell\'URL.'); return; }
    if(!supabase){ showAlert('danger','Supabase non inizializzato.'); return; }

    // Colonne minime per la visualizzazione (adatta ai tuoi campi reali)
    const cols = [
      'id','cliente','descrizione','modello','statoPratica','note',
      'battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco',
      'punta','numPunte','dataApertura','dataAccettazione','dataScadenza',
      'telefono','email','docTrasporto'
    ].join(',');

    const { data, error } = await supabase.from('records').select(cols).eq('id', id).single();
    loading.classList.add('d-none');

    if(error){
      console.error(error);
      showAlert('danger', 'Record non trovato o non condiviso.');
      return;
    }

    L('fCliente', data.cliente || '—');
    L('fDescrizione', data.descrizione || '—');
    L('fModello', data.modello || '—');
    L('fStato', data.statoPratica || '—');

    L('fBatt', data.battCollettore ?? '—');
    L('fAsse', data.lunghezzaAsse ?? '—');
    L('fPacco', data.lunghezzaPacco ?? '—');
    L('fLarg', data.larghezzaPacco ?? '—');
    L('fPunta', data.punta ?? '—');
    L('fNP', data.numPunte ?? '—');

    L('fApertura', fmt(data.dataApertura));
    L('fAccettazione', fmt(data.dataAccettazione));
    L('fScadenza', fmt(data.dataScadenza));

    L('fNote', data.note || '—');

    content.classList.remove('d-none');
  }

  run();
})();