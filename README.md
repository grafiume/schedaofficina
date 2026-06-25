# ELIP Tagliente - Scheda Riparazioni

Vedi `app.v25.js` per la logica. Allinea colonne fra Home e Ricerca, anteprima immagini, overlay in-page.
Compila `config.js` con URL e chiave ANON di Supabase.

## Aggiornamenti

- 2026-06-25: aggiunta Data chiusura automatica per le schede marcate come Completata. Applicare anche la migrazione `supabase/migrations/20260625_add_data_chiusura_records.sql` nel database Supabase.

## Modalita privata

L'app e pensata per uso interno officina: accesso solo a operatori autenticati con Supabase Auth.

Per chiudere il database agli accessi anonimi, applicare nel SQL editor Supabase la migrazione:

`migrations/20260615_secure_rls_authenticated.sql`

Nota: dopo questa migrazione, i link `record.html?id=...` richiedono una sessione operatore attiva. Se in futuro serve inviare una scheda al cliente, creare una condivisione separata con token temporaneo e dati limitati.
