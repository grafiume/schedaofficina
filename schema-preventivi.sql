-- Scheda Officina — Modulo Preventivi (NUOVA IMPLEMENTAZIONE)
-- Prezzi liberi (IVA esclusa) + IVA fissa 22% in UI
-- Tabelle:
--   work_categories, work_tasks, work_task_phases_template
--   quotes, quote_items, quote_item_phases

-- UUID helper
create extension if not exists pgcrypto;

-- --------------------- Libreria lavorazioni (struttura PDF) ---------------------
create table if not exists public.work_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.work_categories(id) on delete cascade,
  code text,
  title text not null,
  default_description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists work_tasks_category_idx on public.work_tasks(category_id);

create table if not exists public.work_task_phases_template (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  phase_name text not null,
  weight_percent numeric not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists work_task_phases_task_idx on public.work_task_phases_template(task_id);

-- --------------------- Preventivi ---------------------

-- NOTE: record_id punta alla tabella records già esistente in Scheda Officina
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  status text not null default 'BOZZA',
  sent_at date,
  accepted_at date,
  delivery_days int,
  delivery_date date,
  notes text,
  -- cache calcoli
  subtotal_ex_vat numeric not null default 0,
  vat_rate numeric not null default 22,
  vat_total numeric not null default 0,
  grand_total numeric not null default 0,
  progress_percent numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quotes_record_idx on public.quotes(record_id);
create index if not exists quotes_status_idx on public.quotes(status);
create index if not exists quotes_accepted_idx on public.quotes(accepted_at);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  position int not null default 0,
  task_id uuid references public.work_tasks(id) on delete set null,
  description text not null,
  qty numeric not null default 1,
  unit_price_ex_vat numeric not null default 0,
  line_total_ex_vat numeric not null default 0,
  line_progress_percent numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_items_quote_idx on public.quote_items(quote_id);
create index if not exists quote_items_task_idx on public.quote_items(task_id);

create table if not exists public.quote_item_phases (
  id uuid primary key default gen_random_uuid(),
  quote_item_id uuid not null references public.quote_items(id) on delete cascade,
  phase_name text not null,
  weight_percent numeric not null default 0,
  is_done boolean not null default false,
  sort_order int not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists quote_item_phases_item_idx on public.quote_item_phases(quote_item_id);

-- --------------------- updated_at trigger (leggero) ---------------------
create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='set_quotes_updated_at') then
    create trigger set_quotes_updated_at before update on public.quotes
    for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname='set_quote_items_updated_at') then
    create trigger set_quote_items_updated_at before update on public.quote_items
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- --------------------- RLS (frontend anon) ---------------------
-- Se nel tuo progetto usi auth/RLS più stretta, adatta queste policy.

alter table public.work_categories enable row level security;
alter table public.work_tasks enable row level security;
alter table public.work_task_phases_template enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_item_phases enable row level security;

-- Permessi pubblici (anon) — CRUD
-- Categorie
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='work_categories' and policyname='work_categories_all') then
    create policy work_categories_all on public.work_categories
      for all to anon
      using (true)
      with check (true);
  end if;
end $$;

-- Tasks
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='work_tasks' and policyname='work_tasks_all') then
    create policy work_tasks_all on public.work_tasks
      for all to anon
      using (true)
      with check (true);
  end if;
end $$;

-- Phases template
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='work_task_phases_template' and policyname='work_task_phases_all') then
    create policy work_task_phases_all on public.work_task_phases_template
      for all to anon
      using (true)
      with check (true);
  end if;
end $$;

-- Quotes
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quotes' and policyname='quotes_all') then
    create policy quotes_all on public.quotes
      for all to anon
      using (true)
      with check (true);
  end if;
end $$;

-- Quote items
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quote_items' and policyname='quote_items_all') then
    create policy quote_items_all on public.quote_items
      for all to anon
      using (true)
      with check (true);
  end if;
end $$;

-- Quote item phases
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quote_item_phases' and policyname='quote_item_phases_all') then
    create policy quote_item_phases_all on public.quote_item_phases
      for all to anon
      using (true)
      with check (true);
  end if;
end $$;

-- Fine.
