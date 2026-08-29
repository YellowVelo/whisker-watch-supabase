# 0060_CheckIn_History_Calendar_Edit_Specification_v1

**Status:** Draft
**Date:** 2026-08-28
**Related files:** `src/components/PetProfileContent.jsx`, `src/components/catchup/CatchUpFlow.jsx`, `src/components/DailyCheckInModal.jsx`, `src/components/DailyCheckInSheet.jsx`, `src/lib/checkin/checkinClient.js`, `src/components/BottomSheet.jsx`, `src/components/ListRow.jsx`, `src/hooks/useFocusTrap.js`, `src/lib/zIndex.js`, `docs/features/0026_Edit_Todays_CheckIn_Specification_v1.md`, `docs/features/0015_MultiDay_CatchUp_CheckIn_Specification_v1.md`, `docs/features/0043_Concurrent_CheckIn_Edit_Conflict_Detection_Specification_v1.md`, `docs/features/0059_ZIndex_Layering_Scale_And_CatchUp_Overlay_Fix_Specification_v1.md`, `e2e/catch-up-flow.spec.js`, `e2e/daily-checkin.spec.js`

---

## Before You Approve This

- **The screenshot that prompted this spec is an already-shipped, today-only feature (spec 0026), not the right hook for this.** The "Observations — Start/Edit Daily Check-In" row on the Pets tab only knows about *today's* check-in (`checkedInToday`/`todayCheckIn`, hardcoded, no date parameter). It can't be turned into a day-picker without a rewrite, so this spec adds a **new, separate row** next to it instead, per your answer below — Observations itself is untouched.
- **The hard part (saving an edit to a past day) already exists and is already safe.** `markGreatDay`/`markOffTough` in `checkinClient.js` already accept any date and already have co-owner conflict detection built in (spec 0043 — it explicitly already covers "editing a past day via Catch-Up"). This spec is new UI wiring on top of existing save logic, not new save logic.
- **This is a real, new feature, not an extension of Catch-Up.** Catch-Up's calendar (`CatchUpFlow.jsx`) only ever shows *currently missed* days in an open gap — the moment a day gets saved, it's gone from that list for good, which is exactly the trap you hit with Tribble. This spec builds a calendar that stays reachable any time, for any day in the lookback window, whether it has a check-in or not.
- **Reuses Catch-Up's calendar UI, but its date-math helpers aren't currently shareable.** `CatchUpFlow.jsx` already has a working month-grid calendar (`buildMonthGrid`, `parseDateStr`, `formatDateStr`, `formatMonthLabel`) but they're private, unexported functions local to that one file. Building a second calendar means either duplicating ~30 lines of date math or extracting it into a shared module first — recommended below as the cleaner path, flagged here since it's a small scope addition beyond "just add a new screen."
- No conflicts found with CLAUDE.md's locked Vibe/Symptom-Count model — this only changes when/where a saved day can be reopened, not how Vibe or symptom count is calculated or displayed.

---

## Functional Requirements

1. From a pet's expanded profile card on the Pets tab, the owner can open a new "Check-In History" calendar for that pet, separate from the existing Observations row (which keeps working exactly as it does today, for today only).
2. The calendar shows up to the last 180 days (about 6 months — the same lookback window already used by Catch-Up, so "how far back can I touch history" is consistent everywhere in the app), one month at a time, with Previous/Next month navigation.
3. Every day in that window is shown with an icon indicating its saved status: Great Day, Off Day, Tough Day, Skipped, or blank (nothing ever saved for that day).
4. Tapping any day — whether it already has a saved check-in or is completely blank — opens the same Daily Check-In screen used everywhere else in the app (Vibe selection, then symptom/observation steps), pre-filled with whatever was already saved for that day, or empty if nothing was.
5. Unlike editing *today's* check-in (which saves immediately, no warning — an earlier, deliberate decision), saving a change to a *past* day first shows a short "Save changes to [date]?" confirmation step before it's written, since a past-day edit can quietly rewrite history further back than a same-day correction would.
6. If another co-owner already changed that same day in the meantime, the owner sees the exact same "Keep Mine / Keep Theirs" conflict handling that already exists for today's check-in and for Catch-Up (spec 0043) — nothing new to build here, just confirming this new entry point goes through the same save path that already has this protection.
7. Days outside the 180-day window aren't shown or reachable from this calendar.

