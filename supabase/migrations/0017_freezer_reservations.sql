-- Vleesjes and groenten: planned meals reserve stock, the freezer empties on
-- the meal's day.
--
-- Before: choosing a freezer vleesje for a meal subtracted it from
-- `vleesjes.count` straight away (at PLANNING time), matched by name with
-- `ilike ... maybeSingle()` — which silently did nothing once two batches
-- shared a name, and "restoring" inserted yet another duplicate row.
--
-- Now:
--   * `vleesjes.count` / `groenten.amount` is what is physically in the
--     freezer. Several entries may share a name (frozen on different days).
--   * A planned meal says what it wants (plan_meals.template_vleesjes /
--     plan_meals.template_groenten) and holds rows in `freezer_reservations`
--     against specific entries, oldest entry first. Wanted minus reserved is a
--     shortage the app shows.
--   * Once the meal's day has passed, `settle_freezer_reservations` takes the
--     reserved amount out of the entry and marks the reservation settled.
--
-- Additive only: no existing row is changed by this file.

-- What a meal takes from the freezer-vegetable inventory:
--   [{ name, unit, amount, replaces }] — `replaces` is the recipe ingredient it
--   stands in for, which then stays off the boodschappenlijstje.
alter table public.plan_meals
  add column if not exists template_groenten jsonb not null default '[]'::jsonb;

create table if not exists public.freezer_reservations (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid not null references public.plan_meals(id) on delete cascade,
  vleesje_id  uuid references public.vleesjes(id) on delete cascade,
  groente_id  uuid references public.groenten(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  -- Set once the meal's day has passed and the amount left the freezer.
  settled_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint freezer_reservations_one_item check ((vleesje_id is null) <> (groente_id is null))
);
create index if not exists freezer_reservations_meal_idx on public.freezer_reservations(meal_id);
create index if not exists freezer_reservations_vleesje_idx on public.freezer_reservations(vleesje_id) where settled_at is null;
create index if not exists freezer_reservations_groente_idx on public.freezer_reservations(groente_id) where settled_at is null;

alter table public.freezer_reservations enable row level security;
drop policy if exists freezer_reservations_household_all on public.freezer_reservations;
create policy freezer_reservations_household_all on public.freezer_reservations
  for all to authenticated using (true) with check (true);
grant all on public.freezer_reservations to authenticated, service_role;

-- Take every reservation whose meal day is before `p_today` out of the freezer,
-- exactly once (the settled_at guard makes concurrent calls safe).
create or replace function public.settle_freezer_reservations(p_today date)
returns void
language plpgsql
as $$
begin
  with due as (
    update public.freezer_reservations r
    set settled_at = now()
    from public.plan_meals m
    join public.plan_days d on d.id = m.plan_day_id
    where r.meal_id = m.id
      and r.settled_at is null
      and d.day_date < p_today
    returning r.vleesje_id, r.groente_id, r.amount
  ),
  v as (
    update public.vleesjes t
    set count = greatest(0, t.count - ceil(s.amt)::int)
    from (select vleesje_id, sum(amount) as amt from due where vleesje_id is not null group by vleesje_id) s
    where t.id = s.vleesje_id
    returning t.id
  )
  update public.groenten t
  set amount = greatest(0, t.amount - s.amt),
      count = ceil(greatest(0, t.amount - s.amt))::int
  from (select groente_id, sum(amount) as amt from due where groente_id is not null group by groente_id) s
  where t.id = s.groente_id;
end;
$$;

grant execute on function public.settle_freezer_reservations(date) to authenticated, service_role;
