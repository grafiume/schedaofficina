# Scheda Officina — Nuova Grafica (v2)

- UI pulita, dark, con colori originali **arancio/verde/grigio**.
- Ricerca **ESATTA** (senza wildcard) su colonne principali; accenti/maiuscole ignorati.
- KPI: Totali · In attesa · In lavorazione · Completate/Chiuse.
- Pannello dettaglio con banner **CHIUSA** se stato completata o avanzamento 100%.
- Upload foto su Storage (bucket `photos` → percorso `{recordId}/timestamp_nomefile`).
- Reset filtri riporta alla **Home**.

## Setup
1. In Supabase assicurati di avere le tabelle:
   - `records` (UUID `id` PK, testo: `cliente, telefono, marca, modello, descrizione, note, ddt, stato`; date: `dataApertura, dataAccettazione, dataFine`; intero: `avanzamento`).
   - (opzionale) `photos` se vuoi tracciare anche a DB i file caricati.
2. Crea il bucket Storage `photos` **pubblico** (o configura una policy ad hoc).
3. Modifica eventuali nomi colonne nel codice se il tuo schema differisce.
4. Pubblica i file su GitHub Pages come fatto in precedenza.

## Config
Credenziali in `config.js` (inserite dal tuo progetto `pedmdiljgjgswhfwedno`).

## Note
- L’ordinamento prioritizza: In attesa → In lavorazione → Completata, poi `dataApertura` desc.
- La ricerca esatta è lato client. Se desideri farla **server‑side**, posso fornirti SQL e query Supabase con `or()` e uguaglianze.
