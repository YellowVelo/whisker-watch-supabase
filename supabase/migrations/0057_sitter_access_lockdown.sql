-- Wysker Watch — sitter access lockdown (spec 0073; punch list PA-03, PA-04,
-- PA-26, PA-27 and the sitter-function part of PA-05)
--
-- Bugs:
--   * PA-03 (0068 P0-3): pet_sits and pet_sitter_access inserts passed if the
--     caller created the sit OR owned ANY pet in it, and an invite could
--     arrive with sitter_user_id already set. So anyone could build a sit
--     around someone else's pet (alone, or mixed with one of their own) and
--     make themselves its sitter, gaining read access to that pet.
--   * PA-04 (0069 P0-1): is_pet_sitter()/is_pet_sit_sitter() never looked at
--     the sit's dates, so a sitter kept access forever.
--   * PA-26 (0069 P2): a checklist entry could name a pet outside its sit.
--   * PA-27 (0069 P2): pet_sitter_access's select matched sitter_email
--     against profiles.email, which users could edit.
--   * PA-05 part (0069 P2): the two sitter checks answered for ANY user ID,
--     even to logged-out callers.
--
-- Fix:
--   * Writes to a sit, its sitter invites and its checklist require the
--     caller to own (or co-own) EVERY pet in the sit. A sit must list at
--     least one pet.
--   * A new invite never arrives linked: only claim_pending_sitter_invites()
--     (0028) may set sitter_user_id. No update policy on pet_sitter_access
--     (nothing in the app updates it).
--   * Sitter access is open from the day before the sit starts through the
--     day after it ends, by the OWNER's calendar (time zone saved on the
--     profile of the sit's created_by; UTC if none) — Lynn, 2026-11-20.
--     One helper, pet_sit_is_open(), holds that rule so is_pet_sitter() and
--     is_pet_sit_sitter() can never disagree (if they did, Pets.jsx could see
--     a pet without its sit and file it under "My Pets").
--   * is_pet_sitter()/is_pet_sit_sitter() keep their names and parameters
--     (five policies plus 0054's storage rule call them, unchanged) but now
--     answer only about the caller.
--   * Invites match the caller's login email (auth.jwt()), and
--     profiles.email can no longer be changed outside the service role.
--
-- Pre-fix check (spec 0073 AC13), run read-only 2026-11-20 on all three
-- projects before this migration: dev 5 sits / 5 invites / 0 checklist rows,
-- staging and prod 0 / 0 / 0; nothing flagged anywhere. Live policies on all
-- three matched 0004/0030 exactly; all were on migration 0056. Prod's
-- is_pet_sitter/is_pet_sit_sitter differ from dev's only in line endings
-- (CRLF). Query:
--
--   select 'sit' kind, ps.id from public.pet_sits ps
--   where cardinality(ps.pet_ids) = 0
--      or exists (select 1 from unnest(ps.pet_ids) pid
--                 where not public.is_pet_owner(pid, ps.created_by))
--   union all
--   select 'invite', psa.id from public.pet_sitter_access psa
--   join public.pet_sits ps on ps.id = psa.pet_sit_id
--   left join auth.users u on u.id = psa.sitter_user_id
--   where exists (select 1 from unnest(ps.pet_ids) pid
--                 where not public.is_pet_owner(pid, psa.owner_id))
--      or (psa.sitter_user_id is not null
--          and lower(u.email) is distinct from lower(psa.sitter_email))
--   union all
--   select 'checklist', l.id from public.pet_sit_logs l
--   join public.pet_sits ps on ps.id = l.pet_sit_id
--   where not (l.pet_id = any(ps.pet_ids))
--   union all
--   select 'profile', p.id from public.profiles p
--   join auth.users u on u.id = p.id
--   where lower(p.email) is distinct from lower(u.email);

-- ============================================================
-- Helpers. Same build as is_pet_owner() (0004): SECURITY DEFINER + fixed
-- search_path, so they can read pet_sits/profiles without looping back into
-- the access rules (0030 explains the pet_sits <-> pet_sitter_access loop).
-- New functions are executable by PUBLIC by default (PA-05's lesson), so
-- that grant is revoked explicitly.
-- ============================================================

-- Does the caller own (or co-own) every pet in this list? An empty list
-- never counts.
create or replace function public.caller_owns_every_pet(p_pet_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cardinality(p_pet_ids), 0) > 0
    and not exists (
      select 1 from unnest(p_pet_ids) pid
      where not public.is_pet_owner(pid, auth.uid())
    );
$$;

-- Does the caller own every pet in this sit?
create or replace function public.caller_owns_pet_sit(p_pet_sit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.caller_owns_every_pet(ps.pet_ids)
     from public.pet_sits ps where ps.id = p_pet_sit_id),
    false
  );
$$;

-- Is this pet part of this sit?
create or replace function public.pet_in_sit(p_pet_sit_id uuid, p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pet_sits ps
    where ps.id = p_pet_sit_id and p_pet_id = any(ps.pet_ids)
  );
$$;

-- Is this sit's sitter window open right now? The window runs from the day
-- before start_date through the day after end_date, counted on the calendar
-- of the sit's owner (the time zone saved on created_by's profile, or UTC
-- when none is saved). The sitter's own time zone setting never matters.
create or replace function public.pet_sit_is_open(p_pet_sit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (now() at time zone coalesce(pr.timezone, 'UTC'))::date
             between ps.start_date - 1 and ps.end_date + 1
    from public.pet_sits ps
    left join public.profiles pr on pr.id = ps.created_by
    where ps.id = p_pet_sit_id
  ), false);
$$;


