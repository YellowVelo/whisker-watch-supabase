-- Wysker Watch — expose whether an email has ever set a password
--
-- invite-co-owner needs to tell a genuinely-registered co-owner (has a
-- password, can log in normally) apart from someone who was invited
-- once before but never finished accepting (an auth.users row exists,
-- created via admin.generateLink({type:'invite'}), but encrypted_password
-- was never set). Supabase's admin API returns the identical "already
-- registered"/422 error for both cases, so there's no way to distinguish
-- them from the Edge Function's normal API surface — auth.users isn't in
-- PostgREST's exposed schema, so a service-role client can't just
-- `.from('auth.users')` to check.
--
-- This function is intentionally minimal: it returns ONLY a boolean,
-- never any other auth.users field, and execute is restricted to
-- service_role (never authenticated/anon) since "does this email have a
-- password" is itself a sensitive account-enumeration signal that must
-- not be reachable from a regular user session.
create or replace function public.email_has_password(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_password boolean;
begin
  select (encrypted_password is not null and encrypted_password != '')
  into v_has_password
  from auth.users
  where lower(email) = lower(p_email)
  limit 1;

  return coalesce(v_has_password, false);
end;
$$;

revoke execute on function public.email_has_password(text) from public, anon, authenticated;
grant execute on function public.email_has_password(text) to service_role;
