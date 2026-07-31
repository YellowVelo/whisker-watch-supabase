# 0027_Demo_Account_Auto_Reset_On_Login_Specification_v1

**Status:** Implemented and manually verified end-to-end (2026-07-31). Build/lint/all unit tests pass. Confirmed live: (1) `test1@` (non-demo) logs in with no delay and no demo messaging — unaffected. (2) `demo1@` shows "Setting up your demo…" during login, lands on the standard Maple/Cooper baseline. (3) Changed Cooper's Vibe from Great Day to Tough Day mid-session (a real database write), then logged out and back in as `demo1@` — Cooper was back to Great Day, confirming the automatic wipe-and-reseed genuinely runs on every login. No console or server errors in any of the above.
**Date:** 2026-07-31
**Related files:** `src/pages/Login.jsx`, `src/lib/accountClient.js`, `src/lib/seedTestData.js`, `src/lib/accountType.js`, `src/components/InviteCoOwnerDialog.jsx`, `src/components/InviteSitterDialog.jsx`, `supabase/functions/reset-sandbox-account/index.ts`, `docs/features/0018_Demo_Account_ReadOnly_Enforcement_Specification_v1.md`, `docs/launch-punch-list.md`

---

## Before You Approve This

- **This replaced a much bigger design after you confirmed one constraint: only one demo login active at a time.** That single decision means demo writes can just be real writes (same as any account) instead of a browser-only illusion — this version touches 2 files with real logic changes, not 6+.
- **The trade-off you already agreed to:** during an active demo visit, the changes really do sit in the real database — they're just guaranteed to be wiped before the *next* login sees anything. Repeating this here since it's the crux of the whole simpler design.
- **Confirmed with the owner: no admin exception.** Every login to the demo account resets it — including the admin's own — so nothing anyone does while logged into the demo account, admin or not, ever survives past that login. If the demo dataset itself needs to change going forward, that happens by editing the `demo_showcase` seed scenario's definition in code, not by logging in and changing things through the app.
- **No conflicts with CLAUDE.md's locked decisions** — no schema/migration changes, no change to the Vibe/Symptom-Count model, no backend deploy process changes.

---

## Functional Requirements

1. A demo account (`account_type = 'demo'`) can freely create, edit, and delete anything — pets, check-ins, medications, vaccinations, food, weight, baseline, bloodwork, and now also deleting a pet entirely — with real, normal-feeling saves. Nothing is blocked for these actions.
2. Every time *anyone* logs into the demo account — including the demo admin — it is automatically wiped and reseeded back to the standard Maple/Cooper baseline before they see anything. No exception for admin logins: nothing done while logged into the demo account persists past that login for anyone.
3. Only one demo session can be active at a time. Logging into the demo account signs out any other device/browser that was already logged into it, so two visitors can never edit the same live data at the same moment.
4. Inviting a co-owner or a pet sitter remains blocked for demo accounts, with the same friendly, already-existing error-message style used elsewhere in the app — the one exception to Requirement 1, since a real email that's already been sent can't be undone by wiping data.
5. No effect on test or production accounts.

## Acceptance Criteria

- Given a demo login (by anyone, including the admin), when the app finishes loading, then it always shows the standard Maple/Cooper baseline, regardless of what any previous visitor — or the admin themself, last time — did.
- Given the automatic reset/reseed fails partway through login (e.g. a network hiccup), when this happens, then the visitor sees a clear error and is not let into the app with partial or mixed data — login is blocked until it succeeds.
- Given a demo login is in progress, when the reset/reseed step is running, then the login screen shows a "Setting up your demo…" message rather than a generic/blank loading state.
- Given a demo session, when the visitor adds/edits/deletes a pet, check-in, medication, vaccination, food entry, or bloodwork record, then it saves normally with no blocked-action message.
- Given a demo session, when the visitor deletes a pet entirely, then it's really deleted for the rest of their visit (and restored automatically on the next login, per Requirement 2).
- Given a demo session already open in one browser, when someone logs into the same demo account from a second browser/device, then the first browser's session ends (its next action requires logging in again).
- Given a demo session, when the visitor tries to invite a co-owner or a pet sitter, then the action is blocked with a friendly error toast and no email is sent.
- Given a test or production account, when any of the above is attempted, then nothing changes from today's behavior.

## Visual Reference

No mockups provided. No new screens — Login shows a "Setting up your demo…" message while the reset/reseed step runs (replacing the normal "logging in…" state, demo accounts only), plus the app's existing generic error-toast pattern for blocked invites and for a failed reset/reseed.

