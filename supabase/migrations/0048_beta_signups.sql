-- Wysker Watch — beta signup landing page + screener
-- (see docs/features/0053_Beta_Signup_Landing_Page_and_Screener_Specification_v1.md)
--
-- Captures email + 4 screener answers from the public /beta landing page.
-- Written exclusively by the beta-signup Edge Function using the
-- service-role client (no client-side insert path), same pattern as
-- email_logs/rate_limit_hits/email_suppressions — RLS enabled, no
-- policy for anon/authenticated, so those roles are denied by default.
--
-- Unlike those tables, this one also needs to be *read* (and its
-- reviewed_at column updated) by a real logged-in user — Lynn, reviewing
-- signups from the in-app admin page — so it additionally gets a select
-- and update policy scoped to profiles.role = 'admin'. This is the first
-- admin-gated RLS policy in this codebase; every other "privileged" table
-- so far is service-role-only with no authenticated-session access at all.
create table public.beta_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  condition_status text not null,
  tracking_method text not null,
  frustration text not null,
  beta_comfort text not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index beta_signups_created_at_idx on public.beta_signups(created_at desc);

alter table public.beta_signups enable row level security;

create policy "beta_signups_admin_select" on public.beta_signups
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "beta_signups_admin_update" on public.beta_signups
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );
