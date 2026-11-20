-- Wysker Watch — co-owner access lockdown (spec 0072, punch list PA-02)
--
-- Bug (spec 0068 P0-2): pet_co_owners_insert_owner_only only checked
-- auth.uid() = owner_id. Nothing required the inserter to own pet_id, and
-- nothing stopped them setting co_owner_user_id to themselves. Since
-- is_pet_owner() trusts any row with co_owner_user_id = user, any signed-in
-- user who knew a pet's ID could make themselves its co-owner, then edit or
-- delete the pet. The real owner couldn't see the row (select only showed
-- rows where they were owner_id or co_owner_user_id), and a removed
-- co-owner could simply add themselves back.
--
-- Fix:
--   * Only the PRIMARY owner (pets.created_by) may add or remove co-owners
--     (Lynn, 2026-11-18 — matches 0004's original "only the original owner
--     manages co-owners" intent). Co-owners leave via delete-pet's
--     self-removal path, which uses the service role and isn't affected.
--   * A new row may never arrive with co_owner_user_id already set, so
--     claim_pending_co_owner_invites() (0016) is the only way an account is
--     linked: access requires owning the invited inbox, not knowing a pet ID.
--   * Every owner (primary or co-owner) can read the pet's full co-owner list.
--   * Delete checks pets.created_by, not owner_id, because owner_id goes
--     stale after an ownership transfer (delete-pet/delete-account patch it
--     by hand).
--   * Still no UPDATE policy, deliberately.
--
-- Pre-fix check (spec 0072 AC10), run read-only 2026-11-18 on all three
-- projects before this migration: dev 0 rows, staging 0 rows, prod 3 rows,
-- none flagged. Live policies on all three matched 0004 exactly. Query:
--
--   select co.id, co.pet_id, co.created_at
--   from public.pet_co_owners co
--   left join public.pets p on p.id = co.pet_id
--   left join auth.users u on u.id = co.co_owner_user_id
--   where (co.co_owner_user_id is not null
--          and lower(u.email) is distinct from lower(co.co_owner_email))
--      or not (co.owner_id = p.created_by
--              or exists (select 1 from public.pet_co_owners o2
--                         where o2.pet_id = co.pet_id
--                           and o2.co_owner_user_id = co.owner_id))
--      or co.created_by is distinct from co.owner_id;

-- ============================================================
-- Helper: is this user the pet's primary owner?
-- Same build as is_pet_owner() (0004): SECURITY DEFINER + fixed
-- search_path so it can read pets regardless of the caller's own RLS.
-- New functions are executable by PUBLIC by default (PA-05's lesson),
-- so that grant is revoked explicitly.
-- ============================================================
create or replace function public.is_primary_pet_owner(p_pet_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.pets
    where id = p_pet_id and created_by = p_user_id
  );
$$;

revoke execute on function public.is_primary_pet_owner(uuid, uuid) from public, anon;
grant execute on function public.is_primary_pet_owner(uuid, uuid) to authenticated;

-- ============================================================
-- pet_co_owners policies
-- ============================================================
drop policy "pet_co_owners_insert_owner_only" on public.pet_co_owners;
drop policy "pet_co_owners_select_owner_or_self" on public.pet_co_owners;
drop policy "pet_co_owners_delete_owner_only" on public.pet_co_owners;

create policy "pet_co_owners_insert_primary_owner" on public.pet_co_owners
  for insert with check (
    public.is_primary_pet_owner(pet_id, auth.uid())
    and auth.uid() = owner_id
    and created_by = auth.uid()
    -- A new row never arrives already linked: only
    -- claim_pending_co_owner_invites() (0016) may set co_owner_user_id.
    and co_owner_user_id is null
  );

create policy "pet_co_owners_select_any_owner" on public.pet_co_owners
  for select using (
    public.is_pet_owner(pet_id, auth.uid())
    or auth.uid() = co_owner_user_id
  );

create policy "pet_co_owners_delete_primary_owner" on public.pet_co_owners
  for delete using (
    public.is_primary_pet_owner(pet_id, auth.uid())
  );
