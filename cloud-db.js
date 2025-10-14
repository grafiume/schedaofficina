async function getPhotos(recordId){
  // 1) leggo solo il campo path
  const { data, error } = await sb
    .from('photos')
    .select('path')
    .eq('record_id', recordId)
    .order('created_at', { ascending: true });

  if (error) { console.error('[getPhotos]', error); return { images: [], thumbs: [] }; }

  const images = [];
  for (const row of (data || [])) {
    // salta righe senza path
    if (!row || !row.path) continue;

    const pubRes = sb.storage.from(window.SB_BUCKET || 'photos').getPublicUrl(row.path);
    const pubUrl = pubRes && pubRes.data && pubRes.data.publicUrl ? String(pubRes.data.publicUrl) : '';

    // salta url vuoti e NON fare mai .replace su null
    if (pubUrl) images.push(pubUrl);
  }

  return { images, thumbs: images };
}
