-- Wysker Watch — lock down privileged profile fields
--
-- profiles_update_own (0001) is `for update using (auth.uid() = id)`
-- with no WITH CHECK, which means it doubles as the check clause: a
-- signed-in user can update ANY column on their own profiles row,
-- including `role` and the newly-added `account_type`. That directly
-- contradicts the requirement that only an administrative process can
-- classify an account as test/demo (or grant admin).
--
-- RLS policies can't compare NEW vs OLD column values on their own,
-- so this is enforced with a BEFORE UPDATE trigger instead: any
-- attempt to change `role` or `account_type` from a regular
-- authenticated session is rejected. Service-role callers (Edge
-- Functions, future admin tooling) are unaffected.

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
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger profiles_protect_privileged_fields
  before update on public.profiles
  for each row execute procedure public.protect_privileged_profile_fields();
