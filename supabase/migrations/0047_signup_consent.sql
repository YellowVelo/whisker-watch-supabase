-- Wysker Watch — signup consent gate (spec 0047)
--
-- Adds a real, provable record of Terms of Service / Privacy Policy
-- acceptance at signup, plus a separate (optional) marketing-communications
-- opt-in answer. Both are plain, self-editable columns — neither needs the
-- privileged-field protection 0011 added for role/account_type, since a
-- user controlling their own consent/marketing answer isn't a privilege
-- escalation risk.
--
-- terms_version/privacy_version store the "Last updated" string in effect
-- at the moment of signup (TOS_LAST_UPDATED / PRIVACY_POLICY_LAST_UPDATED
-- in src/lib/termsOfServiceContent.js / privacyPolicyContent.js), so a
-- later change to those documents doesn't retroactively change what an
-- existing user is recorded as having agreed to.
--
-- All four columns are nullable/default-false for existing rows — nobody
-- who signed up before this shipped is retroactively asked to agree to
-- anything; terms_accepted_at staying null just means "predates this
-- requirement."

alter table public.profiles
  add column terms_accepted_at timestamptz,
  add column terms_version text,
  add column privacy_version text,
  add column marketing_opt_in boolean not null default false;

-- Extends handle_new_user() (0015) to also populate these from
-- raw_user_meta_data, same pattern as the existing first_name read. The
-- email/password signup path (supabase/functions/sign-up/index.ts) always
-- sets these at createUser() time. The Google OAuth path can't inject
-- custom user_metadata the same way, so it leaves these null here and
-- writes them separately from the client immediately after the first
-- authenticated session — see AuthContext.jsx.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id, email, account_type, first_name,
    terms_accepted_at, terms_version, privacy_version, marketing_opt_in
  )
  values (
    new.id,
    new.email,
    public.classify_account_type(new.email),
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    case
      when new.raw_user_meta_data ->> 'terms_accepted_at' is not null
        then (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
      else null
    end,
    nullif(new.raw_user_meta_data ->> 'terms_version', ''),
    nullif(new.raw_user_meta_data ->> 'privacy_version', ''),
    coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false)
  );
  return new;
end;
$$ language plpgsql security definer;
