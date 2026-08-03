# 0043_Concurrent_CheckIn_Edit_Conflict_Detection_Specification_v1

**Status:** Draft
**Date:** 2026-08-02
**Related files:** `supabase/migrations/0014_daily_checkins_wellness.sql`, `supabase/migrations/0034_save_daily_check_ins.sql`, `src/lib/checkin/checkinClient.js`, `src/components/DailyCheckInSheet.jsx`, `src/components/DailyCheckInModal.jsx`, `docs/features/0026_Edit_Todays_CheckIn_Specification_v1.md`, `supabase/migrations/0004_co_owner_accounts.sql`

## Before You Approve This

- **This directly touches a decision made two days ago.** Spec 0026 (2026-07-31) explicitly decided *against* any warning when the same person overwrites their own earlier same-day entry. This spec does not reopen that — it only reacts when a *different* signed-in co-owner's save is involved. The two need to stay clearly distinct in the UI copy so they don't read as contradictory.
- **The database already has what's needed to detect this** — every check-in row already silently records the exact moment it was last saved (`updated_at`, auto-maintained since this table was created). No new column is required.
- **Scoped to co-owners only, by decision.** Pet sitters can also save check-ins today (a `source: 'sitter'` save is a real, existing path), so the same silent-overwrite risk technically exists there too — but this spec deliberately does not cover it. Noted as a real Non-Goal, not an oversight.
- **Identifying "who" is workable without new privacy exposure** — co-owners are already tracked by their email address on a pet (visible today via "Manage Access"), so showing "so-and-so@email.com already saved this" doesn't require exposing anything not already shown elsewhere.
- No conflicts with any other locked decision or Design System rule found beyond the 0026 note above.

## Functional Requirements

1. When a co-owner opens a pet's Daily Check-In and sees what's already saved for that day, the app remembers exactly when that saved entry was last touched.
2. If, before they hit Save, the *other* co-owner has already saved a newer version of that same day, the app must catch this before the save goes through.
3. When that happens, the save is stopped and a simple pop-up shows what the other co-owner already entered (e.g. "Jamie already saved this as Off Day (vomiting).") with two choices: "Keep Mine" or "Keep Theirs."
4. Choosing "Keep Mine" saves this co-owner's version, overwriting the other's (now a deliberate choice, not an accident). Choosing "Keep Theirs" discards this co-owner's in-progress edits entirely and leaves the other co-owner's saved entry as-is — no further screen or merge step.
5. This only triggers for a genuinely different co-owner's change. If it's the same person re-editing their own earlier entry from today, nothing changes — that stays exactly as spec 0026 already decided (immediate save, no warning).
6. Applies both to today's check-in and to editing a past day via Catch-Up, since both share the same underlying save mechanism and both can be touched by more than one co-owner.

## Acceptance Criteria

- Given Co-Owner A opens today's check-in while it's still blank, when Co-Owner B saves a Great Day for the same pet/day first, then Co-Owner A's save must not silently replace Co-Owner B's — Co-Owner A must see it happened before it's overwritten.
- Given a conflict is caught, when Co-Owner A is shown the pop-up, then it clearly shows what Co-Owner B actually entered (their Vibe and symptoms), with "Keep Mine" / "Keep Theirs" as the only two choices.
- Given the pop-up, when Co-Owner A taps "Keep Mine," the save proceeds with Co-Owner A's version. When Co-Owner A taps "Keep Theirs," Co-Owner A's in-progress edits are discarded immediately, nothing further is shown, and Co-Owner B's entry is untouched.
- Given the same person previously saved this same day themselves, when they reopen and resave it, no conflict pop-up appears — unchanged from spec 0026.

## Test Plan

- Conflict detection + pop-up content + "Keep Mine"/"Keep Theirs" behavior → Playwright test using two separate signed-in co-owner sessions against the same test pet: one session loads the check-in, the second session saves in the background, then the first session's save attempt is asserted to show the conflict pop-up (with the correct co-owner's saved data) instead of silently succeeding.
- "No warning for the same person" boundary case → same test pattern, single session, asserting the pop-up never appears — this is the case most likely to regress by accident, worth its own explicit check.
- **Seeding/access constraints:** Needs two distinct signed-in co-owner test identities with shared access to the same test pet, usable as two separate sessions inside the automated test. You mentioned co-owner test logins already exist in **production** — those aren't usable here; the automated test suite needs its own dedicated accounts on the **dev** database (`wysker-watch-dev`) so it can safely create/delete fake check-ins repeatedly without touching real data. This is an engineering setup detail to confirm/build during implementation, not a product decision.

## Visual Reference

No mockup provided. Agreed direction: a simple pop-up (reusing the existing `BottomSheet` component, not a new hand-rolled dialog, per the Design System's de-duplication rule) — one line stating what the other co-owner saved, plus "Keep Mine" and "Keep Theirs" buttons. Exact copy/spacing to be finalized during implementation, not blocking approval.

## Technical Spec

- **Schema:** No new columns. Reuses the existing `daily_check_ins.updated_at`, already auto-maintained by an existing trigger.
- **Save logic:** The shared save function (`save_daily_check_ins`, migration 0034) needs to accept the "last known saved time" the app had loaded, and compare it against the row's real current saved time at the moment of saving — inside the same all-or-nothing save it already does. If they don't match, it must refuse the overwrite and hand back what's currently actually saved (the other co-owner's entry), instead of proceeding.
- **Components/files touched:** a new migration extending `save_daily_check_ins`; `checkinClient.js` (carry the loaded timestamp through every save call, handle the new "conflict" outcome); `DailyCheckInSheet.jsx`/`DailyCheckInModal.jsx` (new pop-up in the save flow, built from `BottomSheet`).
- **API / edge functions:** None new — stays inside the existing database function pattern.
- **Design System compliance:** The new pop-up must reuse the existing shared `BottomSheet` (and standard button styles), not a new hand-rolled dialog, per the existing de-duplication rule.
- **Constraints from CLAUDE.md / locked decisions:** Doesn't touch how Vibe or symptom count is calculated — purely about catching an overwrite at save time.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None — no existing conflict-detection of any kind in this save path today.
- **Technical debt nearby:** None new. Worth flagging clearly in implementation: spec 0026 very recently and deliberately chose *no* warning for the solo-edit case — this spec's copy/UI needs to visibly not contradict that.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** This is a new, previously-unlisted risk, surfaced during this session while scoping the (separate) punch-list item that produced spec 0042. Recommend adding it to the punch list as its own new line once this spec is approved, rather than folding it into that item's existing wording (which is about database plumbing, not this).

## Non-Goals

- Does not reopen spec 0026's decision — a person re-editing their own earlier same-day entry still saves immediately, no warning.
- Does not cover pet sitters overwriting, or being overwritten by, an owner or co-owner — scoped to co-owner-to-co-owner conflicts only for v1. A real, similar risk, deliberately left for a possible future spec.
- Does not attempt to silently merge two people's entries — always requires an explicit human decision (Keep Mine / Keep Theirs).
- Does not cover the separate "leftover stale data" plumbing concern — that's spec 0042.
- Does not add any live "someone else is editing this right now" real-time indicator — this only checks at the moment of saving, not continuously.

## Open Questions

None remaining on product decisions. One engineering setup item to confirm during implementation: dedicated co-owner test accounts on `wysker-watch-dev` (separate from the production co-owner accounts you already have) for the Playwright test described above.
