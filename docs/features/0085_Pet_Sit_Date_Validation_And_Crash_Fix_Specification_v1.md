# 0085_Pet_Sit_Date_Validation_And_Crash_Fix_Specification_v1

**Status:** Approved by Lynn 2026-11-26, including the error copy and the click-to-open calendar. Building.
**Date:** 2026-11-26
**Branch:** `claude/spec-0085-sit-date-crash` (off `main` at `1ce9a31`)
**Migration:** `0063_pet_sit_date_check.sql` (reserved)
**Process:** `/ship-feature`. Type: **PROTECTED**, because it adds a migration and the dates it guards decide how long a sitter can see a pet (`pet_sit_is_open()`, migration 0057). Merging needs Lynn's OK after review passes.
**Related files:** `src/components/PetSittingSection.jsx`, `src/pages/PetSitter.jsx`, new `src/lib/sitDates.js` (+ test), `src/components/IconButton.jsx`, `src/lib/errorMonitoring.js`, `src/components/ui/use-toast.jsx`, `supabase/migrations/0001_init_schema.sql` (the `pet_sits` table), `supabase/migrations/0057_sitter_access_lockdown.sql` (`pet_sit_is_open()`), `supabase/migrations/0058_account_deletion_data_safety.sql` (updates `pet_sits.created_by`), `supabase/migrations/0055_*.sql` (the deploy-marker gate pattern), `e2e/pet-sitter.spec.js`, `docs/testing/QA_Test_Plan.md`

## Lynn — what I need from you

1. ~~Review this spec~~ Approved 2026-11-26.
2. **After the frontend is promoted to production**, open Pet Sitter on prod (desktop is fine). Your bad sit will show **"Dates not set"**. Tap its pencil and enter the right dates, or tap its trash can to delete it. Blocks the migration on prod: 0063 refuses to run while any bad sit exists (see flag 3).
3. **After merge, promote branch `main`'s build in Cloudflare** (commit message will start "Spec 0085"). Then I'll add the deploy marker and push 0063 to each project.

## Before You Approve This

