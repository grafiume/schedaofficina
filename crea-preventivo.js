/**
 * crea-preventivo.js (Scheda Officina)
 * Integrazione: crea un preventivo nel progetto "preventivi-elip" tramite Edge Function
 * Function: /functions/v1/create-preventivo-from-scheda
 *
 * ✅ Usa SOLO ANON KEY (sicuro per frontend).
 * ❌ NON inserire MAI Service Role / Secret key nel browser.
 *
 * USO:
 * 1) Includi questo file in record.html (o dove preferisci):
 *    <script src="./crea-preventivo.js"></script>
 *
 * 2) Aggiungi un bottone:
 *    <button id="btnCreaPreventivo" type="button">Crea Preventivo</button>
 *
 * 3) Nel JS della pagina (dopo aver caricato il record):
 *    bindCreaPreventivoButton(record);   // oppure bindCreaPreventivoButton({ id: '<id>' })
 */

(function () {
  const PREVENTIVI_URL = "https://mvvwcsoqsoqjyqwkpgjm.supabase.co";
  const PREVENTIVI_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dndjc29xc29xanlxd2twZ2ptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA2OTk1MDAsImV4cCI6MjA3NjI3NTUwMH0.phXUlrbGx-f4wIjYAaG8JhTFHcp8utBCWwUvkTQMnKs";

  async function callCreatePreventivo(payload) {
    const endpoint = `${PREVENTIVI_URL}/functions/v1/create-preventivo-from-scheda`;

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": PREVENTIVI_ANON_KEY,
        "Authorization": `Bearer ${PREVENTIVI_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const j = await resp.json().catch(() => ({}));
    if (!resp.ok || !j.ok) {
      const msg = j?.error || `Errore creazione preventivo (HTTP ${resp.status})`;
      throw new Error(msg);
    }
    return j;
  }

  /**
   * Crea preventivo da scheda e apre l'editor Preventivi-ELIP in una nuova scheda.
   *
   * @param {string} schedaId - records.id (Scheda Officina)
   * @param {object} [recordData] - opzionale: dati già presenti in UI (cliente, telefono, email, note, ecc.)
   */
  async function creaPreventivoDaScheda(schedaId, recordData = null) {
    const id = String(schedaId || "").trim();
    if (!id) throw new Error("schedaId mancante");

    const payload = {
      scheda_id: id,
      ...(recordData ? {
        cliente: recordData.cliente ?? undefined,
        telefono: recordData.telefono ?? undefined,
        email: recordData.email ?? undefined,
        note: recordData.note ?? recordData.descrizione ?? undefined,
        articolo: recordData.articolo ?? undefined,
        ddt: recordData.ddt ?? recordData.docTrasporto ?? undefined,
      } : {}),
    };

    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const res = await callCreatePreventivo(payload);

    window.open(res.preventivo_url_edit, "_blank");
    return res;
  }

  /**
   * Collega il bottone #btnCreaPreventivo ad un record caricato.
   *
   * @param {object} record - deve contenere almeno record.id
   * @param {object} [options]
   * @param {string} [options.buttonId] - id bottone (default btnCreaPreventivo)
   * @param {boolean} [options.saveLinkToScheda] - se true salva preventivo_url in records.preventivo_url (richiede supabase officina globale)
   */
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
        btn.classList.add("loading");

        const schedaId = record?.id || new URLSearchParams(location.search).get("id");
        const res = await creaPreventivoDaScheda(schedaId, record);

        if (options.saveLinkToScheda && window.supabase && schedaId) {
          try {
            await window.supabase
              .from("records")
              .update({ preventivo_url: res.preventivo_url })
              .eq("id", schedaId);
          } catch (e) {
            console.warn("[crea-preventivo] Non riesco a salvare preventivo_url sulla scheda:", e);
          }
        }
      } catch (e) {
        alert(e?.message || String(e));
      } finally {
        btn.disabled = false;
        btn.classList.remove("loading");
      }
    });
  }

  window.creaPreventivoDaScheda = creaPreventivoDaScheda;
  window.bindCreaPreventivoButton = bindCreaPreventivoButton;
})();
