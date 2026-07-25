# 0015_MultiDay_CatchUp_CheckIn_Specification_v1

**Status:** Shipped (PR 1–4 complete, 2026-07-25) — see Implementation Status below.
**Date:** 2026-07-25
**Related files:** `src/pages/Home.jsx`, `src/components/DailyCheckInSheet.jsx`, `src/components/DailyCheckInModal.jsx`, `src/lib/checkin/checkinClient.js`, `src/components/VibeIcon.jsx`, `src/components/catchup/CatchUpFlow.jsx`, `src/components/catchup/BulkApplySheet.jsx`, `supabase/migrations/0033_daily_check_ins_source_catch_up.sql`, `docs/features/0007 Home Feature Specification V2.md`, `docs/launch-punch-list.md`

## Before You Approve This (self-review, resolved)

- **Vibe-default tension** — the calendar pre-fills every missed day as "Great Day" and only asks about days the owner flags. This sits close to spec 0012's "Vibe is never defaulted" rule, but was reviewed and confirmed intentional: the rule is about never *computing* Vibe from symptom data, and the owner always gets a real, visible chance to correct each day. Confirmed consistent with the product's frictionless/no-guilt principle.
- **Day-one gap exposure** — resolved via the 6-month lookback cap plus the new-user floor described below, so this doesn't dump an unbounded backlog on existing pets the moment this ships.
- **Icon change is shared-component scope, not calendar-only** — `VibeIcon.jsx` is used on Home and Pet Profile today, not just inside Catch Up. The icon correction below changes the Vibe icon everywhere it renders, not just the new calendar. Confirmed intentional.
- No other conflicts, duplicates, or debt concerns found beyond what's already called out in Repo Findings & Risks below.

## Functional Requirements

