-- Wysker Watch — co-owner/sitter test inboxes on the test-account allowlist
--
-- Spec 0070. Lynn set up real inboxes (coowner1@, coowner2@, petsitter1@,
-- petsitter2@) so co-owner and sitter invite flows can be tested end to
-- end. On prod they were classified 'production', so their activity was
-- counted as real users in analytics and their errors reached Sentry.
-- Adds them to the classify_account_type allowlist (migration 0010) the
-- same documented way 0049 (test3@) and 0051 (test4@) did.
--
-- Note: sendEmail() drops any email *sent by* a 'test' account (see
-- supabase/functions/_shared/email/sendEmail.ts). Invites these accounts
-- receive still link on login, but a real invite email only arrives when
-- the inviter is a non-test account.
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
    when 'coowner1@wyskerwatch.com' then 'test'
    when 'coowner2@wyskerwatch.com' then 'test'
    when 'petsitter1@wyskerwatch.com' then 'test'
    when 'petsitter2@wyskerwatch.com' then 'test'
    when 'demo1@wyskerwatch.com' then 'demo'
    else 'production'
  end;
$$;

-- All four inboxes already have Auth accounts (prod since before this
-- spec; dev/staging created just before this migration, deliberately, so
-- their sign-up confirmation emails weren't suppressed), so their profiles
-- rows were written under the old allowlist. test3@ is included because
-- prod's test3@ login predates 0049 reaching prod and was never
-- backfilled. Safe to re-run.
update public.profiles
set account_type = 'test'
where lower(email) in (
  'test3@wyskerwatch.com',
  'coowner1@wyskerwatch.com',
  'coowner2@wyskerwatch.com',
  'petsitter1@wyskerwatch.com',
  'petsitter2@wyskerwatch.com'
)
and account_type is distinct from 'test';
