-- Keep the household's freeform/manual shopping document permanently separate
-- from the replaceable document generated from selected planning days.
--
-- Additive only: existing `content` is deliberately left byte-for-byte intact
-- and becomes the "Zelf toegevoegd" section. Future planner generations write
-- only `generated_content` (the "Uit je planning" section).

alter table public.shopping_doc
  add column if not exists generated_content jsonb;

comment on column public.shopping_doc.content is
  'Permanent freeform shopping document edited under Zelf toegevoegd.';

comment on column public.shopping_doc.generated_content is
  'Replaceable shopping document generated from selected planning days.';
