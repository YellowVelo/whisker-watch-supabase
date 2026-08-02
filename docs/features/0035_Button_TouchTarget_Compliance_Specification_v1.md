# 0035_Button_TouchTarget_Compliance_Specification_v1

**Status:** Implemented (2026-08-02)
**Date:** 2026-08-02
**Related files:** `src/components/ui/button.jsx`, `src/components/ExportCalendarButton.jsx`, `src/pages/PetVaccinations.jsx`, `src/pages/PetMedications.jsx`, `src/components/FoodSection.jsx`, `src/components/MedicationSection.jsx` (cleanup only), `e2e/vaccination-calendar-export.spec.js` (regression, unchanged), `docs/launch-punch-list.md` (P5 items to close), `docs/foundation/0005 Design System.md` (no changes — this spec brings code into line with it)

## Implementation Notes (2026-08-02)

- Shipped exactly as drafted: `button.jsx`'s four sizes (`default` 36→44px, `sm` 32→44px + dropped the 12px text override, `lg` 40→48px, `icon` 36→44px), and `ExportCalendarButton.jsx`'s `iconOnly` branch swapped to the shared `IconButton` with `aria-label="Export to Calendar"` carried over from the old `title` attribute. The two redundant `min-h-[44px]` overrides in `FoodSection.jsx`/`MedicationSection.jsx` were removed.
- `npm run lint` and `npm run build` both pass clean.
- Verified live against `wysker-watch-dev` (`test1@wyskerwatch.com`): the Vaccinations page header's "Export to Calendar" `IconButton` measures 44×44px with classes identical to the adjacent "Back" `IconButton`; the `sm`-size "Add" button measures 44px tall at 14px font (was 32px/12px). Click-through confirmed the export handler still fires correctly (verified via the "no due dates" alert path, since the test pet had none).
- `e2e/vaccination-calendar-export.spec.js`'s two existing tests (download from Vaccinations, reachability from Medications) both still pass unmodified — confirms the `aria-label` swap preserved the accessible name the test depends on.
- Punch list not yet updated to check off the two P5 items this resolves — that's a `doc-updater` pass, not done as part of this implementation.

## Before You Approve This

Plain-language flags from the self-review pass:

- **You chose the bigger option.** I originally scoped this around just the `sm` button size (32px tall, the thing the notification feature literally hit). While investigating I found the "normal" button size (`default`, 36px tall) is *also* under the app's 44px minimum tap-target rule — it's just less visually cramped, so it hadn't been flagged before. You asked to fix the whole size scale in one pass rather than patch `sm` alone. That means this touches one shared component (`button.jsx`) used by roughly 50 buttons across ~29 files, not 15 buttons across 10 — every screen with a button needs a quick look after this change, not just the ones on the original list.
- **Two places already hand-patched around this exact bug.** `FoodSection.jsx` and `MedicationSection.jsx` each add `min-h-[44px]` directly onto a `default`-size Button's own styling — someone already noticed the button felt too short and fixed it locally, one-off, without touching the shared component. Once this spec fixes the component itself, those two overrides become redundant (harmless to leave, but worth deleting in the same pass since we're already in these files). Flagging so it's a visible, deliberate cleanup, not something quietly slipped in.
- **One existing automated test depends on exact wording, not just visibility.** `e2e/vaccination-calendar-export.spec.js` finds the Export button by its accessible name, "Export to Calendar" — today that name comes from the hand-rolled icon button's `title` attribute. Swapping it to the shared `IconButton` component (which uses `aria-label` instead of `title`) has to carry that exact label over, or this already-passing test breaks silently.
- **No conflicts found** with `CLAUDE.md`, no database or Edge Function changes, and no conflict with any other locked Design System decision — this spec's entire purpose is closing an existing gap between the code and that doc, not changing the doc itself.

## Functional Requirements

In plain terms: every button in the app should be easy to tap — big enough that a finger reliably hits it, with text you can actually read. Two specific things fall short of that today, and this spec fixes both:

