# Requirements: `owner` Account Type

**Status:** Implemented (07-12), undocumented. `account_type` itself (migration 0010: `production`/`test`/`demo`) also has no doc — this covers the full `account_type` model, not just the `owner` addition, since no prior doc exists to extend.
**Source files:** [supabase/migrations/0010_account_type.sql](../../supabase/migrations/0010_account_type.sql), [0025_account_type_owner.sql](../../supabase/migrations/0025_account_type_owner.sql), [src/lib/accountType.js](../../src/lib/accountType.js).

## Purpose

`profiles.account_type` lets the app branch behavior for internal test/demo accounts without touching real user data. `owner` was added later as a fourth value: a real personal-use account (Lynn's own pets, presumably) that should be excluded from future real-user analytics *without* being eligible for the destructive `reset-sandbox-account` wipe path that `test`/`demo` accounts get. This doc exists so the distinction between all four types — and specifically why `owner` had to be its own value rather than reusing `production` or `demo` — is written down somewhere other than migration comments.

## Functional Requirements

- Four `account_type` values, all on `profiles.account_type`, `not null default 'production'`:
  - **`production`** — a normal external user. Default for anyone not matched below.
  - **`test`** — internal QA account. Assigned by exact-email allowlist at signup (`classify_account_type()`), currently `test1@wyskerwatch.com`, `test2@wyskerwatch.com`.
  - **`demo`** — shared demo/showcase account. Assigned the same way, currently `demo1@wyskerwatch.com`.
  - **`owner`** — a real personal-use account (not synthetic), added via migration 0025. Not assigned by the email allowlist/trigger — set directly (dashboard or manual update), since it's a one-off distinction for a specific real account, not a class of signups to auto-classify.
- **Assignment mechanism** for `production`/`test`/`demo`: the `handle_new_user()` trigger calls `classify_account_type(email)` on every signup and inserts the resulting value into the new `profiles` row. This is allowlist-based, not self-service or admin-UI-driven — to add a new test/demo account, add its email to the `CASE` list in a new migration.
- **`owner` is deliberately excluded from that trigger/allowlist** — there is no signup path that produces `owner` automatically. It must be set directly against an existing row.
- **Client-side helpers** ([accountType.js](../../src/lib/accountType.js)): `isProductionAccount`, `isTestAccount`, `isDemoAccount`, `isOwnerAccount` (simple equality checks against `user.account_type`, with `isProductionAccount` treating a missing/null value as `production`), plus `isDemoAdmin` (checks `user.role === 'admin'`, unrelated to `account_type`) and `isInternalAccount` (`isTestAccount(user) || (isDemoAccount(user) && isDemoAdmin(user))` — the combined gate for "may use the internal reset/seed tools").

## Empty States / Load Errors

- A `profiles` row with `account_type` somehow null — not reachable in practice (`not null default 'production'`), but `isProductionAccount()` treats `user?.account_type ?? 'production'` defensively anyway.
- Analytics `track()` calls `profiles` for `account_type` and falls back to `'production'` if the profile lookup itself fails (see [requirements-analytics-events.md](requirements-analytics-events.md)) — an `owner` account whose profile fetch fails would be mis-tagged as `production` in that one event, not a systemic issue.

## Business Rules

1. **`owner` exists specifically to keep `reset-sandbox-account` safe.** That Edge Function's guard only permits `account_type in ('test', 'demo')` ([reset-sandbox-account/index.ts:71](../../supabase/functions/reset-sandbox-account/index.ts#L71)) — an `owner` account can never be wiped through that path, "safe by construction, not by convention" (the code comment's own words). This is the entire reason `owner` isn't just folded into `demo`.
2. **`owner` is meant to be excluded from future real-user analytics**, same intent as `test`/`demo`, but is real personal usage rather than synthetic QA data — so it should eventually get its own analytics treatment distinct from both "real users" and "internal test noise." (No filtering is implemented yet anywhere — see the analytics doc's note that the nightly rollup currently counts all account types.)
3. **`isInternalAccount()` deliberately does not include `owner`.** Internal tooling access (reset/seed) is gated on `test` OR (`demo` AND admin role) — an `owner` account holder does not get sandbox-reset/seed access just by virtue of being a real personal account, even though it's "Lynn's own."
4. **Adding a new test/demo email requires a migration**, not a runtime toggle — this is intentional friction, keeping the allowlist "short and deliberate" (migration 0010's own phrasing) since anyone signing up with one of those exact emails gets non-production status automatically.
5. **The 0025 migration finds and drops the existing check constraint by introspecting `pg_constraint`** rather than assuming a specific name, specifically so it doesn't break if the constraint's actual name differs from what a fresh `0010` migration would generate — worth noting as the pattern to follow for any *future* `account_type` value addition.

## Data Requirements

- `profiles.account_type text not null default 'production' check (account_type in ('production', 'test', 'demo', 'owner'))`.
- `classify_account_type(email) returns text` — pure/immutable SQL function, allowlist lookup only, does not know about `owner`.
- `handle_new_user()` trigger — inserts the classified type on every new `auth.users` row; does not and cannot produce `owner`.

## Acceptance Criteria

- [ ] A doc (README section or `docs/account-types.md`) lists all four `account_type` values, what each means, and how each is assigned (auto via allowlist vs. manual).
- [ ] The doc states explicitly why `owner` had to be a distinct value rather than reusing `demo`: to be excluded from `reset-sandbox-account`'s wipe eligibility while still being excludable from analytics.
- [ ] The doc documents `isInternalAccount()`'s exact gate (`test` OR (`demo` AND admin)) since that's the actual authorization check for sandbox tooling, and clarifies `owner` does not qualify.
- [ ] The doc explains the "add a migration to add a test/demo email" process for anyone who needs to add a new internal account later.
- [ ] No code changes — documentation only, unless a genuine gap is found (e.g. if analytics filtering for `owner`/`test`/`demo` is later scoped, that's a separate follow-up, not part of this doc task).

## Edge Cases

- An account manually set to `owner` that later needs to become a normal `production` account (e.g. account changes hands) — no migration/tooling handles this transition; it would be a manual `UPDATE`. Worth a one-line note rather than new tooling.
- If a second real personal-use account is ever added (not just Lynn's), the current manual-set approach for `owner` doesn't scale the way the email-allowlist does for `test`/`demo` — flag as a known limitation, not something to fix preemptively.
- `isProductionAccount()`'s null-coalescing to `'production'` means a not-yet-loaded `user` object (still fetching profile) would transiently read as "production" in any component checking it before the profile arrives — mostly benign given how it's used, but worth a note if a future feature makes a security-relevant decision based on `isProductionAccount()` before profile load completes.

## Implementation Notes for Claude Code

- This is a documentation task grounded entirely in existing migrations and `accountType.js` — do not add a fifth account type, do not change the `reset-sandbox-account` guard, and do not add analytics filtering as part of writing this doc.
- If write access to a combined `docs/account-types.md` makes more sense than a README section (there's already a growing set of small `docs/*.md` files from the 07-14 audit), prefer that over inflating README further — use judgment based on how README is organized by the time this is written.
