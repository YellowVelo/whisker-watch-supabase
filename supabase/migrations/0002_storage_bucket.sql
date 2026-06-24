-- Whisker Watch — storage bucket for pet photos and document scans
-- (vaccine records, bloodwork reports). Replaces Base44's UploadFile.

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

-- Anyone can read (bucket is public — needed so photo_url/file_url
-- values work as plain <img src> URLs and so the ask-vet-assistant
-- Edge Function can fetch them for vision/document analysis).
create policy "uploads_public_read"
on storage.objects for select
using (bucket_id = 'uploads');

-- Only authenticated users can upload, and only into a folder named
-- after their own user id (path convention: "{user_id}/filename.ext"),
-- enforced by checking the first path segment against auth.uid().
create policy "uploads_insert_own_folder"
on storage.objects for insert
with check (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "uploads_update_own_folder"
on storage.objects for update
using (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "uploads_delete_own_folder"
on storage.objects for delete
using (
  bucket_id = 'uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);
