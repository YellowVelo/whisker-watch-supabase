-- Wysker Watch — account takeover and consent (spec 0086; punch list PA-13, PA-18)
--
-- Bugs:
--   * PA-13: an unconfirmed sign-up kept the password typed on the sign-up
--     form. Whoever really owns the inbox clicks the link and is in an
--     account someone else still holds the password to. Since spec 0086
--     the password is chosen only after the link is clicked
--     (finish-account-setup), so accounts left unconfirmed from before then
--     have their old password wiped here.
--   * PA-18 (and 0069's P2): claim_pending_co_owner_invites() and
--     claim_pending_sitter_invites() linked invites to any account with the
--     invited email, confirmed or not, so someone could sign up as another
--     person's address and pick up their co-owner or sitter access without
--     ever owning the inbox.
--   * Consent (terms_accepted_at, terms_version, privacy_version) was a
--     plain self-editable column (0047), copied from sign-up metadata the
--     browser sent. Anyone could write or rewrite their own record.
--
-- What this does:
--   1. protect_privileged_profile_fields() (last defined in 0057) also
--      refuses any change to terms_accepted_at, terms_version and
--      privacy_version unless it comes from the service role (only
--      finish-account-setup writes them). marketing_opt_in stays editable
--      by the person, so they can always opt out.
--   2. handle_new_user() (last defined in 0047, search_path fixed in 0059)
--      no longer copies consent or marketing from sign-up metadata. It
--      still sets id, email, account_type and first_name.
--   3. claim_pending_co_owner_invites() (0016) and
--      claim_pending_sitter_invites() (0028) link invites only for a caller
--      whose email is confirmed. Grants re-stated as 0059 set them
--      (authenticated + service_role, never anon or PUBLIC).
--   4. One-time: every unconfirmed account's password is wiped (set to '',
--      the form email_has_password() already treats as "no password").
--      Confirmed accounts are not touched.
--   5. One-time: the test/demo fixture accounts (account_type 'test' or
--      'demo', the allowlist in classify_account_type) get consent filled
--      in with the current versions, so the new consent screen doesn't
--      block the e2e suite or the shared demo account. Real people's
--      accounts are never filled in; they agree on the consent screen.
--
-- Who can see or do what, after this:
--   * A signed-in person can no longer set or change their own
--     terms_accepted_at / terms_version / privacy_version (refused with an
--     error). They can still change marketing_opt_in. Nobody else could
--     write their profile before or after (RLS, unchanged).
--   * An account whose email isn't confirmed no longer picks up pending
--     co-owner or sitter invites. Confirmed accounts are unchanged.
--   * No new tables, policies or functions; who may run each function is
--     unchanged (function_permissions.test.ts lists unchanged).
--
-- UNDO (run in that project's SQL editor; restores the 0057/0047/0016/0028
-- behavior, in the same order):
--   1. Re-run the protect_privileged_profile_fields() definition from
--      0057_sitter_access_lockdown.sql (account_type, role, email only).
--   2. Re-run the handle_new_user() definition from 0047_signup_consent.sql,
--      then: alter function public.handle_new_user() set search_path = public;
--   3. Re-run the claim_pending_co_owner_invites() definition from 0016 and
--      claim_pending_sitter_invites() from 0028 (both already carry
--      security definer and search_path = public), then:
--        revoke execute on function public.claim_pending_co_owner_invites() from public, anon;
--        revoke execute on function public.claim_pending_sitter_invites() from public, anon;
--        grant execute on function public.claim_pending_co_owner_invites() to authenticated, service_role;
--        grant execute on function public.claim_pending_sitter_invites() to authenticated, service_role;
--   4. The two one-time updates can't be undone and don't need to be: a
--      wiped password belonged to an account nobody had confirmed (the
--      person sets one on the finish page), and the fixture consent rows
--      are test/demo accounts only. To clear the fixture consent anyway:
--        update public.profiles set terms_accepted_at = null,
--          terms_version = null, privacy_version = null
--        where account_type in ('test', 'demo');
--      (as the service role or in the SQL editor; the trigger refuses it
--      from a signed-in session).
--   The gate marker can stay; it does no harm.
--
-- SAFETY CHECK: this must run only after the spec-0086 frontend is live on
-- that environment. The old Register page sends consent in sign-up
-- metadata and the old Google path writes consent from the browser; once
-- this runs both are ignored or refused, and only the new finish page and
-- consent screen can record it. It refuses to run until the environment
-- has been marked ready, by hand (run in that project's SQL editor, or with
-- `supabase db query --linked`):
--
--   create schema if not exists private;
--   create table if not exists private.deploy_markers (key text primary key, created_at timestamptz not null default now());
--   revoke all on schema private from anon, authenticated;
--   revoke all on private.deploy_markers from anon, authenticated;
--   insert into private.deploy_markers (key) values ('spec_0086_frontend_live') on conflict do nothing;
--
-- (The table is created there, not only below, because a blocked run of
-- this file rolls back everything in it, including its own table.)
--
-- For a real restore by hand (onto a fresh project), FIRST set the deploy
-- markers for every gated migration, or 0055, 0061, 0063 and this file
-- refuse to run during the replay (the same step scripts/restore-test.sh
-- does):
--   create schema if not exists private;
--   create table if not exists private.deploy_markers (key text primary key, created_at timestamptz not null default now());
--   revoke all on schema private from anon, authenticated;
--   revoke all on private.deploy_markers from anon, authenticated;
--   insert into private.deploy_markers (key) values
--     ('spec_0071_frontend_live'), ('spec_0081_frontend_live'),
--     ('spec_0085_frontend_live'), ('spec_0086_frontend_live')
--   on conflict do nothing;
--
-- Rollout order on each project (spec 0086): PA-19 off → functions
-- (sign-up, finish-account-setup) deployed → frontend promoted (Cloudflare,
-- branch main, "Spec 0086 ...") → marker set (snippet above) →
-- `supabase db push` → delete confirm-email →
-- scripts/check-functions-start.sh and the 0006 §11 permissions check.
--
-- `supabase db push` applies this file as one transaction: a blocked or
-- failed run changes nothing.

