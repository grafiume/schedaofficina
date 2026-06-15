-- =====================================================
-- SCHEDA OFFICINA - SINCRONIZZA DATA ARRIVO
-- Data: 2026-06-15
--
-- Regola:
--   dataArrivo deve essere sempre uguale a dataApertura.
--
-- Effetto:
--   - Su INSERT e UPDATE di public.records copia dataApertura in dataArrivo.
--   - Se dataApertura e null, dataArrivo diventa null.
-- =====================================================

create or replace function public.sync_data_arrivo_from_data_apertura()
returns trigger
language plpgsql
as $$
begin
  new."dataArrivo" := new."dataApertura";
  return new;
end;
$$;

drop trigger if exists trg_sync_data_arrivo_from_data_apertura on public.records;

create trigger trg_sync_data_arrivo_from_data_apertura
before insert or update of "dataApertura", "dataArrivo"
on public.records
for each row
execute function public.sync_data_arrivo_from_data_apertura();

-- Allinea anche lo storico gia presente.
update public.records
set "dataArrivo" = "dataApertura"
where "dataApertura" is not null
  and "dataArrivo" is distinct from "dataApertura";
