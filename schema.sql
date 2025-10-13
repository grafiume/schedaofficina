
-- schema.sql — esegui in Supabase SQL Editor (progetto pedmdiljgjgswhfwedno)

create extension if not exists pgcrypto;

create table if not exists public.records (
  id text primary key,
  descrizione text,
  modello text,
  cliente text,
  telefono text,
  email text,
  punta text,
  numPunte text,
  statoPratica text,
  preventivoStato text,
  docTrasporto text,
  dataApertura date,
  dataAccettazione date,
  dataScadenza date,
  dataArrivo date,
  dataCompletamento date,
  note text,
  createdAt timestamptz default now(),
  updatedAt timestamptz default now()
);

create table if not exists public.photos (
  id text primary key,                  -- = id record
  images jsonb default '[]'::jsonb,     -- array base64
  thumbs jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- RLS SEMPLICE (pubblico anon lettura/scrittura).
-- In produzione restringi!
alter table public.records enable row level security;
alter table public.photos  enable row level security;

drop policy if exists "rw_all_records" on public.records;
drop policy if exists "rw_all_photos"  on public.photos;

create policy "rw_all_records" on public.records
for all using (true) with check (true);

create policy "rw_all_photos" on public.photos
for all using (true) with check (true);

-- Trigger per aggiornare updatedAt / updated_at
create or replace function public.touch_updatedAt()
returns trigger as $$ begin new.updatedAt = now(); return new; end; $$ language plpgsql;

drop trigger if exists trg_touch_records on public.records;
create trigger trg_touch_records before update on public.records
for each row execute procedure public.touch_updatedAt();

create or replace function public.touch_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists trg_touch_photos on public.photos;
create trigger trg_touch_photos before update on public.photos
for each row execute procedure public.touch_updated_at();
