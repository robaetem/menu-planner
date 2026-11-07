-- Change requests made through the in-app chat. One row per run; the status is
-- derived live from GitHub and persisted here once it is final.
-- Additive only.

create table if not exists public.change_runs (
  id            uuid primary key default gen_random_uuid(),
  requested_by  text not null,
  request       text not null,
  status        text not null default 'queued'
                check (status in ('queued','running','checking','blocked','failed','deploying','live','undoing','undone')),
  summary       text,
  reason        text,
  pr_number     int,
  merge_sha     text,
  -- Set when an undo was requested: the run id the revert workflow was started for.
  revert_run_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists change_runs_created_idx on public.change_runs(created_at desc);

alter table public.change_runs enable row level security;
drop policy if exists change_runs_household_all on public.change_runs;
create policy change_runs_household_all on public.change_runs
  for all to authenticated using (true) with check (true);
grant all on public.change_runs to authenticated, service_role;
