-- Restore production's storage.objects RLS policies (spec 0063).
-- Production's migration history claims 0002_storage_bucket.sql already
-- ran, but the policies it creates were found missing when checked
-- directly — something outside the migration system removed them.
-- Each policy is dropped first since Postgres has no
-- "create policy if not exists", making this safe to re-run anywhere,
-- including dev/staging where the policies already exist correctly.

drop policy if exists "uploads_public_read" on storage.objects;
create policy "uploads_public_read"
on storage.objects for select
using (bucket_id = 'uploads');

drop policy if exists "uploads_insert_own_folder" on storage.objects;
create policy "uploads_insert_own_folder"
on storage.objects for insert
with check (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "uploads_update_own_folder" on storage.objects;
create policy "uploads_update_own_folder"
on storage.objects for update
using (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "uploads_delete_own_folder" on storage.objects;
create policy "uploads_delete_own_folder"
on storage.objects for delete
using (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
