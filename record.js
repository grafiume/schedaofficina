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

  // ✅ Crea UN SOLO client DB e rendilo globale (così altri script possono usare .from())
  const sbns = window.supabase;
  const db = sbns?.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.supabaseClient = db;

  const alertBox = document.getElementById('alert');
  const loading = document.getElementById('loading');
  const content = document.getElementById('content');
  const heroImg = document.getElementById('heroImg');
  const noImg = document.getElementById('noImg');

  function showAlert(type, msg){
    alertBox.className = 'alert alert-' + type;
    alertBox.textContent = msg;
    alertBox.classList.remove('d-none');
  }
  function L(elId, v){ const el=document.getElementById(elId); if(el) el.textContent = v ?? '—'; }

  // Risolve l'URL della prima foto: 1) tabella 'photos' -> path -> publicUrl; 2) storage list su 'records/<id>/*'
  async function resolveFirstPhoto(recordId){
    const bucket = 'photos';

    // 1) prova dalla tabella 'photos'
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

    // 2) storage: prova lista in records/<id>/
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

    // 3) storage: fallback thumbs
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


  async function findBestQuoteIdForRecord(recordId){
    // 1) preferisci ACCETTATO / INVIATO
    {
      const { data, error } = await db
        .from('quotes')
        .select('id,status,accepted_at,sent_at,created_at')
        .eq('record_id', recordId)
        .in('status', ['ACCETTATO','INVIATO'])
        .order('accepted_at', { ascending:false, nullsFirst:false })
        .order('sent_at', { ascending:false, nullsFirst:false })
        .order('created_at', { ascending:false })
        .limit(1);
      if(error) throw error;
      if(data && data.length) return data[0].id;
    }

    // 2) poi la BOZZA piu' compilata
    {
      const { data, error } = await db
        .from('quotes')
        .select('id,status,subtotal_ex_vat,grand_total,sent_at,accepted_at,delivery_date,delivery_days,notes,updated_at,created_at')
        .eq('record_id', recordId)
        .eq('status', 'BOZZA')
        .order('updated_at', { ascending:false, nullsFirst:false })
        .order('created_at', { ascending:false })
        .limit(50);
      if(error) throw error;
      const drafts = data || [];
      if(drafts.length){
        const ids = drafts.map(x=>x.id);
        const { data: items, error: itemsErr } = await db
          .from('quote_items')
          .select('quote_id')
          .in('quote_id', ids)
          .limit(1000);
        if(itemsErr) throw itemsErr;
        const itemCount = new Map();
        (items || []).forEach(it=> itemCount.set(it.quote_id, (itemCount.get(it.quote_id)||0)+1));
        drafts.sort((a,b)=>{
          const score = q => ((itemCount.get(q.id)||0)>0 ? 1000 : 0)
            + ((Number(q.subtotal_ex_vat||0)>0 || Number(q.grand_total||0)>0) ? 100 : 0)
            + ((q.sent_at||q.accepted_at||q.delivery_date||q.delivery_days) ? 10 : 0)
            + (String(q.notes||'').trim() ? 1 : 0);
          const ds = score(b) - score(a);
          if(ds) return ds;
          return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
        });
        if(drafts[0]) return drafts[0].id;
      }
    }

    return null;
  }

  async function run(){
    if(!id){ showAlert('warning','ID non specificato nell\'URL.'); return; }
    if(!db){ showAlert('danger','Supabase non inizializzato.'); return; }

    // Colonne minime per la visualizzazione (+ preventivo_url per mostrare link)
    const cols = [
      'id','cliente','descrizione','modello','statoPratica','note',
      'battCollettore','lunghezzaAsse','lunghezzaPacco','larghezzaPacco',
      'punta','numPunte','dataApertura','dataAccettazione','dataScadenza',
      'telefono','email','docTrasporto',
      'preventivo_url'
    ].join(',');

    const { data, error } = await db.from('records').select(cols).eq('id', id).single();

    if(error){
      loading.classList.add('d-none');
      console.error(error);
      showAlert('danger', 'Record non trovato o non condiviso.');
      return;
    }

    // ✅ Rendiamo il record globale e notifichiamo altri script
    window.currentRecord = data;
    window.dispatchEvent(new CustomEvent('record:loaded', { detail: data }));

    // Preventivo collegato
    try{
      const b=document.getElementById('btnQuote');
      if(b){
        b.onclick=async ()=>{
          try{
            b.disabled = true;
            const bestId = await findBestQuoteIdForRecord(id);
            location.href = bestId
              ? ('preventivo.html?id=' + encodeURIComponent(bestId))
              : ('preventivo.html?record_id=' + encodeURIComponent(id));
          }catch(e){
            console.warn('Apertura preventivo fallback', e);
            location.href='preventivo.html?record_id=' + encodeURIComponent(id);
          }finally{
            b.disabled = false;
          }
        };
      }
    }catch(e){}

    // Riempimento campi
    L('fCliente', data.cliente || '—');
    L('fDescrizione', data.descrizione || '—');
    L('fModello', data.modello || '—');
    L('fStato', data.statoPratica || '—');
    L('fTelefono', data.telefono || '—');
    L('fEmail', data.email || '—');

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

    // Foto (DB 'photos' -> storage list fallback)
    const url = await resolveFirstPhoto(id);
    if (url){
      heroImg.src = url;
      heroImg.classList.remove('d-none');
      noImg.classList.add('d-none');
    }

    // Mostra contenuto
    loading.classList.add('d-none');
    content.classList.remove('d-none');
  }

  run();
})();