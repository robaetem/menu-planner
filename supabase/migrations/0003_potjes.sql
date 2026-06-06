-- Freezer inventory ("Potjes"). Additive only — existing recipe columns
-- (base_servings, uses_fresh_veg, freezer_friendly) are kept so the currently
-- deployed app keeps working until the new code ships.

create table if not exists public.potjes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  robin_count int not null default 0,
  amber_count int not null default 0,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.potjes enable row level security;
drop policy if exists potjes_household_all on public.potjes;
create policy potjes_household_all on public.potjes for all to authenticated using (true) with check (true);
grant all on public.potjes to authenticated, service_role;

-- A planned "Potje diepvries" consumes one from the inventory; deleting it
-- returns the count. set null so deleting an inventory potje doesn't drop the plan.
alter table public.plan_meals
  add column if not exists potje_id uuid references public.potjes(id) on delete set null;
