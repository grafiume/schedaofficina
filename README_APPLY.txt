
DETTAGLIO + PDF con campi tecnici

1) Carica `detail-and-pdf-tech.js` nella root del repo (accanto a index.html).

2) In `index.html`, subito prima di `</body>`, aggiungi:
   <script src="detail-and-pdf-tech.js"></script>
   (lascialo dopo config.js e app-supabase.*.js)

Cosa fa:
- Quando apri "Dettaglio scheda", inserisce una tabella "Dati tecnici" con:
  Batt. collettore, Lunghezza asse, Lunghezza pacco, Larghezza pacco, Punta, N. punte.
- Sostituisce l'azione del bottone "PDF" nella modale con un PDF completo che include i campi tecnici
  e la prima immagine della scheda (se presente).

Note:
- Richiede che esistano showDettaglio(id) e getRecord(id).
- Per l'immagine prova prima getPhotos(id), altrimenti prende la prima immagine visibile nella modale.
