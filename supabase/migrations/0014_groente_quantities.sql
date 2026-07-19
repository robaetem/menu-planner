-- Add explicit decimal quantities and units to the manual Groenten inventory.
-- `count` remains untouched for rollback compatibility. Existing rows are
-- backfilled with their exact count as an amount in pieces.

alter table public.groenten
  add column if not exists amount numeric,
  add column if not exists unit text;

update public.groenten
set
  amount = coalesce(amount, count),
  unit = coalesce(unit, 'stuk')
where amount is null or unit is null;

alter table public.groenten
  alter column amount set default 1,
  alter column amount set not null,
  alter column unit set default 'stuk',
  alter column unit set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groenten_amount_nonnegative') then
    alter table public.groenten
      add constraint groenten_amount_nonnegative check (amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'groenten_unit_supported') then
    alter table public.groenten
      add constraint groenten_unit_supported
      check (unit in ('gram', 'kilogram', 'stuk', 'portie', 'zak', 'doos', 'verpakking'));
  end if;
end $$;
