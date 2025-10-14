# Migrazione foto locali -> Supabase
1. Copia `migrate-photos.js` nella stessa cartella di `index.html`.
2. Aggiungi in `index.html` (prima di `</body>`):
   <script src="migrate-photos.js"></script>
3. Apri il sito su ciascun dispositivo che contiene foto locali.
4. In Home comparirà il pulsante **"Sincronizza foto su cloud"**.
5. Cliccala: le foto verranno caricate su Supabase Storage e registrate in `public.photos`.

Nota: funziona solo se il bucket `photos` è pubblico e le policy Storage/Photos sono impostate come ti ho fornito.
