-- Wysker Watch — access-control tightening (spec 0083; punch list PA-73,
-- PA-25, PA-24)
--
-- Bugs:
--   * PA-73 (P0): any signed-in user could set their own pet's photo_path to
--     any string, including the path of someone else's private upload (a vet
--     document, say). The pet-photo storage rule (0054) then let them open
--     that file, and deleting the pet made delete-pet remove "its photo"
--     with the service role.
--   * PA-25: on the 12 record tables below, created_by ("entered by") was
--     whatever the client sent, on insert and on update. Anyone could log a
--     record as a co-owner or rewrite who entered an old one.
--   * PA-24: a co-owner could change pets.created_by (make anyone, even a
--     stranger, the primary owner) and could delete the pet directly,
--     skipping delete-pet's hand-off and file cleanup. An owner could also
--     change pet_sits.created_by, which moves a sitter's access window onto
--     another person's calendar (0057).
--
-- Fix:
--   1. protect_pet_photo_path(): before insert/update on pets. For signed-in
--      users (auth.role() = 'authenticated') a NEW or CHANGED photo_path must
--      be null, start with 'shared/', or be exactly one file in the caller's
--      own folder ('<auth.uid()>/<name>', no further '/', not '.' or '..').
--      Leaving photo_path unchanged on update is always allowed (so a
--      co-owner can edit a pet whose photo another owner uploaded).
--   2. protect_record_creator(): before update on pets and pet_sits. Nobody
--      but the service role (and no-JWT contexts: migrations, the dashboard,
--      GoTrue) may change created_by. transfer_pet_ownership() and
--      prepare_account_deletion() (0058) run as the service role.
--   3. stamp_record_author(): before insert/update on each FR5 table that
--      exists (to_regclass skip, like 0058; spec 0081 may already have
--      dropped symptom_logs, wellness_scores and food_logs). For signed-in
--      users only: on insert created_by := auth.uid(), on update
--      created_by := old.created_by. pet_co_owners and pet_documents are not
--      touched.
--   4. pets_delete_owner is dropped and not replaced: no signed-in user can
--      delete a pets row directly. delete-pet, delete-account and
--      reset-sandbox-account use the service role.
--   5. All three trigger functions are security definer, search_path =
--      public, with execute revoked from public, anon and authenticated
--      (0059's locked-by-default rule). 0059's "nothing left open" check is
--      re-run at the end.
--
-- Null auth.role(): migrations, the dashboard SQL editor and GoTrue's
-- account-deletion cascade (0058's ON DELETE SET NULL on created_by) run with
-- no JWT, so auth.role() is null. Every check below treats null as "not
-- limited": the photo and author checks only act when the role IS
-- 'authenticated', and the created_by lock only acts when the role is
-- non-null and not 'service_role'. So the SET NULL cascade still clears
-- authors, and the service role's hand-off still moves created_by.
--
-- Who can see/do what after this:
--   * Signed-in users can no longer point a pet's photo at a file outside
--     their own upload folder (or the shared demo photos). Unchanged photos
--     are unaffected. Service role is unaffected.
--   * Signed-in users can no longer choose or change "entered by" on the
--     FR5 record tables; the database sets it to the inserter and keeps the
--     original author on every update.
--   * Owners and co-owners can no longer change pets.created_by or
--     pet_sits.created_by. Only the service role's routines can.
--   * Owners and co-owners can no longer delete a pets row directly; only
--     the service-role functions (delete-pet etc.) can.
--   * Nobody gains any access. No existing rows are changed.
--
-- Pre-check (Rollout step 1): on wysker-watch-dev, 2026-11-24, 3 pets have a
-- photo_path and 0 of them point outside the folder of the pet's creator or
-- a linked co-owner. Staging and prod are to be
-- checked with the same read-only query before this migration is pushed
-- there; the count is reported to Lynn. This migration changes no existing
-- rows, so a non-zero count does not block it (existing values stay as they
-- are and are only checked when changed).
--
-- Undo plan: a follow-up migration that runs
--   drop trigger if exists protect_pet_photo_path on public.pets;
--   drop trigger if exists protect_record_creator on public.pets;
--   drop trigger if exists protect_record_creator on public.pet_sits;
--   -- for each FR5 table that exists:
--   drop trigger if exists stamp_record_author on public.<table>;
--   drop function if exists public.protect_pet_photo_path();
--   drop function if exists public.protect_record_creator();
--   drop function if exists public.stamp_record_author();
--   create policy "pets_delete_owner" on public.pets
--     for delete using (public.is_pet_owner(id, auth.uid()));
-- and removes the three names from function_permissions.test.ts. No data
-- needs restoring.

-- ── 1. Pet photo path (FR1, FR2) ───────────────────────────────────────────
create or replace function public.protect_pet_photo_path()
returns trigger as $$
declare
  v_uid text;
  v_name text;
begin
  if auth.role() = 'authenticated'
     and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path)
     and new.photo_path is not null
     and left(new.photo_path, 7) <> 'shared/'
  then
    v_uid := auth.uid()::text;
    v_name := substr(new.photo_path, length(v_uid) + 2);
    if v_uid is null
       or left(new.photo_path, length(v_uid) + 1) <> v_uid || '/'
       or v_name = ''
       or v_name in ('.', '..')
       or position('/' in v_name) > 0
    then
      raise exception 'photo must be one of your own uploads';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists protect_pet_photo_path on public.pets;
create trigger protect_pet_photo_path
  before insert or update on public.pets
  for each row execute procedure public.protect_pet_photo_path();

-- ── 2. created_by lock on pets and pet_sits (FR8) ──────────────────────────
-- Same shape as protect_privileged_profile_fields() (0057). auth.role() is
-- checked for null explicitly so no-JWT contexts are never limited.
create or replace function public.protect_record_creator()
returns trigger as $$
begin
  if auth.role() is not null
     and auth.role() <> 'service_role'
     and new.created_by is distinct from old.created_by
  then
    raise exception 'created_by can only be changed by an administrative process';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists protect_record_creator on public.pets;
create trigger protect_record_creator
  before update on public.pets
  for each row execute procedure public.protect_record_creator();

drop trigger if exists protect_record_creator on public.pet_sits;
create trigger protect_record_creator
  before update on public.pet_sits
  for each row execute procedure public.protect_record_creator();

-- ── 3. "Entered by" stamping (FR5, FR6) ────────────────────────────────────
create or replace function public.stamp_record_author()
returns trigger as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    else
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'daily_check_ins', 'observations', 'vaccinations', 'medications',
    'bloodwork', 'food_logs', 'pet_foods', 'pet_baselines', 'pet_onboarding',
    'symptom_logs', 'wellness_scores', 'pet_sit_logs'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'spec 0083: table public.% not found, skipped', t;
      continue;
    end if;
    execute format('drop trigger if exists stamp_record_author on public.%I', t);
    execute format(
      'create trigger stamp_record_author before insert or update on public.%I '
      'for each row execute procedure public.stamp_record_author()',
      t
    );
  end loop;
end
$$;

-- ── 4. No direct pet deletion by signed-in users (FR7) ─────────────────────
drop policy if exists "pets_delete_owner" on public.pets;

-- ── 5. Lock the new functions (0059 rules) ─────────────────────────────────
revoke execute on function public.protect_pet_photo_path() from public, anon, authenticated;
revoke execute on function public.protect_record_creator() from public, anon, authenticated;
revoke execute on function public.stamp_record_author() from public, anon, authenticated;

-- Re-run 0059's "nothing in public may be left open to anon or PUBLIC" check.
do $$
declare
  leftover text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into leftover
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass
                      and d.objid = p.oid and d.deptype = 'e')
    and (has_function_privilege('anon', p.oid, 'execute')
         or p.proacl is null);
  if leftover is not null then
    raise exception 'spec 0083: functions still runnable by anon/PUBLIC: %', leftover;
  end if;
end
$$;
