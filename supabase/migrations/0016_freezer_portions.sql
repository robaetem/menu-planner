-- Frozen portions with a timeline.
--
-- Before: `potjes` held per-name counters (robin_count / amber_count) that were
-- decremented the moment a "Potje diepvries" was PLANNED, and cooking "+N
-- potjes" never added anything — the household counted potjes by hand.
--
-- Now every frozen portion is one row in `freezer_portions`:
--   * cooked by a planned meal (source_meal_id) — in the freezer from that
--     meal's day, eatable from the day after;
--   * or entered by hand (name + frozen_on) — already in the freezer.
-- A "Potje diepvries" meal reserves portions (eaten_by_meal_id).
--
-- Additive only: `potjes` and plan_meals.potje_id are kept untouched as a
-- record of the old model.

create table if not exists public.freezer_portions (
  id               uuid primary key default gen_random_uuid(),
  who              text not null check (who in ('robin', 'amber')),
  -- Manual portions carry their own name; cooked ones use their meal's title.
  name             text,
  -- Manual portions: the day it went in (null = before this model existed).
  frozen_on        date,
  source_meal_id   uuid references public.plan_meals(id) on delete cascade,
  eaten_by_meal_id uuid references public.plan_meals(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint freezer_portions_named check (source_meal_id is not null or name is not null)
);
create index if not exists freezer_portions_source_idx on public.freezer_portions(source_meal_id);
create index if not exists freezer_portions_eaten_idx on public.freezer_portions(eaten_by_meal_id);

alter table public.freezer_portions enable row level security;
drop policy if exists freezer_portions_household_all on public.freezer_portions;
create policy freezer_portions_household_all on public.freezer_portions
  for all to authenticated using (true) with check (true);
grant all on public.freezer_portions to authenticated, service_role;

-- Backfill once, from the old counters and the current plan.
do $$
begin
  if exists (select 1 from public.freezer_portions) then
    return;
  end if;

  -- 1. What the old inventory says is in the freezer (and not yet planned).
  insert into public.freezer_portions (who, name, frozen_on)
  select 'robin', p.name, p.created_at::date
  from public.potjes p cross join lateral generate_series(1, p.robin_count);

  insert into public.freezer_portions (who, name, frozen_on)
  select 'amber', p.name, p.created_at::date
  from public.potjes p cross join lateral generate_series(1, p.amber_count);

  -- 2. Upcoming "Potje diepvries" meals: the old model already took these out
  --    of the inventory when they were planned, but they are still in the
  --    freezer until eaten — recreate them, reserved by their meal.
  insert into public.freezer_portions (who, name, eaten_by_meal_id)
  select w.who, coalesce(nullif(m.freeform_title, ''), nullif(m.raw_text, ''), 'Potje'), m.id
  from public.plan_meals m
  join public.plan_days d on d.id = m.plan_day_id
  cross join (values ('robin'), ('amber')) as w(who)
  where m.from_freezer
    and d.day_date >= current_date
    and (m.assignee = 'both' or m.assignee = w.who);

  -- 3. Upcoming cooks with "+N potjes": their portions will go in on that day.
  --    Earlier cooks were already added to the old inventory by hand (step 1).
  insert into public.freezer_portions (who, source_meal_id)
  select 'robin', m.id
  from public.plan_meals m
  join public.plan_days d on d.id = m.plan_day_id
  cross join lateral generate_series(1, m.freezer_robin)
  where not m.from_freezer and d.day_date >= current_date;

  insert into public.freezer_portions (who, source_meal_id)
  select 'amber', m.id
  from public.plan_meals m
  join public.plan_days d on d.id = m.plan_day_id
  cross join lateral generate_series(1, m.freezer_amber)
  where not m.from_freezer and d.day_date >= current_date;
end $$;
