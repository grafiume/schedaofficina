/**
 * crea-preventivo.js (Scheda Officina) - v3
 *
 * ✅ Crea un preventivo nel progetto Preventivi-ELIP tramite Edge Function
 * ✅ Invia al preventivo i dati della scheda (cliente/telefono/email/note ecc.)
 * ✅ Prova a salvare il link del preventivo creato dentro Scheda Officina (records.preventivo_url)
 * ✅ Aggiorna il link in pagina (#linkPreventivo) se presente
 *
 * Nota:
 * - Per salvare preventivo_url su records serve una policy RLS che lo permetta (spesso NON permesso in pagina "pubblica").
 */

(function () {
  const PREVENTIVI_URL = "https://mvvwcsoqsoqjyqwkpgjm.supabase.co";
  const PREVENTIVI_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dndjc29xc29xanlxd2twZ2ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2OTk1MDAsImV4cCI6MjA3NjI3NTUwMH0.phXUlrbGx-f4wIjYAaG8JhTFHcp8utBCWwUvkTQMnKs";

  // Dal tuo screenshot: endpoint reale della function
  const FUNCTION_ENDPOINT_NAME = "rapid-worker";

  const headers = {
    "Content-Type": "application/json",
    "apikey": PREVENTIVI_ANON_KEY,
    "Authorization": `Bearer ${PREVENTIVI_ANON_KEY}`,
  };

  function cleanUndefined(obj) {
    Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
    return obj;
  }

  function buildNoteFromRecord(r) {
    const parts = [];
    if (r?.marca) parts.push(`Marca: ${r.marca}`);
    if (r?.modello) parts.push(`Modello: ${r.modello}`);
    if (r?.numero) parts.push(`Numero: ${r.numero}`);
    if (r?.docTrasporto) parts.push(`DDT: ${r.docTrasporto}`);
    if (r?.descrizione) parts.push(`Descrizione: ${r.descrizione}`);
    if (r?.note) parts.push(`Note: ${r.note}`);
    return parts.join("\n");
  }

  async function callCreatePreventivo(payload) {
    const endpoint = `${PREVENTIVI_URL}/functions/v1/${FUNCTION_ENDPOINT_NAME}`;
    const resp = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok || !j.ok) throw new Error(j?.error || `Errore creazione preventivo (HTTP ${resp.status})`);
    return j;
  }

  async function creaPreventivoDaScheda(record) {
    const id = String(record?.id || "").trim();
    if (!id) throw new Error("ID scheda mancante");

    const payload = cleanUndefined({
      scheda_id: id,
      cliente: record?.cliente ?? undefined,
      telefono: record?.telefono ?? undefined,
      email: record?.email ?? undefined,
      note: record ? (record.note ?? buildNoteFromRecord(record)) : undefined,
      ddt: record?.docTrasporto ?? undefined,
    });

    const res = await callCreatePreventivo(payload);

    // aggiorna link in pagina
    const link = document.getElementById("linkPreventivo");
    if (link) {
      link.href = res.preventivo_url;
      link.textContent = "Apri preventivo";
      link.classList.remove("d-none");
      link.target = "_blank";
      link.rel = "noopener";
    }

    // prova a salvare nel DB officina (se permesso da RLS)
    const db = window.supabaseClient || null;
    if (db && id) {
      try {
        await db.from("records").update({ preventivo_url: res.preventivo_url }).eq("id", id);
      } catch (e) {
        console.warn("Non posso salvare preventivo_url su records (probabile RLS / pagina pubblica):", e);
      }
    }

    // apre editor
    window.open(res.preventivo_url_edit, "_blank");
    return res;
  }

  function bindButtonWithRecord(record) {
    const btn = document.getElementById("btnCreaPreventivo");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;
        await creaPreventivoDaScheda(record);
      } catch (e) {
        alert(e?.message || String(e));
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Se record.js emette l'evento, ci agganciamo automaticamente
  window.addEventListener("record:loaded", (ev) => {
    const rec = ev?.detail || window.currentRecord;
    if (rec) bindButtonWithRecord(rec);
  });

  // fallback: se currentRecord già disponibile
  if (window.currentRecord) bindButtonWithRecord(window.currentRecord);

  // expose (debug)
  window.__creaPreventivoDaScheda = creaPreventivoDaScheda;
})();