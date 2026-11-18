-- Wysker Watch — Private uploads, Phase 1 (spec 0071, punch list PA-01)
--
-- Additive only: nothing a currently-live frontend relies on is removed
-- here. Phase 2 (0055) makes the bucket private, drops the public-read
-- rule and drops pets.photo_url, and must only run on an environment
-- AFTER that environment's frontend is on the spec-0071 build.
--
-- 1. pets.photo_path — the storage location of the pet's photo, replacing
--    the full public URL in pets.photo_url. Backfilled here; 0055 backfills
--    again to catch photos the old frontend uploads in between.
-- 2. pet_documents — one row per (scanned file, pet). Ties a scan to the
--    pet(s) it belongs to so a future feature can find it, and so the
--    storage read rule can tell which pet a file belongs to.
-- 3. uploads_read_permitted — the new read rule, added NEXT TO the old
--    public one for now.
-- 4. Bucket size cap + file-type allowlist (affects new uploads only).
-- 5. observations.photo_url dropped (dead since 2026-07-05; no UI ever set
--    or showed it), with save_daily_check_ins re-created without it.

-- 1. pets.photo_path ------------------------------------------------------
alter table public.pets add column if not exists photo_path text;

update public.pets
set photo_path = substring(photo_url from '/object/public/uploads/(.+)$')
where photo_path is null
  and photo_url like '%/object/public/uploads/%';

create index if not exists pets_photo_path_idx on public.pets (photo_path);

-- 2. pet_documents ----------------------------------------------------------
create table if not exists public.pet_documents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('vaccination', 'bloodwork', 'medication')),
  -- Keep the record, clear the name, if the uploader deletes their
  -- account (same direction as punch list PA-06).
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (pet_id, storage_path)
);

create index if not exists pet_documents_storage_path_idx on public.pet_documents (storage_path);

alter table public.pet_documents enable row level security;

