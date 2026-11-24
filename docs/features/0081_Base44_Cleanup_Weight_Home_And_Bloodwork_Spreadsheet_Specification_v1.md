# 0081_Base44_Cleanup_Weight_Home_And_Bloodwork_Spreadsheet_Specification_v1

**Status:** Approved by Lynn 2026-11-23: spec, wording A–H and the FR9 translation table. Follow-up decisions, same day, from her IDEXX PDF sample and her spreadsheet template: photo/PDF scans use the same review as spreadsheets (FR35), and spreadsheet weights can go into weight history (FR36). Wording I–K approved too. Fully approved; build waits for spec 0080 to merge.
**Date:** 2026-11-23
**Branch:** `claude/base44-cleanup`
**Migration:** `0061` (reserved by the first session). It gives weight its new home, moves the old records, and deletes the three Base44-era tables.
**Punch list:** PA-71, PA-50, PA-51 (Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`).
**Process:** `/ship-feature` (`docs/foundation/0011 SDLC Governance.md`). Expected type: **PROTECTED.** It has a migration that moves and deletes data, changes who can see weight (sitters, see Before You Approve item 4), and changes the storage bucket's allowed file types. Lynn's OK is needed before merge even after review passes.
**Depends on:** spec 0080 (branch `claude/ai-vet-report`, approved, being built). 0081's build starts only after 0080 is merged, because both change the same AI and Vet Report files (see "Overlap with spec 0080").
**Lynn's rule this spec carries out (2026-11-23):** "We should have no Base44-era anything. If we are still using the code, logic, etc — we need to replace it."

**Decisions already made (Lynn, 2026-11-23):**
1. **Where weight is entered:** a new "Log weight" sheet (opened from the Weight card on Pet Profile and Trends), plus the existing optional Weight box in the daily check-in, plus onboarding's starting weight. All three save to the same place, and every screen reads that one place.
2. **Old symptom-log history:** move what fits, then delete the old table. Weights move to the new home. Other answers, notes, "signs of pain" and "medication given" go into the check-in history (details in FR8–FR10).
3. **Fixing a wrong weight:** the Log weight sheet lists the last 10 entries, each with Edit and Delete.
4. **Bloodwork spreadsheets:** accept CSV and Excel (.xlsx). The app reads the file and the AI matches it to the 16 bloodwork values. Several visits can come in at once, and the owner reviews every visit before anything saves.
5. **Imported spreadsheets are kept** with the pet's documents, like scanned bloodwork reports.
6. **The data helper stays** (`entities.X.filter(...)`). Only its Base44 parts are removed.
7. **Test and demo seed data keeps working,** written to current tables instead of the deleted ones.
8. **Sitters may see weight,** read-only and only during the sit, the same as check-ins.

**Related files:**
- Weight: `src/components/PetProfileContent.jsx`, `src/pages/PetTrends.jsx`, `src/pages/Home.jsx`, `src/components/onboarding/PetInfoCard.jsx`, `src/components/DailyCheckInSheet.jsx`, `src/components/catchup/BulkApplySheet.jsx`, `src/lib/checkin/{petProfileClient,trendsClient,checkinClient,config}.js`, new `src/lib/weightClient.js`, new `src/components/WeightLogSheet.jsx`
- Retired: `src/pages/PetSymptoms.jsx`, `src/components/SymptomLogForm.jsx`, `src/pages/Timeline.jsx` (its symptom-log rows), `src/lib/petScreenContext.js` (the `/symptoms` entry), `e2e/symptom-timeline.spec.js`
- Base44 leftovers: `src/api/{entityClient,entities}.js`, `src/lib/AuthContext.jsx`, `src/App.jsx`, `src/components/ProtectedRoute.jsx`, `src/components/UserNotRegisteredError.jsx`, `src/pages/ResetPassword.jsx`, `src/lib/PageNotFound.jsx`, `src/lib/query-client.js`, `src/utils/index.ts`, `src/components/PetSittingSection.jsx`, `src/lib/seedTestData.js`, `package.json`
- Bloodwork: `src/components/BloodworkSection.jsx`, new `src/components/BloodworkImportReview.jsx`, `src/api/storageClient.js`, `src/lib/scannedDocuments.js`, `supabase/functions/ask-vet-assistant/` (0080's `prompts.ts`/`index.ts`)
- Server: `supabase/functions/generate-vet-report/index.ts`, `supabase/functions/ask-vet-assistant/context.ts` (both as 0080 leaves them)
- Database: new `supabase/migrations/0061_weight_home_and_base44_tables.sql`
- Tests and docs: `supabase/tests/` (new `weight_home.test.ts`), `e2e/` (new `weight-log.spec.js`, `bloodwork-spreadsheet.spec.js`; changes to `ask-wysker-guardrails.spec.js`), `docs/testing/QA_Test_Plan.md`, `docs/foundation/0007 Data Model_V2.md`

## Lynn — what I need from you

1. ~~Review this draft~~ Approved 2026-11-23.
2. ~~Approve the wording (A–H)~~ Approved 2026-11-23.
3. ~~Approve the FR9 translation table~~ Approved 2026-11-23.
3a. ~~Answer Open Question 3~~ Answered 2026-11-23: same review for photo, PDF and spreadsheet; spreadsheet weights become a tickable line.
3b. ~~Approve wording I–K~~ Approved 2026-11-23.
4. **Later, before merge:** OK the PROTECTED merge after review passes (0011 rule).
5. **Later, at rollout:** promote the frontend build in Cloudflare (branch `main`, commit message starting "Spec 0081"), then add a deploy marker on each project. I'll give you the exact steps and tell you when.

## Before You Approve This

1. **This is three jobs in one spec.** Weight's new home (PA-71) is the big one: it moves real data and deletes a table. The Base44 cleanup (PA-50) is mostly deleting dead code. The spreadsheet import (PA-51) is a new feature. They share one branch and one PR, built in that order, so a problem in the spreadsheet work can't hold up the data move. Say so if you'd rather split them.
2. **Weight you typed in daily check-ins will suddenly appear.** The check-in's optional Weight box has been saving weights since spec 0012, but no screen ever showed them. After this spec they appear on Home, Pet Profile, Trends and the Vet Report alongside the old weights. That's the fix, but a weight you forgot you typed may show up.
3. **Short planned gap at rollout, like spec 0080's.** The new app reads weight from the new home, and the migration that moves the old weights runs only after the new app is live. That's the safe order: if the old table were deleted first, anyone with the app open would get errors. For the few minutes between your Cloudflare promotion and my migration, Weight cards show "Record Weight" as if empty. Nothing is lost. Anyone with the old app open who saves a weight in those minutes still writes to the old table, and the migration moves it. After the migration, the old Symptoms page in an open tab stops working until it's reloaded. Avoiding the gap entirely would need a second migration number and a two-step rollout. I recommend the short gap.
4. **Who can see what changes (PROTECTED):** sitters can now see a pet's weight, read-only, from the day before the sit to the day after (your decision 8). No sitter screen shows weight yet, so nothing visible changes for sitters. Owners and co-owners see and edit weight exactly as before. Strangers still see nothing.
5. **Deleting the old table is permanent in the app.** Before deleting, the migration moves everything that has a place to go (FR7–FR10), and the build's first step counts the rows on all three projects (FR11). If production has more old symptom logs than expected (anything beyond the 11 Base44 days and onboarding weights), I stop and show you before going further. The nightly database backups keep a copy of the deleted tables for 30 days.
6. **Re-importing the same spreadsheet won't create duplicates.** Owners often keep one running spreadsheet and re-import it after each vet visit. A visit whose date already has a bloodwork record starts unticked in the review, marked "Already on file." The owner can tick it to add it anyway.
7. **Values in other units are never converted.** If a sheet gives creatinine in µmol/L instead of mg/dL, the AI leaves it out and the review lists it as "Not imported (different unit)." Guessing at unit conversions on medical values is how wrong numbers get saved.
8. **Windows reports CSV files as Excel.** Many Windows computers label a .csv file as an Excel file when uploading. The upload check goes by the file's name ending as well as its label, so CSVs aren't refused on Windows.
9. **Excel support needs one new library.** It's a small library that only reads .xlsx files, loaded only when someone imports a spreadsheet. Older .xls files get a message asking to save as .xlsx or .csv. I picked a library on the public npm registry with no open security advisories, pinned to an exact version (CI already enforces this for server code). The best-known Excel library (`xlsx` on npm) is avoided because its npm version has known security problems.
10. **The PA-50 punch-list note is out of date.** It names 7 files. Spec 0071 already cleaned `aiClient.js`, `storageClient.js`, `BloodworkSection.jsx` and `ask-vet-assistant`. What's left is in `entityClient.js`, `AuthContext.jsx`, `ResetPassword.jsx`, and a few Base44-template pieces the note didn't list (FR21–FR26).
11. **A new automatic test stops Base44 from creeping back in.** It fails if the word "Base44" appears anywhere in the app's or server's code. Past migrations and docs are exempt, since they record history.

Self-review: no conflicts with locked rules. Weight stays a separate signal and never affects the Vibe or the symptom count (spec 0012: Weight is "tracked separately"). Moved old answers never get a made-up Vibe: days with no check-in get one with no Vibe, the same rule migration 0027 used. The retired Stable/Monitor weight label and its hidden 0–100 weight score are removed, not carried over. No duplicate of an existing feature: the check-in's Weight box already existed and is reused, not rebuilt. New upkeep: none beyond the new library.

## Wording for your approval

**A. Log weight sheet** (title, fields, button):
> **Log weight**
> Date: [today]
> Weight: [ ] lbs
> [Save]
>
> **Recent weights**
> Nov 20, 2026 · 11.2 lbs   [Edit] [Delete]

Empty list: "No weights logged yet."

**B. Weight out of range:**
> Enter a weight between 0.1 and 300 lbs.

**C. Delete a weight (confirm):**
> Delete this weight? This can't be undone.

**D. Weight that came from a check-in** (small line under the entry in the list):
> From daily check-in

**E. Spreadsheet button and help line** (Bloodwork tab; today's button is "Upload File"):
> [Upload File] (accepts photo, PDF, CSV or Excel)

**F. Spreadsheet review** (one card per visit):
> **Review imported bloodwork**
> We found 3 visits. Check each one before saving.
>
> **Oct 2, 2026** · IDEXX · Dr. Patel  [✓ Include]
> BUN 32 · Creatinine 2.1 · SDMA 15 …  (each value editable)
> Not imported (different unit): Creatinine µmol/L
>
> **Mar 14, 2026** — Already on file  [  Include]
>
> [Save 2 visits]  [Cancel]

**I. Tests the app doesn't track** (one muted line per visit card):
> Not tracked yet: Chloride, Globulin, GGT, Cholesterol …

**J. Spreadsheet weight line:**
> Weight 9.8 lbs: also add to weight history  [✓]

**K. Same visit found twice with different values:**
> Found twice with different values. Check which is right.

(I–K added 2026-11-23 after Lynn's examples; approved by Lynn the same day.)

**G. Spreadsheet problems:**
> - Old Excel file: "This is an older Excel file. Save it as .xlsx or .csv and try again."
> - Too big to read: "This spreadsheet is too large to import. Try a sheet with just the bloodwork results."
> - Nothing found: "We couldn't find any bloodwork results in this spreadsheet."

(AI failures and rate limits keep today's shared messages from `aiErrorText()`.)

**H. Old notes moved into check-in history** (appears as that day's "Other" answer):
> From an older symptom log: Signs of pain. Medication given. "[the owner's own note]"

## Functional Requirements

### Part 1 — Weight gets its own home (PA-71)

1. Weight has one home: the daily check-in's record of answers, as the "Weight" answer. That's where the check-in's Weight box already saves. A weight logged outside a check-in (the new sheet, onboarding) is saved there too, with its own date and no check-in attached.
2. **Log weight sheet:** tapping the Weight card on Pet Profile opens it (today the card opens the old Symptoms page). The Trends Weight card gets the same "Log weight" button. The sheet has a date (default today, in the owner's time zone, never in the future), a weight in lbs (0.1–300, one decimal place), and Save.
3. The sheet lists the pet's 10 most recent weights, newest first, each with Edit (date and value) and Delete (with confirmation). A weight that came from a check-in is labeled (wording D). Its date can't be changed, because it belongs to that day's check-in, but its value can.
4. The daily check-in's Weight box and onboarding's starting weight keep working as today and save to the same home.
5. Every place that shows weight reads only the new home: Home's Weight chip, Pet Profile's Weight card, Trends' Weight card and chart, Ask Wysker and Insights' context (0080's server code), and the Vet Report.
6. If a pet has two weights on the same day, the most recently saved one is the day's weight for charts and "current weight." The list shows both.
7. Weight never affects the Vibe or the symptom count (unchanged rule).

### Part 1 — Moving the old records

8. Every old symptom log with a weight becomes a weight entry on the same date. If an identical weight already exists for that pet and date, it isn't added twice.
9. An old symptom log for a day with **no** check-in becomes a check-in for that day, with no Vibe (the owner never rated those days). Its answers are translated with this table, and the day's symptom count is computed the same way as for any check-in. Unlisted categories get "Normal," the same rule as every check-in and migration 0027.

   | Old answer | Becomes |
   |---|---|
   | Appetite: Ate all / Ate most / Ate some / Ate very little / Refused | Normal / Ate a little less / Ate much less / Ate much less / Did not eat |
   | Energy: Normal, Playful / Calm / Lethargic, Hiding | Normal / Slightly lower / Much lower |
   | Stool: Normal / Soft / Loose, Watery / Bloody / Constipated / None | Normal / Softer than usual / Diarrhea / Blood noticed / Constipated / no answer |
   | Water: Normal / Increased / Decreased / Not observed | Normal / More than usual / Less than usual / Not observed |
   | Urination (now Bathroom): Normal / Frequent, Excessive / Reduced, None | Normal / More frequent / Less frequent |
   | Vomiting count: 0 / 1 / 2 or more | None / Once / More than once |
   | Nausea list (lip licking, burping, drooling, ate non-food items, hunched posture) | The same Nausea answers |

   "Hiding" also adds Behavior: Hiding more. These rules follow migration 0027's hand choices for the 11 Base44 days where they overlap (for example "Ate most" became "Ate a little less").
10. An old symptom log for a day that **already has** a check-in never changes that check-in's answers. The check-in the owner made wins. In both cases (FR9 and FR10), "signs of pain," "medication given" and the free-text note are added to that day's "Other" answer (wording H), after anything already there. This finally moves the Base44 notes that migration 0027 left behind.
11. Before the migration runs anywhere, the build counts on each project: old logs with a weight, old logs with other answers, how many are on days with and without a check-in, and logs with notes, pain or medication. If production has old logs with answers beyond the 11 known Base44 days, the build stops and shows Lynn the counts and a few examples before going on.
12. After moving, the old symptom-log table is deleted.
13. The old Symptoms page and its form are removed. An old link or bookmark to it opens the pet's profile instead.
14. The Timeline page stops listing "Symptom log — …" rows. Their content is now in check-ins, which Timeline already shows.

### Part 2 — Base44 leftovers (PA-50)

15. The retired Health Score table (`wellness_scores`) is deleted. Nothing writes or shows it (0080 removes the Vet Report's read).
16. The Base44 meal-log table (`food_logs`) is deleted, along with the Vet Report's food-log section. It has only ever held test and demo seed data. The Vet Report's "Current Diet" (from pet foods) stays.
17. **Seed data keeps working** (Lynn's decision 7). The test/demo seeder writes current tables:
    - Healthy Dog (Buddy): 3 days of check-ins (Great Day, all normal) plus 3 weight entries of 65.0 lbs, instead of 3 old symptom logs. Its meal-log row becomes a current-diet entry ("Adult Dog Formula", dry food).
    - Multi-Pet Household: one Great Day check-in today per pet, instead of 3 old symptom logs.
    - Demo Showcase: its meal-log row becomes a current-diet entry for each pet ("Adult Formula").
    - Insights Trends and Empty Account: unchanged.
18. The data helper keeps its shape but loses its Base44 parts: the old name translations (`created_date`→`created_at`, `cat_id`→`pet_id`, etc.) and the comments describing Base44. The 3 places still sorting by `-created_date` use `-created_at`.
19. The "Access Restricted / not registered" screen is removed. It came from Base44's invite-only apps, and nothing in Wysker Watch can trigger it.
20. The "public settings" loading flag (a Base44 step that no longer exists) is removed from sign-in.
21. The Page Not Found screen is rewritten without Base44's template pieces: its admin-only "Admin Note" and its own separate sign-in check. It uses the app's normal sign-in state and moves to `src/pages/` with the other pages.
22. The page-link helper `createPageUrl` (Base44's, unused) is deleted.
23. The React Query library is removed if, as found, the Page Not Found screen was its only user.
24. Unused libraries from the Base44 starter template are removed after a build check confirms each is unused (Stripe ×2, Leaflet maps, Quill editor, drag-and-drop, confetti, markdown, html2canvas, jsPDF, lodash, next-themes, zod, hook-form resolvers, as found today).
25. Comments that describe how things worked in Base44 (`ResetPassword.jsx`, `AuthContext.jsx`, `entityClient.js`, `CatchUpFlow.jsx`, `zIndex.js`) are rewritten to describe the current code or deleted.
26. A test fails if "Base44" (any capitalization) appears in `src/`, `supabase/functions/`, `e2e/` or `scripts/`. Migrations and docs are exempt.

### Part 3 — Bloodwork from a spreadsheet (PA-51)

27. The Bloodwork tab's Upload File accepts .csv and .xlsx as well as photos and PDFs. All four open the same review (FR35).
28. For a spreadsheet, the app reads the file itself (every sheet in an .xlsx), turns it into plain text, and sends the text to the AI as a new task, "bloodwork spreadsheet." This is a 9th task added to spec 0080's fixed task list, with the server writing the instructions, the same as the other 8. The file is never sent to the AI.
29. The AI returns zero or more visits. Each has a date, lab, vet, any of the 16 values, urine values and notes. A value whose unit differs from the app's unit is returned as "not imported" with its unit, never converted (Before You Approve item 7).
30. The owner sees a review (wording F): one card per visit, every field editable, an Include tick per visit. Visits whose date already has a bloodwork record start unticked and marked "Already on file." Nothing saves until the owner confirms. Cancel saves nothing.
31. On confirm, each ticked visit becomes a bloodwork record, and the spreadsheet file is kept and linked to the pet's documents (Lynn's decision 5), the same way a scanned report is (spec 0071's pending-scan pattern: deleted on cancel, close or failure).
32. Spreadsheet text over 60,000 characters is refused before any AI call (wording G). Files keep the 10 MB upload limit.
33. Old .xls files, empty sheets and sheets with no bloodwork get wording G. AI failures and rate limits use today's shared messages. Failures go to Sentry (`reportClientError`).
34. The server's file reader for photo/PDF scans refuses spreadsheet files, so a spreadsheet path can never be sent to the AI as if it were an image.
35. **Photo and PDF scans use the same review** (Lynn, 2026-11-23, after her IDEXX sample report). The bloodwork scan returns the same `{ visits, skipped }` shape as the spreadsheet task, and opens the same review instead of a single prefilled form. That means one card per visit, values in other units listed as "Not imported (different unit)" and never converted, and duplicate dates starting unticked. This fixes a live bug: today's scan would save the IDEXX sample's creatinine of 194.48 µmol/L as 194.48 mg/dL, about 90 times too high, and keep only one of its 2 visits.
36. **Weights in a spreadsheet** (Lynn, 2026-11-23, after her template's WEIGHT row). If a visit has a weight with a stated unit (lbs or kg), its card shows one more line: "Weight 9.8 lbs: also add to weight history." The line starts ticked, or unticked if that pet already has a weight on that date. kg is converted to lbs (weight isn't a lab value, so the no-conversion rule in FR29 doesn't apply). A weight with no unit is listed as not imported. Ticked weights are saved as standalone weight entries (Part 1) on that visit's date.
37. **How spreadsheets are read, based on Lynn's template (`Idexx Template US.xlsx`):**
    - Tests go down the rows and visits across the columns, newest on the left. Date and weight rows come before the tests.
    - The "Range" (reference range) and "Measure" (unit) columns are read as labels, never as results.
    - A workbook with several near-identical sheets (her template has "Inc Research" and "No Research") gives each visit once. Visits with the same date and the same values on two sheets are merged. Same date with different values is shown as two cards, both unticked, marked "Found twice with different values."
    - Treatments, fluids, medications and supplements in the sheet are ignored, not shown and not saved, the same rule as the vaccine scan (spec 0061).
    - Tests the app doesn't track are listed once per visit as "Not tracked yet" (chloride, globulin, GGT, bilirubin, cholesterol, amylase, lipase, CK, blood count details, other urine tests, blood pressure). Wording I.

## Acceptance Criteria

1. **AC1:** Given a pet, when the owner logs 11.2 lbs for today in the Log weight sheet, then Pet Profile, Home's Weight chip and Trends show 11.2 lbs without a reload of other pages.
2. **AC2:** Given a weight typed in a daily check-in's Weight box, then it appears in the sheet's list (labeled "From daily check-in"), on Pet Profile and on Trends.
3. **AC3:** Given a listed weight, when the owner edits it to 11.0, then every screen shows 11.0. When they delete it and confirm, it disappears everywhere.
4. **AC4:** Given 0, 301 or a future date, when the owner taps Save, then nothing saves and wording B (or a date error) shows.
5. **AC5:** Given onboarding with a starting weight of 9 lbs, when the pet is created, then 9 lbs is that pet's current weight.
6. **AC6:** Given an old symptom log with a weight, when migration 0061 runs, then a weight entry with the same pet, date and value (in lbs, one decimal) exists, and an identical pre-existing entry isn't duplicated.
7. **AC7:** Given an old symptom log ("Ate most", vomiting 1, note "seemed tired") on a day with no check-in, when 0061 runs, then that day has a check-in with no Vibe, Appetite "Ate a little less", Vomiting "Once", every other counted category "Normal", symptom count 2, and an Other answer containing "seemed tired".
8. **AC8:** Given an old log on a day that already has a check-in, when 0061 runs, then the check-in's answers are unchanged and the old note, pain and medication answers are added to its Other answer.
9. **AC9:** Given 0061 has run, then `symptom_logs`, `wellness_scores` and `food_logs` no longer exist, and `/pet/<id>/symptoms` opens the pet's profile.
10. **AC10:** Given the 0081 frontend marker is not set on a project, when 0061 is pushed there, then it stops with a clear message and changes nothing.
11. **AC11:** Given a sitter during an open sit, then they can read that pet's weights and can't add, change or delete them. Given a stranger, then they can't read them. Given a co-owner, then they can do everything the owner can.
12. **AC12:** Given each seeder scenario, when run on a test account, then it finishes without errors and Healthy Dog's Buddy shows 65.0 lbs.
13. **AC13:** Given the code, then "Base44" appears nowhere in `src/`, `supabase/functions/`, `e2e/` or `scripts/`, and the test enforcing this passes.
14. **AC14:** Given a CSV with three visits (one row per visit), when imported, then the review shows three visits with the right dates and values. On confirm, three records exist and the file appears in the pet's documents.
15. **AC15:** Given an .xlsx with one row per test and visits across the columns, when imported, then the review shows one card per visit column.
16. **AC16:** Given a visit dated the same as an existing record, then it starts unticked and marked "Already on file," and saving without ticking it adds nothing for that date.
17. **AC17:** Given a value in a different unit (creatinine in µmol/L), then it isn't in the visit's values and is listed under "Not imported."
18. **AC18:** Given Cancel or closing the review, then no records are saved and the uploaded file is deleted.
19. **AC19:** Given an .xls file, text over 60,000 characters, or a sheet with no bloodwork, then the matching wording G shows and (for the first two) no AI call is made.
20. **AC20:** Given a request to the scan task with a spreadsheet path, then the server refuses it.
21. **AC21:** Given a PDF with 2 visits whose creatinine is in µmol/L (like the IDEXX sample), when scanned, then the review shows 2 visit cards and creatinine is under "Not imported (different unit)" for both, never in the value field.
22. **AC22:** Given a filled-in copy of Lynn's template layout (made-up values, two sheets, three visit columns, a WEIGHT row in lbs), when imported, then the review shows exactly three visits (not six), no reference-range number appears as a value, each card has a ticked weight line, and confirming saves three bloodwork records and three weight entries.
23. **AC23:** Given the same template where one sheet's visit has a different creatinine for the same date, then both versions show, unticked, marked "Found twice with different values."

## Test Plan

- AC1, AC3, AC4 → **Playwright** `weight-log.spec.js`: log, edit, delete and validate on test1@'s pet. Each test creates its own entry dated a unique past day and deletes it at the end, so order doesn't matter and leftover data can't build up (the vaccination-leftovers problem in CLAUDE.md).
- AC2 → **Playwright**: complete a catch-up-style Off Day for a unique past date with a weight, then check the sheet list and Trends. The test cleans up its own check-in.
- AC5 → **Playwright** in the existing onboarding spec (add a starting weight, check Pet Profile).
- AC6, AC7, AC8 → **Deno integration test** `weight_home.test.ts` on dev. The data-move logic lives in a database function, `migrate_symptom_log_row`, that 0061 calls for each old row. The test calls it on scratch rows in a scratch user's scratch pet (one set of users per file, per CLAUDE.md's sign-in limit), then deletes them. The function is server-only (0059 rule) and is dropped at the end of 0061's own run on each project, so the test runs it in a test-only schema copy loaded from the migration file. The exact mechanics are settled in planning; the rule is that the same SQL the migration runs is what's tested.
- AC9 → **manual** check on each project after the push (`select to_regclass(...)` for the 3 tables) + **Playwright** for the redirect.
- AC10 → **manual** on dev: push before setting the marker and see it stop (same check spec 0071 did).
- AC11 → **Deno integration test** in `weight_home.test.ts`: sitter, stranger and co-owner clients against standalone weight rows (pattern from `sitter_access.test.ts`).
- AC12 → **manual** on dev with test1@ (each scenario once). The seeder wipes the account's sample data, so it isn't run in CI, where it would wipe the shared e2e fixtures.
- AC13 → **Vitest** `noBase44.test.js` (same style as `toneColors.test.js`).
- AC14–AC19 → **Playwright** `bloodwork-spreadsheet.spec.js` with fixture files in `e2e/fixtures/`. The AI response is stubbed with `page.route` (same as the scan tests), so CI has no AI cost. AC19's "no AI call" is checked by asserting the stub was never hit. **Manual** on dev with real AI, once for each layout (rows and columns), using a real anonymized sheet from Lynn if she has one.
- AC20 → **Deno integration test** (refused before the AI is called, so no cost).
- AC21 → **Playwright** with a stubbed AI response shaped like the IDEXX sample (2 visits, one skipped SI value), plus a **Deno unit test** on the server's scan response check (a value whose stated unit isn't the field's unit is moved to `skipped`, even if the AI put it in values). **Manual** on dev with real AI using Lynn's `IDEXX Example.pdf` (kept on her machine; it's IDEXX's document, not committed).
- AC22, AC23 → **Vitest** on the browser-side reader (sheet text built correctly from a synthetic .xlsx in Lynn's layout: both sheets read, Range/Measure kept as labels) + **Deno unit test** on the server's merge of identical visits across sheets + **Playwright** for the review with a stubbed AI. The fixture is a made-up copy of her layout committed under `e2e/fixtures/`, never her own file. **Manual** with real AI on a filled-in copy.
- `ask-wysker-guardrails.spec.js` opens Ask Wysker from the Symptoms page today; it moves to the Trends page (the screen context changes from "Weight" to "Trends"). 0080 also edits this file, so this change lands after 0080 merges.
- **Seeding/access constraints:** AC6–AC8 and AC11 need scratch users and server-only calls, which the Deno suite already does. Everything else is reachable from test1@'s normal session.

## Visual Reference

No screenshots provided. The Log weight sheet uses the existing `BottomSheet`, with `ListRow` rows for entries and `ConfirmDeleteDialog` for delete. The spreadsheet review reuses `ScanReviewSheet`'s layout (spec 0061: grouped cards, include tick, editable fields) rather than a new design. Not shown anywhere yet: how "Not imported (different unit)" looks inside a card. The draft uses one muted caption line under the values.

## Technical Spec

- **Migration `0061_weight_home_and_base44_tables.sql`** (one transaction):
  1. **Gate:** stops unless `private.deploy_markers` has `spec_0081_frontend_live` (0055's pattern, with the marker snippet in the header). This means the new app is live before the old table goes away.
  2. **Schema:** `observations.observed_on date` (nullable), plus `check (daily_check_in_id is not null or observed_on is not null)` so a standalone weight always has a date. Index `(pet_id, observation_type_id, observed_on)`. Before adding the check, the build confirms no existing observation has a null check-in (count is part of FR11).
  3. **Move:** a temporary server-only function `migrate_symptom_log_row(symptom_logs)` implements FR8–FR10: weight in lbs, `round(weight_grams / 453.59237, 1)`; check-in creation with `status null`, `source 'app'`, the observation rows and `symptom_count`; Other-note appending. It reuses the option codes in `src/lib/checkin/config.js`. The migration loops over every row, raises a summary `notice` with counts, then drops the function.
  4. **Drop:** `symptom_logs`, `wellness_scores`, `food_logs`. 0058's account-deletion loop already skips missing tables (`to_regclass`), so it needs no change. 0058's `prepare_account_deletion()` is checked during planning for any direct reference.
  5. **Undo plan:** restore the three tables from the nightly R2 dump (`requirements-database-backups.md`). There's no code undo for deleted data, so the FR11 counts are the gate. **Order on each project:** frontend promoted → marker set → functions deployed → `db push`.
  6. Restore drill (`scripts/restore-test.sh`): it replays migrations on an empty scratch database, where the gate would block 0061 the way 0055's would. Planning checks how the drill passes 0055 today and does the same for 0061 (likely: insert both markers before replay).
- **Weight code:** new `src/lib/weightClient.js` owns `listWeights`, `addWeight`, `updateWeight`, `deleteWeight`, `getWeightSummary`, `getWeightSummariesForPets` (batched, one query) and `getWeightTrend`. They read observations of type `weight` with `numeric_value` set, dated by `coalesce(daily_check_ins.check_in_date, observed_on)`. The old functions in `petProfileClient.js`/`trendsClient.js` are removed, along with `summarizeWeightLogs`' retired `score`/`statusLabel` (Stable/Monitor). Nothing reads them today. New `WeightLogSheet.jsx`. Writes go through `entities.Observation` (`observations` RLS is already `is_pet_owner()` for write and owner-or-open-sitter for read, migrations 0014/0045). That's why sitters gain read access with no new rule (Before You Approve item 4). Readers that group observations by check-in (`getObservationValuesForCheckIns`, 0080's Vet Report and context code) must ignore rows with a null check-in. The build greps every `observations` reader to confirm this.
- **Check-in edit safety:** `save_daily_check_ins` (0034) deletes and re-inserts a check-in's observations. A standalone weight has no check-in, so it's never touched. A check-in weight edited from the sheet keeps its new value when the check-in is re-saved, because the edit form loads current values. The build confirms the form preloads the weight.
- **Bloodwork:** `read-excel-file` (or an equivalent with no open advisories, pinned exactly), loaded only on import with `import()`. CSV is parsed in the browser (simple parser, quoted fields handled). New `checkUploadFile` purpose `'spreadsheet'`: .csv/.xlsx by extension or type, accepting `text/csv`, `application/vnd.ms-excel` and an empty type for `.csv`, and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. The bucket's `allowed_mime_types` (set in 0054) gains `text/csv`, `application/vnd.ms-excel` and the xlsx type in 0061, and the upload sets `contentType` from the extension when the browser gives none. `ask-vet-assistant` gets task `bloodwork_spreadsheet` with body `{ task, pet_id, sheet_text }` (≤60,000 chars, refused over). The server prompt lists the 16 fields with units and asks for `{ visits: [...], skipped: [{ field, unit }] }`. Its JSON shape and the field list reuse 0080's bloodwork parity list. The scan file reader refuses non-image, non-PDF types (FR34). `pet_documents.kind` stays `'bloodwork'`.
- **Base44 cleanup:** as FR15–FR26. `AuthContext` keeps `authError` (`ProtectedRoute` still uses its `'unknown'` case), minus the `user_not_registered` branches. Each package removal is checked with `npm run build`, `npm run typecheck`, the Vitest suite, and a grep of `src/`, `supabase/functions/` and config files.
- **API / edge functions:** `ask-vet-assistant` (new task, FR34 refusal; context weight source), `generate-vet-report` (weight source; food-log section removed). Deployed to all 3 projects, then `scripts/check-functions-start.sh` (§11).
- **Design System compliance:** checked against `0005` and Amendments 1–12. The new sheet and review use `BottomSheet`, `ListRow`, `ConfirmDeleteDialog`, `IconButton` and `PillToggle`/existing include toggles (Amendment 8). Colors come from `toneColors.js` (Amendment 6), text is 13px or larger (Amendment 7), touch targets are 44px or larger. The weight input copies the check-in's existing weight field styling, which uses tokens. The Save button uses the shared `Button`. Its primary style is a known app-wide gap (Amendment 1: doc wins, code is wrong), not fixed here per call site. `PageNotFound` gets the same treatment when it moves. The retired `PetSymptoms.jsx` has no compliance work since it's deleted. `design-system-check` runs on every changed `.jsx`.
- **Constraints from CLAUDE.md / locked decisions:** Vibe and symptom count stay separate, and weight is excluded from both (spec 0012). No Vibe is ever inferred for moved days (0027 rule). Owned-pets-only lists (0076/0079) are unchanged. Upload limits and pending-scan handling follow spec 0071. `reportClientError` is used, never `console.error`, and onboarding's `console.warn` on a failed weight save becomes `reportClientError`. New database functions are locked by default (0059). Backend is pushed to all 3 projects.

## Overlap with spec 0080

0080 (approved, in progress) changes `ask-vet-assistant`, `src/api/aiClient.js`, `BloodworkSection.jsx`'s scan, `AskWyskerSheet.jsx`, `generate-vet-report` and `e2e/ask-wysker-guardrails.spec.js`. It also adds its own server `context.ts`, which reads weight from `symptom_logs`. 0081 edits none of these files until 0080 is merged, then changes:
- `context.ts` and `generate-vet-report`: weight source switches to observations, and the Vet Report's food-log section is removed.
- `prompts.ts`: adds the 9th task (`bloodwork_spreadsheet`).
- `AskWyskerSheet.jsx`: `-created_date` → `-created_at` (0080 removes its `SymptomLog` fetch).
- `ask-wysker-guardrails.spec.js`: the Symptoms-page opener moves to Trends.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** the daily check-in already had a weight field (since spec 0012) saving to the new home, but nothing read it. This spec reuses it rather than adding a second weight store. A seeded `weight` observation type has existed since migration 0014, unused for reads. Sitters can read check-in data (migration 0045) but not the old table, which is why sitter visibility changes.
- **Technical debt nearby:**
  - `summarizeWeightLogs` still computes the retired Stable/Monitor label and a 0–100 weight score that no screen uses. Removed here.
  - `0007 Data Model_V2.md` §7 says weight is written by a `WeightQuickLogSheet` that no longer exists. `doc-updater` corrects it.
  - Onboarding swallows a failed weight save with `console.warn` and no Sentry report. Fixed here.
  - `PageNotFound.jsx` sits in `src/lib/` instead of `src/pages/`. Moved here.
  - The CLAUDE.md "~150 call sites" estimate is about 136 today.
- **Orphaned features nearby:** `wellness_scores` (nothing writes it), `food_logs` (only the seeder writes it, only the Vet Report reads it), `createPageUrl`, `UserNotRegisteredError`, the `isLoadingPublicSettings` flag, React Query (one user), and about 13 starter-template libraries. All removed here. Not removed, because they aren't Base44-specific: `pet_baselines` (schema-only, built in 0014 for the current model) and `observation_options.severity_score` (vestigial since 0026). Listed as possible follow-ups, not part of this spec.
- **Punch list / known issues in this area:** PA-71, PA-50 and PA-51 are covered here. PA-50's file list is stale (Before You Approve item 10). PA-69 (Ask Wysker's pet-page path has no error handling) touches `AskWyskerSheet.jsx` but is a separate item. The restore drill's handling of deploy-marker gates (Technical Spec 0061 step 6) is worth a look, as it may already be failing since 0055.

## Non-Goals

- Metric units (kg). The app is lbs-only today.
- A weight baseline or "ideal weight" (`pet_baselines` stays unused).
- Showing weight on a sitter screen. Sitters can now read it, but no screen for them shows it.
- Replacing the data helper (`entities`) with direct database calls (Lynn's decision 6).
- Replacing the shadcn/ui component kit. It came with the starter template but is a standard library, not Base44-specific.
- Exporting bloodwork to a spreadsheet, or importing anything other than bloodwork from one.
- Fixing the app-wide primary-button style (Design System Amendment 1).

## Open Questions

1. ~~Test file~~ Lynn shared IDEXX's public sample report (`IDEXX Example.pdf`, kept on her machine, not committed: IDEXX's document). It's a PDF, not a spreadsheet. It's used for the manual scan check. A spreadsheet test file is still welcome.
2. If the FR11 counts show production has old symptom logs written by alpha users through the old page (beyond the Base44 days), does the FR9 table still apply as-is, or does Lynn want to see examples first? The spec stops and asks either way.
3. **Photo/PDF scans have the same problems as spreadsheets (found with Lynn's IDEXX example, 2026-11-23).** The sample reports values in SI units (creatinine 194.48 µmol/L, BUN and glucose in mmol/L, protein in g/L), and today's scan has no unit check, so it would save 194.48 as mg/dL, about 90 times too high. It also shows 2 visits side by side, and today's scan fills in only one. It includes 5 tests the app doesn't track (chloride, globulin, GGT, bilirubin, cholesterol), which are skipped either way. Recommended: photo, PDF and spreadsheet imports share the one review in FR29–FR31 (per-visit cards, other units listed as not imported, duplicates unticked), changing the bloodwork scan prompt after 0080 merges. **Answered (Lynn, 2026-11-23): yes, same review for all** (FR35). Her spreadsheet template (`Idexx Template US.xlsx`) also shaped FR36–FR37.
