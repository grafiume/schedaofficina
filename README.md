# Scheda Riparazioni — versione ottimizzata (lite)
App HTML/JS standalone pensata per GitHub Pages. Legge/scrive dalla tabella `records` su Supabase usando `config.js`.

## Ricerca ottimizzata
- **Campo generale**: tokenizzazione case-insensitive e senza accenti su `descrizione`, `modello`, `cliente`, `telefono`, `docTrasporto`.
- **Note (match esatto)**: confronto esatto *case-insensitive* e *spazi normalizzati* su `note`.
- **Filtri tecnici (singoli)**: `battCollettore`, `lunghezzaAsse`, `lunghezzaPacco`, `larghezzaPacco`, `punta`, `numPunte` con *match esatto*.
- **Reset**: pulisce ogni campo, compresa la ricerca generale.
- **Ordinamento**: priorità per stato (`In attesa` → `In lavorazione` → `Completata`), poi `dataApertura` decrescente.

## Banner “Chiusa”
In modifica appare un banner verde **Chiusa** quando `statoPratica = Completata`.

## Deploy
1. Carica l’intera cartella su GitHub Pages o Netlify.
2. Assicurati che `config.js` contenga `SUPABASE_URL` e `SUPABASE_ANON_KEY` validi.
