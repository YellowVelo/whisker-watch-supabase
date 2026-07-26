-- Wysker Watch — Restore Missing Table Grants on Staging (spec 0019)
--
-- Every table in wysker-watch-staging is missing basic table-level
-- permissions (select/insert/update/delete) for every role (anon,
-- authenticated, service_role) — confirmed across all 23 tables by
-- comparing against wysker-watch-dev, which has the correct grants.
-- This is the "outer lock" (can this role touch the table at all),
-- separate from Row Level Security (the "inner lock" — which specific
-- rows a role can see/change). Staging is missing the outer lock's key
-- entirely, so even service_role — which is supposed to bypass RLS —
-- gets a raw "permission denied for table X" instead of ever reaching
-- the RLS layer. RLS itself is untouched by this migration and remains
-- the real access-control mechanism everywhere.
--
-- The most likely cause is that staging was provisioned by a path that
-- skipped Supabase's usual automatic grant bootstrap (e.g. a schema-only
-- restore that excluded privileges). This migration doesn't depend on
-- confirming that — it just restores the correct end state.
--
-- Idempotent: a no-op on dev/prod, where these grants already exist.
-- The explicit grant covers every table that exists today; the
-- `alter default privileges` statement below ensures any table added
-- by a future migration automatically gets the same grants on every
-- environment, closing off this exact failure mode from recurring.

grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;
