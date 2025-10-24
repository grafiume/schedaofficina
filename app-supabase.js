
/* Preventivi ELIP — app-supabase.js (FINAL v4c) */
(function(){
  'use strict';
  let client = null;
  function supa() {
    // Hardening init
    if (!window.supabase) throw new Error('Supabase SDK non caricato (verifica CDN)');
    if (client) return client;
    const cfg = window.supabaseConfig || {};
    if (!cfg.url || !cfg.anon) throw new Error('config.js mancante o incompleto');
    client = window.supabase.createClient(cfg.url, cfg.anon, { auth: { persistSession: false } });
    return client;
  }

  const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
  async function withRetry(fn, tries=3, base=250){
    let last;
    for (let i=0;i<tries;i++){
      try { return await fn(); }
      catch (e){
        last = e;
        const code = Number(e?.status || e?.code || 0);
        if (code===429 || code>=500 || String(e?.message||'').includes('schema')) {
          await sleep(base*(i+1));
          continue;
        }
        break;
      }
    }
    if (last) throw last;
  }

  const ntext = (s)=> (typeof s==='string' && s.trim()!=='' ? s : null);
  const ndate = (s)=> (typeof s==='string' && s.trim()!=='' ? s : null);
  const nnumber = (n)=> { const x = Number(n); return Number.isFinite(x) ? x : null; };

  function buildPayload(cur){
    const imponibile = (cur.lines || []).reduce((s,r)=> s + (+(r.qty||0))*(+(r.price||0)), 0);
    const totale = +(imponibile*1.22).toFixed(2);
    return {
      numero: ntext(cur.id),
      cliente: ntext(cur.cliente),
      articolo: ntext(cur.articolo),
      ddt: ntext(cur.ddt),
      telefono: ntext(cur.telefono),
      email: ntext(cur.email),
      data_invio: ndate(cur.dataInvio),
      data_accettazione: ndate(cur.dataAcc),
      data_scadenza: ndate(cur.dataScad),
      note: ntext(cur.note),
      linee: (cur.lines || []),
      imponibile: nnumber(imponibile),
      totale: nnumber(totale)
    };
  }

  async function saveCompat(table, payload, where){
    const c = supa();
    let q = c.from(table);
    if (where?.id) q = q.update(payload).eq('id', where.id).select().single();
    else q = q.insert(payload).select().single();
    const { data, error } = await q;
    if (error) throw error;
    return { data };
  }

  async function upsertPreventivoByNumero(payload){
    const c = supa();
    const { data: found, error: selErr } = await c.from('preventivi').select('id').eq('numero', payload.numero).maybeSingle();
    if (selErr && selErr.code !== 'PGRST116') return { error: selErr };
    if (found?.id) {
      try { const { data } = await saveCompat('preventivi', payload, { id: found.id }); return { data }; }
      catch (e) { console.error('[preventivi UPDATE error]', e); return { error: e }; }
    } else {
      try { const { data } = await saveCompat('preventivi', payload, null); return { data }; }
      catch (e) { console.error('[preventivi INSERT error]', e); return { error: e }; }
    }
  }

  // ---------- Photo helpers ----------
  async function fileToDataURL(file){
    const fr = new FileReader();
    return await new Promise((res,rej)=>{ fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); });
  }
  async function dataURLToThumbBlob(dataUrl, size=164){
    const img = new Image();
    img.src = dataUrl; await img.decode();
    const ratio = Math.max(size / img.width, size / img.height);
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0,0,size,size);
    ctx.drawImage(img, (size - w)/2, (size - h)/2, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob;
  }

  function publicUrl(path){
    const { data } = supa().storage.from('photos').getPublicUrl(path);
    return data?.publicUrl || null;
  }

  function deriveThumbPathFromOriginalPath(path){
    if (!path) return null;
    const i = path.lastIndexOf('/');
    if (i < 0) return null;
    const prefix = path.slice(0, i);
    const fname  = path.slice(i+1);
    return `${prefix}/thumbs/${fname.replace(/\.[a-z0-9]+$/i, '.jpg')}`;
  }

  async function uploadPhoto(file, numero){
    const c = supa();
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const base = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const fname = `${base}.${ext}`;
    const path = `${numero}/${fname}`;

    await withRetry(async () => {
      const { error } = await c.storage.from('photos').upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
    });

    try {
      const dataUrl = await fileToDataURL(file);
      const thumbBlob = await dataURLToThumbBlob(dataUrl, 164);
      const tpath = `${numero}/thumbs/${base}.jpg`;
      await withRetry(async () => {
        const { error } = await c.storage.from('photos').upload(tpath, thumbBlob, { cacheControl: '3600', upsert: false, contentType:'image/jpeg' });
        if (error) throw error;
      });
    } catch (e) { console.warn('[thumb fail]', e?.message||e); }

    const url = publicUrl(path);
    try {
      await c.from('photos').insert([{ record_num: numero, path, url }]);
    } catch (e) {
      console.warn('[photos insert skipped]', e?.message||e);
    }
    return { path, url };
  }

  async function deletePhoto(path){
    const c = supa();
    const tpath = deriveThumbPathFromOriginalPath(path);
    const delList = [path];
    if (tpath) delList.push(tpath);
    await withRetry(async () => {
      const { error } = await c.storage.from('photos').remove(delList);
      if (error) throw error;
    });
    try { await c.from('photos').delete().eq('path', path); } catch {}
    return true;
  }

  async function loadPhotosFor(numero){
    const c = supa();
    try {
      const { data, error } = await c
        .from('photos')
        .select('url, path, created_at')
        .eq('record_num', numero)
        .order('created_at', { ascending: true });
      if (error) return [];
      const out = [];
      for (const r of (data||[])) {
        const full = r.url || publicUrl(r.path);
        const tpath = deriveThumbPathFromOriginalPath(r.path);
        const thumb = tpath ? publicUrl(tpath) : full;
        out.push({ thumb, full, path: r.path });
      }
      return out;
    } catch { return []; }
  }

  // ---------- Archive ----------
  async function loadArchive(){
    const c = supa();
    const { data, error, status } = await c.from('preventivi').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('[supabase] loadArchive error:', {status, error});
      try { localStorage.setItem('elip_archive', '[]'); } catch {}
      throw Object.assign(new Error(error.message||'loadArchive failed'), { status, error });
    }
    try { localStorage.setItem('elip_archive', JSON.stringify(data || [])); } catch {}
    return data || [];
  }
  async function loadArchiveRetry(){ return await withRetry(async () => await loadArchive(), 3, 300); }

  async function saveToSupabase(goArchive){
    let cur = null; try { cur = JSON.parse(localStorage.getItem('elip_current') || 'null'); } catch {}
    if (!cur) { alert('Nessun preventivo in memoria.'); return false; }
    const payload = buildPayload(cur);
    const { error } = await upsertPreventivoByNumero(payload);
    if (error) { alert('Errore salvataggio: ' + (error?.message || JSON.stringify(error))); return false; }

    const queueFiles = (typeof window.__elipGetUploadFiles === 'function')
      ? window.__elipGetUploadFiles()
      : (Array.isArray(window.__elipPhotosQueue) ? window.__elipPhotosQueue : []);

    for (const f of queueFiles) {
      try { await uploadPhoto(f, cur.id); } catch (e) { console.warn('[uploadPhoto]', e); }
    }
    if (typeof window.__elipClearUploadQueue === 'function') window.__elipClearUploadQueue();
    else window.__elipPhotosQueue = [];

    await loadArchiveRetry();
    if (typeof window.renderArchiveLocal === 'function') {
      try { window.renderArchiveLocal(); } catch (_) {}
    }

    if (goArchive) {
      const t = document.querySelector('[data-bs-target="#tab-archivio"]');
      if (t) { try { new bootstrap.Tab(t).show(); } catch { t.click(); } }
    }
    return true;
  }

  window.dbApi = { supa, uploadPhoto, loadPhotosFor, deletePhoto, loadArchive, loadArchiveRetry, saveToSupabase };
})();