1. **Why the page crashes.** On desktop Chrome a date box lets you type a year with 5 or 6 digits (like 20266). The database accepts it. When the page then tries to print that date ("Dec 1, 20266"), the date tool gives up and throws an error, and since that happens every time the page draws, the whole Pet Sitter page crashes on every open. Nothing on the page can be reached, so the bad sit can't be fixed or deleted either.
2. **Bad dates also stretch sitter access (new finding).** A sitter sees a sit's pets from the day before the start date to the day after the end date. An end date in 20266 means the sitter keeps access for about 18,000 years. A start date in 0202 opens access starting 1,800 years ago. So this is a small access hole as well as a crash, which is why I recommend the database rule (you said yes) and why this is PROTECTED.
3. **The database rule can't go on while a bad sit exists, and it mustn't skip old rows.** I looked at the "only check new saves" option (Postgres `NOT VALID`), but Postgres still checks it on *any* later change to a bad row. Account deletion changes every sit's owner (`created_by`, migration 0058), so one leftover bad sit would make deleting that person's account fail. So instead, 0063 adds a normal rule and **refuses to run if any bad sit exists**, printing how many and which IDs. You fix yours in the app first (step 2 above), then I push it. Dev has none today (checked 2026-11-26). I haven't checked staging or prod; I'll run the same read-only count on each right before pushing.
4. **Order matters on each project:** frontend promoted → deploy marker `spec_0085_frontend_live` → bad sits fixed → `db push`. If the rule went on first, someone on the old page who typed a bad year would hit a silent failure (the old Save button has no error handling and just stays on "Saving…"). 0063 checks for the marker, the same way 0055 and 0061 do.
5. **Limits you chose:** a sit can be at most **30 days** (end date at most 30 days after the start, so up to 31 checklist days). Years must be **2000–2100**. End can't be before start. A one-day sit (same start and end) is fine. Your existing good sits: I'll count any over 30 days on each project before pushing, since those would block the migration too. If any exist, I'll come back to you rather than deleting anything.
6. **Too-short years were worse than they looked.** A year like 0202 to 2026 is about 667,000 days. The page would try to create that many checklist rows in one go and draw that many on screen. The 30-day limit caps it at 31.
7. **"End before start" was silently accepted.** The date library in use (date-fns v3) quietly lists the days backwards instead of complaining, so a reversed sit saved and showed a backwards checklist. Now refused.
8. **Desktop typing can't be fully stopped in the box itself.** I'll set the date boxes' earliest/latest allowed dates, which stops the date picker and usually limits the year to 4 digits, but browsers differ. The check on Save (and the database rule behind it) is the real guard.
9. **Calendar opens on click (added 2026-11-26 at your request):** clicking anywhere in a date box opens the browser's own calendar, not just the small icon at its right edge. Typing still works, so the Save check stays the real guard. A custom calendar dropdown was considered and left out: the app has no calendar component yet, so it would be its own spec.
10. **Small extra fix you approved:** the Share, Edit and Delete icons on each sit are 14px and unlabeled. They become the shared `IconButton` (44px tap area, screen-reader label).
11. **Self-review:** no duplicate date-checking helper exists in the app (searched; the only `min`/`max` date use is onboarding's birthday field). No new debt. One existing gap noticed but not fixed: if loading the sits fails, the page stays on "Loading..." forever (listed under Findings). The sitter's own view uses this same component, so sitters get the crash fix too.

## Copy for approval (approved by Lynn 2026-11-26)

| Where | Text |
|---|---|
| Under the date fields, year outside 2000–2100 or not a real date | "Please enter a real date with a 4-digit year." |
| Under the date fields, end before start | "The end date can't be before the start date." |
| Under the date fields, longer than 30 days | "A pet sit can be up to 30 days. For a longer trip, add a second sit." |
| Toast when saving fails for any other reason | Title "Couldn't save this pet sit", body "Please try again." |
| A saved sit with an unusable date (list header) | "Dates not set" (already used today for a sit with no dates) |

## Functional Requirements

1. The Pet Sitter page always opens, even when a saved sit has an impossible date.
2. A sit with an impossible saved date shows "Dates not set", with its Share, Edit and Delete buttons still working, and no daily checklist.
3. When adding or editing a sit, Save refuses a date whose year isn't between 2000 and 2100, an end date before the start date, or a sit longer than 30 days. It says why, under the date fields, and saves nothing.
4. If saving fails for any other reason (network, database), the owner sees a "Couldn't save" message, the button stops saying "Saving…", the dialog stays open with what they typed, and the error is reported to Sentry.
5. The database itself refuses the same impossible dates, so no other path (old open tab, future screen, script) can store one.
6. Each sit's Share, Edit and Delete buttons meet the 44px tap size and have screen-reader labels.
7. Clicking or tapping anywhere in the Start or End date box opens the calendar, so owners can pick a date instead of typing one. Typing still works.
8. (Added 2026-11-26, Lynn approved during planning.) If a new sit saves but its checklist fails to build, a second tap on Save updates that same sit instead of creating a duplicate.

## Acceptance Criteria

- **AC1** Given a saved sit with an end date in year 20266 (or start in 0202), when the owner or its sitter opens Pet Sitter, then the page loads, that sit reads "Dates not set", and the other sits display normally.
- **AC2** Given that sit, when the owner taps Edit, enters valid dates and saves, then the sit shows its real dates and a checklist with one row per day.
- **AC3** Given that sit, when the owner taps Delete and confirms, then it's gone.
- **AC4** When the owner types a start or end year outside 2000–2100, Save shows "Please enter a real date with a 4-digit year." and nothing is saved.
- **AC5** When the end date is before the start date, Save shows "The end date can't be before the start date." and nothing is saved.
- **AC6** When the end date is 31+ days after the start, Save shows the 30-day message and nothing is saved. Exactly 30 days after saves, with 31 checklist days. Same start and end saves, with 1.
- **AC7** When a save fails at the server, a "Couldn't save this pet sit" toast appears, the button returns to normal, the dialog stays open with the typed values, and `reportClientError` is called with `feature: 'pet-sitting'`.
- **AC8** After 0063, a direct database insert or update with any of the AC4–AC6 bad dates is refused, and a valid one is accepted.
- **AC9** 0063 stops with a clear message if the frontend marker is missing or any existing sit breaks the rule, and changes nothing in either case.
- **AC10** Account deletion and the ownership hand-off still work for an owner with sits (no regression from the new rule).
- **AC11** Share, Edit and Delete on a sit are each at least 44×44px and have the labels "Share with sitter", "Edit sit", "Delete sit".
- **AC12** On desktop Chrome, clicking the middle of the Start or End date box opens the browser's calendar. Picking a day fills the box. In a browser without this ability, clicking does nothing extra and the page shows no error.
- **AC13** Given a new sit whose create succeeds but whose checklist step fails, when the owner taps Save again, then the existing sit is updated, not created again (one sit, not two).

## Test Plan

- AC1 → **Vitest** on the new `parseSitDate()` (`20266-12-01`, `0202-01-01`, `''`, `null` give "not usable"; `2026-12-01` gives a date) plus a render test of `PetSittingSection` with a mocked bad sit, confirming it renders "Dates not set" without throwing. Not Playwright, because once 0063 is on dev a bad sit can't be saved there to seed the test.
- AC2, AC3 → covered by the existing Playwright edit/delete flows in `pet-sitter.spec.js` for valid sits; the bad-sit version is the AC1 render test. Lynn's prod fix (step 2) is the real-world check.
- AC4, AC5, AC6 → **Vitest** on `validateSitDates()` for every boundary (1999/2000/2100/2101, end = start, end = start − 1, +30, +31 days), plus one **Playwright** test in `pet-sitter.spec.js` that types a 5-digit year with the keyboard, taps Save, sees the message, and confirms no new sit appears.
- AC7 → **Vitest** render test with `PetSit.create` mocked to reject: toast shown, `reportClientError` called, dialog still open. Not Playwright: a normal session can't make the server fail on demand.
- AC8 → **Deno** test, new `supabase/tests/pet_sit_dates.test.ts`, signed in as a scratch user (create and sign in once for the file, per the sign-in limit rule): insert/update with each bad case is refused; valid insert works.
- AC9 → manual on dev during the build: run 0063 without the marker (refused), with a planted bad row inserted before the rule (refused, row listed), then clean and run. Not automated: needs to run the migration itself.
- AC10 → existing `supabase/tests/account_deletion.test.ts` and `delete-account`/`delete-pet` `index.test.ts` must stay green after 0063 is on dev.
- AC11 → **Playwright**, measure the three buttons' size on one sit in `pet-sitter.spec.js`.
- AC12 → **Vitest** render test: clicking a date input calls its `showPicker()` (mocked), and a mocked `showPicker` that throws, or one that's missing, causes no error. The real calendar popup can't be checked by Playwright, because it's drawn by the browser outside the page. Lynn's desktop check after promotion is the real-world test.
- **Order safety:** the new Playwright test creates nothing (Save is refused) and checks the sit count before and after, so it can't affect later tests.
- **Seeding/access constraints:** bad saved dates can't be seeded once 0063 is on dev, which is why AC1 is a render test with mocked data.
- QA plan: add these cases to the Pet Sitter section of `docs/testing/QA_Test_Plan.md` in the same PR.

## Visual Reference

None provided. No layout change: messages appear under the date fields in the existing small destructive text style, and the three icons keep their place, just with bigger tap areas.

## Technical Spec

- **New `src/lib/sitDates.js`:**
  - `SIT_MIN_DATE = '2000-01-01'`, `SIT_MAX_DATE = '2100-12-31'`, `SIT_MAX_DAYS = 30`.
  - `parseSitDate(str)`: returns a Date only if `str` matches `^\d{4}-\d{2}-\d{2}$`, parses to a valid date, and sits within the min/max; otherwise `null`.
  - `sitDays(sit)`: `[]` unless both dates parse, end ≥ start and the span is ≤ 30 days; otherwise `eachDayOfInterval`. Used by both the render (line ~207) and `ensureLogsForSit` (line ~90), so neither can ever build a huge or backwards list.
  - `validateSitDates(start, end)`: returns `null` or one of the three approved messages.
  - `formatSitRange(sit)`: the header text, or `'Dates not set'` when either date doesn't parse (line ~220).
- **`PetSittingSection.jsx`:**
  - Header and checklist use the helpers above, so the day formats at ~311/318 only ever see valid days.
  - `handleSave`: run `validateSitDates` first and show the message inline; wrap the create/update + `ensureLogsForSit` in `try/catch/finally` (`setSaving(false)` in `finally`); on error show the destructive toast and call `reportClientError(err, { feature: 'pet-sitting', note: editing ? 'update' : 'create' })`. Clear the message when either date changes.
  - Date inputs get `min={SIT_MIN_DATE}` / `max={SIT_MAX_DATE}`, and the end input `min={form.start_date || SIT_MIN_DATE}`.
  - Both date inputs get `onClick={openDatePicker}`, a small helper in `sitDates.js`: `e.currentTarget.showPicker?.()` inside `try/catch`, since some browsers don't have `showPicker` and it throws if called without a click. Mouse only: keyboard focus and typing are unchanged. No new library or component.
  - Share/Edit/Delete become `IconButton` (`variant="plain"`, 44px, `aria-label`s from AC11), keeping `stopPropagation`.
- **Migration `0063_pet_sit_date_check.sql`:**
  - Gate: refuse unless `private.deploy_markers` has `spec_0085_frontend_live` (same pattern and header snippet as 0055/0061).
  - Gate: count rows breaking the rule; if any, `raise exception` listing up to 20 IDs and their dates. Never edits or deletes data.
  - `alter table public.pet_sits add constraint pet_sits_dates_sane check (start_date between '2000-01-01' and '2100-12-31' and end_date between '2000-01-01' and '2100-12-31' and end_date >= start_date and end_date - start_date <= 30)`. A plain (validated) check, not `NOT VALID` (see flag 3).
  - No function, policy or permission changes, so the 0059 permission check isn't affected.
  - `scripts/restore-test.sh`: add the new marker alongside the existing two.
- **Edge Functions:** none changed. `invite-sitter` and the sitter email templates print the dates as stored, and can only ever see valid ones after this.
- **Design System compliance:** checked against `0005 Design System.md`. The fix swaps three hand-rolled sub-44px icon buttons for the shared `IconButton`. The pre-existing 12px chip "x" in Custom Daily Tasks (line ~412) is the same issue, so it moves to `IconButton variant="plain"` too. No new colors, fonts or emoji. `design-system-check` runs on the changed file.
- **Locked decisions:** respects spec 0073/0057 (the access window logic is untouched; only its inputs are guarded), 0058 (account deletion still updates `created_by`; that's why the rule must be fully valid), 0078 (`reportClientError`, no `console.error`), and the migration-gate pattern.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none. Pet sits are created and edited only in `PetSittingSection.jsx`. No shared date-validation helper exists.
- **Technical debt nearby:**
  - `load()` has no error handling, so a failed load leaves "Loading..." forever. Not fixed here.
  - `handleSave` and `handleDelete` had no error handling. Save is fixed here. Delete is wrapped the same way, as part of the same small change.
  - Sitters also see the Edit and Delete icons on sits they don't own. The database refuses the change, but the buttons shouldn't show. Not fixed here; worth a punch-list line.
- **Orphaned features nearby:** none found.
- **Punch list / known issues:** I didn't find a planner row for this crash. If you want one, tell me and I'll add it to the launch plan.

## Non-Goals

- Fixing `load()`'s missing error handling or hiding owner-only buttons from sitters.
- Changing the sitter access window (day before to day after).
- Cleaning up existing bad sits automatically (you chose to fix them in the app).
- Date checks on other date fields in the app (vaccinations, check-ins, etc.).

## Open Questions

- None blocking. Before pushing 0063 I'll report the bad-sit and over-30-day counts for staging and prod. If any show up beyond your one prod sit, I'll stop and ask you.
