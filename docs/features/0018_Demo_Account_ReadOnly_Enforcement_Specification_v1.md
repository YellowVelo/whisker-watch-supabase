# 0018_Demo_Account_ReadOnly_Enforcement_Specification_v1

**Status:** Implemented (2026-07-26). Live on `wysker-watch-dev`, `wysker-watch-staging`, and `Whisker-Watch` (prod).
**Date:** 2026-07-25
**Related files:** `src/api/entityClient.js`, `src/lib/accountType.js`, `src/components/AccountTypeBanner.jsx`, `src/components/InviteCoOwnerDialog.jsx`, `src/components/InviteSitterDialog.jsx`, `src/components/PetProfileContent.jsx`, `supabase/functions/delete-pet/index.ts`, `supabase/functions/invite-co-owner/index.ts`, `supabase/functions/invite-sitter/index.ts`, `docs/foundation/0006 Technical Standards.md`, `docs/launch-punch-list.md` (P2)

## Before You Approve This

- **This ended up bigger than "add an `if` check somewhere."** Demo accounts can currently write through three genuinely different paths in this codebase (ordinary entity CRUD, a couple of direct-to-database calls that skip the normal CRUD layer, and three admin-privileged Edge Functions), and each one needs its own guard — a single check in one place won't actually cover all of them. Details below.
- **One technical subtlety worth understanding, since it drove the design:** `delete-pet`, `invite-co-owner`, and `invite-sitter` all perform their actual writes using Supabase's "service role" — an elevated, admin-level connection that bypasses all of the database's normal owner-permission checks (Row Level Security, "RLS" — the rule that normally limits a user to only their own data). That's intentional and pre-existing (e.g. transferring pet ownership to a co-owner requires writing a row that belongs to someone else, which a regular user's own permissions would never allow). But it also means a database-level safety net checking "is this the demo user" **cannot see who the real caller was** for those three functions — it only sees the elevated service connection, not the person who triggered it. So those three specifically need their own explicit check inside the function itself (mirroring a pattern already used in `delete-account`, which already refuses to run for test/demo accounts, for a different reason — see Repo Findings below).
- Confirmed: this must be **demo-only, not test accounts.** The existing automated tests for `delete-pet`/`delete-account` (`docs/launch-punch-list.md` P0) genuinely create, transfer, and delete real data as `test1@`/`test2@` — making test accounts read-only would break those tests.
- No conflicts with locked decisions found.

## Functional Requirements

1. A demo account (`demo1@wyskerwatch.com`, or any account with `account_type = 'demo'`) can view every screen exactly as today, but cannot create, edit, or delete any pet-related data — no new/changed check-ins, no edited pet profiles, no added medications/vaccines/food/bloodwork records, no removed pets, no inviting or removing a co-owner or sitter.
2. When a demo user attempts a blocked action, they see a clear, friendly message explaining this is a demo and the action isn't available — never a raw technical error, and never something that silently does nothing with no explanation.
3. This has no effect on test accounts (`account_type = 'test'`) — those remain fully writable, exactly as today.
4. This has no effect on what a demo account can already do today that isn't a health-data write — e.g., the existing admin-gated reset/seed tools (`isDemoAdmin`) are untouched, and viewing/reading data is unaffected.

## Acceptance Criteria

- Given a signed-in demo account, when the owner taps any Save/Edit/Delete/Add action on pet data (check-ins, medications, vaccinations, bloodwork, food, baseline, onboarding), then the action is blocked before anything is written, and a friendly "this is a demo" message is shown instead.
- Given a signed-in demo account, when they try to invite a co-owner or pet sitter, or remove one, then the action is blocked with the same friendly message, before any email is sent or database row is written.
- Given a signed-in demo account, when they try to delete a pet, then the deletion is blocked with the same friendly message.
- Given a signed-in demo account, when they view Home, Pets, Trends, Pet Profile, or any read-only screen, then everything renders exactly as it does today — no change to reading/viewing.
- Given a signed-in **test** account, when they perform any of the above actions, then everything behaves exactly as it does today — fully writable, no new restriction.
- Given someone bypasses the app entirely and calls the database or an Edge Function directly using a demo account's credentials (not through the app's UI), when they attempt a write, then it is still refused — this isn't just a UI-level guardrail for the paths that go through the database directly (see Non-Goals for the one path this doesn't cover).

## Visual Reference