1. When exactly one day (yesterday) was missed for a pet, nothing changes — today's simple "Catch up yesterday" reminder keeps working exactly as it does now.
2. When two or more consecutive days were missed for a pet, the owner instead sees the new Catch Up experience: a full-screen flow that walks them through everything they missed, day by day, without making them relive each day one at a time.
3. The app assumes every missed day was a "Great Day" (nothing wrong) unless the owner says otherwise — this matches how a normal daily check-in already treats "nothing selected" as a real, valid answer.
4. The owner sees a calendar of the missed days and can tap any day that wasn't actually great to mark it "Needs Details."
5. For every day marked "Needs Details," the owner answers the same Great/Off/Tough Day questions they'd see on a normal day, using the exact same screens already built for today's check-in.
6. If several days in a row all had the same issue, the owner can apply one set of answers to all of them at once instead of repeating themselves.
7. The owner can stop partway through and come back later — nothing is lost, and reopening Catch Up picks up where they left off.
8. The owner can dismiss the whole thing and keep using the app normally. The reminder stays visible until the gap is actually resolved.
9. If more than one pet has a gap, the owner picks which pet to catch up first.
10. If the gap is 30 days or longer, the owner first sees a simple "How has [Pet] been?" question before the calendar, so they're not dropped straight into a wall of empty days.
11. When every missed day is accounted for, the owner sees a short "All caught up" celebration screen.
12. Catch Up never looks back further than 6 months, and never further back than when the pet (or the owner's account, whichever is more recent) was created. A pet or account created today simply shows today's normal check-in — no catch-up prompt at all.

## Acceptance Criteria

- Given a pet missed exactly 1 day, when the owner opens Home, then they see today's existing "Catch up yesterday" banner and flow, unchanged.
- Given a pet missed 2+ days, when the owner opens Home, then they see the new Catch Up entry point instead of the old single-day banner.
- Given a gap of 2–29 days, when the owner starts Catch Up, then they land directly on the calendar (no "how has pet been" prompt).
- Given a gap of 30+ days, when the owner starts Catch Up, then they see the "How has [Pet] been?" prompt before the calendar.
- Given the calendar is showing, when the owner does nothing, then every missed day is treated as Great Day.
- Given the owner deselects a day, when they view the Exceptions list, then that day appears as "Needs details."
- Given the owner completes details for a day, when they return to the calendar, then that day shows as resolved (no longer needs details).
- Given the owner selects multiple exception days and applies one set of answers, when saved, then each of those days gets its own independent, correct record — not one shared row.
- Given the owner closes Catch Up before finishing, when they reopen it later (same session or a new one), then their previously-completed days are still marked done and only the remaining days need attention.
- Given every missed day is resolved, when the owner returns to Home, then the Catch Up banner for that pet is gone and the completion screen was shown once.
- Given the owner dismisses Catch Up without finishing, when they return to Home, then the banner is still there.
- Given a pet or user account created today, when Home loads, then no catch-up prompt appears — only today's normal check-in.
- Given a pet with no check-ins for the last 2 years, when Catch Up opens, then only the most recent 6 months are ever surfaced as missing days, never the full 2 years.

## Visual Reference

The provided mockup image maps to this spec as follows:
- **Screen 1 (Welcome / Long Gap Prompt)** and **Screen 2 (How Has [Pet] Been?)** → Requirement 10, the 30-day threshold branch.
- **Screen 3 (Select Pet)** → Requirement 9. The drag-to-reorder control shown on this screen is **not** part of this spec — see Non-Goals.
- **Screen 4 (Calendar)** and **Screen 5 (Exceptions List)** → Requirements 3–4.
- **Screen 6 (Add Details)** → Requirement 5, reusing the existing Daily Check-In detail flow as-is.
- **Screen 7 (Apply Details / bulk apply)** → Requirement 6.
- **Screen 8 (Completion Celebration)** → Requirement 11.
- Exact wording, layout, spacing, and thresholds shown in the mockup are treated as final design direction and should be followed as-is, per the design session that produced them — with one correction: the Great/Off/Tough Day icons in the mockup are replaced by the app's actual icon set (see Technical Spec).
- The persistent-banner behavior ("banner remains until all missed days complete OR owner logs a new today check-in with no prior gap") is not its own screen but governs when the Home-screen entry point appears — covered in Technical Spec.

## Technical Spec

- **Gap detection (new):** `getMissedDaysForPet(petId, timezone)` in `checkinClient.js`. The catch-up window's start date is `max(user.created_at, pet.created_at, today − 180 days)`; its end is yesterday. The function queries `daily_check_ins` for that pet across that date range (direct Supabase `.gte`/`.lte` query, consistent with existing non-equality reads already in this file) and returns which calendar days in the range have no row. If the computed start date is after yesterday (brand-new pet or account), the result is an empty list — no catch-up prompt, Requirement 12.
- **Home.jsx routing change:** the existing `catchUpPets` logic (currently "yesterday only") gets a companion check for 2+ day gaps using `getMissedDaysForPet`. Exactly-1-day gaps keep rendering today's `CatchUpBanner` unchanged; 2+-day gaps render a new entry point leading into the new flow instead.
- **Icon correction (shared component, applies everywhere `VibeIcon` renders — Home and Pet Profile, not just Catch Up):** in `VibeIcon.jsx`, update `VIBE_ICON`:
  - Great Day → `Sun` (unchanged)
  - Off Day → `Cloud` (was `CloudRainWind`)
  - Tough Day → `CloudLightning` (was `CloudHail`)
  
  The calendar's two additional states (Needs Details, No Data) are not real Vibe values and are rendered separately from `VibeIcon` using `CircleDashed` and `Minus` respectively, per the mockup's icon notes.
- **Saving "Great Day" for many days at once (new):** `markGreatDaysBulk(petId, dates)` in `checkinClient.js` — writes check-in + baseline observation rows for potentially dozens of days in one batched insert, following the same "single bulk insert instead of N round trips" pattern already used in `markGreatDay`/`markOffTough`.
- **Saving individual "Needs Details" days:** no new save logic — reuses `DailyCheckInSheet` exactly as it works today (already accepts an arbitrary `date` and an `isCatchUp` flag).
- **Bulk-apply across multiple days (new):** a thin wrapper calling the existing `markOffTough(petId, date, status, selections)` once per selected day with the same `selections` payload — each day still gets its own independent row, consistent with the rest of the data model.
- **No new "catch-up session" table.** Partial progress (Requirement 7) doesn't need its own schema — a day is "done" because it already has a `daily_check_ins` row, and "not done" because it doesn't. Reopening Catch Up just re-runs gap detection.
- **Schema change:** `daily_check_ins.source` currently allows `'app' | 'notification' | 'widget' | 'sitter'`. Add `'catch_up'` as a new allowed value (additive `drop constraint` / `add constraint` migration, same pattern as migration `0026`'s status-enum change) so catch-up-authored rows are distinguishable from live same-day entries. Every write in this feature (`markGreatDaysBulk`, and `DailyCheckInSheet`/`markOffTough` calls made from within the Catch Up flow) passes `source: 'catch_up'`.
- **UI, new components:** a multi-step `CatchUpFlow` container (state-machine pattern similar to `OnboardingWizard.jsx`, since this is genuinely multi-page — unlike `DailyCheckInSheet`'s single-sheet pattern), a calendar day-grid extending `src/components/ui/calendar.jsx` (shadcn/react-day-picker) via its custom day-content slot, a pet-selection screen, an exceptions list, and a completion screen.
- **Analytics (new events):** following the existing `catch_up_started`/`catch_up_completed` convention (already live for the 1-day case) — `multi_day_catch_up_started`, `multi_day_catch_up_day_saved`, `multi_day_catch_up_completed`, `multi_day_catch_up_dismissed`, each carrying `pet_id` and relevant date/count fields.
- **Constraints from CLAUDE.md / locked decisions:** the Vibe/Symptom Count model itself is untouched — every write goes through the same `markGreatDay`/`markOffTough`/`markSkipped` paths every other day already uses.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** A single-day "Catch Up Yesterday" feature already exists and ships today (`Home.jsx`'s `CatchUpBanner`, `DailyCheckInSheet.jsx`'s `isCatchUp` prop). This spec extends it rather than replacing it: the 1-day case keeps using what's already built; only 2+-day gaps get the new flow.
- **Technical debt nearby:** The punch list already flags (P5) that `checkinClient.js`'s saves aren't truly transactional — sequential network calls, no shared database transaction. The new bulk multi-day save makes that same risk larger in scope (a network hiccup partway through saving a large batch could leave some days written and others not). Because each day is already an independent row, a partial failure is recoverable (reopening Catch Up shows the remaining days as still missing) — but the UI must handle "some days saved, some didn't" gracefully rather than assuming all-or-nothing.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** nothing existing referenced Catch Up directly before this spec. See the two punch-list additions made alongside this spec (drag-to-reorder pets; and a follow-up note that `0007 Home Feature Specification V2.md`'s "Catch-Up Reminder" section will need a `doc-updater` pass once this ships, since it currently states only the most recent missed day is ever surfaced).

## Non-Goals

- Drag-to-reorder pets on Home — descoped from this spec; tracked separately on the punch list.
- Any change to the existing 1-day "Catch up yesterday" flow.
- Any change to the Vibe/Symptom Count scoring model itself.
- Catch-Up entry points anywhere other than Home (e.g., Pet Profile) — Home only.
- Looking back further than 6 months, or further than the pet/account's own creation date, under any circumstance.

## Implementation Status

Shipped in four PRs as planned, each verified live against `test1@wyskerwatch.com` (browser interaction plus direct database checks, not just UI text) before moving to the next:

1. **✓ Gap detection + icon swap.** `getMissedDaysForPet` (6-month/creation-date floor), `VibeIcon.jsx` icon correction (Off → `Cloud`, Tough → `CloudLightning`, per a later product correction — see below), Home's 1-day-vs-2+-day routing split.
2. **✓ Calendar + Exceptions list.** `CatchUpFlow.jsx` — entry screen, 30-day long-gap prompt, pet-selection (for the rare case Home routes multiple pets into one flow), custom month-grid calendar, Exceptions List.
3. **✓ Save path.** `markGreatDaysBulk`, migration `0033` (`source: 'catch_up'`), Exceptions-list days wired to the existing `DailyCheckInSheet`, `BulkApplySheet.jsx` for applying one set of details to several selected exception days at once.
4. **✓ Completion + polish.** Completion step, resume-after-close (verified both mid-session and across a full page reload), dismiss behavior (verified the banner survives "Maybe later" and the X), and the `multi_day_catch_up_*` analytics events (documented in `requirements-analytics-events.md`).

**Deviations from the original plan, and why:**
- The calendar is a custom lightweight month-grid component, not `src/components/ui/calendar.jsx` (react-day-picker) as originally suggested — building custom gave full control over per-day icon rendering and the multi-month bounded navigation this needed, with less risk than fighting an unfamiliar library's modifier API under time pressure.
- The full-screen overlay is rendered via `createPortal(..., document.body)`, not inline. Discovered while building: `Home.jsx` is wrapped in `PageTransition.jsx`'s animated `motion.div`, and any `transform` on an ancestor (Framer Motion sets one even at rest) becomes the containing block for `position: fixed` descendants — rendered inline, the overlay sized itself to Home's entire scrollable content instead of the real viewport. `DailyCheckInSheet`/`DailyCheckInModal` have the same latent bug, tracked separately on the punch list (P4).
- Off/Tough Day icons were corrected mid-build (product request, 2026-07-25): `Cloud`/`CloudLightning` instead of the originally-shipped `CloudRainWind`/`CloudHail` from spec 0012 — applies everywhere `VibeIcon` renders (Home, Pet Profile), not just here.
- `DailyCheckInSheet` gained an optional `dayLabel` prop so an exception day shows its actual date ("Jul 16") instead of always saying "yesterday," which would have been actively wrong for any day beyond the most recent one.
