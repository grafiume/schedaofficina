// Data layer Supabase (v2)
const TABLE = window.APP_CONFIG.table;
const BUCKET = window.APP_CONFIG.storageBucket;

async function sbListAll(limit=500){
  // Carica tutti i record e filtra lato client (match esatto)
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .order('dataApertura', { ascending: false })
    .limit(limit);
  if(error){ console.error(error); return []; }
  return data || [];
}

function sbPublicImage(urlOrPath){
  if(!urlOrPath) return null;
  if(/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(urlOrPath);
  return data?.publicUrl || null;
}
