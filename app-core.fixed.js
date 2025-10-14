(function(){
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '');

  // Simple IndexedDB (records only)
  const DB = 'officinaDB', VER = 1;

  function openDB(){
    return new Promise((res, rej)=>{
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        if(!db.objectStoreNames.contains('records')){
          db.createObjectStore('records', { keyPath:'id' });
        }
      };
      r.onsuccess = ()=>res(r.result);
      r.onerror   = ()=>rej(r.error);
    });
  }
  async function putRecord(v){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('records','readwrite');
      tx.objectStore('records').put(v);
      tx.oncomplete = ()=>res();
      tx.onerror    = ()=>rej(tx.error);
    });
  }
  async function getAllRecords(){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('records','readonly');
      const q = tx.objectStore('records').getAll();
      q.onsuccess = ()=>res(q.result || []);
      q.onerror   = ()=>rej(q.error);
    });
  }
  async function getRecord(id){
    const db = await openDB();
    return new Promise((res, rej)=>{
      const tx = db.transaction('records','readonly');
      const q = tx.objectStore('records').get(id);
      q.onsuccess = ()=>res(q.result);
      q.onerror   = ()=>rej(q.error);
    });
  }

  function sh(view){
    $('#page-home').classList.toggle('d-none', view !== 'home');
    $('#page-form').classList.toggle('d-none', view !== 'form');
    $('#page-search').classList.toggle('d-none', view !== 'search');
  }

  function newId(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now());
  }

  let cur = null;

  function nuovo(){
    cur = { id: newId(), createdAt: new Date().toISOString() };
    const f = $('#recordForm');
    f.reset();
    f.elements.id.value = cur.id;
    $('#formTitle').textContent = 'Nuova scheda';
    sh('form');
  }

  async function modifica(id){
    const r = await getRecord(id);
    if(!r){ alert('Scheda non trovata'); return; }
    cur = r;
    const f = $('#recordForm');
    f.reset();
    f.elements.id.value = r.id;
    if(f.elements.descrizione) f.elements.descrizione.value = r.descrizione || '';
    if(f.elements.cliente)     f.elements.cliente.value     = r.cliente     || '';
    $('#formTitle').textContent = 'Modifica scheda';
    sh('form');
  }

  async function salva(){
    const f = $('#recordForm');
    const d = Object.fromEntries(new FormData(f).entries());
    d.id = d.id || (cur ? cur.id : newId());
    d.updatedAt = new Date().toISOString();

    await putRecord(d);
    if(window.sbbridge && typeof window.sbbridge.syncRecord === 'function'){
      try{ await window.sbbridge.syncRecord(d, [], []); }catch(_){ /* ignore */ }
    }
    alert('Scheda salvata');
    sh('home');
    refresh();
  }

  async function populateHome(){
    const all = await getAllRecords();
    const tb = $('#listAllOpenBody');
    if(!all.length){
      tb.innerHTML = '<tr><td colspan="3" class="text-muted">Nessuna scheda</td></tr>';
      return;
    }
    tb.innerHTML = all.map(r => `
      <tr>
        <td>${esc(r.descrizione)}</td>
        <td>${esc(r.cliente)}</td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" data-open="${r.id}">Apri</button>
            <button class="btn btn-sm btn-outline-success" data-edit="${r.id}">Modifica</button>
          </div>
        </td>
      </tr>
    `).join('');
    tb.querySelectorAll('button[data-open]').forEach(b=> b.onclick = ()=> apri(b.dataset.open));
    tb.querySelectorAll('button[data-edit]').forEach(b=> b.onclick = ()=> modifica(b.dataset.edit));
  }

  async function apri(id){
    const r = await getRecord(id);
    if(!r){ alert('Scheda non trovata'); return; }
    alert('Dettaglio\\nDescrizione: ' + esc(r.descrizione) + '\\nCliente: ' + esc(r.cliente));
  }

  async function lista(){
    const q = ($('#q').value || '').toLowerCase();
    const all = await getAllRecords();
    const res = q ? all.filter(r => (r.descrizione||'').toLowerCase().includes(q) || (r.cliente||'').toLowerCase().includes(q)) : all;
    const tb = $('#searchBody');
    tb.innerHTML = res.map(r=> `<tr><td>${esc(r.descrizione)}</td><td>${esc(r.cliente)}</td></tr>`).join('');
  }

  async function refresh(){
    await populateHome();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    $('#btnHome').onclick   = ()=>{ sh('home'); refresh(); };
    $('#btnSearch').onclick = ()=>{ sh('search'); lista(); };
    $('#goSearch').onclick  = ()=>{ sh('search'); lista(); };
    $('#newRecord').onclick = nuovo;
    $('#cancelForm').onclick= ()=>{ sh('home'); refresh(); };
    $('#saveRecord').onclick= salva;
    $('#btnDoSearch').onclick = lista;
    refresh();
  });

  // expose for debug
  window.modifica = modifica;
  window.apri = apri;

})();