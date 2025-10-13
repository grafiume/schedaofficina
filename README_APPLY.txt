
APPLICA SOLO DETTAGLIO — Dati tecnici

1) Carica il file `tech-detail-only.js` nella ROOT del tuo repo (accanto a index.html).

2) In `index.html`, PRIMA di `</body>` aggiungi questa riga (dopo config.js e app-supabase.*.js):
   <script src="tech-detail-only.js"></script>

3) Non serve toccare altro: il blocco "Dati tecnici" verrà creato SOLO quando apri "Dettaglio scheda"
   e verrà rimosso da qualsiasi altra schermata (home, ricerca, foto, ecc.).

4) I campi popolati sono:
   - battCollettore, lungAsse, lungPacco, largPacco, punta, numPunte

5) Requisiti:
   - Deve esistere una funzione globale `showDettaglio(id)` che apre la scheda.
   - Deve esistere `getRecord(id)` per recuperare i dati.
