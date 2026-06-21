-- The Boodschappenlijstje: a single shared, freeform rich-text document, plus the
-- user-defined ingredient categories and an AI-assisted name->category map used to
-- group the generated list. Additive only.

-- ---------------------------------------------------------------------------
-- shopping_doc: ONE row, the household's editable boodschappenlijstje. `content`
-- is TipTap's JSON document. "Maak boodschappenlijstje" overwrites it; the user
-- freely edits it afterwards.
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_doc (
  id         uuid primary key default gen_random_uuid(),
  content    jsonb,
  updated_at timestamptz not null default now()
);
insert into public.shopping_doc (content)
  select null
  where not exists (select 1 from public.shopping_doc);

-- ---------------------------------------------------------------------------
-- ingredient_categories: user-managed shopping sections (Groenten, Vlees, …),
-- ordered. Seeded with a sensible Dutch default set; the user can rename / add /
-- remove. "Overig" is the implicit fallback for anything uncategorised, so it is
-- NOT seeded as a row (handled in code).
-- ---------------------------------------------------------------------------
create table if not exists public.ingredient_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  unique (name)
);
insert into public.ingredient_categories (name, sort) values
  ('Groenten & Fruit', 0),
  ('Vlees & Vis',      1),
  ('Zuivel & Eieren',  2),
  ('Brood & Bakkerij', 3),
  ('Droge voeding',    4),
  ('Diepvries',        5),
  ('Kruiden & Sauzen', 6),
  ('Dranken',          7),
  ('Overig',           8)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- ingredient_category_map: caches each distinct ingredient name's category so the
-- AI is only called for NEW names. `source` records whether the model guessed it
-- ('ai') or the user fixed it ('user') — user picks are never overwritten by a
-- recompute. category_id nulls out (-> "Overig") when its category is deleted.
-- ---------------------------------------------------------------------------
create table if not exists public.ingredient_category_map (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category_id uuid references public.ingredient_categories(id) on delete set null,
  source      text not null default 'ai' check (source in ('ai','user')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name)
);

-- ---------------------------------------------------------------------------
-- RLS: shared household (same permissive policy as every other table).
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.shopping_doc enable row level security;
  drop policy if exists shopping_doc_household_all on public.shopping_doc;
  create policy shopping_doc_household_all on public.shopping_doc
    for all to authenticated using (true) with check (true);
  grant all on public.shopping_doc to authenticated, service_role;

  alter table public.ingredient_categories enable row level security;
  drop policy if exists ingredient_categories_household_all on public.ingredient_categories;
  create policy ingredient_categories_household_all on public.ingredient_categories
    for all to authenticated using (true) with check (true);
  grant all on public.ingredient_categories to authenticated, service_role;

  alter table public.ingredient_category_map enable row level security;
  drop policy if exists ingredient_category_map_household_all on public.ingredient_category_map;
  create policy ingredient_category_map_household_all on public.ingredient_category_map
    for all to authenticated using (true) with check (true);
  grant all on public.ingredient_category_map to authenticated, service_role;
end $$;
