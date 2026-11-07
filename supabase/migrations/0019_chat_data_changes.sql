-- Journal of data changes made through the chat (approved by the user).
-- Additive only. Each row holds, per touched row, its state before and after
-- the change, so the change can be undone without losing later edits.
create table if not exists public.chat_data_changes (
  id            uuid primary key default gen_random_uuid(),
  requested_by  text not null,
  title         text not null,
  ops           jsonb not null,
  status        text not null default 'applying'
                check (status in ('applying','applied','failed','rolled_back','undone')),
  summary       text,
  error         text,
  -- Full copy of the household tables taken before the change; cleared once
  -- `changes` holds the exact before/after rows.
  snapshot      jsonb,
  changes       jsonb,
  undo_changes  jsonb,
  undone_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists chat_data_changes_created_idx on public.chat_data_changes(created_at desc);

alter table public.chat_data_changes enable row level security;
drop policy if exists chat_data_changes_household_all on public.chat_data_changes;
create policy chat_data_changes_household_all on public.chat_data_changes
  for all to authenticated using (true) with check (true);
grant all on public.chat_data_changes to authenticated, service_role;
