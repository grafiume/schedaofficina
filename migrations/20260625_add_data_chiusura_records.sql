-- Salva la data automatica di chiusura quando una scheda viene completata.
alter table public.records
add column if not exists "dataChiusura" date;

comment on column public.records."dataChiusura"
is 'Data in cui la scheda officina viene marcata come Completata.';
