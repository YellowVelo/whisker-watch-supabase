-- Wysker Watch — Private uploads, Phase 2 (spec 0071, punch list PA-01)
--
-- Locks the uploads bucket. Run on an environment ONLY after that
-- environment's frontend is on the spec-0071 build: before that, the live
-- screens still show photos through public links, which this removes.
--
-- SAFETY CHECK: `supabase db push` applies every pending migration at
-- once, so this one would otherwise go out together with 0054. It refuses
-- to run until the environment has been marked ready, by hand, after its
-- frontend was confirmed live (run in that project's SQL editor, or with
-- `supabase db query --linked`):
--
--   create schema if not exists private;
--   create table if not exists private.deploy_markers (key text primary key, created_at timestamptz not null default now());
--   revoke all on schema private from anon, authenticated;
--   insert into private.deploy_markers (key) values ('spec_0071_frontend_live');
--
-- (The table is created there, not only below, because a blocked run of
-- this file rolls back everything in it, including its own table.)
-- If a push reaches this file first, it fails here harmlessly: 0054 has
-- already applied in its own transaction, nothing below runs, and the next
-- push after the marker is set picks this up again.

create schema if not exists private;
create table if not exists private.deploy_markers (
  key text primary key,
  created_at timestamptz not null default now()
);
revoke all on schema private from anon, authenticated;
revoke all on private.deploy_markers from anon, authenticated;

do $$
begin
  if not exists (select 1 from private.deploy_markers where key = 'spec_0071_frontend_live') then
    raise exception 'Spec 0071 Phase 2 blocked: this environment''s frontend is not marked live yet. '
      'After confirming the spec-0071 build is live here, run the marker snippet '
      'in the header of 0055_private_uploads_phase2.sql, then push again.';
  end if;
end $$;

-- Catch photos the old frontend uploaded after 0054's backfill.
update public.pets
set photo_path = substring(photo_url from '/object/public/uploads/(.+)$')
where photo_path is null
  and photo_url like '%/object/public/uploads/%';

-- Refuse to drop photo_url if any photo link still couldn't be converted
-- (e.g. an outside URL): that would silently lose a real photo.
do $$
declare
  v_unconverted int;
begin
  select count(*) into v_unconverted from public.pets where photo_url is not null and photo_path is null;
  if v_unconverted > 0 then
    raise exception 'Spec 0071 Phase 2 blocked: % pet photo link(s) could not be converted to a storage path. Investigate before dropping pets.photo_url.', v_unconverted;
  end if;
end $$;

-- The two switches that make the bucket private. Both are needed: a
-- public bucket serves /object/public/ links without checking any rule.
update storage.buckets set public = false where id = 'uploads';
drop policy if exists "uploads_public_read" on storage.objects;

alter table public.pets drop column if exists photo_url;
