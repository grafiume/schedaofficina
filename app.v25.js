// app.v25.js — HOTFIX RUNTIME (read/write di base) — sostituisce il placeholder
(function(){
  // 1) Supabase client
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error("SUPABASE non configurato: definisci SUPABASE_URL/ANON_KEY in config.js");
    return;
  }
  const { createClient } = window.supabase;
  const supa = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  // 2) UI helpers
  const el = (id)=>document.getElementById(id);
  const pageHome = el('page-home');
  const pageSearch = el('page-search');
  const pageEdit = el('page-edit');
  const errBanner = el('errBanner');
  function showPage(p){
    [pageHome,pageSearch,pageEdit].forEach(x=>x.classList.add('d-none'));
    p.classList.remove('d-none');
  }

  // 3) Nav buttons
  el('btnHome').onclick = ()=>{ showPage(pageHome); loadHome(); };
  el('btnRicerca').onclick = ()=>{ showPage(pageSearch); };
  el('btnNew').onclick = ()=>{
    // Apri il modale "Nuova scheda"
    const modal = new bootstrap.Modal(document.getElementById('newRecordModal'));
    modal.show();
  };

  // 4) Mapping helper per campi variabili
  function pick(obj, keys){ for (const k of keys) { if (obj && obj[k] != null) return obj[k]; } return null; }

  // 5) HOME: carica record
  async function loadHome(){
    errBanner.classList.add('d-none');
    const tbody = document.getElementById('homeRows');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Caricamento…</td></tr>';
    try {
      const { data, error } = await supa.from('records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      if (!data || data.length === 0){
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Nessun record</td></tr>';
        return;
      }

      const rows = data.map(r=>{
        const id = r.id;
        const dataA = pick(r, ['dataApertura','data_apertura','created_at']) || '';
        const cliente = pick(r, ['cliente','nome','ragione_sociale']) || '';
        const descr = pick(r, ['descrizione','descrizione_norm']) || '';
        const modello = pick(r, ['modello','modello_norm']) || '';
        const stato = pick(r, ['statoPratica','statopratica','stato','stato_pratica']) || '';

        return `
          <tr>
            <td class="thumb-cell"><div class="ratio ratio-4x3 bg-light rounded"></div></td>
            <td>${dataA ? String(dataA).slice(0,10) : ''}</td>
            <td>${cliente||''}</td>
            <td>${descr||''}</td>
            <td>${modello||''}</td>
            <td>${stato||''}</td>
            <td class="text-end">
              <button class="btn btn-sm btn-primary" data-open="${id}">Apri</button>
            </td>
          </tr>`;
      }).join('');
      tbody.innerHTML = rows;

      // wire "Apri"
      tbody.querySelectorAll('[data-open]').forEach(btn=>{
        btn.addEventListener('click', ()=> openEdit(btn.getAttribute('data-open')));
      });
    } catch (e){
      console.error(e);
      errBanner.textContent = 'Errore caricamento: ' + (e.message || e);
      errBanner.classList.remove('d-none');
    }
  }

  // 6) OPEN EDIT espone globale per il bridge/finestrella
  window.openEdit = function(id){
    if (!id) return;
    try { document.body.dataset.recordId = String(id); } catch {}
    loadEdit(id);
    showPage(pageEdit);
  };

  // 7) EDIT: carica record singolo
  async function loadEdit(id){
    try {
      const { data, error } = await supa.from('records').select('*').eq('id', id).single();
      if (error) throw error;
      // Riempie campi principali
      el('eDescrizione').value = pick(data, ['descrizione','descrizione_norm']) || '';
      el('eModello').value = pick(data, ['modello','modello_norm']) || '';
      el('eApertura').value = (pick(data, ['dataApertura','data_apertura'])||'').slice(0,10);
      el('eAcc').value     = (pick(data, ['dataAccettazione','data_accettazione'])||'').slice(0,10);
      el('eScad').value    = (pick(data, ['dataScadenza','data_scadenza'])||'').slice(0,10);
      el('eStato').value   = pick(data, ['statoPratica','statopratica','stato','stato_pratica']) || 'In attesa';
      el('ePrev').value    = pick(data, ['preventivo','preventivoStato','preventivo_stato']) || 'Non inviato';
      el('eDDT').value     = pick(data, ['docTrasporto','doctrasporto_norm','documento_trasporto']) || '';
      el('eCliente').value = pick(data, ['cliente','cliente_norm']) || '';
      el('eTel').value     = pick(data, ['telefono','telefono_norm']) || '';
      el('eEmail').value   = pick(data, ['email','email_norm']) || '';

      el('eBatt').value = pick(data, ['battCollettore','battcollettore_norm']) || '';
      el('eAsse').value = pick(data, ['lunghezzaAsse','lunghezzaasse_norm']) || '';
      el('ePacco').value= pick(data, ['lunghezzaPacco','lunghezzapacco_norm']) || '';
      el('eLarg').value = pick(data, ['larghezzaPacco','larghezzapacco_norm']) || '';
      el('ePunta').value= pick(data, ['punta','punta_norm']) || '';
      el('eNP').value   = pick(data, ['numPunte','numpunte_norm']) || '';
      el('eNote').value = pick(data, ['note','note_norm']) || '';

      // Banner chiusa
      const closed = (el('eStato').value||'').toLowerCase().includes('complet');
      document.getElementById('closedBanner').classList.toggle('d-none', !closed);
      document.getElementById('closedHint').textContent = closed ? 'La scheda risulta chiusa.' : '';

      // Preventivo link (se esiste)
      try {
        const link = pick(data, ['preventivo_url']);
        const inp = document.getElementById('preventivo_url');
        if (inp) { inp.value = link || ''; const evt = new Event('input'); inp.dispatchEvent(evt); }
      } catch {}

    } catch(e){
      console.error(e);
      alert('Errore nel caricamento della scheda: ' + (e.message||e));
    }
  }

  // 8) Salvataggio scheda
  document.getElementById('btnSave').addEventListener('click', async ()=>{
    const id = document.body.dataset.recordId;
    if (!id) return alert('ID scheda non rilevato');
    // Prepara patch con i campi trovati
    const patch = {};
    // solo se compilati
    patch.descrizione = el('eDescrizione').value || null;
    patch.modello = el('eModello').value || null;
    patch.dataApertura = el('eApertura').value || null;
    patch.dataAccettazione = el('eAcc').value || null;
    patch.dataScadenza = el('eScad').value || null;
    patch.statoPratica = el('eStato').value || null;
    patch.preventivo = el('ePrev').value || null;
    patch.docTrasporto = el('eDDT').value || null;
    patch.cliente = el('eCliente').value || null;
    patch.telefono = el('eTel').value || null;
    patch.email = el('eEmail').value || null;

    patch.battCollettore = el('eBatt').value || null;
    patch.lunghezzaAsse = el('eAsse').value || null;
    patch.lunghezzaPacco = el('ePacco').value || null;
    patch.larghezzaPacco = el('eLarg').value || null;
    patch.punta = el('ePunta').value || null;
    patch.numPunte = el('eNP').value || null;
    patch.note = el('eNote').value || null;

    try {
      const { error } = await supa.from('records').update(patch).eq('id', id);
      if (error) throw error;
      alert('Scheda salvata ✔');
      loadHome();
      showPage(pageHome);
    } catch(e){
      console.error(e);
      alert('Errore salvataggio: ' + (e.message||e));
    }
  });

  document.getElementById('btnCancel').addEventListener('click', ()=>{
    showPage(pageHome);
  });

  // 9) Ricerca semplice
  document.getElementById('btnDoSearch').addEventListener('click', async ()=>{
    const q = document.getElementById('q').value.trim().toLowerCase();
    const tbody = document.getElementById('searchRows');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Caricamento…</td></tr>';
    try{
      // semplice: scarica 200 e filtra client-side (evita errori su colonne/fts)
      const { data, error } = await supa.from('records').select('*').order('created_at', { ascending:false }).limit(200);
      if (error) throw error;
      const needle = q.split(/\s+/).filter(Boolean);
      const found = data.filter(r => {
        const hay = (JSON.stringify(r)||'').toLowerCase();
        return needle.every(k => hay.includes(k));
      });
      const rows = found.map(r=>{
        const id = r.id;
        const dataA = (r.dataApertura || r.data_apertura || r.created_at || '').slice(0,10);
        const cliente = r.cliente || '';
        const descr = r.descrizione || '';
        const modello = r.modello || '';
        const stato = r.statoPratica || r.stato || '';
        return `
          <tr>
            <td class="thumb-cell"><div class="ratio ratio-4x3 bg-light rounded"></div></td>
            <td>${dataA}</td><td>${cliente}</td><td>${descr}</td><td>${modello}</td><td>${stato}</td>
            <td class="text-end"><button class="btn btn-sm btn-primary" data-open="${id}">Apri</button></td>
          </tr>`;
      }).join('') || '<tr><td colspan="7" class="text-center py-4 text-muted">Nessun risultato</td></tr>';
      tbody.innerHTML = rows;
      tbody.querySelectorAll('[data-open]').forEach(btn=>{
        btn.addEventListener('click', ()=> openEdit(btn.getAttribute('data-open')));
      });
    }catch(e){
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-danger">Errore ricerca</td></tr>';
    }
  });

  // 10) Avvio
  showPage(pageHome);
  loadHome();
})(); 
