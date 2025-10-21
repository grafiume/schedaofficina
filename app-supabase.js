// Bridge funzioni Supabase
(function(){
  const sb = window.getSB();

  async function listRecords(q, exact) {
    // Seleziona tutto, ordina per dataApertura desc (se presente)
    let query = sb.from('records').select('*').order('dataApertura', {ascending:false}, { nullsFirst: false });
    if (q && q.trim() !== '') {
      const term = q.trim();
      const cols = ['descrizione','cliente','telefono','ddt','modello','marca','battcoll','note','notes','notesk'];
      if (exact) {
        // ILIKE senza % => match esatto case-insensitive
        const parts = cols.map(c => `${c}.ilike.${term}`);
        query = query.or(parts.join(','));
      } else {
        const like = `%${term}%`;
        const parts = cols.map(c => `${c}.ilike.${like}`);
        query = query.or(parts.join(','));
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function getRecord(id){
    const { data, error } = await sb.from('records').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async function upsertRecord(payload){
    const { data, error } = await sb.from('records').upsert(payload).select().single();
    if (error) throw error;
    return data;
  }

  window.api = { listRecords, getRecord, upsertRecord };
})();