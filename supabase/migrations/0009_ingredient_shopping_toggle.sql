-- Per-ingredient control for generated boodschappenlijst inclusion.
-- Existing and new ingredients default to included so current behavior is
-- preserved until a user explicitly disables the toggle.

alter table public.ingredients
  add column if not exists include_in_shopping boolean;

update public.ingredients
set include_in_shopping = true
where include_in_shopping is null;

alter table public.ingredients
  alter column include_in_shopping set default true,
  alter column include_in_shopping set not null;
