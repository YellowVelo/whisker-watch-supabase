# 0087_Current_Foods_And_Medications_Specification_v1

**Status:** Built 2026-11-27 on `claude/spec-0087-current-foods-meds`. Every task passed review on the first round; QA and the final review passed. Waiting for Lynn's PROTECTED merge OK (Ask Wysker change). Approved by Lynn 2026-11-27 (no new copy).
**Date:** 2026-11-27
**Branch:** `claude/spec-0087-current-foods-meds` (off `main` at `2b2774c`)
**Migration:** none
**Process:** `/ship-feature`. Expected type: **NORMAL** (no access rules, migrations or permission changes). It does redeploy two server functions (`ask-vet-assistant`, `generate-vet-report`), which the planner may tag PROTECTED if it counts them as service-role functions; if so, merging waits for Lynn's OK.
**Related files:** `src/components/PetSittingSection.jsx`, `src/components/FoodSection.jsx`, `src/components/MedicationSection.jsx`, `src/components/PetProfileContent.jsx`, `src/lib/petsClient.js` (`getActiveMedicationCountsForPets`, used by `src/pages/Home.jsx`), `src/components/ExportCalendarButton.jsx`, `src/lib/timezone.js`, `supabase/functions/ask-vet-assistant/context.ts` (`loadActiveMedications`, `loadCallerTimezone`), `supabase/functions/generate-vet-report/index.ts`, `supabase/functions/_shared/checkinRules.ts` (`dateStrInTimezone`), `src/lib/aiServerParity.test.js`, `e2e/pet-sitter.spec.js`, `docs/testing/QA_Test_Plan.md`

## Lynn — what I need from you

1. ~~Review this spec~~ Approved 2026-11-27.
2. After merge: **promote branch `main`'s build in Cloudflare** (commit message will start "Merge pull request" and name this branch). Doesn't block the server-function deploys.

## Before You Approve This

1. **Why Tribble's sitter card lists six foods.** A food has an on/off switch ("active") and an optional end date. The Food tab counts a food as current only if its switch is on **and** its end date hasn't passed, which is why it shows 1 current and 5 past. The sitter card checks only the switch, and all six of Tribble's foods still have it on. Nothing is wrong with your data.
2. **Medications change too (you chose this).** Today a medication counts as "Active" everywhere based on the switch alone, even after its end date. After this spec, a medication whose end date has passed moves to "Past medications" by itself, on the Medications tab, the pet profile, the sitter card, Home's medication count, Ask Wysker (it stops telling the AI the pet is on it) and the vet report (its column says "Inactive"). **Your real data may shift**: any med with a past end date that you never switched off will drop out of "Active" on the day this ships.
3. **Switching a past-dated item back on won't bring it back.** If something's end date has passed, flipping its switch on leaves it under "Past". To start it again, edit it and change or clear the end date. That's already how foods behave today; meds will now match. No new wording is added for this. If you'd like a hint in the edit form, that needs new copy, so say so and I'll draft it.
4. **Calendar export stops including finished meds.** "Export to calendar" currently adds due-date reminders for every medication, even switched-off ones. It will now include only current ones.
5. **Small time-zone bug fixed along the way.** The Food tab works out "today" in UTC (London time), so in the US evening a food ending today already showed as past. Every screen will use your saved time zone (your device's if none is saved), as the pet profile already does. The server uses the person's saved time zone, UTC if unset, as the vet report already does.
6. **No database change.** Nothing flips anyone's switches. "Current" is worked out from the switch plus the end date each time a screen loads, so nothing needs undoing.
7. **Self-review:** the same "switch on and end date not passed" check is currently hand-written in two places (Food tab, pet profile) and missing in seven. This spec puts it in one shared helper so it can't drift again, with a matching server copy that a test keeps identical (the same pattern spec 0080 uses). The timeline and onboarding review deliberately keep listing every medication (they're history, not "what's current"). No duplicate feature, no new debt, no locked decision touched.

## Copy for approval

No new user-facing text. Existing headings ("Current Diet", "Past foods", "Active Medications", "Past medications") and the vet report's "Active"/"Inactive" stay as they are.

## Functional Requirements

- **FR1.** One rule decides whether a food or medication is current: its switch is on, and it has no end date or its end date is today or later. The end date counts as a current day. No end date means current. (Confirmed by Lynn 2026-11-27, including that switching an item off also ends it. This is the interim rule until the medication module adds prescriptions and refills; that module will revisit it for medications.)
- **FR2.** "Today" means today in the viewer's saved time zone, falling back to the device's time zone, then UTC. On the server it's the caller's saved time zone, UTC if unset.
- **FR3.** The sitter card (owners' and sitters' views) lists only current foods and current medications for each pet.
- **FR4.** The Food tab's Current Diet / Past foods split and the pet profile's food list use the rule (behavior unchanged except for the time-zone fix).
- **FR5.** The Medications tab splits Active / Past by the rule. Its "given today" taps work only for current meds, as they do for active ones today.
- **FR6.** The pet profile's medication list and Home's per-pet medication count include only current meds.
- **FR7.** Ask Wysker tells the AI only about current medications.
- **FR8.** The vet report marks a medication "Active" only if it's current, and lists current ones first.
- **FR9.** Calendar export includes due dates only for current medications.
- **FR10.** Medication history (the pet timeline) and the onboarding review still show every medication.
- **FR11.** No stored data changes.

## Acceptance Criteria

