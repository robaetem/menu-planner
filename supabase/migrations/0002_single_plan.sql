-- Move from multiple "periods" to a single always-on rolling plan.
-- Planning shows days from today onward; shopping lists are built ad-hoc from a
-- day selection (check-off lives client-side), so the period-scoped shopping
-- tables are removed.

-- Meals are assigned to 'both' (Samen, full-width), 'amber' or 'robin' (half-width).
alter table public.plan_meals
  add column if not exists assignee text not null default 'both'
    check (assignee in ('both', 'amber', 'robin'));

-- Per-day mode annotations (Amber / Robin), e.g. 'Vrije middag', 'Leuven'.
alter table public.plan_days
  add column if not exists amber_mode text,
  add column if not exists robin_mode text;

-- Detach days from periods; day_date becomes globally unique.
alter table public.plan_days drop column if exists period_id cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_days_day_date_key') then
    alter table public.plan_days add constraint plan_days_day_date_key unique (day_date);
  end if;
end $$;

-- How far ahead the plan extends (the "+ Voeg dagen toe" horizon). The view always
-- shows at least today..today+10 regardless.
alter table public.household add column if not exists plan_horizon date;

-- Remove the period + period-scoped shopping tables.
drop table if exists public.shopping_checks;
drop table if exists public.shopping_extras;
drop table if exists public.periods cascade;
