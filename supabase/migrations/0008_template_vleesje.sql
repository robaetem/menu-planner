-- Template "[vleesje]" recipes: one recipe ("Koude bloemkool met [vleesje]") that
-- gets its meat chosen at planning time, from the freezer (consumed) or to-buy
-- (added to the shopping list). Additive only — existing recipes default to
-- has_vleesje = false and behave exactly as before.

-- A recipe that carries a vleesje slot. The non-meat ingredients live in the
-- normal `ingredients` rows; the meat is chosen per planned meal.
alter table public.recipes
  add column if not exists has_vleesje boolean not null default false;

-- The vleesjes chosen for one planned meal: an array of
--   { name: text, count: int, source: 'freezer' | 'buy' }
-- 'freezer' lines are consumed from the vleesjes inventory and buy nothing;
-- 'buy' lines are added to the shopping list under the meat category.
alter table public.plan_meals
  add column if not exists template_vleesjes jsonb not null default '[]'::jsonb;
