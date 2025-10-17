async function savePhotosWithThumbs(recordId, fullImages /* array di URL/base64 */, thumbs /* ignorate su DB */) {
  const sb = getSupabase?.() || window.supabase || window.supabaseClient || window.__sb;
  if (!sb || typeof sb.from !== 'function') throw new Error('Supabase client non inizializzato');

  // 1) leggo eventuali immagini già presenti
  const { data: existing, error: selErr } = await sb
    .from('photos')
    .select('images')
    .eq('record_id', recordId)
    .maybeSingle();

  if (selErr) console.warn('[photos select]', selErr);

  // 2) unisco evitando duplicati
  const prev = Array.isArray(existing?.images) ? existing.images : [];
  const merged = [...new Set([...(prev||[]), ...(fullImages||[])])];

  // 3) UPSERT (NON insert)
  const { data, error } = await sb
    .from('photos')
    .upsert(
      { record_id: recordId, images: merged },
      { onConflict: 'record_id' }
    );

  if (error) {
    console.error('[photos upsert]', error);
    throw error;
  }
  return data;
}
