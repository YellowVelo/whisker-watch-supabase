-- Wysker Watch — let an assigned sitter read the pets covered by their sit
--
-- Bug found while manually testing the sitter-invite-email fix (see
-- requirements-sitter-invite-email.md), same root cause as
-- 0030_pet_sits_sitter_select.sql: pets' existing RLS policies
-- (pets_select_owner, from 0001_init_schema.sql / updated for co-owners
-- in 0004_co_owner_accounts.sql) only grant access to the pet's owner or
-- a co-owner (via is_pet_owner) — never a sitter.
--
-- Consequence: even after 0028 (sitter_user_id linking), 0029
-- (pet_sitter_access.created_by), and 0030 (pet_sits sitter read
-- access), a sitter still couldn't actually fetch the pet record itself
-- — getSharedPetsForUser() (src/lib/petsClient.js) calls
-- entities.Pet.get(id) for each pet on the sit, which failed ("Cannot
-- coerce the result to a single JSON object" — RLS made the row
-- invisible), so "Shared with Me" on the Pets screen still showed
-- nothing. This is a pre-existing gap, not something introduced by the
-- sitter-invite-email change — only surfaced by actually exercising the
-- flow end to end.
--
-- SECURITY DEFINER, same reasoning as is_pet_sit_sitter() in 0030: keeps
-- this policy's internal query from re-triggering RLS on pet_sits/
-- pet_sitter_access when evaluated from within a pets policy.
create or replace function public.is_pet_sitter(p_pet_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pet_sitter_access psa
    join public.pet_sits ps on ps.id = psa.pet_sit_id
    where psa.sitter_user_id = p_user_id
      and p_pet_id = any(ps.pet_ids)
  );
$$;

create policy "pets_select_sitter" on public.pets
  for select using (is_pet_sitter(id, auth.uid()));
