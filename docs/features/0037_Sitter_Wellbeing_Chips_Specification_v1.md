# 0037_Sitter_Wellbeing_Chips_Specification_v1

**Status:** Partially implemented — verified against code 2026-08-18. The feature itself is shipped (`src/pages/Pets.jsx`'s `SitterPetRow` renders the wellbeing badges; RLS migration `0045_daily_check_ins_observations_select_sitter.sql` is live). Automated Playwright coverage from this spec's Test Plan is **not started** (Launch Plan Task #18) — `e2e/pet-sitter.spec.js` only tests navigation to `/pet-sitter`, with no second-identity or wellbeing-chip assertions yet. Note: this spec's plan to use `test3@wyskerwatch.com` as the new sitter fixture account is now stale — `test3@` was claimed by spec 0053 (migration `0049_test3_admin_fixture_account.sql`) for admin-route tests instead. Task #18 will need a different account (e.g. `test4@`).
**Date:** 2026-08-02
**Related files:**
- `src/pages/Pets.jsx` (`SitterPetRow`, lines 205-223)
- `src/components/PetProfileContent.jsx` (wellbeing-chip loading and rendering, lines 137-235, 460-492)
- `src/components/AttributeTrendChip.jsx`
- `src/lib/checkin/checkinClient.js` (`getWellbeingDirections`, `getAttributeDirectionsForPets`)
- `supabase/migrations/0014_daily_checkins_wellness.sql` (existing owner-only RLS on `daily_check_ins`/`observations`)
- `supabase/migrations/0031_pets_select_sitter.sql` (existing `is_pet_sitter()` helper — the model for this spec's new policies)
- `docs/features/0008 Pets Feature Specification V3.md` (documents this as a known, undecided gap)
- `docs/launch-punch-list.md` (line 81, the punch-list item this spec resolves)
- `e2e/fixtures.js`, `e2e/global-setup.js` (single-identity Playwright fixture — needs extending for this)

## Before You Approve This

- **This is a two-part fix, not a UI tweak.** The database currently has no rule allowing a sitter to read a pet's daily check-in or symptom data at all — only the pet's owner/co-owner can. Wellbeing chips can't show real data for a sitter until that's changed, separately from adding the chip UI itself.
- **The chips must be non-interactive for sitters.** Owners' chips are tappable buttons that jump to a specific Trends chart. But a sitter's whole pet row is *already* a tap-to-Trends link — putting a clickable button inside a clickable row is invalid, broken behavior in browsers and worse for accessibility (a screen reader user can't tell the two "buttons" apart). So sitters get chips as plain read-only badges, and tapping anywhere on the row still goes to Trends, matching how it already works today.
- **Testing this requires a new test setup.** The automated test suite currently only ever logs in as one person (a pet owner). Proving "a sitter sees the right chips" needs a second saved test login, which doesn't exist yet — this spec adds it.
- No duplicate or overlapping feature was found — this fills a gap that was already tracked, not competing with something else.

## Functional Requirements

1. On the Pets screen's "Pets I Sit" section, each pet's row shows the same five Wellbeing indicators (Energy, Mobility, Breathing, Itching, Behavior) that an owner sees on their own pets — as small read-only badges, not tappable buttons.
2. Each badge shows the same up/down/steady/unknown signal an owner sees, based on that pet's check-in from today compared with yesterday.
3. If a pet hasn't been checked in on yet today, the badges show the same "no check-in yet" state an owner sees, not an error.
4. Tapping anywhere on the row (including on/near a badge) still opens that pet's Trends page, exactly as it does today — the badges do not add a second, separate tap target.
5. If wellbeing data fails to load, the row shows the same "Unable to load wellbeing" message an owner would see, instead of blank space or a stuck loading spinner.

## Acceptance Criteria

- Given a signed-in user has sitter access to a pet (and does not own or co-own it), when they open the Pets screen, then that pet's row under "Pets I Sit" shows five Wellbeing badges alongside the pet's name and photo.
- Given the shared pet has a check-in logged for today, when the badges load, then each one shows the correct direction (improved / declined / steady / not enough data) matching what the pet's owner would see for the same day.
- Given the shared pet has no check-in yet for today, when the row loads, then the badges show the "no check-in yet" state, not a loading spinner or an error.
- Given the badges are showing, when the sitter taps a badge directly, then nothing happens except the same row-tap navigation to Trends that tapping anywhere else on the row does — no separate action fires.
- Given the wellbeing data fails to load (e.g. a network error), when the row renders, then it shows the same "Unable to load wellbeing" message used elsewhere, not a broken or empty layout.

## Test Plan

- Row shows 5 badges for a shared pet → Playwright test, new.
- Badges reflect correct direction for a logged check-in → Playwright test, new.
- "No check-in yet" state renders correctly → Playwright test, new.
- Tapping a badge doesn't create a second action, only row navigation fires → Playwright test, new (asserts a single `Trends` navigation, no duplicate handler).
- "Unable to load wellbeing" fallback renders on failure → not covered by Playwright; same as the owner-side equivalent, which isn't tested via induced network failure either (would require intercepting Supabase requests, out of scope here) — covered by manual QA only, consistent with current test coverage for this same fallback message elsewhere.
- **Seeding/access constraints:** none of the above are reachable with the existing single-identity fixture (`test1@`, an owner). This feature is inherently about a second identity (the sitter) viewing a first identity's (the owner's) pet. Needed setup:
  1. A second Playwright fixture account with its own saved login session, added alongside the existing `test1@` fixture in `e2e/global-setup.js`/`fixtures.js`. **Not `test2@wyskerwatch.com`** — per `.env.playwright.example`, that account is already reserved for the separate Deno Edge Function CI suite so the two suites never collide. This needs a new account (e.g. `test3@wyskerwatch.com`), added to the `classify_account_type()` test-account allowlist (migration `0010_account_type.sql`) the same way `test1@`/`test2@` were.
  2. `test1@` (as the pet's owner, using a normal signed-in session — no service-role key needed) creates a `pet_sits` row and a `pet_sitter_access` row naming the new account's user id as the sitter, and logs a check-in for that pet — all of which `test1@`'s own account is already allowed to do under existing RLS.
  3. The test then signs in as the new sitter account and asserts on the "Pets I Sit" row.
  This is new test infrastructure this repo doesn't have yet (today's suite never simulates a second identity), so it's scoped as part of this spec rather than assumed to already work.

## Visual Reference

No mockup or screenshot was provided. Layout re-uses the existing `AttributeTrendChip` component exactly as owners see it (same grid, same colors, same labels) so no new visual design is needed — only the `interactive` flag changes from `true` to `false` (the default) for this call site.

## Technical Spec

- **Schema:** Two new RLS (row-level security — the database's row-by-row read/write permission rules) policies, modeled directly on the existing `is_pet_sitter()` helper function added in `supabase/migrations/0031_pets_select_sitter.sql`:
  - `daily_check_ins_select_sitter` — `for select using (is_pet_sitter(pet_id, auth.uid()))`
  - `observations_select_sitter` — `for select using (is_pet_sitter(pet_id, auth.uid()))`
  New migration file, next sequential number after the latest in `supabase/migrations/`. Per CLAUDE.md, this must be pushed to `wysker-watch-dev`, `wysker-watch-staging`, and `Whisker-Watch` (prod) manually, not just merged to `main`.
- **Components/files touched:**
  - `src/pages/Pets.jsx` — `SitterPetRow` gains the wellbeing-fetch-and-render logic currently unique to `PetProfileContent.jsx`'s `context === 'pets'` branch. Rather than duplicating that logic, extract the existing fetch (`getWellbeingDirections`) and the chip-grid JSX into something both `PetProfileContent` and `SitterPetRow` can call, so there's one implementation of "load and show 5 wellbeing badges," not two copies drifting apart over time (the same duplication concern CLAUDE.md flags for `BottomSheet`/`PillToggle`/etc.).
  - `src/components/AttributeTrendChip.jsx` — no changes needed; it already supports a non-interactive, read-only `<div>` render mode (`interactive` defaults to `false`), which is exactly what sitter rows need.
- **API / edge functions:** none — this is a direct-table RLS change and a client-side read, no Edge Function involved.
- **Design System compliance:** checked against `docs/foundation/0005 Design System.md` including its Amendments. No new UI is introduced — this re-uses `AttributeTrendChip` exactly as already built and already compliant (13px+ text per Amendment #7, no raw hex, no hand-rolled duplicate). No conflicts found.
- **Constraints from CLAUDE.md / locked decisions:** none conflict. This does not touch Vibe/scoring logic (spec 0012) — it only reads existing directional data the same way the owner's screen already does. Backend changes will need the manual three-project deploy CLAUDE.md calls out, which is worth flagging explicitly at ship time so it isn't the "missed before" case CLAUDE.md warns about.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found competing with this. The nearest related code (`PetProfileContent.jsx`'s wellbeing-chip block) is the thing this spec reuses, not a duplicate to reconcile.
- **Technical debt nearby:** the wellbeing-chip fetch/render logic currently lives inline inside `PetProfileContent.jsx`, written assuming it's the only place chips are ever shown. Extracting it (rather than copy-pasting into `SitterPetRow`) avoids creating a second copy that could quietly drift out of sync, the same failure mode CLAUDE.md's shared-primitives note (`BottomSheet`/`PillToggle`/etc.) already warns about for this codebase.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** this spec directly resolves the open item at `docs/launch-punch-list.md` line 81 ("Shared/co-owned (sitter-access) pets show no Wellbeing chips"). Once implemented and verified, that item should be checked off and its resolution noted, the same way neighboring resolved items in that file document what changed and when.

## Non-Goals

- No medication count, weight, condition chips, or any indicator beyond the five Wellbeing badges — the punch-list item and this spec are scoped to Wellbeing chips only.
- No expand/collapse behavior for sitter rows — the row stays a single tap target to Trends, matching current behavior. (Making sitter rows expandable like an owner's card was considered and explicitly deferred — see your answer to the "show chips?" question.)
- No change to what a sitter can *do* with the data (no editing, no logging a check-in on behalf of the owner) — read-only in every sense, both visually and at the database level.
- No change to symptom-count logic, Vibe scoring, or any part of spec 0012.

## Open Questions

None outstanding — product direction (read-only chips, include the backend migration) was confirmed before drafting.
