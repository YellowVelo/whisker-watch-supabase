-- Wysker Watch — let an assigned sitter read the pet_sits row itself
--
-- Bug found while manually testing the sitter-invite-email fix (see
-- requirements-sitter-invite-email.md): pet_sits' existing RLS policies
-- (pet_sits_select_owner, from 0001_init_schema.sql) only grant access
-- to the sit's creator or a pet co-owner (via is_pet_owner). There was
-- never a policy letting the sitter named in pet_sitter_access read the
-- sit itself — only pet_sit_logs had a sitter-aware policy.
--
-- Consequence: even with sitter_user_id correctly linked (migration
-- 0028) and pet_sitter_access.created_by fixed (migration 0029), a
-- sitter who accepts an invite still can't see anything — getSharedPets
-- ForUser() (src/lib/petsClient.js) needs to read the pet_sits row
-- (for its pet_ids) to know which pets to show under "Shared with Me",
-- and that read was silently rejected by RLS the whole time. This is a
-- pre-existing gap, not something introduced by the sitter-invite-email
-- change — only surfaced by actually exercising the flow end to end.
--
-- Uses a SECURITY DEFINER helper (same pattern as is_pet_owner()) rather
-- than a plain `exists (select ... from pet_sitter_access ...)` clause:
-- the live pet_sitter_access_select_owner_or_sitter policy itself reads
-- from pet_sits (to let an owner see sitter_access rows for their own
-- pets), so a plain cross-reference here would form a two-table RLS
-- cycle — pet_sits' policy triggers pet_sitter_access's RLS, which
-- triggers pet_sits' RLS again, and so on ("infinite recursion detected
-- in policy for relation pet_sitter_access"). SECURITY DEFINER bypasses
-- RLS for its own internal query, breaking that cycle.
create or replace function public.is_pet_sit_sitter(p_pet_sit_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pet_sitter_access
    where pet_sit_id = p_pet_sit_id and sitter_user_id = p_user_id
  );
$$;

create policy "pet_sits_select_sitter" on public.pet_sits
  for select using (is_pet_sit_sitter(id, auth.uid()));
