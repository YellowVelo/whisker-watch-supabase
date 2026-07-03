-- Wysker Watch — account_type (production / test / demo)
--
-- Adds an account_type to every user's profile so the app can branch
-- behavior for internal test and demo accounts without touching real
-- user data. All existing and newly-signed-up users default to
-- 'production'.
--
-- Test/demo status is assigned by email allowlist at signup time
-- (rather than a self-service or admin-UI toggle) — the small,
-- known set of internal accounts below are provisioned directly in
-- Supabase Auth (e.g. via the dashboard), and this migration/trigger
-- recognizes them by email. To add another test/demo account later,
-- add its email to the CASE list below in a new migration.

alter table public.profiles
  add column account_type text not null default 'production'
    check (account_type in ('production', 'test', 'demo'));

-- Known internal test/demo accounts. Keep this list short and
-- deliberate — anyone signing up with one of these exact emails
-- gets a non-production account automatically.
create or replace function public.classify_account_type(p_email text)
returns text
language sql
immutable
as $$
  select case lower(p_email)
    when 'test1@wyskerwatch.com' then 'test'
    when 'test2@wyskerwatch.com' then 'test'
    when 'demo1@wyskerwatch.com' then 'demo'
    else 'production'
  end;
$$;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, account_type)
  values (new.id, new.email, public.classify_account_type(new.email));
  return new;
end;
$$ language plpgsql security definer;

-- Backfill in case any of the known test/demo accounts already
-- existed (signed up) before this migration ran.
update public.profiles
set account_type = public.classify_account_type(email)
where lower(email) in ('test1@wyskerwatch.com', 'test2@wyskerwatch.com', 'demo1@wyskerwatch.com');
