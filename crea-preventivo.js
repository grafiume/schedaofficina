/**
 * crea-preventivo.js (Scheda Officina) - v2
 *
 * ✅ Crea un preventivo nel progetto Preventivi-ELIP tramite Edge Function (endpoint corretto)
 * ✅ Invia al preventivo i dati della scheda (cliente/telefono/email/descrizione/note/etc.)
 * ✅ Salva il link del preventivo creato dentro Scheda Officina (records.preventivo_url)
 * ✅ (Opzionale) Aggiorna un link in pagina se esiste <a id="linkPreventivo"></a>
 *
 * IMPORTANTE:
 * - Questo file usa SOLO ANON KEY del progetto Preventivi-ELIP (ok in frontend).
 * - NON inserire MAI Service Role / Secret key nel browser.
 */

(function () {
  // === CONFIG PREVENTIVI-ELIP ===
  const PREVENTIVI_URL = "https://mvvwcsoqsoqjyqwkpgjm.supabase.co";
  const PREVENTIVI_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dndjc29xc29xanlxd2twZ2ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2OTk1MDAsImV4cCI6MjA3NjI3NTUwMH0.phXUlrbGx-f4wIjYAaG8JhTFHcp8utBCWwUvkTQMnKs";

  // ⚠️ Dal tuo screenshot: la function "create-preventivo-from-scheda" è pubblicata su /rapid-worker
  const FUNCTION_ENDPOINT_NAME = "rapid-worker";

  const defaultHeaders = {
    "Content-Type": "application/json",
    "apikey": PREVENTIVI_ANON_KEY,
    "Authorization": `Bearer ${PREVENTIVI_ANON_KEY}`,
  };

  function cleanUndefined(obj) {
    Object.keys(obj).forEach(k => obj[k] === undefined && delete obj[k]);
    return obj;
  }

  function buildNoteFromRecord(record) {
    const parts = [];
    if (record?.marca) parts.push(`Marca: ${record.marca}`);
    if (record?.modello) parts.push(`Modello: ${record.modello}`);
    if (record?.numero) parts.push(`Numero: ${record.numero}`);
    if (record?.docTrasporto) parts.push(`DDT: ${record.docTrasporto}`);
    if (record?.descrizione) parts.push(`Descrizione: ${record.descrizione}`);
    if (record?.note) parts.push(`Note: ${record.note}`);
    return parts.join("\n");
  }

  async function callCreatePreventivo(payload) {
    const endpoint = `${PREVENTIVI_URL}/functions/v1/${FUNCTION_ENDPOINT_NAME}`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: defaultHeaders,
      body: JSON.stringify(payload),
    });

    const j = await resp.json().catch(() => ({}));
    if (!resp.ok || !j.ok) {
      const msg = j?.error || `Errore creazione preventivo (HTTP ${resp.status})`;
      throw new Error(msg);
    }
    return j;
  }

  async function creaPreventivoDaScheda(schedaId, recordData = null) {
    const id = String(schedaId || "").trim();
    if (!id) throw new Error("schedaId mancante");

    const payload = cleanUndefined({
      scheda_id: id,
      cliente: recordData?.cliente ?? undefined,
      telefono: recordData?.telefono ?? undefined,
      email: recordData?.email ?? undefined,
      note: (recordData ? (recordData.note ?? buildNoteFromRecord(recordData)) : undefined),
      articolo: recordData?.articolo ?? undefined,
      ddt: recordData?.ddt ?? recordData?.docTrasporto ?? undefined,
    });

    const res = await callCreatePreventivo(payload);
    window.open(res.preventivo_url_edit, "_blank");
    return res;
  }

  function updateLinkElement(elementId, url) {
    if (!elementId) return;
    const el = document.getElementById(elementId);
    if (!el) return;
    el.href = url;
    el.textContent = "Apri preventivo";
    el.target = "_blank";
    el.rel = "noopener";
    el.style.display = "inline-block";
  }

  function getOfficinaClient() {
    return window.supabase || window.supabaseClient || null;
  }

  function bindCreaPreventivoButton(record, options = {}) {
    const btnId = options.buttonId || "btnCreaPreventivo";
    const btn = document.getElementById(btnId);
    if (!btn) {
      console.warn(`[crea-preventivo] Bottone #${btnId} non trovato`);
      return;
    }

    btn.addEventListener("click", async () => {
      try {
        btn.disabled = true;

        const schedaId = record?.id || new URLSearchParams(location.search).get("id");
        const res = await creaPreventivoDaScheda(schedaId, record);

        if (options.updateLinkElementId) {
          updateLinkElement(options.updateLinkElementId, res.preventivo_url);
        }

        if (options.saveLinkToScheda) {
          const officina = getOfficinaClient();
          if (!officina) {
            console.warn("[crea-preventivo] Client Supabase Officina non trovato (window.supabase o window.supabaseClient). Link non salvato su DB.");
          } else {
            await officina
              .from("records")
              .update({ preventivo_url: res.preventivo_url })
              .eq("id", schedaId);
          }
        }
      } catch (e) {
        alert(e?.message || String(e));
      } finally {
        btn.disabled = false;
      }
    });
  }

  window.creaPreventivoDaScheda = creaPreventivoDaScheda;
  window.bindCreaPreventivoButton = bindCreaPreventivoButton;
})();
