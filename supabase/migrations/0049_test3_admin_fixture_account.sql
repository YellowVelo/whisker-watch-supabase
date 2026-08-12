-- Wysker Watch — test3@ fixture account for admin-gated Playwright tests
--
-- Spec 0053 needs a Playwright fixture account with profiles.role =
-- 'admin' to test the new /admin/beta-signups route. test1@ is already
-- the shared "ordinary logged-in user" session reused by nearly every
-- other test in the suite (see e2e/global-setup.js) — making it admin
-- would change what "logged in" means for the whole rest of the suite.
-- test2@ is explicitly reserved for the Deno CI integration tests (see
-- .env.playwright.example) so the two suites never collide on the same
-- account. test3@ is a new, dedicated account for exactly this purpose,
-- added to the classify_account_type allowlist (migration 0010) the same
-- documented way every account on that list has been added before.
create or replace function public.classify_account_type(p_email text)
returns text
language sql
immutable
as $$
  select case lower(p_email)
    when 'test1@wyskerwatch.com' then 'test'
    when 'test2@wyskerwatch.com' then 'test'
    when 'test3@wyskerwatch.com' then 'test'
    when 'demo1@wyskerwatch.com' then 'demo'
    else 'production'
  end;
$$;
