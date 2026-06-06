-- Menu Planner schema (shared single-household app for Robin & Amber).
-- Access is gated upstream by Clerk + ALLOWED_EMAILS (app/(protected)/layout.tsx +
-- proxy.ts), so every table uses a permissive shared-household RLS policy
-- (FOR ALL TO authenticated USING(true) WITH CHECK(true)) — NO per-user user_id
-- scoping (that would make Amber see an empty app). The local dev server may use
-- the Supabase secret key, which bypasses RLS entirely.

-- ---------------------------------------------------------------------------
-- household: a single settings row holding the shared diner roster + defaults.
-- (Single-tenant: other tables are global to this one household, so no FK to it.)
-- ---------------------------------------------------------------------------
create table if not exists public.household (
  id              uuid primary key default gen_random_uuid(),
  name            text not null default 'Robin & Amber',
  diners          jsonb not null default '[{"key":"robin","label":"Robin"},{"key":"amber","label":"Amber"}]'::jsonb,
  default_people  int  not null default 2,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- recipes: the meal database to scroll through + power the suggestion ranker.
-- ---------------------------------------------------------------------------
create table if not exists public.recipes (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  tags             text[] not null default '{}',
  prep_minutes     int,
  uses_fresh_veg   boolean not null default false,
  freezer_friendly boolean not null default false,
  base_servings    int not null default 2,
  method           text,
  notes            text,
  -- (searchable text is assembled in the TS suggestion ranker from title+tags+
  --  notes+ingredient names; no DB-side generated column needed.)
  cook_count       int not null default 0,
  last_cooked_on   date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ingredients: per-recipe lines with three scaling modes.
--   per_serving -> amount is the quantity for ONE eaten serving (normalized on
--                  save by base_servings so reads never divide -> no drift)
--   per_person  -> amounts_per_person {diner_key: amount} (meat: Robin 2 / Amber 1)
--   fixed       -> amount added ONCE per planned meal regardless of headcount
-- amount_max captures ranges ('800-1000 g' -> amount=800, amount_max=1000); the
-- shopping total uses amount_max to never under-buy.
-- ---------------------------------------------------------------------------
create table if not exists public.ingredients (
  id                 uuid primary key default gen_random_uuid(),
  recipe_id          uuid not null references public.recipes(id) on delete cascade,
  name               text not null,
  unit               text not null default '',
  scaling            text not null default 'per_serving'
                       check (scaling in ('per_serving','per_person','fixed')),
  amount             numeric,
  amount_max         numeric,
  amounts_per_person jsonb not null default '{}'::jsonb,
  is_fresh           boolean not null default false,
  sort               int not null default 0
);
create index if not exists ingredients_recipe_id_idx on public.ingredients(recipe_id);

-- ---------------------------------------------------------------------------
-- periods: a planning window. No end_date — length is implied by plan_days
-- (variable-length periods, any start weekday).
-- ---------------------------------------------------------------------------
create table if not exists public.periods (
  id          uuid primary key default gen_random_uuid(),
  title       text,
  start_date  date not null,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- plan_days: one day card. note is the verbatim Notion freeform line.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_days (
  id        uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete cascade,
  day_date  date not null,
  note      text,
  sort      int not null default 0,
  unique (period_id, day_date)
);
create index if not exists plan_days_period_id_idx on public.plan_days(period_id);

-- ---------------------------------------------------------------------------
-- plan_meals: the meal on a day.
--   freezer_servings = potjes to COOK extra & freeze (buy MORE; scales per_serving)
--   from_freezer     = eat existing stock (no recipe needed, buy NOTHING)
-- raw_text round-trips the typed meal line losslessly.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_meals (
  id               uuid primary key default gen_random_uuid(),
  plan_day_id      uuid not null references public.plan_days(id) on delete cascade,
  recipe_id        uuid references public.recipes(id) on delete set null,
  raw_text         text not null default '',
  freeform_title   text,
  cook             text,
  diner_count      int not null default 2,
  diner_keys       text[] not null default '{robin,amber}',
  freezer_servings int not null default 0,
  from_freezer     boolean not null default false,
  note             text,
  sort             int not null default 0
);
create index if not exists plan_meals_plan_day_id_idx on public.plan_meals(plan_day_id);

-- ---------------------------------------------------------------------------
-- shopping_extras: freeform manual items not from any recipe ('koffie').
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_extras (
  id        uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete cascade,
  text      text not null,
  checked   boolean not null default false,
  sort      int not null default 0
);
create index if not exists shopping_extras_period_id_idx on public.shopping_extras(period_id);

-- ---------------------------------------------------------------------------
-- shopping_checks: shared check-off state for COMPUTED lines, keyed by the
-- aggregation key 'lower(name)|unit' so a tick syncs across both phones.
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_checks (
  period_id uuid not null references public.periods(id) on delete cascade,
  line_key  text not null,
  checked   boolean not null default true,
  primary key (period_id, line_key)
);

-- ---------------------------------------------------------------------------
-- RLS: shared household — any signed-in (=allowlisted) user has full access.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['household','recipes','ingredients','periods','plan_days','plan_meals','shopping_extras','shopping_checks']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_household_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t||'_household_all', t);
    -- privileges (RLS still applies; this just allows the role to touch the table)
    execute format('grant all on public.%I to authenticated, service_role;', t);
  end loop;
end $$;

-- Seed the single household row if none exists.
insert into public.household (name)
select 'Robin & Amber'
where not exists (select 1 from public.household);
