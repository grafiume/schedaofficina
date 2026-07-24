-- Estende il vincolo del campo cassetto da A1-A80 ad A1-A100.
-- Necessario dopo l'aumento della mappa cassetti a 100 posizioni.

alter table public.records
  drop constraint if exists records_cassetto_format_chk;

alter table public.records
  add constraint records_cassetto_format_chk
  check (
    cassetto is null
    or cassetto = ''
    or cassetto ~ '^A([1-9]|[1-9][0-9]|100)$'
  );