## Acceptance Criteria

- Given a pet has a saved check-in for a past day, when the owner opens Check-In History and taps that day, then the Daily Check-In screen opens pre-filled with exactly what was saved (Vibe and any symptoms).
- Given a pet has a blank day (nothing ever saved) within the last 180 days, when the owner taps it, then the Daily Check-In screen opens empty, ready for a fresh entry for that date.
- Given the owner changes a past day's answer and saves, when a "Save changes to [date]?" confirmation appears and the owner confirms, then the change is written and reflected everywhere that day's data appears (the History calendar itself, and Trends).
- Given the confirmation appears, when the owner backs out instead of confirming, then nothing is saved and the day's previously-saved value (or blank state) is unchanged.
- Given a day is more than 180 days in the past, when the owner navigates the calendar, then that day is not reachable (Previous-month navigation stops at the 180-day floor, matching Catch-Up's own boundary).
- Given a co-owner changed the same day first, when the owner tries to save over it, then the existing "Keep Mine / Keep Theirs" conflict pop-up (spec 0043) appears instead of silently overwriting.

## Test Plan

- Tap a past day with an existing check-in → opens pre-filled → Playwright test: seed a past-dated `daily_check_ins` row for a throwaway test pet (same backdated-pet seeding pattern already used in `e2e/catch-up-flow.spec.js`), open Check-In History, tap that day, assert the sheet shows the seeded Vibe/symptoms.
- Tap a blank day → opens empty, saves a new entry → Playwright test: same seeded pet, tap a day with no row, fill it in, save through the new confirmation step, assert the day's icon updates on the calendar and the row now exists.
- Confirmation step appears for past-day edits and blocks the write until confirmed → Playwright test: edit an existing past day, assert the confirmation sheet renders before any write happens (check via network/API assertion, not just UI), confirm, assert the value changed.
- Backing out of the confirmation leaves data unchanged → Playwright test: same flow, dismiss the confirmation instead of confirming, assert the original value is still what's shown.
- 180-day floor blocks earlier navigation → Playwright test: assert the "Previous month" control is disabled once the calendar reaches the month containing the 180-day floor, mirroring the existing `canGoEarlier` assertion pattern already implicit in Catch-Up's calendar.
- Co-owner conflict pop-up appears for a past-day edit made through this new entry point → Playwright test: reuses the exact two-session pattern already built for spec 0043's conflict test, just triggered from Check-In History instead of Catch-Up/today's edit, to confirm the new entry point goes through the same protected save path rather than a bypass.
- **Seeding/access constraints:** Same as `e2e/catch-up-flow.spec.js` — a throwaway pet is created directly via a signed-in Supabase client with a backdated `created_at` (RLS on `pets` only checks `created_by`, not `created_at`), and `daily_check_ins` rows for it are seeded the same way. No service-role key or admin access needed; everything here is reachable via a normal signed-in test session.

## Visual Reference

No mockup was provided. Agreed direction from the clarifying questions above:
- New row added near (not replacing) the existing Observations row on the Pets-tab expanded card, using the same canonical `ListRow` component (icon + title + subtitle + chevron) per Design System Amendment #8 — no new row-style component.
- The calendar itself is a full-screen overlay, reusing Catch-Up's existing visual language (month grid, day-status icons, Previous/Next header controls) rather than inventing a new calendar look.
- The "Save changes to [date]?" confirmation is a small `BottomSheet` with two buttons (Cancel / Save), not the type-to-confirm `ConfirmDeleteDialog` pattern — that component is purpose-built for destructive deletes and doesn't fit a routine save confirmation.

## Technical Spec

- **Schema:** None. No new tables or columns — reuses `daily_check_ins` exactly as-is, and the same `markGreatDay`/`markOffTough`/`markSkipped` write paths (with `expectedUpdatedAt` already wired for conflict detection per spec 0043).
- **Components/files touched:**
  - `src/components/PetProfileContent.jsx` — add a new `ListRow` ("Check-In History") near the existing Observations row (~line 570), opening the new calendar component. Observations itself is unchanged.
  - **New file** `src/components/catchup/CheckInHistoryCalendar.jsx` (or similar) — a full-screen overlay modeled directly on `CatchUpFlow.jsx`'s `CalendarStep`/`DayIcon` rendering, but sourcing its day list from the full 180-day window (via `getCheckInsForDateRange`) instead of `missedDaysByPet`, and allowing every day to be tapped (not just flagged exceptions).
  - **New file** `src/lib/checkin/calendarDates.js` (recommended) — extract `parseDateStr`/`formatDateStr`/`formatMonthLabel`/`buildMonthGrid` out of `CatchUpFlow.jsx` into a shared module both components import, instead of duplicating that date math. `CatchUpFlow.jsx` is updated to import from here too, so there's exactly one copy of this logic afterward, not two.
  - **New, small component** — a "Save changes to [date]?" confirmation `BottomSheet`, reused for every past-day save from this new entry point. Lives alongside `DailyCheckInSheet.jsx`'s existing save flow, gated on `isCatchUp`-style "is this a past day opened from History, not today" flag so today's editing (spec 0026) is completely unaffected.
  - `src/lib/checkin/checkinClient.js` — no functional changes expected; existing `getCheckInsForDateRange`, `markGreatDay`, `markOffTough`, `markSkipped`, and `CATCH_UP_MAX_LOOKBACK_DAYS` are reused as-is.
- **API / edge functions:** None — no Edge Function involved in a Daily Check-In save today, and this doesn't add one.
- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including its 2026-07-30 Amendments. No conflicts found — the new row reuses `ListRow` (Amendment #8), the new confirmation reuses `BottomSheet` (Amendment #8) rather than a hand-rolled dialog, the full-screen calendar overlay follows the same `role="dialog"`/`aria-modal`/`useFocusTrap`/`Z.overlay` pattern spec 0045 and spec 0059 already established for `CatchUpFlow.jsx`, and all touch targets stay at the existing 44px minimum used by Catch-Up's calendar cells today.
- **Constraints from CLAUDE.md / locked decisions:** Respected. Doesn't touch how Vibe or symptom count is calculated, doesn't let one signal derive the other, and doesn't introduce a score of any kind — purely about when/where a saved (or blank) day can be reopened.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** The calendar UI itself would duplicate `CatchUpFlow.jsx`'s month-grid rendering if built independently — addressed above by extracting the shared date-math helpers rather than copy-pasting them. The save/edit mechanism is not duplicated at all; this spec deliberately reuses `DailyCheckInModal`/`checkinClient.js` exactly as spec 0026 and spec 0043 already do.
- **Technical debt nearby:** None new, if the date-math extraction above is done as part of this spec rather than skipped. Skipping it would recreate the same kind of near-duplicate-logic issue spec 0028's Design System pass was created to catch.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** The old `docs/launch-punch-list.md` file no longer exists — per CLAUDE.md, `docs/planning/Wysker_Watch_Launch_Plan.xlsx` is now the master task tracker, maintained by you outside of Code. No existing line item in that file was checked against this specific gap (editing an already-resolved past day); worth telling Lynn to add one if it isn't already tracked there, since this session can't edit that file's task list without being asked to.

## Non-Goals

- Any change to the Observations row's today-only behavior (spec 0026) — left exactly as it is.
- Any change to Catch-Up's own missed-day flow or its "assumed Great Day" default — unchanged.
- Extending this calendar past the 180-day window, or removing the cap entirely.
- Any new co-owner conflict-detection logic — this spec only confirms the existing spec 0043 mechanism also covers this new entry point, it doesn't add anything new to it.
- A general "activity log" or audit trail of who changed what and when — this only lets the current saved value be viewed and replaced, same as every other edit path in the app today.

## Open Questions

None remaining — all four scope questions (entry point location, lookback window, confirmation behavior, blank-day support, and full-screen vs. sheet) were resolved in the clarifying-questions pass above.
