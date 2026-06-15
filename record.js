// record.js - pagina privata di sola lettura per singolo record (?id=<uuid>)
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

  const sbns = window.supabase;
  const db = sbns?.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.supabaseClient = db;

  const alertBox = document.getElementById('alert');
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');
  const heroImg = document.getElementById('heroImg');
  const noImg = document.getElementById('noImg');

  function showAlert(type, msg){
    if(loading) loading.classList.add('d-none');
    if(!alertBox) return;
    alertBox.className = 'alert alert-' + type;
    alertBox.textContent = msg;
    alertBox.classList.remove('d-none');
  }

  function L(elId, v){ const el=document.getElementById(elId); if(el) el.textContent = v ?? '-'; }

  function redirectToLogin(){
    const returnTo = encodeURIComponent(location.pathname + location.search);
    location.href = 'index.html?returnTo=' + returnTo;
  }

  async function requireSession(){
    if(!db || !db.auth) return null;
    try{
      const { data } = await db.auth.getSession();
      return data?.session || null;
    }catch(_e){
      return null;
    }
  }

  // Risolve l'URL della prima foto: 1) tabella 'photos' -> path -> publicUrl; 2) storage list su 'records/<id>/*'
  async function resolveFirstPhoto(recordId){
    const bucket = 'photos';

    try{
      const { data: ph, error: perr } = await db
        .from('photos')
        .select('path')
        .eq('record_id', recordId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!perr && ph && ph.path){
        const { data } = db.storage.from(bucket).getPublicUrl(ph.path);
        if (data?.publicUrl) return data.publicUrl;
      }
    } catch(e){ /* ignore */ }

    try{
      const prefix = 'records/' + recordId + '/';
      const { data: list, error } = await db.storage.from(bucket).list(prefix, { limit: 50, offset: 0 });
      if (!error && Array.isArray(list) && list.length){
        const file = list.find(f => f?.name && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)) || list[0];
        if (file?.name){
          const { data } = db.storage.from(bucket).getPublicUrl(prefix + file.name);
          if (data?.publicUrl) return data.publicUrl;
        }
      }
    } catch(e){ /* ignore */ }

    try{
      const prefix = 'records/' + recordId + '/thumb';
      const { data: list, error } = await db.storage.from(bucket).list(prefix, { limit: 50, offset: 0 });
      if (!error && Array.isArray(list) && list.length){
        const file = list.find(f => f?.name && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)) || list[0];
        if (file?.name){
          const path = prefix + (prefix.endsWith('/')?'':'/') + file.name;
          const { data } = db.storage.from(bucket).getPublicUrl(path);
          if (data?.publicUrl) return data.publicUrl;
        }
      }
    } catch(e){ /* ignore */ }

    return null;
  }

  async function run(){
    if(!id){ showAlert('warning','ID non specificato nell\'URL.'); return; }
    if(!db){ showAlert('danger','Supabase non inizializzato.'); return; }

    const session = await requireSession();
    if(!session){
      redirectToLogin();
      return;
    }

    const cols = [
      'id','cliente','descrizione','modello','statoPratica','note',
      'battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco',
      'punta','numPunte','dataApertura','dataAccettazione','dataScadenza',
      'telefono','email','docTrasporto',
      'preventivo_url'
    ].join(',');

    const { data, error } = await db.from('records').select(cols).eq('id', id).single();

    if(error){
      console.error(error);
      showAlert('danger', 'Record non trovato o accesso non autorizzato.');
      return;
    }

    window.currentRecord = data;
    window.dispatchEvent(new CustomEvent('record:loaded', { detail: data }));

    try{
      const b=document.getElementById('btnQuote');
      if(b){ b.onclick=()=>{ location.href='preventivo.html?record_id=' + encodeURIComponent(id); }; }
    }catch(e){}

    L('fCliente', data.cliente || '-');
    L('fDescrizione', data.descrizione || '-');
    L('fModello', data.modello || '-');
    L('fStato', data.statoPratica || '-');
    L('fTelefono', data.telefono || '-');
    L('fEmail', data.email || '-');

    L('fBatt', data.battCollettore ?? '-');
    L('fAsse', data.lunghezzaAsse ?? '-');
    L('fPacco', data.lunghezzaPacco ?? '-');
    L('fLarg', data.larghezzaPacco ?? '-');
    L('fPunta', data.punta ?? '-');
    L('fNP', data.numPunte ?? '-');

    L('fApertura', fmt(data.dataApertura));
    L('fAccettazione', fmt(data.dataAccettazione));
    L('fScadenza', fmt(data.dataScadenza));
    L('fNote', data.note || '-');

    const url = await resolveFirstPhoto(id);
    if (url){
      heroImg.src = url;
      heroImg.classList.remove('d-none');
      noImg.classList.add('d-none');
    }

    loading.classList.add('d-none');
    content.classList.remove('d-none');
  }

  run();
})();
