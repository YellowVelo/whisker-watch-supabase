-- Wysker Watch — test4@ fixture account for sitter-identity Playwright tests
--
-- Spec 0057 (closing out the e2e coverage half of spec 0037, Launch Plan
-- Task #18) needs a second Playwright login that can play "a sitter
-- looking at someone else's pet" — test1@ already plays every other role
-- in the suite (see e2e/global-setup.js), test2@ is reserved for the Deno
-- CI suite, and test3@ was already claimed by spec 0053 for admin-route
-- tests (see 0049_test3_admin_fixture_account.sql). test4@ is a new,
-- dedicated account for exactly this purpose, added to the
-- classify_account_type allowlist (migration 0010) the same documented
-- way every account on that list has been added before.
create or replace function public.classify_account_type(p_email text)
returns text
language sql
immutable
as $$
  select case lower(p_email)
    when 'test1@wyskerwatch.com' then 'test'
    when 'test2@wyskerwatch.com' then 'test'
    when 'test3@wyskerwatch.com' then 'test'
    when 'test4@wyskerwatch.com' then 'test'
    when 'demo1@wyskerwatch.com' then 'demo'
    else 'production'
  end;
$$;

-- Unlike 0049 (test3@ didn't exist yet when that migration ran, so the
-- signup trigger classified it correctly from the start), test4@'s Auth
-- account was created before this migration — its profiles row was
-- already written with the old allowlist and defaulted to 'production'.
-- Backfill it explicitly, the same way 0010's original migration backfilled
-- test1@/test2@/demo1@ for the same reason.
update public.profiles
set account_type = 'test'
where lower(email) = 'test4@wyskerwatch.com';
