-- Per-person freezer servings.
--
-- Previously plan_meals.freezer_servings was a single "cook N extra potjes to
-- freeze" count. But a potje isn't anonymous: when Robin cooks while Amber is
-- away, "+2 potjes" usually means one Robin-portion + one Amber-portion. That
-- distinction matters for per_person ingredients — a Robin courgette portion is
-- 1,5 stuk, an Amber portion 0,75 stuk — so the amount to prepare depends on
-- WHO each potje is for, not just how many there are.
--
-- Split the count into two per-person columns (mirroring potjes.robin_count /
-- amber_count). The old freezer_servings column is RETAINED, untouched by the
-- app from here on, as a frozen in-DB record of the pre-split value so nothing
-- is ever lost.

alter table public.plan_meals
  add column if not exists freezer_robin int not null default 0,
  add column if not exists freezer_amber int not null default 0;

-- Backfill: "+2 potjes" -> 1 Robin + 1 Amber, regardless of who eats (assignee).
-- Odd counts put the extra portion on Robin (ceil). The total is preserved for
-- every row: freezer_robin + freezer_amber == the old freezer_servings.
-- Guarded so re-running the migration is a no-op (idempotent).
update public.plan_meals
  set freezer_robin = ceil(freezer_servings::numeric / 2)::int,
      freezer_amber = floor(freezer_servings::numeric / 2)::int
  where freezer_servings > 0
    and freezer_robin = 0
    and freezer_amber = 0;
