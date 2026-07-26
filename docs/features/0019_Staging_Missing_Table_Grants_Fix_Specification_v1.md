# 0019_Staging_Missing_Table_Grants_Fix_Specification_v1

**Status:** Implemented (2026-07-26). Migration 0035 applied to all three environments — confirmed via `supabase migration list` before each push, no migration-history conflicts on any project.
**Date:** 2026-07-25
**Related files:** `supabase/migrations/` (new migration), `docs/launch-punch-list.md` (P2)

## Before You Approve This

- **This is bigger than the punch-list item described.** The original entry suspected `service_role` might be missing grants on `profiles`/`daily_check_ins`, affecting 4 specific Edge Functions. Direct investigation this session found the real scope is much larger: **every table in staging's database is missing basic read/write permissions for every role** (`anon`, `authenticated`, `service_role`) — not just those two tables, not just `service_role`. In practice, this likely means the entire app is non-functional against the `wysker-watch-staging` project today, for any user, not just a handful of admin-only functions.
- No conflicts with locked decisions found. This is a pure infrastructure/permissions fix — no schema, no application code, no data changes.
- No duplicate/overlapping functionality found — nothing else in the repo already manages these grants.

## What's actually wrong (plain-language)

Think of a database table as having two separate layers of protection: a coarse outer lock ("can this type of user touch this table at all") and a fine-grained inner lock ("which specific rows can they see/change" — this app's existing Row Level Security policies). Staging is missing the **outer lock's key entirely** — for every table, for every role. It doesn't matter that the inner lock (RLS) is set up perfectly; nobody can even reach it, because the outer door is bolted shut for everyone including the database's own trusted internal user.

I confirmed this by directly comparing staging against `wysker-watch-dev`, which has the correct permissions: on dev, every role has the full expected set (read, insert, update, delete, plus three Postgres-internal ones). On staging, every role is missing all four of the ones that matter (read, insert, update, delete) — confirmed across all 23 tables in the schema, not a sample.

## Functional Requirements

1. `wysker-watch-staging`'s database grants the same table-level permissions as `wysker-watch-dev` and production, for every existing table.
2. Any table added by a future migration automatically gets the correct permissions on staging (and on dev/prod) without needing a manual step — closing off this exact failure mode from recurring.
3. This changes nothing about *who can see what* — the existing Row Level Security policies (the "inner lock") are completely untouched and continue to be the real access-control layer. This fix only restores the outer layer that's supposed to always be wide open, with RLS doing the actual restricting.

## Acceptance Criteria

- Given the fix is applied to staging, when any table (`profiles`, `pets`, `daily_check_ins`, etc.) is queried through the normal Supabase client (anon/authenticated) or an Edge Function (service role), then the request succeeds or fails based on Row Level Security only — never a raw "permission denied for table X" grants error.
- Given the fix is applied, when a new migration adds a brand-new table to staging (or dev, or prod) in the future, then that table automatically has the correct grants with no extra manual step.
- Given the fix is applied and re-run again later (e.g. if pushed to an environment that already has it), then nothing breaks — it's safe to apply more than once.
- Given the fix is applied to staging, when the same grants are checked on dev/production, then they are unchanged (already correct) — confirming this fix doesn't alter anything that already worked.

## Technical Spec

- **New migration** (next sequential number after `0034`) containing two things:
  1. Explicit `grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;` (idempotent — safe to run against dev/prod, where it's a no-op since those grants already exist).
  2. `alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role;` — so any table created by a *future* migration automatically inherits the correct grants on every environment, rather than relying on someone remembering to grant it by hand (which is the most likely original cause of this gap on staging).
- Applied via the normal `supabase db push` pipeline to `wysker-watch-staging` (this is the one environment that actually needs it) — and, since it's harmless and idempotent, also applied to `wysker-watch-dev` and production as part of the same migration, for consistency (every environment runs the identical set of migrations by convention in this repo).
- **No RLS changes.** This only affects the coarse table-level grants; every existing RLS policy (`is_pet_owner()`-based, etc.) is untouched and remains the actual access-control mechanism.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found.
- **Technical debt nearby:** none introduced. If anything, this closes a gap in how new environments get provisioned — worth a one-line note in `README.md`'s setup instructions (not required for this fix, flagged as an Open Question below) so a future fourth environment doesn't hit the same thing.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** this *is* the P2 punch-list item, scoped larger than originally described. Once shipped, that item should move to Resolved with a note about the true scope found.
- **Root cause, not fully confirmed:** the most likely explanation is that staging was provisioned by some path that skipped Supabase's usual automatic grant bootstrap (e.g. a schema-only restore that excluded privileges) — but this wasn't independently proven, since doing so would require reconstructing exactly how staging was originally created, which isn't recoverable from here. The fix doesn't depend on knowing the exact cause; it just restores the correct end state and prevents recurrence going forward.

## Non-Goals

- Does not change any RLS policy, table structure, or application code.
- Does not investigate *why* staging ended up this way beyond the plausible explanation above — not needed to fix it.
- Does not address the original punch-list item's narrower framing (4 specific Edge Functions) as a special case — the fix is schema-wide because the actual problem is schema-wide.

## Open Questions

1. **[Engineering]** Should `README.md`'s environment-setup instructions get a note about this default-privileges statement, in case a fourth environment is ever provisioned by hand in the future? Not required for this fix to work, just a documentation nice-to-have — happy to add it if wanted, otherwise skipping.