Not applicable — no new screens. The only new UI is a message (toast or inline notice, to be styled consistently with the app's existing toast pattern) shown when a blocked action is attempted.

## Technical Spec

Three separate write paths exist in this codebase, and each needs its own guard:

**1. Ordinary entity CRUD, via `src/api/entityClient.js`.** Per Technical Standards, "all data access goes through entityClient.js and entities.js" — this is the single choke point for the overwhelming majority of writes in the app (pets, medications, vaccinations, bloodwork, food, baselines, onboarding, etc.). `createEntityClient()`'s `create`/`update`/`delete`/`bulkCreate` methods will check `isDemoAccount(user)` (already exists, `src/lib/accountType.js`) before doing anything, and if true, throw a specific, recognizable error (not silently no-op) that calling UI code catches and turns into the friendly message — never a raw network/permission error reaching the user.

**2. A new database-level trigger, for anything that writes directly (bypassing `entityClient.js`) using the signed-in user's own session** — e.g. `checkinClient.js`'s `save_daily_check_ins` RPC (spec `0016`) and any other direct `supabase.from(...)` call. A new reusable Postgres trigger function, `public.prevent_demo_account_writes()`, raises an exception if the acting user's `profiles.account_type = 'demo'` (looked up via `auth.uid()`), attached as a `BEFORE INSERT OR UPDATE OR DELETE` trigger on every pet-scoped, user-mutable table: `pets`, `daily_check_ins`, `observations`, `medications`, `vaccinations`, `bloodwork`, `pet_foods`, `pet_baselines`, `pet_onboarding`, `symptom_logs`, `food_logs`, `pet_co_owners`, `pet_sits`, `pet_sit_logs`, `pet_sitter_access`. New migration (next number after `0034`). This is a real, unbypassable backstop — it fires regardless of which JS code path led to the write, as long as the write happens under the user's own session (not the elevated service-role one).

**Deliberately excluded from the trigger** (not user health/pet data, or not meaningfully at risk): `notifications`, `analytics_events`, `email_logs`, `profiles` (a demo user's own settings, e.g. timezone, aren't the "wait I broke the demo" risk this is about), `observation_types`/`observation_options` (global reference data, already not user-writable), `analytics_daily_summary` (dead — unused anywhere in the codebase), `wellness_scores` (not dead — `generate-vet-report` reads it live — but no code path writes to it outside `entityClient.js`, which layer 1 already covers).

**3. Explicit guards inside the three service-role Edge Functions** that bypass RLS entirely for their actual writes — `delete-pet`, `invite-co-owner`, `invite-sitter`. Each already resolves the caller's identity via their own JWT (a `userClient`) before switching to the elevated `adminClient` for the actual write. Add a check right after identity resolution: look up the caller's `profiles.account_type` and return a 403 if it's `'demo'` — the exact same pattern `delete-account` already uses (`supabase/functions/delete-account/index.ts`), just checking `'demo'` only (not `'test'`, since `delete-pet` specifically needs to keep working for test accounts' existing integration tests).

**Client-side UX for the Edge-Function paths:** `PetProfileContent.jsx` (delete pet), `InviteCoOwnerDialog.jsx`, `InviteSitterDialog.jsx` will check `isDemoAccount(user)` before even calling their Edge Function, showing the friendly message immediately — the server-side 403 above is the real enforcement; this is just so a demo user gets an instant, clear answer instead of a network round-trip that ends in an error.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found — no existing read-only/demo-write-blocking logic exists anywhere (confirmed by the punch-list item itself and a fresh search). `delete-account`'s existing `account_type` guard is a close precedent to follow, not something this duplicates — it blocks test/demo from deleting *their own account*, which is a different concern from blocking demo from editing *pet data*.
- **Technical debt nearby:** none introduced. `entityClient.js`'s role as the single CRUD choke point (already documented in Technical Standards) is exactly what makes layer 1 of this fix simple.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** this *is* the P2 punch-list item ("Demo Account Phase 3 has no read-only enforcement"). Implementing this resolves it.

## Non-Goals

- Does not change anything about test accounts.
- Does not touch the existing admin-gated reset/seed tools (`isDemoAdmin`/`isInternalAccount`) — those remain exactly as they are, since curating the demo dataset is a deliberate, authorized exception to "demo can't write," not a gap.
- Does not add read-only enforcement to `notifications`, `analytics_events`, `email_logs`, or `profiles` — see the exclusion list above.
- **One known gap, not fully closed by this spec:** if a demo account's credentials were used to call `checkinClient.js`'s underlying `save_daily_check_ins` RPC directly (bypassing the app entirely, e.g. via a raw HTTP request with a valid demo-user JWT), the new database trigger *would* catch it, since that RPC runs under the calling user's own session, not an elevated one — so this case is actually covered. The one path that is **not** database-level-enforced is the three Edge Functions in layer 3 above: their protection is the explicit account_type check added to each function's own code, not a database trigger, since their actual writes happen through the elevated service-role connection where the trigger can't see who the real caller was. This is the same trust boundary `delete-account`'s existing guard already relies on — consistent with precedent, not a new kind of risk, but worth naming plainly rather than implying every layer is equally unbypassable.

## Open Questions

None — both open questions (enforcement layer: client + DB trigger both; scope: all pet-scoped data plus co-owner/sitter actions) were resolved during scoping.
