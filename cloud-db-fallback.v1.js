
/*!
 * cloud-db-fallback.v1.js
 * Fix 502 / "Failed to fetch" when loading photos:
 * - Retries REST with exponential backoff
 * - Falls back to RPC photos_for_record(record_id, limit)
 * - Falls back to Storage list('records/<record_id>') and picks the latest
 * - Always returns {ok, photos: [{path, publicUrl}], error?}
 */
(function(){
  const MOD = "[cloud-fallback]";

  function resolveSupabase() {
    try {
      if (window.supabase?.from) return window.supabase;
      if (typeof window.getSupabase === "function") { const c = window.getSupabase(); if (c?.from) return c; }
      if (window.sb?.from) return window.sb;
      if (window.__supabaseClient?.from) return window.__supabaseClient;
      if (window.__supabase?.from) return window.__supabase;
    } catch(e){}
    return null;
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function isTransient(err){ 
    const m = (err?.message||"").toLowerCase();
    return m.includes("failed to fetch") || m.includes("502") || m.includes("bad gateway") || m.includes("timeout");
  }

  function toPublicUrl(path, bucket="photos"){
    try{
      const sb = resolveSupabase(); if (!sb) return null;
      const { data } = sb.storage.from(bucket).getPublicUrl(path);
      return data?.publicUrl || null;
    }catch(e){ return null; }
  }

  async function tryREST(recordId, {limit=10}={}){
    const sb = resolveSupabase(); if (!sb) throw new Error("Supabase client not found");
    const { data, error } = await sb
      .from("photos")
      .select("path")
      .eq("record_id", recordId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data||[]).map(r => ({
      path: r.path,
      publicUrl: toPublicUrl(r.path) || toPublicUrl(`records/${r.path}`)
    }));
  }

  async function tryRPC(recordId, {limit=10}={}){
    const sb = resolveSupabase(); if (!sb) throw new Error("Supabase client not found");
    const { data, error } = await sb.rpc("photos_for_record", { p_record_id: recordId, p_limit: limit });
    if (error) throw error;
    const arr = [];
    for (const row of (data||[])) {
      const list = (row.thumbs && row.thumbs.length) ? row.thumbs : (row.images||[]);
      for (const p of list) {
        arr.push({ path: p, publicUrl: toPublicUrl(p) || toPublicUrl(`records/${p}`) });
      }
    }
    return arr;
  }

  async function tryStorageList(recordId, {limit=10}={}){
    const sb = resolveSupabase(); if (!sb) throw new Error("Supabase client not found");
    // Convenzione comune: files in photos/records/<record_id>/...
    const prefix = `records/${recordId}`;
    const { data, error } = await sb.storage.from("photos").list(prefix, { limit: 100, sortBy: { column: "name", order: "desc" } });
    if (error) throw error;
    const files = (data||[]).filter(x => x && x.name);
    files.sort((a,b)=> (b.created_at||'').localeCompare(a.created_at||''));
    const out = files.slice(0, limit).map(f => {
      const path = `${prefix}/${f.name}`;
      return { path, publicUrl: toPublicUrl(path) };
    });
    return out;
  }

  async function getPhotosSafe(recordId, {limit=5, retries=3}={}){
    let lastErr;
    // 1) REST with backoff
    for (let i=0;i<retries;i++){
      try { return { ok:true, photos: await tryREST(recordId, {limit}) }; }
      catch(e){ lastErr = e; if (!isTransient(e)) break; await sleep(200 * Math.pow(2,i)); }
    }
    // 2) RPC fallback
    try { return { ok:true, photos: await tryRPC(recordId, {limit}) }; }
    catch(e){ lastErr = e; }
    // 3) Storage list fallback
    try { return { ok:true, photos: await tryStorageList(recordId, {limit}) }; }
    catch(e){ lastErr = e; }
    return { ok:false, photos: [], error: lastErr };
  }

  // Export in window
  window.getPhotosSafe = getPhotosSafe;
  console.log(MOD, "pronto: usa getPhotosSafe(recordId, {limit})");
})();
