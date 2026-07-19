-- Fully manual freezer-vegetable inventory. Additive only: no existing recipe,
-- planning, shopping, Potjes, or Vleesjes rows are updated or moved.

create table if not exists public.groenten (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  count      int not null default 1 check (count >= 0),
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

-- Keep previously used names available after a vegetable has been removed.
create table if not exists public.groente_names (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists groente_names_name_lower_idx on public.groente_names (lower(name));

do $$
declare t text;
begin
  foreach t in array array['groenten', 'groente_names']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_household_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_household_all', t
    );
    execute format('grant all on public.%I to authenticated, service_role;', t);
  end loop;
end $$;
