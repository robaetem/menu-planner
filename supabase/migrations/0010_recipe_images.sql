-- Recipe images.
-- Files live in Supabase Storage; recipes only keep the object path.

alter table public.recipes
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'recipe_images_select_public'
  ) then
    create policy recipe_images_select_public on storage.objects
      for select to public
      using (bucket_id = 'recipe-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'recipe_images_insert_authenticated'
  ) then
    create policy recipe_images_insert_authenticated on storage.objects
      for insert to authenticated
      with check (bucket_id = 'recipe-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'recipe_images_update_authenticated'
  ) then
    create policy recipe_images_update_authenticated on storage.objects
      for update to authenticated
      using (bucket_id = 'recipe-images')
      with check (bucket_id = 'recipe-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'recipe_images_delete_authenticated'
  ) then
    create policy recipe_images_delete_authenticated on storage.objects
      for delete to authenticated
      using (bucket_id = 'recipe-images');
  end if;
end $$;
