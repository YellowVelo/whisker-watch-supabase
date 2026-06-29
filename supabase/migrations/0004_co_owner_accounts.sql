-- Whisker Watch — co-owner accounts
--
-- Lets a pet's original owner invite another person (e.g. a spouse)
-- to share full owner-level access to a pet: same rights as the
-- original owner, including editing, logging, and deleting the pet
-- itself. Only the original owner can manage who the co-owners are
-- (co-owners can't add/remove other co-owners).
--
-- This is a different, fuller-access concept than pet_sitter_access,
-- which only grants visibility into pet_sit_logs for a specific
-- sitting period — co-owners get full access to everything.

-- ============================================================
-- pet_co_owners
-- ============================================================
create table public.pet_co_owners (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, -- the original/primary owner who sent the invite
  created_by uuid not null references auth.users(id) on delete cascade, -- who actually clicked "invite" (may be a co-owner, once co-owners can invite — see note below); kept for consistency with entityClient.js's generic create() helper, which always sets this field
  co_owner_email text not null,
  co_owner_user_id uuid references auth.users(id) on delete cascade, -- filled in once the invited person signs up/logs in with this email
  created_at timestamptz not null default now()
);

create index pet_co_owners_pet_id_idx on public.pet_co_owners(pet_id);
create index pet_co_owners_co_owner_email_idx on public.pet_co_owners(co_owner_email);
create index pet_co_owners_co_owner_user_id_idx on public.pet_co_owners(co_owner_user_id);

alter table public.pet_co_owners enable row level security;

-- Only the original owner can see/manage the co-owner list for their
-- pet. A co-owner can see their own grant (so the app can show them
-- "you're a co-owner of X"), but can't manage the list themselves.
create policy "pet_co_owners_select_owner_or_self" on public.pet_co_owners
  for select using (
    auth.uid() = owner_id
    or auth.uid() = co_owner_user_id
  );
create policy "pet_co_owners_insert_owner_only" on public.pet_co_owners
  for insert with check (auth.uid() = owner_id);
create policy "pet_co_owners_delete_owner_only" on public.pet_co_owners
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- Helper function: is this user a full owner (original or
-- co-owner) of this pet? Reused across every table's RLS policy
-- below instead of duplicating the same OR-exists logic ten times.
--
-- SECURITY DEFINER + a fixed search_path so this function can read
-- pets/pet_co_owners regardless of the calling user's own RLS grants
-- on those tables (otherwise it'd risk infinite recursion: checking
-- a permission by querying a table that itself is protected by a
-- policy that calls this same function).
-- ============================================================
create or replace function public.is_pet_owner(p_pet_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.pets
    where id = p_pet_id and created_by = p_user_id
  )
  or exists (
    select 1 from public.pet_co_owners
    where pet_id = p_pet_id and co_owner_user_id = p_user_id
  );
$$;

-- ============================================================
-- Rewrite RLS policies on pets and every child table to use
-- is_pet_owner() instead of a plain created_by = auth.uid() check.
-- This grants co-owners the exact same rights as the original
-- owner, including delete, matching the "full parity" decision.
-- ============================================================

-- pets
drop policy "pets_select_own" on public.pets;
drop policy "pets_insert_own" on public.pets;
drop policy "pets_update_own" on public.pets;
drop policy "pets_delete_own" on public.pets;

create policy "pets_select_owner" on public.pets
  for select using (public.is_pet_owner(id, auth.uid()));
create policy "pets_insert_own" on public.pets
  for insert with check (auth.uid() = created_by); -- creating a NEW pet still requires being its creator
create policy "pets_update_owner" on public.pets
  for update using (public.is_pet_owner(id, auth.uid()));
create policy "pets_delete_owner" on public.pets
  for delete using (public.is_pet_owner(id, auth.uid()));

-- pet_foods
drop policy "pet_foods_select_own" on public.pet_foods;
drop policy "pet_foods_insert_own" on public.pet_foods;
drop policy "pet_foods_update_own" on public.pet_foods;
drop policy "pet_foods_delete_own" on public.pet_foods;

create policy "pet_foods_select_owner" on public.pet_foods for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_foods_insert_owner" on public.pet_foods for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_foods_update_owner" on public.pet_foods for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_foods_delete_owner" on public.pet_foods for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- food_logs
drop policy "food_logs_select_own" on public.food_logs;
drop policy "food_logs_insert_own" on public.food_logs;
drop policy "food_logs_update_own" on public.food_logs;
drop policy "food_logs_delete_own" on public.food_logs;

create policy "food_logs_select_owner" on public.food_logs for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "food_logs_insert_owner" on public.food_logs for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "food_logs_update_owner" on public.food_logs for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "food_logs_delete_owner" on public.food_logs for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- medications
drop policy "medications_select_own" on public.medications;
drop policy "medications_insert_own" on public.medications;
drop policy "medications_update_own" on public.medications;
drop policy "medications_delete_own" on public.medications;

create policy "medications_select_owner" on public.medications for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "medications_insert_owner" on public.medications for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "medications_update_owner" on public.medications for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "medications_delete_owner" on public.medications for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- vaccinations
drop policy "vaccinations_select_own" on public.vaccinations;
drop policy "vaccinations_insert_own" on public.vaccinations;
drop policy "vaccinations_update_own" on public.vaccinations;
drop policy "vaccinations_delete_own" on public.vaccinations;

create policy "vaccinations_select_owner" on public.vaccinations for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "vaccinations_insert_owner" on public.vaccinations for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "vaccinations_update_owner" on public.vaccinations for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "vaccinations_delete_owner" on public.vaccinations for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- bloodwork
drop policy "bloodwork_select_own" on public.bloodwork;
drop policy "bloodwork_insert_own" on public.bloodwork;
drop policy "bloodwork_update_own" on public.bloodwork;
drop policy "bloodwork_delete_own" on public.bloodwork;

create policy "bloodwork_select_owner" on public.bloodwork for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "bloodwork_insert_owner" on public.bloodwork for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "bloodwork_update_owner" on public.bloodwork for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "bloodwork_delete_owner" on public.bloodwork for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- symptom_logs
drop policy "symptom_logs_select_own" on public.symptom_logs;
drop policy "symptom_logs_insert_own" on public.symptom_logs;
drop policy "symptom_logs_update_own" on public.symptom_logs;
drop policy "symptom_logs_delete_own" on public.symptom_logs;

create policy "symptom_logs_select_owner" on public.symptom_logs for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "symptom_logs_insert_owner" on public.symptom_logs for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "symptom_logs_update_owner" on public.symptom_logs for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "symptom_logs_delete_owner" on public.symptom_logs for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- pet_sits (PetSit records reference multiple pets via pet_ids array,
-- so this one checks if the user owns ANY of the pets in that array,
-- not a single pet_id column)
drop policy "pet_sits_select_own" on public.pet_sits;
drop policy "pet_sits_insert_own" on public.pet_sits;
drop policy "pet_sits_update_own" on public.pet_sits;
drop policy "pet_sits_delete_own" on public.pet_sits;

create policy "pet_sits_select_owner" on public.pet_sits
  for select using (
    auth.uid() = created_by
    or exists (select 1 from unnest(pet_ids) pid where public.is_pet_owner(pid, auth.uid()))
  );
create policy "pet_sits_insert_owner" on public.pet_sits
  for insert with check (
    auth.uid() = created_by
    or exists (select 1 from unnest(pet_ids) pid where public.is_pet_owner(pid, auth.uid()))
  );
create policy "pet_sits_update_owner" on public.pet_sits
  for update using (
    auth.uid() = created_by
    or exists (select 1 from unnest(pet_ids) pid where public.is_pet_owner(pid, auth.uid()))
  );
create policy "pet_sits_delete_owner" on public.pet_sits
  for delete using (
    auth.uid() = created_by
    or exists (select 1 from unnest(pet_ids) pid where public.is_pet_owner(pid, auth.uid()))
  );

-- pet_sit_logs (owner side now uses is_pet_owner, so co-owners can
-- manage sit logs too, alongside the existing sitter-access policies)
drop policy "pet_sit_logs_select_own_or_sitter" on public.pet_sit_logs;
drop policy "pet_sit_logs_insert_own_or_sitter" on public.pet_sit_logs;
drop policy "pet_sit_logs_update_own" on public.pet_sit_logs;
drop policy "pet_sit_logs_delete_own" on public.pet_sit_logs;

create policy "pet_sit_logs_select_owner_or_sitter" on public.pet_sit_logs
  for select using (
    public.is_pet_owner(pet_id, auth.uid())
    or exists (
      select 1 from public.pet_sitter_access psa
      where psa.pet_sit_id = pet_sit_logs.pet_sit_id
        and psa.sitter_user_id = auth.uid()
    )
  );
create policy "pet_sit_logs_insert_owner_or_sitter" on public.pet_sit_logs
  for insert with check (
    public.is_pet_owner(pet_id, auth.uid())
    or exists (
      select 1 from public.pet_sitter_access psa
      where psa.pet_sit_id = pet_sit_logs.pet_sit_id
        and psa.sitter_user_id = auth.uid()
    )
  );
create policy "pet_sit_logs_update_owner" on public.pet_sit_logs
  for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_sit_logs_delete_owner" on public.pet_sit_logs
  for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- pet_sitter_access: a co-owner can manage sitter invites for any
-- pet covered by the related pet_sit, same as the original owner.
-- This table's existing owner_id column reflects whoever happened to
-- create the invite; rather than rely on that column for permission
-- checks, owner-side access is now based on is_pet_owner() against
-- the pet_sit's pet_ids, so it stays correct as co-owners are added
-- or removed over time.
drop policy "pet_sitter_access_select_owner_or_sitter" on public.pet_sitter_access;
drop policy "pet_sitter_access_insert_owner" on public.pet_sitter_access;
drop policy "pet_sitter_access_update_owner" on public.pet_sitter_access;
drop policy "pet_sitter_access_delete_owner" on public.pet_sitter_access;

create policy "pet_sitter_access_select_owner_or_sitter" on public.pet_sitter_access
  for select using (
    auth.uid() = sitter_user_id
    or sitter_email = (select email from public.profiles where id = auth.uid())
    or exists (
      select 1 from public.pet_sits ps, unnest(ps.pet_ids) pid
      where ps.id = pet_sitter_access.pet_sit_id
        and public.is_pet_owner(pid, auth.uid())
    )
  );
create policy "pet_sitter_access_insert_owner" on public.pet_sitter_access
  for insert with check (
    exists (
      select 1 from public.pet_sits ps, unnest(ps.pet_ids) pid
      where ps.id = pet_sitter_access.pet_sit_id
        and public.is_pet_owner(pid, auth.uid())
    )
  );
create policy "pet_sitter_access_update_owner" on public.pet_sitter_access
  for update using (
    exists (
      select 1 from public.pet_sits ps, unnest(ps.pet_ids) pid
      where ps.id = pet_sitter_access.pet_sit_id
        and public.is_pet_owner(pid, auth.uid())
    )
  );
create policy "pet_sitter_access_delete_owner" on public.pet_sitter_access
  for delete using (
    exists (
      select 1 from public.pet_sits ps, unnest(ps.pet_ids) pid
      where ps.id = pet_sitter_access.pet_sit_id
        and public.is_pet_owner(pid, auth.uid())
    )
  );
