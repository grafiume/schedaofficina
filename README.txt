PACCHETTO PUBBLICO — ISTRUZIONI RAPIDE

1) SUPABASE STORAGE (Bucket 'photos')
   - Supabase → Storage → Buckets → 'photos' → PUBLIC (ON).
   - Policies (Auth → Policies → storage.objects):
     a) SELECT (lettura pubblica):
        USING: (bucket_id = 'photos')
     b) INSERT (upload da client anon):
        WITH CHECK: (bucket_id = 'photos')
   - Se usi RLS sul DB 'photos' (tabella metadati), dai SELECT/INSERT ad anon per i soli campi necessari.

2) GITHUB PAGES
   - Carica tutto il contenuto della cartella nel repo 'schedaofficina' (root).
   - Settings → Pages → Deploy from a branch → main / root.

3) INDEX.HTML
   - Assicurati che contenga questi script (prima di </body>):
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="./config.js"></script>
     <script src="./app-supabase-bridge.js"></script>
     <script src="./app-photos.js"></script>
     <script> if('serviceWorker' in navigator){ navigator.serviceWorker.register('./service-worker.js'); } </script>

4) FOTOCAMERA (opzionale)
   - Aggiungi un input: <input id="cameraInput" type="file" accept="image/*" capture="environment" hidden>
   - Usa un bottone per trigger: document.getElementById('cameraInput').click()

5) DEBUG
   - getPhotos('<ID>').then(console.log) deve restituire URL pubblici visibili su tutti i device.