## Technical Spec

- **`src/pages/Login.jsx`:** after `supabase.auth.signInWithPassword(...)` succeeds, look up the signed-in user's `account_type` (a quick `profiles` table read). If it's `'demo'` (no exception for `role = 'admin'` — every demo login gets this, per the owner's confirmation above):
  1. Show a "Setting up your demo…" loading state instead of the normal login spinner.
  2. Call `supabase.auth.signOut({ scope: 'others' })` — a built-in Supabase Auth feature that invalidates every *other* active session for this same account, without needing any new backend code or admin/service-role access.
  3. Call the existing `resetSandboxAccount()` (`src/lib/accountClient.js`, wraps the already-built `reset-sandbox-account` Edge Function) to wipe whatever the previous visitor left behind.
  4. Run the existing `demo_showcase` scenario's `.run()` (`src/lib/seedTestData.js`, `SEED_SCENARIOS`) to reseed the standard Maple/Cooper baseline.
  5. If either step 3 or step 4 fails, show a clear error and do not redirect into the app — the visitor stays on the login screen rather than entering with partial/mixed data.
  6. Only once both steps succeed, redirect to `/`.
- **`src/components/InviteCoOwnerDialog.jsx`, `src/components/InviteSitterDialog.jsx`:** add an `isDemoAccount(user)` check (`src/lib/accountType.js`, already exists) before calling their respective Edge Function. If true, show the same generic error-toast pattern already used elsewhere in these same components for real failures, and skip the network call entirely.
- **No changes needed anywhere else** — `entityClient.js`, `checkinClient.js`, `PetProfileContent.jsx`'s Delete Pet, all Edge Functions, and the database schema stay exactly as they are today. Everyday CRUD (including Delete Pet) already behaves correctly for this design; the only new work is making the reset automatic and reliable at login time, plus the two invite blocks.
- **Constraints from CLAUDE.md / locked decisions:** respected — no schema/migration changes, no change to test-account or production-account behavior, no change to the Vibe/Symptom-Count model.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none — this reuses two things that already exist and already work today (`reset-sandbox-account` and the `demo_showcase` seed scenario, both currently triggered manually via Settings' Reset/Seed buttons), just triggering them automatically at login instead of requiring someone to click a button.
- **Technical debt nearby:** none introduced. `supabase.auth.signOut({ scope: 'others' })` is a standard, already-available Supabase Auth capability — worth confirming during implementation that the project's installed `@supabase/supabase-js` version supports the `scope` option as expected, since a version mismatch would silently no-op rather than throw a clear error.
- **Orphaned features nearby:** none new. The database trigger from spec 0018 (`public.prevent_demo_account_writes()`) stays dropped (migration `0037`) — this spec doesn't touch it or need it back.
- **Punch list / known issues in this area:** this fully replaces the goal of `docs/launch-punch-list.md`'s P2 item ("Demo Account Phase 3 has no read-only enforcement") — that item's very premise (read-only enforcement) no longer applies once this ships, since the model is "auto-reset," not "block." Flagged for a `doc-updater` pass after implementation, not done as part of this spec.
- **Spec 0018 is now fully obsolete, not just superseded in style.** Its block-based approach (three enforcement layers including a database trigger) isn't needed at all under this design — the only piece of it this spec reuses is the "check `isDemoAccount()` before calling an Edge Function, show a friendly error" pattern, applied narrowly to just the two invite flows. 0018's file should get a status update once this ships.

## Non-Goals

- Delete Pet is not blocked — it's fully real and unblocked, since the automatic reset makes it safe.
- No change to test or production account behavior.
- No change to `entityClient.js` or `checkinClient.js` — this spec doesn't touch the data-access layer at all.
- Does not change the existing admin Reset Test Account / Seed Data tool's mechanism in Settings — it still exists for mid-session, this-visit-only experimentation, understanding that (per the owner's confirmation) it won't survive the next login either, admin or not.
- Does not change what `demo_showcase` itself contains — if the seeded baseline needs to look different going forward, that's a separate change to `src/lib/seedTestData.js`, not part of this spec.

## Open Questions

None — all three from the previous draft are resolved above: no admin exception (Functional Requirement 2), reset/reseed failure blocks login with an error (Acceptance Criteria, Technical Spec step 5), and Login shows a "Setting up your demo…" message during the extra step (Visual Reference, Technical Spec step 1).
