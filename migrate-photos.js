
/* Migrazione foto locali -> Supabase Storage + public.photos
   Usa l'IndexedDB locale 'officinaDB' store 'photos' come sorgente.
   Aggiunge un pulsante in Home per lanciare la migrazione.
*/
(function(){
  async function openLocalDB(){
    return await new Promise((res, rej)=>{
      const r = indexedDB.open('officinaDB');
      r.onupgradeneeded = ()=>{};
      r.onsuccess = ()=>res(r.result);
      r.onerror = ()=>rej(r.error);
    });
  }
  async function getAllLocalPhotos(){
    const db = await openLocalDB();
    return await new Promise((res, rej)=>{
      if(!db.objectStoreNames.contains('photos')){ res([]); return; }
      const tx = db.transaction('photos', 'readonly');
      const store = tx.objectStore('photos');
      const req = store.getAll();
      req.onsuccess = ()=> res(req.result || []);
      req.onerror = ()=> rej(req.error);
    });
  }
  async function runMigration(){
    if(!window.sb){ alert('Supabase non inizializzato'); return; }
    const confirmRun = confirm('Sincronizzare tutte le foto locali sul cloud?');
    if(!confirmRun) return;
    const items = await getAllLocalPhotos();
    if(!items.length){ alert('Nessuna foto locale trovata.'); return; }
    let ok=0, fail=0, ins=0;
    for(const row of items){
      const rid = row.id; // chiave: record_id
      const images = row.images || [];
      for(let i=0;i<images.length;i++){
        try{
          const dataUrl = images[i];
          const b64 = dataUrl.split(',')[1];
          const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
          const path = `${rid}/${Date.now()}-${i+1}.jpg`;
          const up = await sb.storage.from(window.SB_BUCKET||'photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
          if(up.error && !(up.error.message||'').includes('already exists')){ fail++; console.warn('upload fail', up.error); continue; }
          const insRes = await sb.from('photos').insert({ record_id: rid, path });
          if(insRes.error){ console.warn('insert fail', insRes.error); } else { ins++; }
          ok++;
        }catch(e){ fail++; console.warn('err', e); }
        await new Promise(r=>setTimeout(r, 60)); // piccolo respiro
      }
    }
    alert(`Migrazione completata.\nCaricate: ${ok}\nInserimenti tabella: ${ins}\nErrori: ${fail}`);
    if(typeof refreshDashboard==='function') refreshDashboard();
  }

  // Aggiungi pulsante nella Home (accanto a Backup)
  document.addEventListener('DOMContentLoaded', ()=>{
    const home = document.getElementById('page-home');
    if(!home) return;
    const btn = document.createElement('button');
    btn.id = 'btnMigratePhotos';
    btn.className = 'btn btn-outline-primary';
    btn.textContent = 'Sincronizza foto su cloud';
    const grid = home.querySelector('.d-grid.gap-2.mt-2');
    if(grid){
      grid.insertAdjacentElement('afterend', document.createElement('div')).className='d-grid gap-2 mt-2';
      grid.nextElementSibling.appendChild(btn);
    }else{
      home.appendChild(btn);
    }
    btn.addEventListener('click', runMigration);
  });
})();
