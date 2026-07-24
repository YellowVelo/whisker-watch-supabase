-- Wysker Watch — link pending sitter invites on login
--
-- Bug: pet_sitter_access.sitter_user_id was documented ("later linked to
-- their own user id once they sign up/log in" — see 0001_init_schema.sql's
-- comment on the table) but nothing ever actually set it. This is the same
-- bug that already hit pet_co_owners.co_owner_user_id — see
-- 0016_link_pending_co_owner_invites.sql's header comment for that
-- incident. This migration applies the identical fix for sitters.
--
-- Consequence of the missing link: the RLS policies on pet_sit_logs
-- ("select_own_or_sitter" / "insert_own_or_sitter", see
-- 0001_init_schema.sql) require psa.sitter_user_id = auth.uid(). Since
-- that column was never populated, an invited sitter could see they'd
-- been granted access (that check goes through sitter_email, which does
-- work) but could never actually log a feeding/meds/task entry for the
-- pet-sit — the core purpose of the invite.
--
-- Fix: a SECURITY DEFINER function the client calls once per session (on
-- login / session restore) that links any pending sitter invites for the
-- signed-in user's email. SECURITY DEFINER is required because the caller
-- doesn't own these rows (owner_id is the inviter), matching the same
-- pattern used by claim_pending_co_owner_invites().
create or replace function public.claim_pending_sitter_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pet_sitter_access
  set sitter_user_id = auth.uid()
  where sitter_user_id is null
    and lower(sitter_email) = lower((select email from auth.users where id = auth.uid()));
end;
$$;

grant execute on function public.claim_pending_sitter_invites() to authenticated;
