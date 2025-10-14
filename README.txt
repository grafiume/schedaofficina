SCHEDA OFFICINA — Patch Galleria/Fotocamera (telefono/tablet)

Contenuto:
1) photo-inputs.js   -> Aggiunge i pulsanti e gli handler per scegliere Galleria o Fotocamera.
2) index-snippet.html -> Blocco HTML da incollare dove avevi l'input file.
3) salva-photo-block.js -> Sostituisce SOLO il blocco "Foto" dentro la tua funzione salva().

Passi (non sovrascrive il resto della tua app):
A) Apri index.html e sostituisci il vecchio input <input id="photoInput"...> con il contenuto di index-snippet.html.
B) Aggiungi prima di </body> questa riga:
   <script src="./photo-inputs.js"></script>
C) Apri la funzione salva() e sostituisci SOLO il blocco "Foto" con il contenuto di salva-photo-block.js.
D) Salva, fai hard refresh (se serve pulisci il Service Worker) e prova su telefono:
   - "Scegli dalla galleria" apre la libreria
   - "Scatta foto" apre la fotocamera
   - La foto selezionata/scattata compare in anteprima e viene caricata alla pressione di "Salva scheda".
