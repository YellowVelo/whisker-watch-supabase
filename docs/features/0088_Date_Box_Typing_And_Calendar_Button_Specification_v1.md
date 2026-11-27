# 0088_Date_Box_Typing_And_Calendar_Button_Specification_v1

**Status:** Draft, 2026-11-27. Waiting for Lynn's review.
**Date:** 2026-11-27
**Branch:** `claude/spec-0088-date-box-typing` (off `main` at `749e084`)
**Migration:** none
**Process:** `/ship-feature`. Type: **NORMAL** (front end only; no access rules, functions or data).
**Related files:** `src/components/PetSittingSection.jsx` (the sit dialog's Start/End Date boxes), `src/lib/sitDates.js` (`openDatePicker`), `src/components/IconButton.jsx`, `src/components/ui/input.jsx`, new `src/components/DateField.jsx`, `e2e/pet-sitter.spec.js`, `docs/testing/QA_Test_Plan.md`, `docs/features/0085_Pet_Sit_Date_Validation_And_Crash_Fix_Specification_v1.md`

## Lynn — what I need from you

1. **Review this spec and approve the two button labels in "Copy for approval".** Blocks the build.
2. After merge: **promote branch `main`'s build in Cloudflare** (commit message will start "Merge pull request" and name this branch).

## Before You Approve This

1. **What broke (my mistake in 0085).** 0085 made a click anywhere in a pet-sit date box open the browser's calendar. On desktop, while that calendar is open it takes the keyboard, so typing a date does nothing. You found this on prod trying to fix your sit's year. 0085 promised typing would still work; its automated test couldn't catch this because it swaps the real calendar for a stand-in (the real one is drawn by the browser, outside the page).
2. **The fix you chose:** clicking a date box lets you type. A calendar button sits at the right end of each box (inside it, so the two boxes still fit side by side on a phone) and opens the calendar. It has the full 44px tap area. Phones keep their normal behavior: tapping a date box opens the phone's own date picker, as it always has.
3. **One calendar icon, not two.** Chrome, Edge and Safari draw their own small calendar icon inside date boxes. It's hidden in these two boxes so there's only our button. Firefox's own icon can't be hidden; Firefox users would see both (rare, harmless).
4. **Built once, reusable.** The box + button becomes a small shared `DateField` component. This spec uses it only for the two pet-sit dates. The app has 10 other date boxes (food, meds, vaccines, bloodwork, memorial, onboarding birthday) that use the browser's plain box; moving them to `DateField` is a separate, optional follow-up, not done here.
5. **Your bad prod sit.** Once this is live you can click the end date's year, retype 2026 and save. Until then, deleting and re-adding the sit is the way through, and 0063 can't go on prod until that sit is fixed or gone.
6. **Self-review:** no other component opens a date picker (searched `showPicker`/`openDatePicker`: only these two boxes). `openDatePicker` stays and moves to the button. The 0085 date checks on Save and the database rule are unchanged. No new debt.

## Copy for approval

| Where | Text |
|---|---|
| Calendar button beside Start Date (read aloud by screen readers; also the hover tooltip) | "Choose start date" |
| Calendar button beside End Date | "Choose end date" |

## Functional Requirements

- **FR1.** Clicking or tapping inside a pet-sit date box on desktop puts the cursor there so the date can be typed. It never opens the calendar by itself.
- **FR2.** Each date box has a calendar button at its right end that opens the browser's calendar for that box. Picking a date fills the box.
- **FR3.** The button has a 44px tap area, a screen-reader label, and is reachable with the Tab key.
- **FR4.** If the browser can't open its calendar from the button, nothing breaks; typing still works.
- **FR5.** On phones, tapping the date box behaves as the phone normally does (its own date picker).
- **FR6.** The 0085 date limits (min/max dates, Save checks, messages) are unchanged.
- **FR7.** Only one calendar icon shows per box in Chrome, Edge and Safari.

## Acceptance Criteria

- **AC1.** Given the Add or Edit sit dialog on desktop Chrome, when the owner clicks the End Date box and types 11 28 2026, then the box shows 11/28/2026.
- **AC2.** Given a saved sit whose end year is 272026 (like Lynn's), when the owner clicks the year, retypes 2026 and saves, then the sit saves with end date 2026-11-28.
- **AC3.** When the owner clicks the calendar button, the browser's calendar opens for that box.
- **AC4.** Clicking inside the box (not the button) does not open the calendar.
- **AC5.** The button is 44px or larger and has the approved label.
- **AC6.** If opening the calendar fails, no error appears and typing still works.
- **AC7.** At 375px wide, both boxes, their buttons and the full date fit side by side without overlap.

## Test Plan

- AC1 → Playwright, `e2e/pet-sitter.spec.js`: real `page.click()` on the box, then `keyboard.type`, checking the box's value.
- AC2 → Playwright edits a saved sit: clicks the end date's year, types a new year, saves, and checks the stored date. A 6-digit year can't be planted on dev (0063's rule is live there), so the exact 272026 case is Lynn's manual check on prod.
- AC3, AC4, AC6 → Playwright with the existing `showPicker` stub: clicking the button calls it once; clicking the box calls it zero times; a throwing stub causes no page error.
- AC5 → Playwright measures the button's box and reads its `aria-label`.
- AC7 → Playwright at 375px: the two boxes and buttons don't overlap and the input's text isn't clipped (scroll width ≤ client width).
- The existing 0085 AC4 test's `focus()` workaround (comment at line ~412) is switched back to a real click.
- **Seeding/access constraints:** none.

## Visual Reference

- Lynn's screenshot of prod's Edit Pet Sitting Period dialog (2026-11-27): End Date shows 11/28/272026 → the case AC2 makes fixable by typing.

## Technical Spec

- **Schema / functions:** none.
- **New `src/components/DateField.jsx`:** wraps `Input type="date"` (passes through `value`, `onChange`, `min`, `max`, `id`, `aria-*`) in a `relative` container; adds `pr-11` and `[&::-webkit-calendar-picker-indicator]:hidden` to the input; places `IconButton variant="plain"` with Lucide `CalendarDays`, absolutely positioned at the right, vertically centered, whose `onClick` calls `inputRef.current.showPicker?.()` inside try/catch (reuse `openDatePicker` by passing the input as `currentTarget`, or a small `openPickerFor(input)` in `sitDates.js`). The button is `type="button"` so it never submits.
- **`PetSittingSection.jsx`:** replace the two `Input type="date"` blocks with `DateField`, drop `onClick={openDatePicker}` from the inputs, keep min/max exactly as now, add `buttonLabel` "Choose start date" / "Choose end date".
- **Design System compliance:** reuses `IconButton` (Amendment #8/#11), Lucide only, `text-muted-foreground` icon, 44px tap area (§8). `design-system-check` runs on both `.jsx` files.
- **Constraints from CLAUDE.md / locked decisions:** none affected. `src/lib/sitDates.js` stays the one place sit dates are checked.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none; no other custom date control exists.
- **Technical debt nearby:** the app's other 10 date boxes have no year limits, so a 6-digit year can be typed into, e.g., a food's end date. Nothing crashes there today (spec 0087's rule treats an unreadable end date as "not ended"), but it's the same class of problem. Not fixed here; worth a punch-list item (offered after this ships).
- **Orphaned code:** none.
- **Open/known issues:** PA-80 (sit page leftovers) unaffected.

## Non-Goals

- Changing the other 10 date boxes.
- A custom-drawn calendar.
- Changing date limits or messages.

## Open Questions

- None beyond the copy approval.
