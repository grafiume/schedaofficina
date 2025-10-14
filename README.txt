SCHEDA OFFICINA — Patch Galleria/Fotocamera (iPhone-safe)

Contenuto:
1) index-snippet.html  -> blocco HTML con <label for> compatibile iOS (niente display:none)
2) photo-inputs.js     -> listener 'change' per anteprima
3) style-snippet.css   -> classe .visually-hidden da aggiungere al tuo CSS

Istruzioni:
A) Apri index.html e sostituisci il blocco input/btn foto con index-snippet.html.
B) Aggiungi il contenuto di style-snippet.css dentro il tuo <head> o file CSS.
C) Aggiungi prima di </body>:
   <script src="./photo-inputs.js"></script>
D) Hard refresh. Su iPhone:
   - "Scegli dalla galleria" apre la libreria
   - "Scatta foto" apre la fotocamera
   - Anteprima aggiornata correttamente.
