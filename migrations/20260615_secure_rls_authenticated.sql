-- =====================================================
-- SCHEDA OFFICINA - RLS HARDENING
-- Data: 2026-06-15
--
-- Scopo:
--   Rimuove le policy pubbliche anon CRUD create nelle prime migrazioni
--   e limita lettura/scrittura agli utenti autenticati Supabase.
--
-- ATTENZIONE:
--   1. Applicare questa migrazione solo dopo aver verificato che gli operatori
--      accedano davvero con Supabase Auth.
--   2. record.html pubblico con solo ?id=<uuid> non potra piu leggere records
--      come anon. Se serve condivisione pubblica, creare un flusso dedicato
--      con token di condivisione o Edge Function controllata.
--   3. Questa migrazione non rende privato il bucket Storage se il bucket
--      "photos" e configurato come pubblico nel dashboard Supabase.
-- =====================================================

-- --------------------- Helper ---------------------
create or replace function public.is_authenticated()
returns boolean
language sql
stable
as $$
  select auth.role() = 'authenticated';
$$;

-- --------------------- Core tables ---------------------
alter table public.records enable row level security;
alter table public.photos enable row level security;

drop policy if exists "Allow public read records" on public.records;
drop policy if exists "Allow public insert records" on public.records;
drop policy if exists "Allow public update records" on public.records;
drop policy if exists "Allow public delete records" on public.records;
drop policy if exists records_authenticated_all on public.records;

create policy records_authenticated_all
on public.records
for all
to authenticated
using (public.is_authenticated())
with check (public.is_authenticated());

drop policy if exists "Allow public read photos" on public.photos;
drop policy if exists "Allow public insert photos" on public.photos;
drop policy if exists "Allow public update photos" on public.photos;
drop policy if exists "Allow public delete photos" on public.photos;
drop policy if exists photos_authenticated_all on public.photos;

create policy photos_authenticated_all
on public.photos
for all
to authenticated
using (public.is_authenticated())
with check (public.is_authenticated());

-- --------------------- Preventivi ---------------------
alter table if exists public.work_categories enable row level security;
alter table if exists public.work_tasks enable row level security;
alter table if exists public.work_task_phases_template enable row level security;
alter table if exists public.quotes enable row level security;
alter table if exists public.quote_items enable row level security;
alter table if exists public.quote_item_phases enable row level security;

drop policy if exists work_categories_all on public.work_categories;
drop policy if exists work_categories_authenticated_all on public.work_categories;
create policy work_categories_authenticated_all
on public.work_categories
for all
to authenticated
using (public.is_authenticated())
with check (public.is_authenticated());

drop policy if exists work_tasks_all on public.work_tasks;
drop policy if exists work_tasks_authenticated_all on public.work_tasks;
create policy work_tasks_authenticated_all
on public.work_tasks
for all
to authenticated
using (public.is_authenticated())
with check (public.is_authenticated());

drop policy if exists work_task_phases_all on public.work_task_phases_template;
drop policy if exists work_task_phases_authenticated_all on public.work_task_phases_template;
create policy work_task_phases_authenticated_all
on public.work_task_phases_template
for all
to authenticated
using (public.is_authenticated())
with check (public.is_authenticated());

drop policy if exists quotes_all on public.quotes;
drop policy if exists quotes_authenticated_all on public.quotes;
create policy quotes_authenticated_all
on public.quotes
for all
to authenticated
using (public.is_authenticated())
with check (public.is_authenticated());

drop policy if exists quote_items_all on public.quote_items;
drop policy if exists quote_items_authenticated_all on public.quote_items;
create policy quote_items_authenticated_all
on public.quote_items
for all
to authenticated
using (public.is_authenticated())
with check (public.is_authenticated());

drop policy if exists quote_item_phases_all on public.quote_item_phases;
drop policy if exists quote_item_phases_authenticated_all on public.quote_item_phases;
create policy quote_item_phases_authenticated_all
on public.quote_item_phases
for all
to authenticated
using (public.is_authenticated())
with check (public.is_authenticated());

-- --------------------- Storage note ---------------------
-- Se vuoi rendere davvero private le foto, controlla anche il bucket:
--   1. Supabase Dashboard > Storage > photos > Public bucket = OFF
--   2. Aggiungi policy su storage.objects per authenticated.
-- Esempio da adattare:
--
-- update storage.buckets set public = false where id = 'photos';
--
-- create policy photos_storage_authenticated_select
-- on storage.objects for select to authenticated
-- using (bucket_id = 'photos');
--
-- create policy photos_storage_authenticated_insert
-- on storage.objects for insert to authenticated
-- with check (bucket_id = 'photos');
--
-- create policy photos_storage_authenticated_update
-- on storage.objects for update to authenticated
-- using (bucket_id = 'photos')
-- with check (bucket_id = 'photos');
--
-- create policy photos_storage_authenticated_delete
-- on storage.objects for delete to authenticated
-- using (bucket_id = 'photos');
