-- Wysker Watch — account deletion data safety (spec 0075, punch list
-- PA-06, PA-07, PA-14)
--
-- Bugs (spec 0068 P0-5, P0-6, P1-5; one more found in spec 0075):
--   * Every record table's created_by was "on delete cascade" to
--     auth.users, so deleting an account erased every check-in,
--     observation, vaccination etc. that person had entered on a pet
--     someone else still owns.
--   * pet_co_owners.created_by (who sent the invite) was also cascade, so
--     when a primary owner left, every co-owner invite they had sent went
--     with them: the other co-owners lost access even after delete-account
--     repointed owner_id.
--   * delete-account deleted every pet_co_owners row the leaving owner had
--     sent, deleted every file in their folder (including the transferred
--     pet's photo and documents), only saw the first 100 files, and could
--     stop halfway with pets already transferred.
--   * Pet sits and sitter invites the leaving person set up were deleted
--     with them, even for pets that survive.
--   * A sitter who deleted their account left their invite row behind
--     (sitter_user_id set null), and re-registering with the same email
--     brought the access back via claim_pending_sitter_invites().
--
-- Fix:
--   1. created_by -> ON DELETE SET NULL (and nullable) on every record
--      table and on pet_co_owners. Records belong to the pet.
--   2. pet_sitter_access.sitter_user_id -> ON DELETE CASCADE.
--   3. transfer_pet_ownership(): the one "pass this pet to a co-owner"
--      routine, used by both delete-pet and delete-account.
--   4. prepare_account_deletion(): every database step of deleting an
--      account, in one all-or-nothing transaction, safe to run twice.
--      Returns the storage files to delete. delete-account then deletes
--      those files and the login.
--
-- Both new functions are server-only (service role). New functions are
-- executable by PUBLIC by default (PA-05's lesson), so that is revoked.
--
-- Foreign keys are found by catalog lookup, not by assumed name, because
-- production's real state has drifted from migration history before
-- (0052/0063).
--
-- Pre-check (read-only, each project, before this migration; spec 0075):
--
--   select c.conrelid::regclass as tbl, a.attname as col, c.conname,
--          c.confdeltype  -- c = cascade, n = set null
--   from pg_constraint c
--   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
--   where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
--     and c.connamespace = 'public'::regnamespace
--   order by 1, 2;
--
--   select count(*) from public.pet_co_owners where created_by is distinct from owner_id;

-- ============================================================
-- 1 + 2. Foreign keys
-- ============================================================
do $$
declare
  t text;
  r record;
begin
  foreach t in array array[
    'daily_check_ins', 'observations', 'vaccinations', 'medications',
    'bloodwork', 'food_logs', 'pet_foods', 'pet_baselines', 'pet_onboarding',
    'symptom_logs', 'wellness_scores', 'pet_sit_logs', 'pet_co_owners'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'spec 0075: table public.% not found, skipped', t;
      continue;
    end if;

    for r in
      select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f'
        and c.conrelid = ('public.' || t)::regclass
        and c.confrelid = 'auth.users'::regclass
        and a.attname = 'created_by'
    loop
      execute format('alter table public.%I drop constraint %I', t, r.conname);
    end loop;

    execute format('alter table public.%I alter column created_by drop not null', t);
    execute format(
      'alter table public.%I add constraint %I foreign key (created_by) references auth.users(id) on delete set null',
      t, t || '_created_by_fkey'
    );
  end loop;

  for r in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.conrelid = 'public.pet_sitter_access'::regclass
      and c.confrelid = 'auth.users'::regclass
      and a.attname = 'sitter_user_id'
  loop
    execute format('alter table public.pet_sitter_access drop constraint %I', r.conname);
  end loop;
  alter table public.pet_sitter_access
    add constraint pet_sitter_access_sitter_user_id_fkey
    foreign key (sitter_user_id) references auth.users(id) on delete cascade;
end $$;

-- ============================================================
-- Internal helpers (server-only)
-- ============================================================

-- Is p_user an owner (primary or linked co-owner) of p_pet? Deliberately
-- not is_pet_owner(): PA-05 may make that answer only about the caller,
-- and these server-side routines ask about other people.
create or replace function public.deletion_user_owns_pet(p_pet_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.pets where id = p_pet_id and created_by = p_user_id)
      or exists (select 1 from public.pet_co_owners
                 where pet_id = p_pet_id and co_owner_user_id = p_user_id);
$$;

-- The name shown to other people in notifications: first name, else the
-- login email, else a fallback.
create or replace function public.deletion_display_name(p_user_id uuid, p_fallback text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif((select first_name from public.profiles where id = p_user_id), ''),
    (select email from auth.users where id = p_user_id),
    p_fallback
  );
$$;

-- "Mittens and Biscuit (Dec 1 – Dec 8)" for notification text.
create or replace function public.deletion_sit_label(p_pet_sit_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(string_agg(p.name, ' and ' order by p.name), 'your pets')
         || ' (' || to_char(ps.start_date, 'Mon FMDD') || ' – ' || to_char(ps.end_date, 'Mon FMDD') || ')'
  from public.pet_sits ps
  left join public.pets p on p.id = any(ps.pet_ids)
  where ps.id = p_pet_sit_id
  group by ps.start_date, ps.end_date;
$$;

-- Hand a sit and all its sitter invites to a new owner.
create or replace function public.deletion_hand_over_sit(p_pet_sit_id uuid, p_new_owner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.pet_sits set created_by = p_new_owner where id = p_pet_sit_id;
  update public.pet_sitter_access
     set owner_id = p_new_owner, created_by = p_new_owner
   where pet_sit_id = p_pet_sit_id;
$$;

-- ============================================================
-- 3. transfer_pet_ownership
-- ============================================================
-- Passes p_pet_id from its primary owner p_from_user to the oldest linked
-- co-owner. Returns the new owner, or null if there is no linked
-- co-owner (nothing is changed then).
--
--   * Only the promoted co-owner's own pet_co_owners row is deleted.
--     Every other row (linked or still pending) is repointed to the new
--     owner, so the other co-owners keep access (spec 0068 P0-6).
--   * p_reason 'pet_removed' (delete-pet) or 'account_deleted'
--     (delete-account) picks the notification wording.
--   * p_handle_sits: delete-pet passes true. Each sit p_from_user created
--     that covers this pet passes to the new owner if the new owner owns
--     every pet in it; otherwise this pet is taken out of the sit (which
--     stays with p_from_user for their other pets) and the new owner is
--     told. delete-account passes false and sorts sits out itself, once
--     every pet has been dealt with.
create or replace function public.transfer_pet_ownership(
  p_pet_id uuid,
  p_from_user uuid,
  p_reason text,
  p_handle_sits boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pet record;
  v_new_owner uuid;
  v_promoted_row uuid;
  v_actor text;
  v_sit record;
  v_label text;
begin
  if p_reason not in ('pet_removed', 'account_deleted') then
    raise exception 'transfer_pet_ownership: unknown reason %', p_reason;
  end if;

  select id, name, created_by into v_pet
  from public.pets where id = p_pet_id for update;
  if not found or v_pet.created_by is distinct from p_from_user then
    return null;
  end if;

  select id, co_owner_user_id into v_promoted_row, v_new_owner
  from public.pet_co_owners
  where pet_id = p_pet_id
    and co_owner_user_id is not null
    and co_owner_user_id <> p_from_user
  order by created_at asc, id asc
  limit 1;

  if v_new_owner is null then
    return null;
  end if;

  update public.pets set created_by = v_new_owner where id = p_pet_id;
  delete from public.pet_co_owners where id = v_promoted_row;
  update public.pet_co_owners
     set owner_id = v_new_owner, created_by = v_new_owner
   where pet_id = p_pet_id;

  v_actor := public.deletion_display_name(p_from_user, 'A former co-owner');

  insert into public.notifications (user_id, type, message)
  values (
    v_new_owner,
    'ownership_transfer',
    case p_reason
      when 'account_deleted' then v_actor || ' deleted their account. You are now the primary owner of ' || v_pet.name || '.'
      else v_actor || ' removed ' || v_pet.name || ' from their account. You are now the primary owner.'
    end
  );

  if p_handle_sits then
    for v_sit in
      select id, pet_ids from public.pet_sits
      where created_by = p_from_user and p_pet_id = any(pet_ids)
      for update
    loop
      v_label := public.deletion_sit_label(v_sit.id);
      if not exists (
        select 1 from unnest(v_sit.pet_ids) pid
        where not public.deletion_user_owns_pet(pid, v_new_owner)
      ) then
        perform public.deletion_hand_over_sit(v_sit.id, v_new_owner);
        insert into public.notifications (user_id, type, message)
        values (v_new_owner, 'pet_sit_transferred',
                'You now manage the pet sit for ' || v_label || ', which ' || v_actor || ' set up.');
      else
        update public.pet_sits
           set pet_ids = array_remove(pet_ids, p_pet_id)
         where id = v_sit.id;
        insert into public.notifications (user_id, type, message)
        values (v_new_owner, 'pet_sit_pet_removed',
                v_pet.name || ' was taken out of the pet sit ' || v_actor || ' set up for ' || v_label
                || '. You can set up a new sit for ' || v_pet.name || ' anytime.');
      end if;
    end loop;
  end if;

  return v_new_owner;
end;
$$;

-- ============================================================
-- 4. prepare_account_deletion
-- ============================================================
-- Every database step of deleting p_user_id's account, as one
-- all-or-nothing transaction. Running it twice is safe: a second run
-- finds nothing left to transfer, hand over or notify about.
--
-- p_folder_paths: every file in the user's storage folder (delete-account
-- lists them, all pages). Returns { transferred_pet_ids, files_to_delete }.
-- files_to_delete = files in the folder, plus the photo and documents of
-- every pet that will be deleted with the account (wherever they live),
-- minus any file a surviving pet still uses, minus the shared demo photos.
create or replace function public.prepare_account_deletion(
  p_user_id uuid,
  p_folder_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
  v_email text;
  v_pet record;
  v_row record;
  v_sit record;
  v_transferred uuid[] := '{}';
  v_doomed uuid[];
  v_remaining uuid[];
  v_candidate uuid;
  v_label text;
  v_files text[];
begin
  if p_user_id is null then
    raise exception 'prepare_account_deletion: p_user_id is required';
  end if;

  v_actor := public.deletion_display_name(p_user_id, 'A former co-owner');
  select email into v_email from auth.users where id = p_user_id;

  -- a. Pets this user is the primary owner of: pass each to its oldest
  --    linked co-owner. Pets with no linked co-owner stay, and are deleted
  --    with the account.
  for v_pet in
    select id from public.pets where created_by = p_user_id order by created_at, id
  loop
    if public.transfer_pet_ownership(v_pet.id, p_user_id, 'account_deleted', false) is not null then
      v_transferred := v_transferred || v_pet.id;
    end if;
  end loop;

  select coalesce(array_agg(id), '{}') into v_doomed
  from public.pets where created_by = p_user_id;

  -- b. Pets this user co-owns: tell the primary owner, then remove the
  --    link (removing it here, not by cascade, is what makes a retry
  --    send no second notification).
  for v_row in
    select co.id, p.created_by as primary_owner, p.name
    from public.pet_co_owners co
    join public.pets p on p.id = co.pet_id
    where co.co_owner_user_id = p_user_id
  loop
    insert into public.notifications (user_id, type, message)
    values (v_row.primary_owner, 'co_owner_removed',
            v_actor || ' deleted their account and no longer has access to ' || v_row.name || '.');
    delete from public.pet_co_owners where id = v_row.id;
  end loop;

  -- Any co-owner row still naming this user as inviter/owner on a pet
  -- that survives: point it at the pet's primary owner.
  update public.pet_co_owners co
     set owner_id = p.created_by, created_by = p.created_by
    from public.pets p
   where p.id = co.pet_id
     and p.created_by <> p_user_id
     and (co.owner_id = p_user_id or co.created_by = p_user_id);

  -- c. Pet sits. First take pets that are about to be deleted out of every
  --    sit (pet_ids has no foreign key, so nothing else would).
  --    Only sits that include one of those pets are touched; a sit left
  --    with no pets is removed (its invites and checklist cascade).
  if cardinality(v_doomed) > 0 then
    delete from public.pet_sits
     where pet_ids && v_doomed and pet_ids <@ v_doomed;
    update public.pet_sits
       set pet_ids = array(select unnest(pet_ids) except select unnest(v_doomed))
     where pet_ids && v_doomed;
  end if;

  --    Then each sit this user set up: hand it to someone who owns every
  --    pet left in it (preferring the first pet's primary owner), or, if
  --    no one does, end it and tell the pets' owners.
  for v_sit in
    select id, pet_ids from public.pet_sits where created_by = p_user_id for update
  loop
    v_remaining := v_sit.pet_ids;
    v_label := public.deletion_sit_label(v_sit.id);

    select u into v_candidate
    from (
      select p.created_by as u, 0 as pref, null::timestamptz as since
      from public.pets p where p.id = v_remaining[1]
      union all
      select co.co_owner_user_id, 1, co.created_at
      from public.pet_co_owners co
      where co.pet_id = v_remaining[1] and co.co_owner_user_id is not null
    ) c
    where u is not null
      and u <> p_user_id
      and not exists (
        select 1 from unnest(v_remaining) pid
        where not public.deletion_user_owns_pet(pid, c.u)
      )
    order by pref, since nulls first
    limit 1;

    if v_candidate is not null then
      perform public.deletion_hand_over_sit(v_sit.id, v_candidate);
      insert into public.notifications (user_id, type, message)
      values (v_candidate, 'pet_sit_transferred',
              'You now manage the pet sit for ' || v_label || ', which ' || v_actor || ' set up.');
    else
      insert into public.notifications (user_id, type, message)
      select distinct p.created_by, 'pet_sit_cancelled',
             v_actor || ' deleted their account, so the pet sit they set up for ' || v_label
             || ' was cancelled. You can set up a new one anytime.'
      from public.pets p
      where p.id = any(v_remaining) and p.created_by <> p_user_id;
      delete from public.pet_sits where id = v_sit.id;
    end if;
  end loop;

  --    Sitter invites this user sent on a sit someone else owns: point
  --    them at the sit's owner, so they survive.
  update public.pet_sitter_access psa
     set owner_id = ps.created_by, created_by = ps.created_by
    from public.pet_sits ps
   where ps.id = psa.pet_sit_id
     and ps.created_by <> p_user_id
     and (psa.owner_id = p_user_id or psa.created_by = p_user_id);

  -- d. Signup lists (Lynn, spec 0075 decision 2A). Email logs and the
  --    do-not-email list are kept on purpose.
  if v_email is not null then
    delete from public.beta_signups where lower(email) = lower(v_email);
    delete from public.early_adopters where lower(email) = lower(v_email);
  end if;

  -- e. Files to delete.
  select coalesce(array_agg(distinct f), '{}') into v_files
  from (
    select unnest(coalesce(p_folder_paths, '{}')) as f
    union
    select photo_path from public.pets where id = any(v_doomed) and photo_path is not null
    union
    select storage_path from public.pet_documents where pet_id = any(v_doomed)
  ) candidates
  where f is not null
    and f not like 'shared/%'
    and not exists (
      select 1 from public.pets p
      where p.photo_path = candidates.f and not (p.id = any(v_doomed))
    )
    and not exists (
      select 1 from public.pet_documents d
      where d.storage_path = candidates.f and not (d.pet_id = any(v_doomed))
    );

  return jsonb_build_object(
    'transferred_pet_ids', to_jsonb(v_transferred),
    'files_to_delete', to_jsonb(v_files)
  );
end;
$$;

-- ============================================================
-- Server-only
-- ============================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.deletion_user_owns_pet(uuid, uuid)',
    'public.deletion_display_name(uuid, text)',
    'public.deletion_sit_label(uuid)',
    'public.deletion_hand_over_sit(uuid, uuid)',
    'public.transfer_pet_ownership(uuid, uuid, text, boolean)',
    'public.prepare_account_deletion(uuid, text[])'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
