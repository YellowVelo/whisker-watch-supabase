-- Wysker Watch — Early Adopters welcome page
-- (see docs/features/0056_Early_Adopters_Welcome_Page_Specification_v1.md)
--
-- Captures first name + email + consent from the public /early-adopters
-- page. This is the PRE-PWA-LAUNCH list (social traffic wanting to know
-- when the app is ready to sign up for real) — distinct from
-- `beta_signups` (people actively screened to test the rough Alpha app
-- right now) and distinct from the future "Watch List" (a separate,
-- later list for the pre-App-Store phase, not built yet).
--
-- Written exclusively by the early-adopter-signup Edge Function using the
-- service-role client (no client-side insert path), same pattern as
-- email_logs/rate_limit_hits/email_suppressions/beta_signups — RLS
-- enabled, no policy for anon/authenticated, so those roles are denied by
-- default.
--
-- Unlike beta_signups, this table intentionally has NO admin-facing
-- read/update policy (confirmed with Lynn — no admin review UI for this
-- pass). She reads/exports this list directly via the Supabase dashboard
-- against whichever project is live, same access she already uses to
-- manage all three Wysker Watch projects.
create table public.early_adopters (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  email text not null,
  consented_at timestamptz not null,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

create index early_adopters_created_at_idx on public.early_adopters(created_at desc);

alter table public.early_adopters enable row level security;
-- No policies added: RLS enabled with zero grants means anon/authenticated
-- are denied by default. All access is via the service-role client inside
-- the early-adopter-signup Edge Function, or Lynn's direct Supabase
-- dashboard access (which bypasses RLS as project owner).
