// Bridge funzioni CRUD + Storage per Supabase
(function () {
  const sb = window.supabaseClient;
  const CFG = window.APP_CFG;

  const normalize = (s) => (s ?? "").normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const todayISO = () => new Date().toISOString().slice(0,10);

  if (!sb) {
    console.error("[supabase] client non inizializzato");
    return;
  }

  // ---- RECORDS CRUD ---------------------------------------------------------
  async function listRecords() {
    const { data, error } = await sb.from(CFG.TABLE_RECORDS).select("*");
    if (error) throw error;
    // client sort: In attesa -> In lavorazione -> Completata, poi dataApertura desc
    const rank = (st) => {
      const s = normalize(st);
      if (["in attesa","attesa"].includes(s)) return 1;
      if (["in lavorazione","lavorazione"].includes(s)) return 2;
      if (["completata","chiusa","completate","chiuse"].includes(s)) return 3;
      return 4;
    };
    const byDate = (a,b) => String(b.dataApertura||"").localeCompare(String(a.dataApertura||""));
    return [...data].sort((a,b) => (rank(a.stato)-rank(b.stato)) || byDate(a,b));
  }

  async function getRecord(id) {
    const { data, error } = await sb.from(CFG.TABLE_RECORDS).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function saveRecord(record) {
    // auto-logic: if dataFine present -> stato = Completata
    if (record.dataFine && !record.stato) record.stato = "Completata";
    // normalize avanzamento
    if (record.avanzamento != null) {
      const n = Number(record.avanzamento);
      record.avanzamento = isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
    }
    // insert vs update
    if (!record.id) {
      if (!record.dataApertura) record.dataApertura = todayISO();
      const { data, error } = await sb.from(CFG.TABLE_RECORDS).insert(record).select("*").single();
      if (error) throw error;
      return data;
    } else {
      const id = record.id; delete record.id;
      const { data, error } = await sb.from(CFG.TABLE_RECORDS).update(record).eq("id", id).select("*").single();
      if (error) throw error;
      return data;
    }
  }

  async function deleteRecord(id) {
    const { error } = await sb.from(CFG.TABLE_RECORDS).delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  // ---- EXACT SEARCH ---------------------------------------------------------
  // Exact (case/accent-insensitive) match on selected columns.
  function exactMatchRows(rows, q, col="auto") {
    const Q = normalize(q);
    const colsAuto = ["cliente","descrizione","note","telefono","ddt","marca","modello"];
    const cols = col==="auto" ? colsAuto : [col];
    const numQ = Number(q);
    const isNum = !isNaN(numQ);

    return rows.filter(r => {
      for (const c of cols) {
        let v = r[c];
        if (v == null) continue;
        if (typeof v === "number" && isNum) {
          if (Number(v) === numQ) return true;
        } else {
          if (normalize(String(v)) === Q) return true;
        }
      }
      return false;
    });
  }

  // ---- STORAGE: photo upload -----------------------------------------------
  async function uploadPhoto(file, recordId) {
    if (!file || !recordId) throw new Error("File o recordId mancante");
    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_.-]+/g,'-')}`;
    const path = `${recordId}/${safeName}`;
    const { data, error } = await sb.storage.from(CFG.STORAGE_BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    const { data: pub } = sb.storage.from(CFG.STORAGE_BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  }

  window.DB = {
    listRecords, getRecord, saveRecord, deleteRecord, exactMatchRows, uploadPhoto
  };
})();
