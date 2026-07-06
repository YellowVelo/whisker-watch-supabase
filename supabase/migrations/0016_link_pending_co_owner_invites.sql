-- Wysker Watch — link pending co-owner invites on login
--
-- Bug: pet_co_owners.co_owner_user_id was documented ("filled in once
-- the invited person signs up/logs in with this email") but nothing
-- ever actually set it. InviteCoOwnerDialog.jsx only ever inserts
-- co_owner_email; there's no UPDATE policy on pet_co_owners at all, so
-- even a client-side attempt to self-link would be rejected by RLS.
--
-- Consequences of the missing link:
--   1. is_pet_owner() checks co_owner_user_id, so an invited co-owner
--      never actually gained access to the shared pet's data, despite
--      the invite dialog claiming "they'll see the pet on their next
--      login."
--   2. delete-pet's ownership-transfer branch only fires for co-owners
--      whose co_owner_user_id is non-null. Since that never happened,
--      deleting a pet always took the "sole owner — permanent delete"
--      path, silently destroying pets that were supposed to transfer
--      to a co-owner instead.
--
-- Fix: a SECURITY DEFINER function the client calls once per session
-- (on login / session restore) that links any pending invites for the
-- signed-in user's email. SECURITY DEFINER is required because the
-- caller doesn't own these rows (owner_id is the inviter), matching
-- the same pattern used by is_pet_owner() elsewhere in this schema.
create or replace function public.claim_pending_co_owner_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pet_co_owners
  set co_owner_user_id = auth.uid()
  where co_owner_user_id is null
    and lower(co_owner_email) = lower((select email from auth.users where id = auth.uid()));
end;
$$;

grant execute on function public.claim_pending_co_owner_invites() to authenticated;
