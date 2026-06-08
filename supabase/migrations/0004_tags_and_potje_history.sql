-- User-managed recipe tags + persistent potje-name history. Additive only — the
-- currently deployed app keeps working (it still reads recipes.tags as before).

-- ---------------------------------------------------------------------------
-- recipe_tags: the tag vocabulary, now editable by the user (was a fixed TS
-- list in lib/recipes/tags.ts). `value` is the stable key stored in
-- recipes.tags[]; `label` is the display text. Seeded with the original six so
-- existing recipes keep their tags. Renaming a tag only changes `label`, so
-- recipe references (by value) never break.
-- ---------------------------------------------------------------------------
create table if not exists public.recipe_tags (
  id         uuid primary key default gen_random_uuid(),
  value      text not null unique,
  label      text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

insert into public.recipe_tags (value, label, sort) values
  ('snel',                 'Snel',                 0),
  ('verse groenten',       'Verse groenten',       1),
  ('diepvriesvriendelijk', 'Diepvriesvriendelijk', 2),
  ('zomer',                'Zomer',                3),
  ('winter',               'Winter',               4),
  ('pasta',                'Pasta',                5)
on conflict (value) do nothing;

-- ---------------------------------------------------------------------------
-- potje_names: every potje name ever entered, powering the add-potje
-- autocomplete. Survives a potje being consumed/deleted, so the suggestion
-- list only ever grows. Case-insensitively unique.
-- ---------------------------------------------------------------------------
create table if not exists public.potje_names (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists potje_names_name_lower_idx on public.potje_names (lower(name));

insert into public.potje_names (name)
select distinct on (lower(name)) name from public.potjes
order by lower(name)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS: shared household (same permissive policy as every other table).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recipe_tags','potje_names']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_household_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t||'_household_all', t);
    execute format('grant all on public.%I to authenticated, service_role;', t);
  end loop;
end $$;