- **AC1.** Given a pet with one current food and one food switched on but ended yesterday, when the owner opens Pet Sitter, then the sit card lists only the current food. The same holds on a sitter's view.
- **AC2.** Same as AC1 for medications on the sit card.
- **AC3.** Given a food or medication ending **today**, it shows as current everywhere.
- **AC4.** Given a medication switched on but ended yesterday, it appears under "Past medications" on the Medications tab, not "Active Medications", and isn't counted on Home or listed on the pet profile.
- **AC5.** Given that same medication, Ask Wysker's pet data doesn't include it, and the vet report shows it as "Inactive".
- **AC6.** Given a medication switched off with no end date, behavior is unchanged (past everywhere).
- **AC7.** Given a viewer whose saved time zone is behind UTC (e.g. America/Los_Angeles) at 9 pm local time, a food ending today still shows under Current Diet.
- **AC8.** Calendar export contains no event for a medication whose end date has passed.
- **AC9.** The pet timeline still lists the past-dated medication.
- **AC10.** The client rule and the server rule give the same answer for the same inputs (parity test).

## Test Plan

- AC1, AC2 → Playwright, `e2e/pet-sitter.spec.js`: test1@ adds a current food and med plus an ended-yesterday food and med (normal owner writes to `pet_foods`/`medications`), creates a sit, checks the card, cleans up in `finally`. Sitter's view → unit render test on `SitCard` (same component; test4@'s sitter data is set up only in its own spec).
- AC3, AC6, AC10 → Vitest on the shared helper (end today/yesterday/tomorrow, no end date, switched off, bad date string) and a parity test comparing the client and server copies.
- AC4 → Playwright on the Medications tab with the ended-yesterday med; Home count and pet profile → unit tests on `getActiveMedicationCountsForPets` and the profile filter.
- AC5 → Deno tests: `loadActiveMedications` with a past-dated med (as test2@), and the vet report's row status helper.
- AC7 → Vitest with a fixed clock and time zone. Not Playwright: the browser's clock can't be reliably moved here.
- AC8 → Vitest on the export's event list.
- AC9 → new Vitest on `getTimelineEvents` (`src/lib/checkin/petProfileClient.js`, no test exists yet) with a past-dated med, entities mocked. The timeline code itself isn't changed.
- **Seeding/access constraints:** none. Everything is creatable by a normal signed-in owner on dev.

## Visual Reference

- Lynn's screenshot of the prod sit card (2026-11-27): six foods listed for Tribble → illustrates the bug FR3 fixes.
- Lynn's screenshot of Tribble's Food tab: "Current Diet (1)", "Past foods (5)" → the expected result for FR3.

## Technical Spec

- **Schema:** none.
- **New `src/lib/currentItems.js`:** `isCurrentItem(row, todayStr)` → `row.active === true && (!row.end_date || row.end_date >= todayStr)` (string compare on `YYYY-MM-DD`, as today's code does; a malformed `end_date` counts as not ended, so bad data never hides a med the owner switched on), plus `splitCurrent(rows, todayStr)` → `{ current, past }`. "Today" comes from `dateStrInTimezone(user?.timezone || detectTimezone() || 'UTC', 0)`.
- **Server copy:** `supabase/functions/_shared/currentItems.ts`, same function, kept identical by an addition to `src/lib/aiServerParity.test.js`.
- **Client call sites:** `PetSittingSection.jsx` (meds + foods after load, line ~111); `FoodSection.jsx` lines 71–73 (drop its UTC `today()` for the split, keep it for the new-food default start date or switch that to the time-zone date too); `MedicationSection.jsx` lines 84–85; `PetProfileContent.jsx` line ~258 (meds) and ~275 (foods, replace the inline check); `petsClient.js` `getActiveMedicationCountsForPets` (select `pet_id, active, end_date` and filter by the rule; it takes a `todayStr` argument from `Home.jsx`); `ExportCalendarButton.jsx` (skip non-current meds).
- **Server call sites:** `ask-vet-assistant/context.ts` `loadActiveMedications(client, petId, todayStr)`, selecting `end_date` and filtering by the rule, with `todayStr` from the already-loaded caller time zone; `generate-vet-report/index.ts` line ~500 (sort current first) and ~655 (status column), using `profile.timezone` it already loads.
- **API / edge functions:** redeploy `ask-vet-assistant` and `generate-vet-report` to dev, staging and prod, then run `scripts/check-functions-start.sh` on each (`0006 Technical Standards.md` §11). No permission changes.
- **Design System compliance:** no new UI or styles; only which rows render changes. `design-system-check` runs on each touched `.jsx`.
- **Constraints from CLAUDE.md / locked decisions:** none affected. The AI still never receives a prompt from the browser (spec 0080); the server loads meds itself.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** the current-food check is hand-written twice (`FoodSection.jsx:72`, `PetProfileContent.jsx:275`); this spec replaces both with the shared helper.
- **Technical debt nearby:** `FoodSection.jsx`'s `today()` uses UTC (fixed here). `MedicationSection.jsx` and `FoodSection.jsx` still show `▾`/`▸` text arrows for the Past toggle and use plain `<Switch>` rows; not touched here (Design System accordion work, out of scope).
- **Orphaned code:** none found.
- **Open/known issues:** none on the punch list for this area.
- **Behavior change risk:** flag 2. Meds with past end dates silently become "past"; that's the intent, but it changes what Ask Wysker and the vet report say.

## Non-Goals

- Auto-switching items off in the database.
- Treating a future start date as "not yet current" (unchanged: a med starting next week counts as current today, as now).
- A hint in the edit form about end dates (flag 3; separate copy decision).
- Redesigning the Past toggle or switches.

## Open Questions

- None beyond flag 3.
