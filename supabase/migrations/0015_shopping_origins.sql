-- Remember where every generated shopping line came from, so the
-- boodschappenlijstje can show "600 gram gehakt = 200 from Tuesday's Opgevulde
-- tomaten + 400 from Saturday's Balletjes in tomatensaus".
--
-- Additive only: a nullable jsonb column beside the existing documents. Older
-- generated lists simply have no origins and render without the (i) icon, and
-- the manual document is untouched.

alter table public.shopping_doc
  add column if not exists generated_origins jsonb;

comment on column public.shopping_doc.generated_origins is
  'Per-line provenance for generated_content: which planned meals contributed how much, and on which day.';
