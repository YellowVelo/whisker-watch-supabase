-- Wysker Watch — expose an email's Supabase Auth confirmation state
--
-- The sign-up Edge Function (see
-- docs/features/0021_Branded_Signup_Confirmation_Email_Specification_v1.md)
-- needs to tell three cases apart for a given email, none of which are
-- distinguishable from its normal API surface (auth.users isn't in
-- PostgREST's exposed schema, and generateLink's "already registered"
-- error alone can't tell confirmed from unconfirmed):
--   1. no account exists yet                    -> proceed with signup
--   2. account exists, email already confirmed   -> no-op (nothing to
--      resend; also true for a "resend" call on an already-verified user)
--   3. account exists, email NOT yet confirmed    -> (re)send a
--      confirmation link via a 'recovery'-type generateLink call
--
-- Deliberately separate from email_has_password() (migration 0020):
-- that function answers "does this email have a password set", which
-- invite-co-owner/invite-sitter use to detect a stuck pending invite.
-- It does NOT distinguish confirmed-with-password from
-- unconfirmed-with-password, and a signup-type account created by this
-- feature has a password from the moment it's created (passed directly
-- to generateLink) even before its email is confirmed — reusing
-- email_has_password() here would silently misclassify every one of our
-- own not-yet-confirmed signups as "already registered, nothing to
-- resend". Same security posture as email_has_password(): returns only
-- the minimum needed, restricted to service_role.
create or replace function public.get_auth_user_confirmation_state(p_email text)
returns table (user_id uuid, email_confirmed boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select id, (email_confirmed_at is not null)
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;
end;
$$;

revoke execute on function public.get_auth_user_confirmation_state(text) from public, anon, authenticated;
grant execute on function public.get_auth_user_confirmation_state(text) to service_role;
