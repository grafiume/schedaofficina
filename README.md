# Scheda Officina — UI chiara (bianco)
- Ricerca **match esatto** (case/accents-insensitive), nessun wildcard.
- Tasto **Ricerca** = applica filtri+ricerca; **Reset** pulisce TUTTO e torna alla home.
- Banner **CHIUSA** in verde quando `statoPratica = Completata`.
- **Data Scadenza** in rosso (se presente).

## Setup
1. Apri `config.js` e inserisci la tua **ANON KEY** Supabase.
2. Servi la cartella con un web server (anche `npx serve .`).