create schema if not exists private;
create table if not exists private.deploy_markers (
  key text primary key,
  created_at timestamptz not null default now()
);
revoke all on schema private from anon, authenticated;
revoke all on private.deploy_markers from anon, authenticated;

-- Check: frontend marker ----------------------------------------------------
do $$
begin
  if not exists (select 1 from private.deploy_markers where key = 'spec_0086_frontend_live') then
    raise exception 'Spec 0086 migration 0064 blocked: this environment''s frontend is not marked live yet. '
      'After confirming the spec-0086 build is live here, run the marker snippet '
      'in the header of 0064_account_setup_consent.sql, then push again.';
  end if;
end $$;

-- 1. Consent is written only by the server ----------------------------------
-- Same trigger as 0057, three more columns. marketing_opt_in is
-- deliberately not here: people must always be able to opt out.
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
    if new.email is distinct from old.email then
      raise exception 'email can only be changed by an administrative process';
    end if;
    if new.terms_accepted_at is distinct from old.terms_accepted_at then
      raise exception 'terms_accepted_at can only be changed by an administrative process';
    end if;
    if new.terms_version is distinct from old.terms_version then
      raise exception 'terms_version can only be changed by an administrative process';
    end if;
    if new.privacy_version is distinct from old.privacy_version then
      raise exception 'privacy_version can only be changed by an administrative process';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 2. New accounts start with no consent recorded ----------------------------
-- 0047's version minus the four consent/marketing columns read from
-- raw_user_meta_data (which the browser controls). terms_* start null and
-- marketing_opt_in takes its column default (false); finish-account-setup
-- records them.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, account_type, first_name)
  values (
    new.id,
    new.email,
    public.classify_account_type(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), '')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3. Invites are claimed only by a confirmed email --------------------------
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
    and lower(co_owner_email) = lower((
      select email from auth.users
      where id = auth.uid()
        and email_confirmed_at is not null
    ));
end;
$$;

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
    and lower(sitter_email) = lower((
      select email from auth.users
      where id = auth.uid()
        and email_confirmed_at is not null
    ));
end;
$$;

-- Permissions exactly as 0059 set them (create or replace keeps grants, but
-- state them so every project lands the same).
revoke execute on function public.claim_pending_co_owner_invites() from public, anon, authenticated;
revoke execute on function public.claim_pending_sitter_invites() from public, anon, authenticated;
grant execute on function public.claim_pending_co_owner_invites() to service_role, authenticated;
grant execute on function public.claim_pending_sitter_invites() to service_role, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_privileged_profile_fields() from public, anon, authenticated;

-- 4. One-time: wipe passwords on unconfirmed accounts -----------------------
-- Every one of these was typed on the old sign-up form by whoever signed
-- up, who may not own the inbox. The inbox owner sets a password on the
-- finish page after clicking their link.
update auth.users
set encrypted_password = ''
where email_confirmed_at is null
  and encrypted_password is not null
  and encrypted_password <> '';

-- 5. One-time: consent for test/demo fixture accounts -----------------------
-- These are the allowlisted fixture accounts (test1-4@, the manual
-- co-owner/sitter inboxes) and the shared demo account, not real people.
-- Real people's accounts are never filled in: they agree on the consent
-- screen. Versions must equal supabase/functions/_shared/legalVersions.ts
-- (TOS_VERSION, PRIVACY_VERSION) as of this migration.
update public.profiles
set terms_accepted_at = now(),
    terms_version = 'July 10, 2026',
    privacy_version = 'November 21, 2026'
where account_type in ('test', 'demo')
  and terms_accepted_at is null;
