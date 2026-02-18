// SNIPPET (Scheda Officina) - crea preventivo e apri edit
// Inserisci dove hai il bottone / azione.
// Richiede: SUPABASE_URL + SUPABASE_ANON_KEY del progetto Preventivi-ELIP (NON quello officina).

async function creaPreventivoDaScheda(schedaId) {
  const PREVENTIVI_SUPABASE_URL = "https://<PROJECT_REF>.supabase.co"; // <-- mvvwcsoqsoqjyqwkpgjm
  const PREVENTIVI_ANON_KEY = "<PREVENTIVI_ANON_KEY>";

  const endpoint = `${PREVENTIVI_SUPABASE_URL}/functions/v1/create-preventivo-from-scheda`;

  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": PREVENTIVI_ANON_KEY,
      "Authorization": `Bearer ${PREVENTIVI_ANON_KEY}`,
    },
    body: JSON.stringify({
      scheda_id: schedaId,
      // read_from_officina: true, // se abiliti la lettura server-side (secrets)
      // oppure passa i campi dal record già caricato in UI:
      // cliente, telefono, email, note
    }),
  });

  const j = await resp.json();
  if (!resp.ok || !j.ok) throw new Error(j.error || "Errore creazione preventivo");

  // Apri editor preventivo
  window.open(j.preventivo_url_edit, "_blank");
}
