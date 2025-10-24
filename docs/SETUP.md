# Come usare questo pacchetto

1) Copia l'intera cartella nel tuo repo (o unisci `index.html` e `js/preventivo-link-lite.js` dove preferisci).
2) Imposta l'**ID scheda** reale:
   - metti `data-record-id="<UUID>"` nel tag `<body>`, **oppure**
   - aggiungi prima di `</body>`: `<script>window.ELIP_RECORD_ID = "<UUID>"</script>`, **oppure**
   - apri la pagina con `?rid=<UUID>`.
3) (Se hai una CSP tua) assicurati che consenta `connect-src https://pedmdiljgjgswhfwedno.supabase.co`.
4) La colonna `public.records.preventivo_url` deve esistere; RLS deve permettere `UPDATE (preventivo_url)`.

Il file JS funziona da solo (REST), non richiede SDK Supabase.