revoke execute on function public.caller_owns_every_pet(uuid[]) from public, anon;
revoke execute on function public.caller_owns_pet_sit(uuid) from public, anon;
revoke execute on function public.pet_in_sit(uuid, uuid) from public, anon;
revoke execute on function public.pet_sit_is_open(uuid) from public, anon;
grant execute on function public.caller_owns_every_pet(uuid[]) to authenticated;
grant execute on function public.caller_owns_pet_sit(uuid) to authenticated;
grant execute on function public.pet_in_sit(uuid, uuid) to authenticated;
grant execute on function public.pet_sit_is_open(uuid) to authenticated;

-- ============================================================
-- The two sitter checks: same names and parameters as 0030/0031, so every
-- policy that calls them keeps working unchanged. They now answer only
-- about the caller (false for anyone else, and for logged-out callers,
-- whose auth.uid() is null), and only while the sit's window is open.
-- ============================================================
create or replace function public.is_pet_sitter(p_pet_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_user_id = auth.uid(), false)
    and exists (
      select 1
      from public.pet_sitter_access psa
      join public.pet_sits ps on ps.id = psa.pet_sit_id
      where psa.sitter_user_id = p_user_id
        and p_pet_id = any(ps.pet_ids)
        and public.pet_sit_is_open(ps.id)
    );
$$;

create or replace function public.is_pet_sit_sitter(p_pet_sit_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_user_id = auth.uid(), false)
    and exists (
      select 1 from public.pet_sitter_access psa
      where psa.pet_sit_id = p_pet_sit_id
        and psa.sitter_user_id = p_user_id
    )
    and public.pet_sit_is_open(p_pet_sit_id);
$$;

-- ============================================================
-- pet_sits (0004). pet_sits_select_sitter (0030) stays; it is now windowed
-- through is_pet_sit_sitter(). The bare "created_by = me" shortcut is gone.
-- ============================================================
drop policy "pet_sits_select_owner" on public.pet_sits;
drop policy "pet_sits_insert_owner" on public.pet_sits;
drop policy "pet_sits_update_owner" on public.pet_sits;
drop policy "pet_sits_delete_owner" on public.pet_sits;

create policy "pet_sits_select_any_owner" on public.pet_sits
  for select to authenticated using (
    exists (select 1 from unnest(pet_ids) pid where public.is_pet_owner(pid, auth.uid()))
  );
create policy "pet_sits_insert_every_owner" on public.pet_sits
  for insert to authenticated with check (
    auth.uid() = created_by
    and public.caller_owns_every_pet(pet_ids)
  );
-- WITH CHECK too: 0004's update had none, so an edit could add someone
-- else's pet to a sit.
create policy "pet_sits_update_every_owner" on public.pet_sits
  for update to authenticated
  using (public.caller_owns_every_pet(pet_ids))
  with check (public.caller_owns_every_pet(pet_ids));
create policy "pet_sits_delete_every_owner" on public.pet_sits
  for delete to authenticated using (public.caller_owns_every_pet(pet_ids));

-- ============================================================
-- pet_sitter_access (0004). No update policy, deliberately.
-- ============================================================
drop policy "pet_sitter_access_select_owner_or_sitter" on public.pet_sitter_access;
drop policy "pet_sitter_access_insert_owner" on public.pet_sitter_access;
drop policy "pet_sitter_access_update_owner" on public.pet_sitter_access;
drop policy "pet_sitter_access_delete_owner" on public.pet_sitter_access;

create policy "pet_sitter_access_select_sitter_or_owner" on public.pet_sitter_access
  for select to authenticated using (
    auth.uid() = sitter_user_id
    -- the login email, never the editable profiles.email (PA-27)
    or lower(sitter_email) = lower(auth.jwt() ->> 'email')
    or public.caller_owns_pet_sit(pet_sit_id)
  );
create policy "pet_sitter_access_insert_every_owner" on public.pet_sitter_access
  for insert to authenticated with check (
    public.caller_owns_pet_sit(pet_sit_id)
    and auth.uid() = owner_id
    and auth.uid() = created_by
    -- A new invite never arrives linked: only
    -- claim_pending_sitter_invites() (0028) may set sitter_user_id.
    and sitter_user_id is null
  );
create policy "pet_sitter_access_delete_every_owner" on public.pet_sitter_access
  for delete to authenticated using (public.caller_owns_pet_sit(pet_sit_id));

-- ============================================================
-- pet_sit_logs (0004). Update/delete stay owner-only (the sitter side of the
-- checklist is PA-60).
-- ============================================================
drop policy "pet_sit_logs_select_owner_or_sitter" on public.pet_sit_logs;
drop policy "pet_sit_logs_insert_owner_or_sitter" on public.pet_sit_logs;

create policy "pet_sit_logs_select_owner_or_open_sitter" on public.pet_sit_logs
  for select to authenticated using (
    public.is_pet_owner(pet_id, auth.uid())
    or public.is_pet_sit_sitter(pet_sit_id, auth.uid())
  );
create policy "pet_sit_logs_insert_pet_in_sit" on public.pet_sit_logs
  for insert to authenticated with check (
    public.pet_in_sit(pet_sit_id, pet_id)
    and (
      public.caller_owns_pet_sit(pet_sit_id)
      or public.is_pet_sit_sitter(pet_sit_id, auth.uid())
    )
  );

-- ============================================================
-- profiles.email is a copy of the login email, written once by
-- handle_new_user(). Nothing in the app changes it; now nothing outside the
-- service role can (PA-27). Same trigger as 0011, one more column.
-- ============================================================
create or replace function public.protect_privileged_profile_fields()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    if new.account_type is distinct from old.account_type then
      raise exception 'account_type can only be changed by an administrative process';
    end if;
    if new.role is distinct from old.role then
      raise exception 'role can only be changed by an administrative process';
    end if;
    if new.email is distinct from old.email then
      raise exception 'email can only be changed by an administrative process';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
