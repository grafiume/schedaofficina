Scheda Officina — Patch definitiva (senza toccare index.html)
============================================================

Contenuto:
- detail-fields-override.js  → sovrascrive la tabella del "Dettaglio scheda" aggiungendo tutti i campi tecnici
- modal-a11y-guard.js       → evita il warning aria-hidden/focus sulla modale Bootstrap
- (questo) README.txt

Come installare:
1) Copia i due file .js nella stessa cartella del tuo index (dove già includi gli altri script).
2) Aggiungi PRIMA della chiusura </body> queste righe:

   <script src="detail-fields-override.js?v=1"></script>
   <script src="modal-a11y-guard.js?v=1"></script>

Note:
- Non tocco la tua grafica originale.
- I campi tecnici inclusi: Batt. collettore, Lunghezza asse, Lunghezza pacco, Larghezza pacco, Punta, N. punte.
- Le date sono mostrate in formato gg/mm/aaaa se la sorgente è ISO (YYYY-MM-DD).
- Se vuoi cambiare l'ordine/etichette dei campi, modifica l'array FIELDS in detail-fields-override.js.

Filtri esatti:
- Restano gestiti dal tuo filters-exact-guard.js (già in pagina). Questa patch non interferisce.