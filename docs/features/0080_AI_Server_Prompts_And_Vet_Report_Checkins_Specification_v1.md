# 0080_AI_Server_Prompts_And_Vet_Report_Checkins_Specification_v1

**Status:** Approved by Lynn 2026-11-23. Wording A and B approved. Switchover: option (a), deploy and promote back to back. Anthropic monthly spend limit set. Her one change (Before You Approve item 5, Base44 wording) is made. Base44 cleanup (PA-71, PA-50, PA-51) is the next bundle (spec 0081), not part of this one. Lynn OK'd the three T3-review clarifications (the `range` input, pet details allowed in the AI's fixed instructions, curly-apostrophe matching) on 2026-11-23.
**Date:** 2026-11-23
**Branch:** `claude/ai-vet-report`
**Migration:** `0060` (reserved): fixes the shared rate limiter and adds a version that checks two time windows at once.
**Punch list:** PA-11, PA-12, PA-52, PA-65 (Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`). Also fixes a rate-limiter bug found during this investigation (no PA number yet; `doc-updater` adds one). Related, out of scope: PA-71 (weight's own home, added 2026-11-23) and Launch Plan Task 125 (watch AI usage after launch, added 2026-11-23).
**Process:** `/ship-feature` (`docs/foundation/0011 SDLC Governance.md`). Expected type: **PROTECTED.** It includes a migration and changes `ask-vet-assistant`, which uses the service role, so Lynn's OK is needed before merge even after review passes.
**Decisions already made (Lynn, 2026-11-23):**
- The server looks up pet data itself. The app sends only which task it wants, the pet's ID, and the owner's own words.
- Pet Insights reads daily check-ins, not the old symptom logs.
- The daily AI cap is **100 requests per person**, with monitoring (Sentry warning now; Launch Plan Task 125 after launch).
- In the Vet Report, each Health or Wellbeing attribute that had at least one symptom logged in the last 30 days gets its own 30-day bar chart, like the Trends tab. An attribute that stayed Normal all month gets no chart. (Lynn's example: Tribble's Appetite appears; her Water doesn't.)

**Related files:**
- AI: `supabase/functions/ask-vet-assistant/index.ts` (+ new `prompts.ts`, `context.ts` beside it), `src/api/aiClient.js`, `src/lib/aiGuardrails.js`, `src/components/{PetAIChat,GeneralAskWyskerChat,PetAIInsights,AskWyskerSheet,VaccinationSection,BloodworkSection}.jsx`, `src/components/onboarding/{VaccinationEntryCard,MedicationEntryCard}.jsx`, `src/lib/checkin/trendsClient.js`, `src/lib/baselineContext.js`
- Rate limits: new `supabase/migrations/0060_rate_limit_windows.sql`; `supabase/functions/{sign-up,beta-signup,early-adopter-signup}/index.ts` and `_shared/inviteRateLimit.ts` (unchanged callers, but they benefit from the fix)
- Vet Report: `supabase/functions/generate-vet-report/index.ts` (+ new `wellness.ts` beside it)
- Phase 1 cleanup: `supabase/functions/_shared/petPhoto.ts`, `supabase/tests/private_uploads.test.ts`
- Type check: `.github/workflows/ci.yml`, `supabase/functions/sign-up/index.ts`
- Tests: `supabase/tests/` (new and changed), `e2e/ask-wysker-guardrails.spec.js`, `e2e/pet-sitter.spec.js`, `e2e/vet-report.spec.js`, `docs/testing/QA_Test_Plan.md` §5.6 and the Vet Report rows

## Lynn — what I need from you

1. ~~Final approval~~ Done 2026-11-23.
2. **Later, before merge:** OK the PROTECTED merge after review passes (0011 rule).
3. **Later, at rollout:** promote the frontend build in Cloudflare right after I deploy the server function (branch `main`, commit message starting "Spec 0080"). I'll tell you the moment.

## Before You Approve This

1. **AI features will briefly break during the switch unless we roll out in two steps.** Today the app sends the AI instructions and the server passes them on. After this spec the server refuses requests built that way. The new server and the new app have to go live at about the same moment. Between my function deploy and your Cloudflare promotion, Ask Wysker, Insights, the Trends summary and scans show "Something went wrong" (a few minutes, if we do them back to back). Someone with the app already open needs to reload it once afterwards. The alternative is a two-step rollout like spec 0071's, but that leaves the open AI proxy working until step two. I recommend the short planned outage. See Open Question 1.
2. **This is a bigger change than PA-11 first looked.** You chose the version where the server gathers pet details itself, so I'll rebuild on the server how the 8 AI features describe a pet: profile, active medications, baseline, recent check-ins, weight. Today that's done in the app. The app's screens and the answers' format don't change. What changes is who writes the instructions and who looks up the data.
3. **Some rules will exist in two places, on purpose.** The emergency-word list, the "which answers count as normal" lists, and the bloodwork field list are needed both in the app (for instant feedback) and on the server (where they're now enforced). Server functions can't read the app's files, so each list gets a second copy, and a new automatic test fails if the two copies ever differ. That's small new upkeep, and the test stops it drifting.
4. **A rate-limiter bug affecting sign-up and invites gets fixed as part of this.** It wasn't on the punch list. Each AI request was wiping the shared counter's history older than 10 minutes, for every feature at once. So while anyone was using Ask Wysker, the "10 invite emails an hour" and "20 sign-ups an hour" limits acted like "per 10 minutes". It has to be fixed here, because otherwise the new daily cap would reset every 10 minutes.
5. **Pet Insights' answers will read differently.** They'll be based on daily check-ins (Vibe and logged symptoms, kept separate) instead of the old `symptom_logs` table. No history is lost: the only Base44 records ever imported (11 days for Tribble and Auggie, May–June 2026) were already moved into daily check-ins by migration `0027`. After this spec, no AI feature and no part of the Vet Report reads Base44-era tables or logic, except weight (still stored only in `symptom_logs`, PA-71). Lynn, 2026-11-23: "We should have no Base44-era anything." Retiring what's left (PA-71, PA-50) is tracked separately; see Non-Goals.
6. **Sitters keep today's Ask Wysker access.** A sitter who opens Ask Wysker from a pet they're sitting can still ask about that pet during the sit, as today; the server allows anyone the database lets see the pet. The general "my pets" chat only includes pets the person owns or co-owns (spec 0079's rule, now enforced on the server too). Say so if you'd rather sitters couldn't use pet chat at all.
7. **The Vet Report's other sections are unchanged.** The 180-day "Daily Observations" table stays as it is, even though it now overlaps a bit with the new charts. Weight still comes from the old symptom logs (PA-71).
8. **There are 19 type errors today, not 22.** Spec 0078 fixed some since PA-65 was written. Locally, the type check only works with the app's `node_modules` folder turned off, so the CI step does the same. The check also uses whatever Deno version CI installs, which may differ from Supabase's (the 0075 Sentry crash was a version gap like this). This check catches typing mistakes only; the hourly "do all functions start" check stays the real safety net.

Self-review found no conflicts with locked rules: Vibe and symptom counts stay separate everywhere, including the charts, which count symptoms only and never look at the day's Vibe. It found no duplicate of an existing feature. The duplicated rule lists in item 3 are the one piece of new upkeep.

## Wording for your approval

**A. Daily limit reached** (shown where AI errors already appear: the chat bubble or a toast after a scan):
> You've reached today's limit for Ask Wysker and document scans. You can try again tomorrow.

The existing 10-minute message stays: "You've reached the limit for AI requests. Please wait a few minutes and try again."

**B. Vet Report, Wellness Overview** (example values are Tribble-style):
> **Wellness Overview** — last 30 days (Oct 25 – Nov 23, 2026)
>
> **How the days went** (the owner's own daily rating): Great Day 21 · Off Day 6 · Tough Day 2 · Skipped 1 · No check-in 0
>
> **Symptoms logged** (counted separately from the daily rating):
>
> *Appetite* — Ate a little less (18 days)
> [30-day bar chart: grey = Normal, yellow = 1 symptom, red = 2+ symptoms, blank = skipped or no check-in]

Empty states:
> No symptoms were logged in the last 30 days.

> No daily check-ins were recorded in the last 30 days.

A day with no rating at all counts under a separate "Not recorded" total, shown only when there are any. In practice this never appears: the only unrated days are the 11 imported in migration `0027` (May–June 2026), always outside the 30-day window. The code still handles it so an unrated day can never break the report.

## Functional Requirements

**AI requests (PA-11, PA-52)**

1. The app no longer sends AI instructions. It says which of 8 known tasks it wants:
   - pet chat
   - household chat
   - pet insights
   - Trends summary
   - vaccine document scan (multi-pet)
   - single vaccine record scan (onboarding)
   - medication label scan
   - bloodwork report scan

   With the task it sends only the pet's ID, the file it uploaded, which screen the owner came from, and for chats the owner's own question and the conversation so far.
2. The server writes the instructions for each task, including the safety rules (no diagnosing or prescribing; always recommend a real vet; flag real emergencies). It looks up the pet's details itself, and only what the person's account is allowed to see.
3. Any request that isn't one of the 8 tasks, or that sends its own instructions, is refused.
4. Owner-typed text has length limits: a question up to 2,000 characters, and conversation history up to the last 20 messages.
5. The emergency hard stop is also enforced on the server. If the owner's question contains an emergency phrase, the server returns the emergency answer without calling the AI. If the AI itself flags an answer as urgent, the server drops the AI's text and returns only the urgent flag, so the fixed "contact your vet" message is all that can be shown. The app keeps its own instant check as well.
6. Household chat only includes pets the person owns or co-owns (spec 0079's rule, now enforced on the server).
7. Vaccine document scans match lines to the person's own pets, looked up on the server (spec 0076's rule).
8. Pet Insights uses the last 30 days of daily check-ins: each day's Vibe and the symptoms logged, presented as two separate things. It also uses active medications, the baseline, and weight. It needs at least 2 non-skipped check-ins, as the Trends summary already does.
9. Each person can make at most **100 AI requests in any 24 hours**, across all 8 tasks, on top of the existing 20 per 10 minutes. Over the limit, they see wording A and the AI is never called.
10. Every time someone hits the daily limit, a warning goes to Sentry, so Lynn can see whether 100 is too low.
11. AI failures (the AI service erroring, or returning an unreadable answer) are reported to Sentry. Today they're only written to a log.
12. The temporary file-link workaround from spec 0071 is removed. Only file paths are accepted. The old-photo-link fallback used when deleting a pet is removed too.

**Rate limiter (new finding)**

13. A rate-limit check for one feature never erases another feature's history. Each limit counts over its own full window: 10 minutes, 1 hour or 24 hours.

**Vet Report (PA-12)**

14. The Wellness Overview no longer shows the retired Health Score, and the report no longer reads it.
15. The overview covers the last 30 days, ending today in the owner's time zone. It shows how many days were Great, Off, Tough, Skipped, had no check-in, and (only if any) were "Not recorded".
16. For each of the 11 Health and Wellbeing attributes that had at least one symptom logged in those 30 days, the report shows a 30-day bar chart, colored the way the Trends tab colors it, plus a line listing which symptoms were logged and on how many days. Attributes with no symptoms in the window get no chart. "Not observed" answers (Water and Bathroom) aren't symptoms.
17. The charts count symptoms only. A day's Vibe never decides whether an attribute appears or how a bar is colored.

**Type checking (PA-65)**

18. All Edge Function code passes the type checker, and CI runs the check so new errors can't be merged.

## Acceptance Criteria

1. **AC1:** Given a signed-in user, when they send `ask-vet-assistant` a request with a `prompt` field or an unknown task, then it is refused with 400 and the AI is not called.
2. **AC2:** Given a pet the caller can't see, when they ask for pet chat, insights or a Trends summary for it, then it is refused with 403 and nothing about the pet is returned.
3. **AC3:** Given a sitter for one pet who owns none, when the server builds household chat context for them, then the sat pet is not in it. Given a co-owner, their co-owned pet is in it.
4. **AC4:** Given a question containing an emergency phrase (e.g. "she's having a seizure"), when it reaches the server, then the reply is the urgent flag with no AI text, and the AI is not called.
5. **AC5:** Given an AI answer flagged urgent, then the server's response contains no AI-written text.
6. **AC6:** Given a person who has made 100 AI requests in the last 24 hours, when they make another, then they get 429 with code `daily_limit` and wording A, the AI isn't called, and a warning reaches Sentry.
7. **AC7:** Given a 1-hour limit with recent history for one key, when a 10-minute check runs for a different key, then the 1-hour key's history is untouched.
8. **AC8:** Given a request using the old `file_url`, then it is refused with 400 `invalid_file`.
9. **AC9:** Given each of the 8 tasks, when the app uses that feature (chat, insights, Trends summary, each scan), then it works as before: same screens, same answer shapes.
10. **AC10:** Given a pet with check-ins in the last 30 days, when its Vet Report is generated, then the overview shows the Vibe totals and one chart per attribute that had a symptom, and no chart for attributes that stayed normal. No "Health Score" text appears anywhere in the report.
11. **AC11:** Given the same symptom data on days rated Great and on days rated Off, then the attribute's chart and day count are the same either way.
12. **AC12:** Given CI on a branch with an Edge Function type error, then the edge-functions check fails.

## Test Plan

- AC1, AC2, AC8 → **Deno integration tests** in `supabase/tests/` (new `ai_tasks.test.ts`; the `private_uploads.test.ts` compat case changes from 403 to 400). Each check is refused before the AI is called, so no Anthropic cost. Per 0011, this covers a stranger, a logged-out caller, and a sitter (refused for documents).
- AC3 → **Deno integration test** that imports `context.ts`'s household-pets loader and runs it with a scratch sitter's and a scratch co-owner's signed-in client (one set of users per file, per CLAUDE.md's sign-in limit). Replaces the prompt-reading part of `pet-sitter.spec.js` AC3, since the app no longer sends a pet list. That e2e check changes to "the general chat request carries no pet details".
- AC4, AC5 → **Deno unit tests** on `prompts.ts` (pure functions, no network): keyword stop and urgent-answer stripping. AC4 also gets an integration check that an emergency question returns the urgent flag and no AI text. Proving "the AI was never called" from outside the server is settled in planning (Open Question 3); the unit test proves it directly.
- AC6 → **Deno integration test** of the new two-window rate-limit function with tiny limits on a test-only key. Calling the AI 100 times isn't needed. The 429 wording → **Playwright** (`ask-wysker-guardrails.spec.js`, same `page.route` pattern spec 0050 uses for the 10-minute limit). The Sentry warning → manual check on dev (Sentry isn't visible to tests).
- AC7 → **Deno integration test** against the existing and new rate-limit functions (service role, test-only keys).
- AC9 → **Playwright**: the existing Ask Wysker, scan and Trends tests still pass with the request shape updated (they stub the AI response, so no cost). `ask-wysker-guardrails.spec.js`'s screen-context test changes from reading the prompt to reading the request's `screen` field. **Manual** on dev, once per task, with real AI answers: one chat, one household chat, Insights, Trends summary, and one of each scan.
- AC10, AC11 → **Deno unit tests** on `wellness.ts` (pure: check-ins + observations in, overview data out), including the "same data, different Vibe" case. `vet-report.spec.js` still proves a real PDF downloads. **Manual:** download Tribble's report on prod after release and check Appetite is charted and Water isn't.
- AC12 → proven once by the PR's own CI run (the step must be green on the fixed code). A deliberate failing commit isn't needed.
- Parity tests (Before You Approve item 3) → **Vitest**: app and server copies of the emergency phrases, the normal/not-observed answer lists, and the bloodwork fields must match.
- **Seeding/access constraints:** the AC3 and AC7 integration tests need scratch users and service-role calls, which the Deno suite already does (`co_owner_access.test.ts` pattern). The Vet Report data shaping is tested as a pure function, so no seeded check-ins are needed in CI.

## Visual Reference

- Lynn's screenshots of Tribble's Trends tab, 2026-11-23: an **Appetite** card with yellow "1 Symptom" bars across most of 30 days → appears in the Vet Report (FR16). A **Water** card with all grey "Normal" bars → does not appear. The report's bar colors and legend follow these cards: grey Normal, amber 1 Symptom, red 2+ Symptoms.
- Not shown in the screenshots: how a skipped or no-check-in day looks in the PDF. The draft uses a blank slot (no bar). Trends has its own treatment, but a printed page has no hover or tooltip, so blank plus the legend is clearer.

## Technical Spec

- **Schema / migration `0060_rate_limit_windows.sql`:**
  - `check_and_record_rate_limit` and `check_and_record_rate_limits` keep their signatures. Their cleanup changes from "delete every row older than this call's window" to "delete rows older than 2 days" (longer than any window in use).
  - New `check_and_record_rate_limits_windowed(p_keys text[], p_limits integer[], p_windows integer[])`. It works all-or-nothing like the existing multi-key function, but each key has its own window. `security definer`, `set search_path = public`, execute revoked from `public, anon, authenticated` and granted to `service_role` only (0059's locked-by-default rule). Added to `function_permissions.test.ts`'s server-only list.
  - **Undo plan:** a follow-up migration that restores 0039's two function bodies and drops the new function. **Order:** migration before the function deploy, on each project. The old callers are unaffected either way.
- **`ask-vet-assistant`:**
  - Body becomes `{ task, pet_id?, file_path?, screen?, range?, question?, history? }`. `range` is the Trends time range showing (24H/7D/30D/90D/1Y), used only by the Trends summary. `prompt`, `response_json_schema` and `file_url` are refused. Chat history: the server keeps the last 20 well-formed messages and drops any without text (e.g. the app's emergency and error bubbles), so long chats keep working.
  - `prompts.ts` holds the 8 prompt builders and their JSON response shapes, the disclaimer and urgent-flag sentences (moved from `src/lib/aiGuardrails.js`), and the emergency phrase list.
  - Instructions go in Anthropic's `system` field. The owner's words (their question and chat history) go only in the user message. Pet details (name, breed, conditions, medications, baseline) may appear in the fixed instruction sentences, as they do today. Scans and the Trends summary keep today's wording word for word (no added disclaimer); chats and Insights carry the disclaimer and urgent-flag sentences. Planning clarifications, 2026-11-23 (T3 review).
  - The emergency phrase check treats curly apostrophes (’) like straight ones, in both the app and server copies, so "can’t breathe" typed on an iPhone is caught (found in T3 review; pre-existing gap, fixed here because FR5 makes this check server-enforced).
  - `context.ts` loads data with the **caller's** client, so the database's access rules decide what's visible:
    - the pet
    - active medications
    - `pet_onboarding` baseline (port of `formatBaselineForAI`)
    - the last 30 `daily_check_ins` plus their `observations`, with labels from `observation_types`
    - weight from `symptom_logs`
    - owned and co-owned pets for household chat and the multi-pet scan, matching `listOwnedPets()`

    The service role is still used only for the rate-limit call and the file download (as today).
  - The rate check becomes one windowed call: keys `ask-vet-assistant:user:<id>` (20 per 600s) and `ask-vet-assistant:daily:user:<id>` (100 per 86,400s). On rejection, the code tells which limit was hit: `rate_limited` or `daily_limit`. Daily hits go to `reportError(..., { level: 'warning', feature: 'ai_daily_cap' })`.
  - Anthropic errors and unreadable JSON go through `reportError`.
  - The Phase 1 `file_url` branch is deleted.
- **App:**
  - `invokeAI({ task, ...inputs })`.
  - Each of the 8 call sites drops its prompt text and sends ids and inputs. Response handling is unchanged.
  - `AskWyskerSheet` stops fetching symptom logs for Insights.
  - `aiGuardrails.js` keeps the emergency phrases (for the instant check), `emergencyRedirectText`, the banner text and `aiErrorText`. `aiErrorText` keeps showing the server's 429 message, so wording A needs no app copy.
- **`generate-vet-report`:**
  - Drop the `wellness_scores` query and the header comment about it. Add queries for 30 days of `daily_check_ins`, their `observations` and `observation_types`, and `profiles.timezone`.
  - New pure `wellness.ts`: totals plus per-attribute day series, using the same counting rules as `getObservationTrend`.
  - New `ReportBuilder.barChart()`. Colors match `PALETTE.gray/amber/red` from `src/lib/toneColors.js`, written as PDF RGB values.
  - Fix the null-check type errors in the same file.
- **`_shared/petPhoto.ts`:** remove the `photo_url` fallback. Redeploy `ask-vet-assistant`, `delete-pet` and `reset-sandbox-account` to all 3 projects.
- **CI:** add `deno check --node-modules-dir=none supabase/functions/*/index.ts` to the edge-functions job. Fix the 19 current errors in `ask-vet-assistant`, `generate-vet-report` and `sign-up`.
- **Deploy (all 3 projects):**
  1. Migration 0060
  2. Functions
  3. `scripts/check-functions-start.sh`
  4. 0006 §11 permission check
  5. Frontend promotion (see Open Question 1)
- **Design System compliance:** the only app UI change is wording A, shown in the existing `AIErrorNotice`/toast, so no new components or styles. The PDF isn't covered by the Design System; its chart colors reuse the app's palette values so they match the Trends cards. No conflicts found.
- **Constraints from CLAUDE.md / locked decisions:**
  - Spec 0012: Vibe and symptom count are never combined, and the charts never depend on Vibe (FR17, AC11).
  - Spec 0041: the emergency stop gets stricter, not looser.
  - Spec 0050: rate limits reuse the existing mechanism.
  - Spec 0078: `reportError`/`serverError`, exact versions.
  - Spec 0059: new function locked by default.
  - Spec 0076/0079: owned-pets rule.

  All respected.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:**
  - Today, 8 places in the app each write their own AI instructions. This spec makes one server-side source.
  - The Trends tab's counting logic (`getObservationTrend`) gets a server copy for the Vet Report and Insights, with the same rules. It's covered by the parity tests where the rules are plain lists. The counting code itself is checked by its own unit tests on both sides.
- **Technical debt nearby:**
  - The rate-limiter cleanup bug (fixed here).
  - The 19 type errors (fixed here).
  - The AI model name (`claude-sonnet-4-6`) is fixed in the code. Not changed here.
  - The Vet Report's header comment still describes the retired Health Score (fixed here).
- **Orphaned features nearby:** `entities.WellnessScore` in `src/api/entities.js` is defined but nothing in the app uses it any more. After this spec, nothing on the server reads `wellness_scores` either. The table and the entity entry are left alone (removing a table is a separate decision) and noted for PA-50.
- **Punch list / known issues in this area:**
  - PA-11, PA-12, PA-52 and PA-65 are covered.
  - PA-69 (Ask Wysker gives no message if pets fail to load) is next door but separate.
  - PA-71 (weight) and PA-50 (Base44 leftovers) are related and out of scope.

## Non-Goals

- Giving weight its own home or retiring the old Symptoms page (PA-71).
- Changing the AI model, answer lengths, or how any AI screen looks.
- Changing the Vet Report's other sections, including the 180-day Daily Observations table.
- Removing the `wellness_scores` table or the unused `WellnessScore` entity.
- A usage dashboard for AI (Launch Plan Task 125, post-launch).
- PA-69's missing error message in Ask Wysker.

## Open Questions

1. **Switchover — resolved (Lynn, 2026-11-23): option (a).** Deploy the new function and promote the frontend back to back, accepting a few minutes of AI features showing "Something went wrong" (anyone with the app open reloads once). No two-step compatibility path. Staging auto-promotes on push, so it follows the same pattern.
2. **Sitter pet chat — resolved (Lynn, 2026-11-23): keep today's behavior.** A sitter can ask about a pet they're sitting, during the sit only.
4. **Planning answers (Lynn, 2026-11-23):**
   - **Onboarding scans:** when the daily limit is hit, the new-pet setup scan buttons show wording A instead of "Couldn't read that record…". Manual entry stays available.
   - **Staging:** sync staging to `main` in the same rollout, right after the backend goes on staging.
   - **Vet Report and sitters:** the server would build a Vet Report for a sitter during a sit if asked directly (only the screen stops them). Logged as PA-72, fixed separately, not in this spec.
3. **Proving "the AI wasn't called" in the emergency integration test (technical, no decision needed from Lynn):** the integration tests call the deployed dev function, whose AI key we shouldn't change for a test. So the unit test on `prompts.ts` proves the stop happens before any AI call, and the integration test checks the response is the urgent flag with no AI text. The planner can propose a stronger check if one exists without test-only switches in production code.
