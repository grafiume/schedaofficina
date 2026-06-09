-- =====================================================
-- SCHEDA OFFICINA - SCHEMA BASE SUPABASE
-- Versione base ufficiale
-- Data: 2026-06-09
-- =====================================================

create extension if not exists "uuid-ossp";

-- =====================================================
-- TABELLA RECORDS
-- =====================================================

create table if not exists public.records (
  id text primary key,

  numero text,
  cliente text,
  telefono text,
  email text,

  marca text,
  modello text,
  descrizione text,
  note text,

  statoPratica text default 'In attesa',
  preventivoStato text default 'Non inviato',
  docTrasporto text,

  dataApertura date,
  dataAccettazione date,
  dataScadenza date,
  dataArrivo date,
  dataCompletamento date,

  battCollettore text,
  lunghezzaAsse text,
  lunghezzaPacco text,
  larghezzaPacco text,
  punta text,
  numPunte text,

  image_url text,

  cliente_norm text,
  descrizione_norm text,
  note_norm text,
  cliente_words text,
  search_words text,

  createdAt timestamptz default now(),
  updatedAt timestamptz default now(),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================================================
-- TABELLA PHOTOS
-- =====================================================

create table if not exists public.photos (
  id uuid primary key default uuid_generate_v4(),
  record_id text not null references public.records(id) on delete cascade,
  path text not null,
  is_main boolean default false,
  created_at timestamptz default now()
);

-- =====================================================
-- INDICI
-- =====================================================

create index if not exists idx_records_cliente on public.records(cliente);
create index if not exists idx_records_stato on public.records(statoPratica);
create index if not exists idx_records_data_apertura on public.records(dataApertura);
create index if not exists idx_records_data_arrivo on public.records(dataArrivo);
create index if not exists idx_records_data_scadenza on public.records(dataScadenza);
create index if not exists idx_records_preventivo on public.records(preventivoStato);
create index if not exists idx_records_ddt on public.records(docTrasporto);

create index if not exists idx_records_tecnici
on public.records (
  battCollettore,
  lunghezzaAsse,
  lunghezzaPacco,
  larghezzaPacco,
  punta,
  numPunte
);

create index if not exists idx_photos_record_id on public.photos(record_id);
create index if not exists idx_photos_is_main on public.photos(record_id, is_main);

-- =====================================================
-- FUNZIONE UPDATED_AT
-- =====================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  new."updatedAt" = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_records_updated_at on public.records;

create trigger trg_records_updated_at
before update on public.records
for each row
execute function public.set_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

alter table public.records enable row level security;
alter table public.photos enable row level security;

drop policy if exists "Allow public read records" on public.records;
drop policy if exists "Allow public insert records" on public.records;
drop policy if exists "Allow public update records" on public.records;
drop policy if exists "Allow public delete records" on public.records;

create policy "Allow public read records"
on public.records for select
using (true);

create policy "Allow public insert records"
on public.records for insert
with check (true);

create policy "Allow public update records"
on public.records for update
using (true)
with check (true);

create policy "Allow public delete records"
on public.records for delete
using (true);

drop policy if exists "Allow public read photos" on public.photos;
drop policy if exists "Allow public insert photos" on public.photos;
drop policy if exists "Allow public update photos" on public.photos;
drop policy if exists "Allow public delete photos" on public.photos;

create policy "Allow public read photos"
on public.photos for select
using (true);

create policy "Allow public insert photos"
on public.photos for insert
with check (true);

create policy "Allow public update photos"
on public.photos for update
using (true)
with check (true);

create policy "Allow public delete photos"
on public.photos for delete
using (true);