1. **Buttons are too short.** The shared button style used everywhere in the app comes in four sizes (small, normal, large, icon-only), and none of them meet the app's own 44-pixel minimum tap-target rule today — small is the worst (32px), but even the "normal" one (36px) falls short. This spec brings all four up to at least 44px, and also fixes small's text, which currently renders smaller than the app's own 13px minimum readable size.
2. **One button on the Vaccinations and Medications pages is hand-built instead of using the app's shared "circular icon button" component.** The little calendar-export button next to those page titles doesn't match the styling or sizing rules every other icon button in the app already follows (including the back button sitting right next to it). This spec switches it to the same shared component the back button already uses.

## Acceptance Criteria

- Given any button anywhere in the app using the shared button style (any of its four sizes), when measured, then its tappable height is at least 44px.
- Given the small-size button style specifically, when its text is measured, then it renders at least 13px, matching the app's minimum readable text size (it currently renders at 12px).
- Given the calendar-export icon button on the Vaccinations page or the Medications page, when compared to the back button in the same header, then both are built from the same shared icon-button component, same size, same shape.
- Given a user taps the calendar-export icon button on either page, when the tap registers, then it still downloads the `.ics` calendar file exactly as it does today — no behavior change, styling only.
- Given the existing automated test that finds the Export button by name and downloads a file, when it runs after this change, then it still passes without modification.
- Given `npm run build` and `npm run lint`, when run after this change, then both complete with no errors.
- Given a representative sample of screens using each button size (a dialog "Send" button, a page header button, a form "Add" button, a full-width "Save" button), when viewed after this change, then none look visually broken (overflowing containers, text wrapping unexpectedly, misaligned with neighboring elements).

## Test Plan

