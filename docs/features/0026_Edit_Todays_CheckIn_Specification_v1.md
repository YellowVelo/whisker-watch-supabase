# 0026_Edit_Todays_CheckIn_Specification_v1

**Status:** Implemented (2026-07-31, not yet manually verified in a running app — no Supabase credentials available in this worktree, see implementation notes)
**Date:** 2026-07-31
**Related files:** `src/components/PetProfileContent.jsx`, `src/components/CheckInStatusBanner.jsx`, `src/components/DailyCheckInModal.jsx`, `src/pages/Home.jsx`, `src/pages/PetProfile.jsx`, `docs/features/0012_DailyCheckIn_Vibe_Trends_Specification_v5.md`, `docs/foundation/0008 Navigation & Information Architecture_V4.md`, `docs/launch-punch-list.md`

---

## Before You Approve This

- **This is two changes bundled together, not one.** (1) Delete a dead button that can never be tapped by a real user today. (2) Build a new, reachable way to do the thing that dead button used to do. Splitting these into separate PRs is possible but they're tightly related, so this spec covers both.
- **A foundation doc is stale.** `docs/foundation/0008 Navigation & Information Architecture_V4.md` (normally treated as locked/trustworthy per CLAUDE.md) still describes the dead button's location as a live page. This spec flags it for a `doc-updater` pass but doesn't fix foundation docs itself — that's a separate step after this spec is approved.
- **No database or schema changes.** This is purely a UI change — reusing an edit path (`DailyCheckInModal`'s `existingCheckIn` prop) that already exists and is already used elsewhere (the Multi-Day Catch-Up flow edits past days the same way). Nothing new is being invented at the data layer.
- **No conflicts found** with CLAUDE.md's locked Vibe/Symptom-Count model — this spec doesn't change what's recorded or how it's scored, only when/where an owner can reopen and re-save it.

---

## Functional Requirements

1. Once an owner has completed today's Daily Check-In for a pet (Great Day / Off Day / Tough Day / Skipped), they can still go back and change their answer later that same day — for example, if they tapped the wrong option by mistake, or a pet's condition changed over the course of the day.
2. This "go back and change it" option must be reachable from two places an owner already visits daily:
   - **Home**, on the one-line check-in status row under each pet's card (today, once checked in, that row is just a link to Trends with no way to edit). Once checked in, this row's label changes from "Start [Pet]'s Daily Check-In" to "Edit [Pet]'s Daily Check-In" and tapping it reopens the check-in instead of navigating to Trends.
   - **Pets tab**, on the pet's own card, after tapping "Show More" to expand it (the collapsed card face is unchanged — this is not meant to be reachable without expanding first). The existing "Observations" row in the expanded card, which today reads "Start Daily Check-In" only before a check-in exists, keeps working the same way afterward too: once checked in, its label changes to "Edit Daily Check-In" and it stays tappable, reopening the check-in, instead of becoming a static, unclickable summary.
3. Reopening today's check-in shows the exact same Daily Check-In flow used to create it (Vibe selection, then the symptom/observation steps), pre-filled with what was already saved — not a stripped-down or different version.
4. Saving again simply overwrites today's entry. No extra warning or "are you sure" step is shown first — this matches how editing already works elsewhere in the app (e.g. Edit Pet).
5. This only applies to *today's* check-in. Editing a past day already has its own, unrelated flow (the Catch-Up feature) and this spec does not change that.
6. No new UI components are introduced. Both entry points reuse existing, canonical components (the `CheckInStatusBanner` row on Home, the `ListRow`-based Observations card on Pets) per the Design System's component de-duplication rule (Amendment #8) — only their label and click behavior change once a check-in exists.

## Acceptance Criteria

- Given a pet has **not** checked in today, its Home row reads "Start [Pet]'s Daily Check-In" and its Pets-tab Observations row (once expanded) reads "Start Daily Check-In" — both unchanged from today, and both open a fresh Daily Check-In sheet.
- Given a pet has a completed check-in for today, its Home row instead reads "Edit [Pet]'s Daily Check-In," and tapping it reopens the Daily Check-In sheet pre-filled with today's saved Vibe and observations (rather than navigating to Trends).
- Given a pet has a completed check-in for today, its Pets-tab card stays collapsed by default; once the owner taps "Show More" to expand it, the Observations row reads "Edit Daily Check-In" and tapping it reopens the same pre-filled Daily Check-In sheet.
- Given the owner changes the Vibe and/or observations and saves, when they return to Home or Pets, then the updated values are what's shown everywhere (Home, Pets, Trends) — the old values are fully replaced, not kept alongside the new ones.
- Given the dead `context === 'profile'` branch is removed from `PetProfileContent.jsx`, when the app is exercised end to end (Pets tab, Home, onboarding's check-in link, accept-invite redirect), then nothing breaks — because nothing live ever reached that branch to begin with.

## Visual Reference

No mockups were provided for this spec. Both visual questions originally open here are now resolved (see decisions below) — no new component or icon is introduced in either case, per the Design System's de-duplication principle (Amendment #8) and its 44px-touch-target / clear-label requirements (§8):
- **Home's `CheckInStatusBanner`:** stays the exact row it is today (icon + one line of text, same tap target), just with its label and click target swapped based on whether a check-in already exists — no new icon, no separate "edit" indicator.
- **Pets-tab card:** the collapsed card face is unchanged; the existing expanded-state "Observations" `ListRow` (same canonical row component used for every other card in the expanded profile) simply stays clickable and relabels itself once checked in, instead of becoming a static summary.

## Technical Spec

- **Schema:** None. No new columns or tables — this reuses the existing `daily_check_ins` row and the existing upsert path already used by `DailyCheckInModal`/`checkinClient.js`.
- **Components/files touched:**
  - `src/components/PetProfileContent.jsx` — delete the entire `context === 'profile'` branch (~lines 554–573, the dead Vibe-icon/Weight header block) and its now-unused default `context = 'profile'` parameter fallback, since the only real caller (`ExpandablePetProfileCard.jsx`) always passes `context="pets"` explicitly. In the shared "Observations" `ListRow` (~lines 667–694, rendered for both contexts once expanded), remove the `checkedInToday` restriction on `onClick`/label: keep `onClick={() => setCheckInOpen(true)}` and change the row's title/value copy to "Edit Daily Check-In" once `checkedInToday` is true, instead of switching to the current static, unclickable summary variant.
  - `src/components/CheckInStatusBanner.jsx` — change the "already checked in" render branch (currently a `<Link to={trendsHref}>`) into a `<button>` with label `Edit ${pet.name}'s Daily Check-In` that calls a new `onEditCheckIn` prop instead of navigating to Trends. Trends is still reachable elsewhere (the pet's Trends nav card, the Wellbeing chips) so this isn't removing that path, just changing what this specific row does.
  - `src/pages/Home.jsx` — wire the new `onEditCheckIn` prop through to open the same `DailyCheckInModal` pattern `PetProfileContent.jsx` already uses (`existingCheckIn={todayCheckIn}`, `isCatchUp={false}`).
- **API / edge functions:** None — no Edge Function involved in a Daily Check-In save.
- **Constraints from CLAUDE.md / locked decisions:** Respected. This does not touch the Vibe/Symptom-Count model, does not introduce a score, and does not let one signal derive the other — it only changes when an owner can reopen the same existing save flow.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found. There's exactly one save path for a Daily Check-In (`DailyCheckInModal` → `checkinClient.js`); this spec reuses it rather than building a second one.
- **Technical debt nearby:** The dead `context === 'profile'` branch itself is the debt this spec removes. Separately (not part of this spec, but adjacent): `docs/launch-punch-list.md` P4 already logs that the Pets-tab Wellbeing chips route to Trends instead of launching check-in for the *not-yet-checked-in* case — a related but distinct gap from the one this spec closes (this spec is about editing an *already-saved* check-in, not starting an unstarted one).
- **Orphaned features nearby:** The standalone `/pet/:petId` route (`src/pages/PetProfile.jsx`) is itself already a known, intentional compatibility redirect (per spec 0023) — not new debt, just the reason `context="profile"` became unreachable.
- **Punch list / known issues in this area:** `docs/launch-punch-list.md` P4 (line ~103, Pets-tab chips) is related but not the same issue — flagged above, not resolved by this spec. No other punch-list item covers same-day check-in editing.
- **Doc drift found:** `docs/foundation/0008 Navigation & Information Architecture_V4.md` lines 88 and 96 describe `context="profile"` as still rendering at a live `/pet/:petId` page. This is now inaccurate — flag for a `doc-updater` pass after this spec is approved and implemented, since foundation docs are otherwise treated as locked/trustworthy per CLAUDE.md.

## Non-Goals

- Editing a check-in from a day other than today (that's the existing, separate Catch-Up flow — unchanged).
- Any confirmation/warning dialog before overwriting today's entry (explicitly decided against).
- Fixing the separate, already-logged issue of Pets-tab Wellbeing chips not launching check-in for pets who haven't checked in yet.
- Any redesign of the Wellbeing chips themselves, or of Trends.
- The `docs/foundation/0008 ...` doc fix itself (flagged for `doc-updater`, not done here).
- Making the edit action reachable from the Pets-tab card's **collapsed** state without expanding it — deliberately kept behind "Show More," same as every other card action today.

## Open Questions

None remaining — both visual questions from the earlier draft are resolved above (label swap on Home's existing row; relabeled, still-clickable Observations row on Pets, gated behind "Show More" as today).
