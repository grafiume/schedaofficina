
PATCH: Filtri a corrispondenza esatta + Dettaglio con campi tecnici

1) SUPABASE (SQL Editor):
   - Esegui 'schema_add_tech_fields.sql' per assicurarti che i campi tecnici esistano nella tabella 'records'.

2) GITHUB PAGES (repo):
   - Carica 'technical-filters.js' nella root del repo (accanto a index.html).
   - In 'index.html', aggiungi PRIMA della chiusura </body>:
       <script src="technical-filters.js"></script>
     (dopo config.js e app-supabase.*.js)

3) DETTAGLIO SCHEDA (HTML):
   - Apri 'index.html' e incolla il contenuto di 'detail-tech-section.html'
     dentro il pannello "Dettaglio scheda" (ovunque vuoi mostrarli).

4) UI - ID attesi dai filtri:
   - Inputs: #f-battCollettore, #f-lungAsse, #f-lungPacco, #f-largPacco, #f-punta, #f-numPunte
   - Bottoni: #btnApplyFilters, #btnResetFilters
   Se i tuoi ID sono diversi, apri 'technical-filters.js' e cambia i selettori in cima.

5) Funzionamento:
   - I filtri usano match ESATTO (Supabase .eq) per ogni campo valorizzato.
   - La lista viene aggiornata chiamando renderList(lista) oppure lista(lista) oppure refreshDashboard().
   - Il dettaglio viene popolato quando invochi showDettaglio(id) (la funzione originale viene preservata).
