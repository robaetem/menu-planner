-- User-managed per-person day "modes" (the Amber/Robin situation pills). Additive
-- only — the currently deployed app keeps working (it still reads
-- plan_days.amber_mode / robin_mode strings as before).

-- ---------------------------------------------------------------------------
-- plan_modes: the situation vocabulary, now editable by the user (was a fixed TS
-- list in app/(protected)/planning/config.ts). Each row belongs to one person
-- (`who`). `value` is the stable key stored in plan_days.amber_mode/robin_mode;
-- `label` is the display text. Seeded with the original hardcoded options, with
-- value = label so existing plan_days references keep matching. Renaming a mode
-- only changes `label`, so day references (by value) never break. Deleting a
-- mode nulls it out of the days that used it (handled in mode-actions.ts).
-- ---------------------------------------------------------------------------
create table if not exists public.plan_modes (
  id         uuid primary key default gen_random_uuid(),
  who        text not null check (who in ('amber','robin')),
  value      text not null,
  label      text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  unique (who, value)
);

insert into public.plan_modes (who, value, label, sort) values
  ('amber', '24 uur',        '24 uur',        0),
  ('amber', 'Recup',         'Recup',         1),
  ('amber', 'Vrije middag',  'Vrije middag',  2),
  ('amber', 'A',             'A',             3),
  ('robin', 'Brussel',       'Brussel',       0),
  ('robin', 'Leuven',        'Leuven',        1),
  ('robin', 'Thuiswerk',     'Thuiswerk',     2)
on conflict (who, value) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: shared household (same permissive policy as every other table).
-- ---------------------------------------------------------------------------
do $$
begin
  alter table public.plan_modes enable row level security;
  drop policy if exists plan_modes_household_all on public.plan_modes;
  create policy plan_modes_household_all on public.plan_modes
    for all to authenticated using (true) with check (true);
  grant all on public.plan_modes to authenticated, service_role;
end $$;