-- Owners and co-owners only. Sitters never see scanned documents (they
-- usually carry the owner's name, address and phone number).
create policy "pet_documents_select_owner"
on public.pet_documents for select
to authenticated
using (public.is_pet_owner(pet_id, auth.uid()));

-- You can only link a file you uploaded yourself (it lives in your own
-- folder) to a pet you own.
create policy "pet_documents_insert_owner_own_file"
on public.pet_documents for insert
to authenticated
with check (
  public.is_pet_owner(pet_id, auth.uid())
  and (storage.foldername(storage_path))[1] = auth.uid()::text
  and uploaded_by = auth.uid()
);

create policy "pet_documents_delete_owner"
on public.pet_documents for delete
to authenticated
using (public.is_pet_owner(pet_id, auth.uid()));

-- No update policy: a link is created or removed, never edited.
revoke all on public.pet_documents from anon;
grant select, insert, delete on public.pet_documents to authenticated;

-- 3. New storage read rule ---------------------------------------------------
-- NOTE: inside the subqueries, the file's name MUST be written as
-- objects.name. A bare "name" would silently resolve to pets.name (the
-- pet's name) and the rule would never match.
drop policy if exists "uploads_read_permitted" on storage.objects;
create policy "uploads_read_permitted"
on storage.objects for select
to authenticated
using (
  bucket_id = 'uploads'
  and (
    -- your own uploads
    (storage.foldername(objects.name))[1] = auth.uid()::text
    -- the stock demo photos
    or (storage.foldername(objects.name))[1] = 'shared'
    -- a pet photo, for that pet's owners, co-owners and sitters
    or exists (
      select 1 from public.pets p
      where p.photo_path = objects.name
        and (public.is_pet_owner(p.id, auth.uid()) or public.is_pet_sitter(p.id, auth.uid()))
    )
    -- a scanned document, for that pet's owners and co-owners only
    or exists (
      select 1 from public.pet_documents d
      where d.storage_path = objects.name
        and public.is_pet_owner(d.pet_id, auth.uid())
    )
  )
);

-- 4. Upload limits -----------------------------------------------------------
-- 10 MB; the image types the AI can read, plus PDF. Scan photos have a
-- lower 5 MB limit (the AI's own image limit), enforced in the app and in
-- ask-vet-assistant, not here, because a pet photo may be up to 10 MB.
update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
where id = 'uploads';

-- 5. Drop observations.photo_url --------------------------------------------
-- Same body as 0046, minus photo_url in the insert, select and recordset
-- column lists. jsonb_to_recordset ignores keys it isn't asked for, so a
-- still-live old frontend that sends "photo_url": null keeps saving fine.
create or replace function public.save_daily_check_ins(payloads jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  day jsonb;
  v_checkin_id uuid;
  v_check_conflict boolean;
  v_expected_updated_at timestamptz;
  v_existing_id uuid;
  v_existing_updated_at timestamptz;
  v_pet_id uuid;
  v_check_in_date date;
  v_result jsonb := '[]'::jsonb;
  v_day_result jsonb;
begin
  for day in select * from jsonb_array_elements(payloads)
  loop
    v_pet_id := (day->>'pet_id')::uuid;
    v_check_in_date := (day->>'check_in_date')::date;
    v_check_conflict := day ? 'expected_updated_at';
    v_expected_updated_at := nullif(day->>'expected_updated_at', '')::timestamptz;
    v_existing_id := null;
    v_existing_updated_at := null;

    if v_check_conflict then
      perform pg_advisory_xact_lock(hashtext(v_pet_id::text || v_check_in_date::text));

      select id, updated_at into v_existing_id, v_existing_updated_at
      from public.daily_check_ins
      where pet_id = v_pet_id and check_in_date = v_check_in_date;

      if (v_existing_id is not null and (v_expected_updated_at is null or v_existing_updated_at <> v_expected_updated_at))
         or (v_existing_id is null and v_expected_updated_at is not null) then
        select jsonb_build_object(
          'conflict', true,
          'check_in', to_jsonb(dc),
          'observations', coalesce((select jsonb_agg(to_jsonb(o)) from public.observations o where o.daily_check_in_id = dc.id), '[]'::jsonb)
        ) into v_day_result
        from public.daily_check_ins dc where dc.id = v_existing_id;

        v_result := v_result || jsonb_build_array(v_day_result);
        continue;
      end if;
    end if;

    insert into public.daily_check_ins (
      pet_id, check_in_date, status, symptom_count, completed_at, source, created_by
    )
    values (
      v_pet_id,
      v_check_in_date,
      day->>'status',
      nullif(day->>'symptom_count', '')::int,
      (day->>'completed_at')::timestamptz,
      day->>'source',
      auth.uid()
    )
    on conflict (pet_id, check_in_date) do update set
      status = excluded.status,
      symptom_count = excluded.symptom_count,
      completed_at = excluded.completed_at,
      source = excluded.source
    returning id into v_checkin_id;

    delete from public.observations where daily_check_in_id = v_checkin_id;

    insert into public.observations (
      pet_id, daily_check_in_id, observation_type_id, value, numeric_value, notes, observed_at, created_by
    )
    select
      v_pet_id,
      v_checkin_id,
      o.observation_type_id,
      o.value,
      o.numeric_value,
      o.notes,
      now(),
      auth.uid()
    from jsonb_to_recordset(coalesce(day->'observations', '[]'::jsonb)) as o(
      observation_type_id uuid, value text, numeric_value numeric, notes text
    );

    select jsonb_build_object('conflict', false, 'check_in', to_jsonb(dc)) into v_day_result
    from public.daily_check_ins dc where dc.id = v_checkin_id;

    v_result := v_result || jsonb_build_array(v_day_result);
  end loop;

  return v_result;
end;
$function$;

grant execute on function public.save_daily_check_ins(jsonb) to authenticated;

alter table public.observations drop column if exists photo_url;