- Buttons ≥44px tall across all sizes → **not covered by an automated test.** This repo has no visual-regression/pixel-measurement tooling (confirmed in spec 0028's own Test Plan, same limitation applies here) — verified by manual click-through of a representative screen per button size, listed in the Technical Spec's phase check-ins below.
- Small-size button text ≥13px → same as above, manual verification (a text-size floor isn't something the existing Playwright suite checks anywhere in this repo).
- Calendar-export button matches shared `IconButton` styling → manual visual check (Vaccinations and Medications page headers), same reasoning as above.
- Calendar-export button still downloads the `.ics` file correctly, on both pages → **already covered**, no new test needed: `e2e/vaccination-calendar-export.spec.js`'s two existing tests (`the Export to Calendar button downloads a .ics file from the Vaccinations page`, `...is reachable from the Medications page`) exercise exactly this. Re-run as a regression check after the `IconButton` swap — this is the test that will actually catch it if the accessible name (`aria-label`) isn't carried over correctly from the old `title` attribute.
- `npm run build` / `npm run lint` clean → CI already runs both on every push; no separate step needed beyond normal verification before considering this done.
- **Seeding/access constraints:** None — everything in this spec is reachable via a normal signed-in session (`test1@wyskerwatch.com`), no server-only or admin-only data involved.

## Visual Reference

No mockups provided for this spec — it's a compliance fix against an existing written rule (`docs/foundation/0005 Design System.md` §8, "Large touch targets (44px minimum)," and Amendment #7's 13px type floor), not a new visual design. The target look for the icon-button swap is the already-shipped back button sitting next to it in the same header (`src/components/IconButton.jsx`, already used in both `PetVaccinations.jsx` and `PetMedications.jsx`) — same component, same 44×44px circle, same styling, just a different icon and click handler.

## Technical Spec

- **Schema:** None.
- **API / Edge Functions:** None.
- **Components/files touched:**
  - `src/components/ui/button.jsx` — the size scale inside `buttonVariants`. Current vs. proposed:
    | size | current | proposed | reasoning |
    |---|---|---|---|
    | `default` | `h-9` (36px) | `h-11` (44px) | Matches the 44px floor already established elsewhere in this app (`IconButton`'s `h-11 w-11`, `ListRow`'s standalone avatar, several `min-h-[44px]` utility overrides already in use) — reusing an existing convention rather than inventing a new number. |
    | `sm` | `h-8 text-xs` (32px / 12px text) | `h-11`, drop the `text-xs` override (32px→44px height; text then inherits the base `text-sm`/14px already applied to every button variant, clearing the 13px floor) | Removing the override rather than setting a new size keeps `sm` consistent with the other three sizes' text instead of adding a fifth text size to the app. |
    | `lg` | `h-10` (40px) | `h-12` (48px) | `h-10` was also under the floor; bumped one step above the new `default` so `lg` still reads as visually larger, not just "equal to default." |
    | `icon` | `h-9 w-9` (36×36px) | `h-11 w-11` (44×44px) | Makes the generic icon-size button dimensionally identical to `IconButton`, the app's other icon-only control. |
  - `src/components/ExportCalendarButton.jsx` — `iconOnly` branch (currently a hand-rolled `<button>` with `bg-black/20`, `border-white/20`, `rounded-full`, `title="Export to Calendar"`) replaced with the shared `IconButton` component, passing `icon={loading ? Loader2 : CalendarDays}`, `iconClassName` with `animate-spin` while loading, and **`aria-label="Export to Calendar"`** (carrying the accessible name forward explicitly, since `IconButton` has no `title`-attribute fallback the way the old hand-rolled button did).
  - `src/pages/PetVaccinations.jsx` / `src/pages/PetMedications.jsx` — no changes expected beyond what `ExportCalendarButton.jsx`'s internal swap already handles; both already import and use `IconButton` for their back buttons, so no new import needed.
  - `src/components/FoodSection.jsx:169`, `src/components/MedicationSection.jsx:246` — cleanup only: remove the now-redundant `min-h-[44px]` override on their `default`-size submit buttons, since `default` itself will meet 44px after this change. Not required for compliance (harmless either way), but avoids leaving two dead one-off patches for the exact bug this spec fixes at the source.
- **Design System compliance:** This spec exists specifically to close a gap between shipped code and `docs/foundation/0005 Design System.md` §8 ("Large touch targets (44px minimum)") and Amendment #7 (13px type floor). No new conflicts introduced — Amendment #11 (icon buttons are one component everywhere) is what motivates the `ExportCalendarButton` swap, and this spec brings it into compliance with that rule rather than working around it.
- **Constraints from CLAUDE.md / locked decisions:** None triggered — no database, no Edge Function, no deployment-adjacent change. Purely a shared-component style fix plus one component swap.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None — this reuses the already-canonical `IconButton` component (established by Amendment #8/#11 and spec 0025's de-duplication pass) rather than introducing anything new.
- **Technical debt nearby:** The two `min-h-[44px]` local overrides in `FoodSection.jsx`/`MedicationSection.jsx` described above — pre-existing one-off patches for the same root problem this spec fixes properly. Cleaned up as part of this spec's Technical Spec, not left behind.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** This spec directly resolves the two P5 items added 2026-08-02 to `docs/launch-punch-list.md`: *"`Button`'s `size="sm"`... falls under both the Design System's 44px touch-target floor... and its 13px type floor"* and *"`ExportCalendarButton.jsx`'s `iconOnly` mode is a hand-rolled circular button... instead of the shared `IconButton` component."* Both should be checked off once this ships (a `doc-updater` job, not part of this spec itself). Note the punch list's `sm`-only framing is superseded by this spec's wider scope (whole size scale, not just `sm`) — worth calling out explicitly when the punch list is updated, so the resolution note doesn't undersell what actually got fixed.
- **A related, explicitly out-of-scope finding:** during the same review, a rough grep for other hand-rolled circular/icon-style buttons not using `IconButton` returned ~26 files — but that number is unreliable (it also catches pills, avatars, and other unrelated `rounded-full` elements) and would need an actual per-file read to size accurately, which hasn't been done. Not part of this spec; left as an open item on the punch list for a future, separately-scoped pass.

## Non-Goals

- The broader "hand-rolled icon buttons elsewhere in the app" question (the noisy ~26-file grep above) — not sized or scoped, left for a future spec.
- Any visual redesign of button colors, borders, or the primary/secondary button treatment — those are separately covered by Design System Amendment #1 and untouched here. This spec is sizing only.
- Automated visual-regression or pixel-measurement testing — doesn't exist in this repo (same limitation noted in spec 0028); verification here is manual, same precedent.
- Any change to `docs/foundation/0005 Design System.md` itself — the doc is already correct; this spec fixes code to match it.

## Open Questions

None remaining — the one real ambiguity (whether to fix `sm` alone or the whole size scale) was resolved by you before drafting.
