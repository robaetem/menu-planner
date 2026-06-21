-- Vleesjes: a freezer inventory for raw meat, parallel to potjes but with a
-- single shared count (meat isn't portioned per person the way cooked potjes
-- are). Additive only — nothing existing depends on these tables.

-- ---------------------------------------------------------------------------
-- vleesjes: what raw meat is in the freezer right now. `count` is the number of
-- pieces/portions; `created_at` doubles as the "ingevroren op" date shown in the
-- UI.
-- ---------------------------------------------------------------------------
create table if not exists public.vleesjes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  count      int  not null default 1,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- Every vleesje name ever entered — powers the add/pick autocomplete and the AI
-- fuzzy-match, and survives the vleesje being eaten (mirrors potje_names).
create table if not exists public.vleesje_names (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: shared household (same permissive policy as every other table).
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.vleesjes enable row level security;
  drop policy if exists vleesjes_household_all on public.vleesjes;
  create policy vleesjes_household_all on public.vleesjes
    for all to authenticated using (true) with check (true);
  grant all on public.vleesjes to authenticated, service_role;

  alter table public.vleesje_names enable row level security;
  drop policy if exists vleesje_names_household_all on public.vleesje_names;
  create policy vleesje_names_household_all on public.vleesje_names
    for all to authenticated using (true) with check (true);
  grant all on public.vleesje_names to authenticated, service_role;
end $$;
