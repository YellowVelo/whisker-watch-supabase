# Wysker Watch — QA Test Plan & Exit Criteria

**Status:** Approved (2026-08-19), one open item — see spec [0058](../features/0058_QA_Test_Plan_And_Exit_Criteria_Specification_v1.md)'s Open Questions #1 (adversarial AI prompt-set content not yet decided)
**Established by:** spec 0058, fulfilling Launch Plan Task 22 ("QA test plan defined per area"), Task 23 ("Regression testing"), Task 25 ("Accessibility pass"), Task 26 ("Performance pass")
**This is a living document.** Every new feature spec must add its test cases here in the same PR that ships the feature — see "Keeping this current" at the bottom. A test plan that lags the app is worse than none, because it lies about coverage.

---

## 1. How to read this document

Each test case is tagged:

- **`[Playwright: file.spec.js]`** — already automated, runs in CI on every PR/push. "Passing" means that file is green in the CI `e2e` job.
- **`[Deno: file.test.ts]`** — automated backend integration test against `wysker-watch-dev`, run in CI's required `edge-functions` job. Used where a case needs several throwaway accounts at once (e.g. owner vs. sitter vs. stranger), which the browser suite can't create.
- **`[Vitest: file.test.js]`** — automated unit test, run in CI's required `frontend` job.
- **`[Manual]`** — no automation exists yet. Must be run by hand by a real tester before the gate that requires it, using the Given/When/Then steps given. A `[Manual]` case is a debt, not a permanent state — see §6.
- **Priority** — `Critical` / `High` / `Medium` / `Low`, matching the priority vocabulary already used in the Launch Plan xlsx. Priority determines which gate a case must be clean for (§2).

A **defect found while running any case** gets logged with the same severity words the Launch Plan gates already use ("Critical bugs open" is a literal gate blocker) — Critical/High/Medium/Low — not a new scale invented here.

---

## 2. Exit Criteria — what "100% pass rate" means at each stage gate

"100% pass" is meaningless without a denominator. The denominator is: **every `Critical` and `High` priority test case in §5, for the area(s) actually touched since the last gate, plus the full Critical/High regression set below.** `Medium`/`Low` cases are run and logged but a `Medium`/`Low` failure does not, by itself, block a gate — it becomes a tracked bug with an explicit accept/fix decision, the same way the Launch Plan already treats non-Critical bugs.

### Alpha Gate (maps to Launch Plan Gate 70 "Regression passed" + Gate 71 "Accessibility passed")

Required, all must be true:

1. **CI is green and required, not advisory.** The `frontend`, `edge-functions`, and `e2e` jobs in `.github/workflows/ci.yml` all pass on the commit being promoted, and `e2e` is a **required** branch-protection check — not `continue-on-error`. (Today it is still advisory, per spec 0055's trial period through 2026-09-03 — flipping this is now part of the Alpha Exit Criteria itself, not a separate decision. See Open Questions in the spec.)
2. **Every `Critical` and `High` case in §5 passes** — automated cases via the CI run above; `[Manual]` cases via a dated, signed-off manual pass (recorded in this doc's revision note, §6) completed no more than 7 days before the gate date.
3. **Accessibility pass clean** (§4) on every `Critical`/`High` page.
4. **Zero open Critical bugs**, matching Launch Plan Gate 69.
5. **Performance:** not required for Alpha — see §7. Task 26 is Medium priority and explicitly non-blocking for the PWA gate in the Launch Plan today; this plan does not change that.

### Beta Gate (App Store track — TestFlight/Android internal testing)

Everything in Alpha, plus:

6. Every `Medium` priority case in §5 has been run at least once and any resulting bugs have an explicit accept/fix decision recorded (no silent gaps).
7. Device/browser compatibility cases (§5.13) pass on a real iOS Safari device and a real Android Chrome device, not just desktop emulation.

### Release / App Store Gate

Everything in Beta, plus:

8. Performance pass is no longer a placeholder — see §7's condition for when it becomes required.
9. Full regression (§3) run one final time within 48 hours of submission.

---

## 3. Regression Testing

**Definition:** two layers, both required, neither optional:

- **Continuous (every PR/push to `main`):** the existing CI pipeline — `lint`, `typecheck`, `test` (Vitest unit tests), `build`, `edge-functions` (Deno integration tests), and `e2e` (Playwright, currently ~48 tests across 19 spec files). This is regression testing in the literal sense — it's what catches a change breaking something that used to work — and it already runs on every PR. Its only gap today is that `e2e` doesn't block a merge if it fails (§2.1 closes that gap as part of the Alpha gate).
- **Full manual smoke pass (before every gate transition):** every `[Manual]` `Critical`/`High` case in §5, run fresh, by a human, on the actual build being promoted — not inferred from "it worked last time." This is what catches the ~60% of the app (see §5's coverage summary) that CI cannot see today.

A regression pass is **not** "run the whole app and see if anything looks wrong." It is running the specific, named cases in §5 — that's the entire reason this document exists (Launch Plan Task 22's own note: *"a pass rate against zero defined tests is not a pass rate"*).

---

## 4. Accessibility Testing

Per Design System §8 (`docs/foundation/0005 Design System.md`): **Accessibility is mandatory** — high-contrast text, large touch targets (44px minimum), clear labels, never color-only indicators. No accessibility tooling exists in this repo today; this section is new infrastructure.

### Automated

- Add `@axe-core/playwright` as a new devDependency.
- New Playwright spec, `e2e/accessibility.spec.js`, runs an axe scan against each `Critical`/`High` page (one test per page, reusing the existing `test1@` saved session per `fixtures.js` convention) and asserts **zero violations of impact `critical` or `serious`**. `moderate`/`minor` violations are logged, not failed on, to avoid the suite being too brittle to trust — tightened later once a baseline is established.
- Runs as part of the existing `e2e` CI job — no new CI job needed.
- **What this catches:** missing alt text, insufficient contrast ratios (computed against real rendered colors, not just "looks fine"), missing form labels, invalid ARIA usage, keyboard-trap issues.
- **What this does not catch:** color-only signaling (axe can't judge *meaning*, only markup), whether a 44px target *feels* right on a real touch device, and screen-reader narrative quality. Those stay manual.

### Manual

A one-page checklist run against every `Critical`/`High` page before the Accessibility gate (§2.3):

- [ ] No status/state is conveyed by color alone (e.g., a Vibe chip or Wellbeing badge must carry a label or icon, not just a hue change).
- [ ] Every interactive element (button, chip, row) is at least 44×44px — spot-check with browser devtools box-model inspector on 3-4 representative screens; this is a runtime check, complementing (not replacing) the `design-system-check` skill's static source-code audit that already runs after every UI edit.
- [ ] Tab-only keyboard navigation can reach and activate every primary action on Home, Daily Check-In, and Settings (extends the pattern already proven in `home-card-keyboard-nav.spec.js`).
- [ ] Screen reader (VoiceOver on iOS Safari, or macOS VoiceOver in browser) can identify every icon-only button by name — the `IconButton` component's `aria-label` usage is spot-checked here, not just its 44px size.

**Note on overlap:** the `design-system-check` skill (run after every `.jsx` edit, per CLAUDE.md) already catches sub-44px targets and raw-color violations *at the code level, at authoring time*. This section is the *runtime* check — catching what only shows up in the rendered, live app (computed contrast against actual theme colors, real focus order, actual screen-reader output) — the two are complementary, not duplicate work.

---

## 5. Test Catalog by Area

*Playwright test file paths are relative to `e2e/`. "~48 tests / 19 files" reflects the suite as of spec 0057 (2026-08-20); update this line whenever a new spec file is added.*

### 5.1 Auth — Critical

| Case | Priority | Coverage |
|---|---|---|
| Sign in with valid email/password lands on a recognizably logged-in page | Critical | `[Playwright: login.spec.js]` |
| Protected route redirects to `/login` when signed out | Critical | `[Playwright: login.spec.js]` |
| Sign in with Google (OAuth) completes and lands logged in | Critical | **Hidden until Google sign-in is set up (spec 0076, PA-20).** Turn back on with `GOOGLE_SIGN_IN_ENABLED` in `src/lib/authProviders.js`, then run this as `[Manual]`: Given a registered Google account, When "Continue with Google" is clicked and consent granted, Then the user lands on Home signed in. (OAuth automation is out of scope for Playwright per spec 0024.) |
| Login and Register show no "Continue with Google" button, Login has no Terms checkbox, and Register's Terms checkbox still gates Sign Up (spec 0076) | High | `[Playwright: login.spec.js]` |
| Wrong password shows a generic, non-enumerating error | High | `[Manual]` |
| Unconfirmed-email login shows inline "Resend confirmation email" with a 60s cooldown | Medium | `[Manual]` |
| Demo account login triggers a full sandbox reset before landing on Home | High | `[Manual]` — Given a demo-type account, When login succeeds, Then a "Setting up your demo…" state appears and resolves to a freshly-seeded scenario. |
| `/register`: password mismatch and <8-char password are blocked client-side before any network call | High | `[Manual]` |
| `/register`: successful signup shows "check your email" state | Critical | `[Manual]` |
| `/forgot-password`: submitting a non-existent email still shows the same success copy (enumeration-safe) | High | `[Manual]` |
| `/forgot-password`: a failed send shows an error (rate-limit or general) and keeps the form, never a false "sent" (spec 0074) | Critical | `[Playwright: public-legal-and-reset.spec.js]` |
| A password-reset link redirects to `/reset-password` (Supabase Redirect URLs list, spec 0074) | Critical | `[Deno: supabase/tests/password_reset_redirect.test.ts]` on dev; run by hand per project |
| A reset-link login that lands on any other page is moved to Set New Password (spec 0074) | High | `[Vitest: passwordRecovery.test.js]` |
| Reset email arrives at a non-team address and its link opens Set New Password (spec 0074) | Critical | `[Manual]` — Given prod (then staging), When a reset is requested for petsitter1@ (an alias to Lynn), Then the branded email arrives and its link opens Set New Password. |
| `/reset-password`: submit stays disabled until the recovery session is confirmed ready | Medium | `[Manual]` |
| `/accept-invite`: valid sitter invite redeems and redirects to `/pet-sitter` | Critical | `[Manual]` |
| `/accept-invite`: valid co-owner invite redeems and redirects to `/pets?highlight={petId}` | Critical | `[Manual]` |
| `/accept-invite`: double-redemption (two tabs / prefetch) does not incorrectly show "Invalid" if a session already exists | High | `[Manual]` |
| `/verify-email`: valid signup confirmation link verifies and redirects to `/` | Critical | `[Manual]` |

### 5.2 Onboarding — Critical

| Case | Priority | Coverage |
|---|---|---|
| New pet creation → full onboarding wizard → Review → Home | Critical | `[Playwright: onboarding.spec.js]` |
| Add Pet with "Skip for now" appears correctly in Pets list | Critical | `[Playwright: add-pet.spec.js]` |
| Resuming an incomplete `pet_onboarding` row picks up where it left off | High | `[Manual]` |
| Already-completed onboarding shows "You're all set!" not the wizard again | Medium | `[Manual]` |
| Onboarding load failure shows "We couldn't load this pet's profile" + working Retry | Medium | `[Manual]` |

### 5.3 Pet Management — Critical/High

| Case | Priority | Coverage |
|---|---|---|
| Pets list: expand/collapse a pet card | High | `[Manual]` |
| Pets list empty state shows Add Pet CTA | Medium | `[Manual]` |
| Pets list error state shows Retry and Retry actually works | Medium | `[Manual]` |
| `?highlight=<petId>` deep link scrolls to and highlights the right card | Medium | `[Manual]` |
| Edit Pet: Save is disabled with a blank name | High | `[Manual]` |
| Edit Pet: no Conditions picker present (split confirmed by spec 0036) | High | `[Playwright: pet-edit-conditions.spec.js]` |
| Edit Pet: add/remove a Nickname via Enter key and via + button | Medium | `[Manual]` |
| Edit Pet: each nickname/favorite-activity chip's remove "x" is at least 44×44px and removes the chip (spec 0076, PA-55) | Medium | `[Playwright: pet-edit-conditions.spec.js]` |
| Pet Conditions page: category search + save persists | High | `[Playwright: pet-edit-conditions.spec.js]` |
| Retired `/pet/:petId` and `/pet/:petId/profile` routes still resolve (redirect to `/pets?highlight=`) | Medium | `[Manual]` — regression case for old bookmarks/links. |
| Invite Co-Owner: blocked entirely on demo accounts | High | `[Manual]` |
| Invite Co-Owner: self-invite rejected; inviting someone who has already accepted shows "Already a co-owner." (an invite not yet accepted is resent instead, spec 0077) | High | `[Manual]` |
| Invite Co-Owner: remove asks "Remove {email} as a co-owner?"; Cancel keeps them, Remove takes them off the list (spec 0072) | High | `[Playwright: co-owner.spec.js]` |
| Memorial Dialog: marking a pet as memorial moves it to the Rainbow Bridge section | Medium | `[Manual]` |
| Vaccination Calendar Export produces a real downloadable `.ics` file | Critical | `[Playwright: vaccination-calendar-export.spec.js]` |
| Vaccination due-reminder deep link opens the correct vaccination pre-loaded for edit | High | `[Playwright: vaccination-due-reminders.spec.js]` |

### 5.4 Daily Check-In / Catch-Up — Critical

| Case | Priority | Coverage |
|---|---|---|
| Start a Daily Check-In, mark Great Day, status flips to "Edit…" | Critical | `[Playwright: daily-checkin.spec.js]` |
| Mark Off Day / Tough Day with category selection and per-category detail follow-ups | Critical | `[Manual]` — no automated coverage of this branch today; only the Great Day happy path is automated. |
| Save is disabled until every selected category has an answer | High | `[Manual]` |
| Closing the sheet mid-flow (not while saving) does not silently lose data without the user realizing | High | `[Manual]` |
| **Co-owner conflict:** a second co-owner's newer save triggers "Someone already saved this day" with working "Keep Theirs"/"Keep Mine" | Critical | `[Manual]` — requires two real co-owner sessions on the same pet/day; no automated coverage. See spec 0043. |
| Re-opening an already-logged day shows "already logged as X… saving again will update it" | Medium | `[Manual]` |
| Multi-day Catch-Up: auto-launches for pets with missed days, focus-trapped dialog, Escape/Maybe-later don't escape the trap | Critical | `[Playwright: catch-up-flow.spec.js]` |
| Catch-Up calendar: tapping a missed day flags it as a "Needs Details" exception | Critical | `[Manual]` — functional calendar interaction has no automated coverage beyond the auto-launch/focus-trap check. |
| Catch-Up: ≥30 missed days triggers the "How has {pet} been?" long-gap prompt | Medium | `[Manual]` |
| Catch-Up: "Finish Catch Up" is blocked while any flagged exception is still undetailed | Critical | `[Manual]` — this is a deliberate data-integrity guard (never silently overwrite a flagged day); a regression here would silently corrupt check-in history. |
| Catch-Up: "Finish Catch Up" with no pending exceptions bulk-marks all untouched days as Great Day | High | `[Manual]` |
| Bulk Apply Sheet: selecting Off/Tough Day + categories and saving to N days (chunks of 20) | High | `[Manual]` |
| Bulk Apply Sheet: partial failure on a large selection shows the correct partial-failure error, doesn't silently drop days | High | `[Manual]` |
| Home reachability via keyboard only (tab to a pet card, activate with Enter/Space) | High | `[Playwright: home-card-keyboard-nav.spec.js]` |

### 5.5 Health Records / Trends / Timeline — High

| Case | Priority | Coverage |
|---|---|---|
| Symptom log: "+"opens the full-screen log form, submit persists a new entry visible in the timeline | High | `[Manual]` — no automated coverage of this core logging surface. |
| Symptom log: empty state shows "No logs yet" + working "Log symptoms" CTA | Medium | `[Manual]` |
| Trends: switching time-range pill updates the displayed data (debounced) | Medium | `[Manual]` |
| Trends: Health/Wellness pill toggle switches the correct data set | High | `[Manual]` |
| Trends: Patterns/Compare "coming soon" placeholders render without crashing | Low | `[Manual]` |
| Trends: `?section=trends&group=&metric=` deep link scrolls to and highlights the right card | Medium | `[Manual]` |
| Timeline: check-in days and medication/vaccination/symptom events merge correctly, sorted newest-first | High | `[Manual]` |
| Timeline: empty state and error+Retry state | Medium | `[Manual]` |
| Scan Record: uploading a document opens a review screen; nothing saves until confirmed | Critical | `[Playwright: vaccination-scan-review.spec.js]` |
| Scan Record: a multi-pet document groups detected vaccinations under the correct pet, and un-attributable lines default to the pet the scan was launched from | High | `[Playwright: vaccination-scan-review.spec.js]` |
| Scan Record: a differently-worded known vaccine name (e.g. "Canine - Rabies Vaccine") is recognized as an update to the existing "Rabies Vaccine" record, not a duplicate | High | `[Playwright: vaccination-scan-review.spec.js]`, `[Vitest: speciesConfig.test.js]` — spec 0064 |
| Scan Record: an unrecognized/uncommon vaccine name worded differently from an existing record still shows "New" (fuzzy matching only applies to the app's known vaccine list) | Medium | `[Playwright: vaccination-scan-review.spec.js]`, `[Vitest: speciesConfig.test.js]` — spec 0064 |
| Vet Report: Download Report produces a real file, not a stuck spinner | Critical | `[Playwright: vet-report.spec.js]` |
| **Vet Report Wellness Overview (spec 0080, PA-12) AC10:** the overview covers the last 30 days ending today in the owner's time zone, with the heading "Wellness Overview — last 30 days (Oct 26 – Nov 24, 2026)" (both years only across New Year), the Vibe line "Great Day N · Off Day N · Tough Day N · Skipped N · No check-in N" ("Not recorded" only when > 0), and one chart plus a "Symptom (N days)" line for each attribute that had a symptom. An all-Normal attribute, one with only "Not observed" answers, and one whose symptom is older than 30 days get none. No "Health Score" text anywhere | Critical | `[Deno: supabase/tests/vet_report_wellness.test.ts]` (pure data shaping and wording) + `[Deno: supabase/tests/vet_report_pdf.test.ts]` (check-ins saved through `save_daily_check_ins` on dev, real PDF downloaded from the deployed function, text extracted and checked; added in QA 2026-11-24) + `[Deno: supabase/tests/function_hygiene.test.ts]` (no `wellness_scores` read, no "Health Score" in the source). `vet_report_pdf.test.ts` isn't in CI's `edge-functions` step yet; run it by hand with the command in its header. |
| Vet Report AC11: the same symptoms on a Great day and on an Off day give the same chart and day count (Vibe never decides whether an attribute appears or how a bar is colored) | Critical | `[Deno: supabase/tests/vet_report_wellness.test.ts]`, `[Deno: supabase/tests/checkin_rules.test.ts]`, `[Vitest: src/lib/aiServerParity.test.js]` (app and server per-day rules match) |
| Vet Report: empty states "No daily check-ins were recorded in the last 30 days." and "No symptoms were logged in the last 30 days."; a skipped day's symptoms never make a chart; window edges (day −29 and today in, day −30 and tomorrow out); a daylight-saving change inside the window | High | `[Deno: supabase/tests/vet_report_wellness.test.ts]` + `[Deno: supabase/tests/vet_report_pdf.test.ts]` (a pet with no check-ins, on dev) |
| Vet Report: a stranger asking the function for someone else's pet gets 403 and no pet details | Critical | `[Deno: supabase/tests/vet_report_pdf.test.ts]` + `[Deno: supabase/tests/sitter_access.test.ts]` |
| **Vet Report owners only (spec 0083 AC4, FR4, PA-72):** a sitter during an open sit, a sitter whose sit has ended, a stranger, and anyone asking about a pet ID that doesn't exist all get 403 `forbidden` from `generate-vet-report`, even when calling it directly; the owner and a co-owner get a PDF | Critical | `[Deno: supabase/tests/sitter_access.test.ts]` on dev (the screen-level block is `[Playwright: pet-sitter.spec.js]`, §5.7) |
| Vet Report on prod after spec 0080 ships: Tribble's report charts Appetite (symptoms most days) and has no Water chart (all Normal) | High | `[Manual]`, Lynn — the real data only exists on prod. |

### 5.6 AI Assistant ("Ask Wysker") — Critical

**Since spec 0080 (PA-11), the server writes every AI prompt** (`supabase/functions/ask-vet-assistant/prompts.ts`) and looks up the pet's details itself, as the caller (`context.ts`). The app sends only a task name (one of 8), the pet's ID, the file path, the screen, the Trends range, and the owner's own question and history. Tests that used to read the prompt in the browser now read these fields; prompt wording is checked by the Deno unit tests.

| Case | Priority | Coverage |
|---|---|---|
| "Ask Wysker" reachable from a pet screen; the screen name is sent as the request's `screen` field | High | `[Playwright: ask-wysker-guardrails.spec.js]` + `[Deno: supabase/tests/ai_prompts.test.ts]` (the screen sentence in the server prompt) |
| Disclaimer banner visible in both general and pet-scoped modes | Critical | `[Playwright: ask-wysker-guardrails.spec.js]` |
| Emergency-keyword hard-stop fires with no bypass, before any AI call, in the app **and on the server** (spec 0080 AC4, FR5): "she's having a seizure", "can’t breathe" typed with an iPhone curly apostrophe, and a household-chat question all get `{ urgent: true }` with no AI text | Critical | `[Playwright: ask-wysker-guardrails.spec.js]` (app) + `[Deno: supabase/tests/ai_prompts.test.ts]` (the stop runs before the AI) + `[Deno: supabase/tests/ai_tasks.test.ts]` (deployed function) + `[Vitest: src/lib/aiServerParity.test.js]` (same phrase lists) |
| AI-flagged `urgent: true` backstop: the server drops every AI-written field and returns only the urgent flag (AC5); the app shows only the emergency notice | Critical | `[Deno: supabase/tests/ai_prompts.test.ts]` (`stripUrgent`) + `[Playwright: ask-wysker-guardrails.spec.js]` (stubbed urgent answer) |
| Rate-limited AI call (20 per 10 minutes) shows "You've reached the limit for AI requests. Please wait a few minutes and try again.", not a generic failure or a stuck spinner | High | `[Playwright: ask-wysker-guardrails.spec.js]` (stubbed 429) + `[Deno: supabase/tests/ai_tasks.test.ts]` (deployed function, `rate_limited`) |
| **AI task requests (spec 0080) AC1:** a body with its own `prompt` or `response_json_schema`, an unknown task, or no task is refused with 400 `unknown_task`, without calling the AI | Critical | `[Deno: supabase/tests/ai_tasks.test.ts]` + `[Deno: supabase/tests/ai_prompts.test.ts]` + `[Vitest: src/api/__tests__/aiClient.test.js]` (the app never sends a prompt, schema or file link) |
| AI task requests AC8: the old `file_url` is refused with 400 `invalid_file` | High | `[Deno: supabase/tests/ai_tasks.test.ts]` + `[Deno: supabase/tests/private_uploads.test.ts]` |
| AI task requests AC2: a stranger, a sitter whose sit has ended and a removed co-owner asking for pet chat, Insights or a Trends summary get 403 `forbidden_pet` and nothing about the pet; a logged-out caller gets 401 | Critical | `[Deno: supabase/tests/ai_tasks.test.ts]` |
| AI task requests: a sitter **inside** the sit window and a current co-owner get past the pet check (Insights on a pet with no check-ins answers `{ not_enough_data: true }`, the Trends summary `{ summary: null }`); the same sitter is refused the owner's other pet that isn't in the sit | High | `[Deno: supabase/tests/ai_tasks.test.ts]` (added in QA 2026-11-24) |
| AI task requests: a sitter can't have the AI read the sat pet's documents (403 `forbidden_file`); a stranger's multi-pet scan naming someone else's pet gets 403 `forbidden_pet` and isn't counted | High | `[Deno: supabase/tests/ai_tasks.test.ts]` |
| AI task requests AC3: household chat (and the multi-pet scan's pet list) only includes pets the person owns or co-owns, not memorial pets and not pets they only sit for | Critical | `[Deno: supabase/tests/ai_context.test.ts]` + `[Playwright: pet-sitter.spec.js]` AC3 (the general chat request carries no pet details) |
| AI task requests FR4: a question over 2,000 characters is refused; history keeps only the last 20 well-formed messages (emergency and error bubbles dropped); the chat boxes stop typing at 2,000 | High | `[Deno: supabase/tests/ai_prompts.test.ts]` + `[Vitest: src/api/__tests__/aiClient.test.js]` + `[Vitest: src/lib/aiServerParity.test.js]` |
| **Daily AI cap (spec 0080) AC6:** after 100 AI requests in 24 hours, the next gets 429 `daily_limit` and "You've reached today's limit for Ask Wysker and document scans. You can try again tomorrow." (over both limits, the daily message wins); the AI isn't called; only one Sentry warning per person per day | Critical | `[Deno: supabase/tests/ai_tasks.test.ts]` (seeded counts; exactly one warned-key row after two refusals) + `[Playwright: ask-wysker-guardrails.spec.js]` (the chat shows wording A) |
| Daily AI cap: the onboarding Medication and Vaccination scan buttons show wording A on a `daily_limit` 429 and keep manual entry available; any other scan failure still shows "Couldn't read that label/record — you can still enter it manually below." | High | `[Playwright: onboarding-scan-limits.spec.js]` (AI stubbed; added in QA 2026-11-24) |
| Daily AI cap: the Sentry warning (`feature: ai_daily_cap`, level warning) arrives once for a person who hits the cap, not once per refused request | High | `[Manual]` — Sentry is external. On dev, seed 100 rows on a scratch user's `ask-vet-assistant:daily:user:<id>` key, ask twice, and check Sentry shows one warning. |
| Daily AI cap FR10: replies the server gives without the AI (not enough check-ins, no Trends summary, a pet the person can't see) don't count toward either limit | High | `[Deno: supabase/tests/ai_tasks.test.ts]` |
| Pet Insights reads the last 30 days of daily check-ins (Vibe and symptoms as two separate sections, no score); fewer than 2 non-skipped check-ins shows "Not enough check-ins yet." (wording C) without calling the AI | High | `[Deno: supabase/tests/ai_prompts.test.ts]` + `[Deno: supabase/tests/ai_context.test.ts]` + `[Playwright: ask-wysker-guardrails.spec.js]` (wording C) |
| App and server copies of the emergency phrases, normal/not-observed answer lists, bloodwork fields, screen names, Trends ranges and the question limit match | High | `[Vitest: src/lib/aiServerParity.test.js]` |
| AC9: each of the 8 AI features works with a real AI answer (same screens, same answer shapes) | Critical | `[Manual]` once per environment after rollout. Run 2026-11-24 on dev by QA through the deployed function (not the UI): pet chat `{reply, urgent}`, household chat `{reply, urgent}`, Insights `{summary, insights[{type,title,detail}], disclaimer, urgent}`, Trends summary `{summary}`, vaccine document scan `{vaccines: []}` (test image): pass. The single-record, medication and bloodwork scans weren't run with real AI; their shapes are checked in `ai_prompts.test.ts`, and the screens with stubbed answers in Playwright. |
| **Adversarial/edge-case prompt set** (per Launch Plan Risk row 38 "AI Assistant quality concerns") | Critical | `[Manual, content TBD]` — content not yet decided (confirmed 2026-08-19, spec 0058 Open Question #1). Placeholder shape only: a dedicated prompt set run against the live AI, reviewed by Lynn for tone/safety per the disclaimer and hard-stop rules (since spec 0080 the disclaimer lives in `supabase/functions/ask-vet-assistant/prompts.ts`; the app keeps its own copy of the hard-stop phrases in `src/lib/aiGuardrails.js`). Revisit before this case can be marked closeable. |

### 5.7 Sitter / Co-Owner — High

**Which accounts to use (spec 0070):** `coowner1@`/`coowner2@` and `petsitter1@`/`petsitter2@wyskerwatch.com` are real inboxes with logins on all three environments (dev logins in `.env.playwright`). All are classified `test`, and so is test1–4@. Emails *sent by* a `test` account are silently dropped (`sendEmail.ts`), so: to check an invite **email** arrives and reads right, send the invite from a non-test account (e.g. Lynn's own login) to one of these inboxes; to check only that the invite **links** on login, any account can send it.

| Case | Priority | Coverage |
|---|---|---|
| Pet Sitter page reachable, all sits listed | High | `[Playwright: pet-sitter.spec.js]` |
| Wellbeing badges: 5 groups, correct direction labels, "no check-in yet" state, single-tap-only navigation | High | `[Playwright: pet-sitter.spec.js]` |
| A sitter who opens Edit Pet or Vet Report for a pet they only sit for sees "Only this pet's owners can do this." and no form or download (spec 0076, PA-28) | High | `[Playwright: pet-sitter.spec.js]` |
| Scan Record only offers the AI, and only matches lines to, pets the owner owns or co-owns, never a pet they only sit for; an owner who is also listed as a sitter on their own pet keeps full access to it (spec 0076, PA-28) | High | `[Vitest: src/lib/petsClient.test.js]` + `[Manual]` scan of a multi-pet invoice from an account that also sits for a friend's pet |
| Home's pet list shows only pets the person owns or co-owns; a pet they only sit for isn't there, including sat pets from two different owners, a deleted sit, and a sat pet that was deleted (spec 0079, PA-61) | High | `[Playwright: pet-sitter.spec.js]` (AC1; first confirms test4@ can see both sat pets on Pets, so the "not on Home" check can't pass vacuously) + `[Vitest: src/lib/petsClient.test.js]` |
| A sitter with no pets of their own sees Home's "Welcome to Wysker Watch" screen with a Pet Sitter card reading "See the pets you're sitting" that opens `/pet-sitter`; someone who sits for nobody sees the welcome screen with no card (spec 0079) | High | `[Playwright: pet-sitter.spec.js]` (AC2, skipped if test4@ owns pets on dev) + `[Vitest: src/pages/Home.test.js]` (both cases) |
| Ask Wysker's general chat (opened with no pet in view) never tells the AI about a pet the person only sits for (spec 0079; enforced on the server since spec 0080) | High | `[Deno: supabase/tests/ai_context.test.ts]` (the server's household list leaves the sat pet out) + `[Playwright: pet-sitter.spec.js]` (AC3: the request carries no pet details at all) |
| A sitter with no pets of their own can still use Ask Wysker's general chat (the AI is told "no pets on file yet" and still answers), and Ask Wysker opened from a sat pet's own page still knows that pet during the sit (spec 0079, 0080) | Medium | `[Deno: supabase/tests/ai_prompts.test.ts]` (the "no pets on file yet" wording) + `[Deno: supabase/tests/ai_context.test.ts]` (a sitter gets the sat pet during the sit, without its medications) + `[Deno: supabase/tests/ai_tasks.test.ts]` (a sitter in the window gets past the pet check) + `[Manual]` one real answer as petsitter1@ |
| If the "which pets do I only sit for?" lookup fails, Home and Ask Wysker show every pet, as before, and the failure is reported to Sentry (features `home` / `ask_wysker`) (spec 0079) | Medium | `[Vitest: src/lib/petsClient.test.js]` |
| Invite Sitter: blocked on demo accounts, self-invite/duplicate rejected | High | `[Manual]` |
| Invite Sitter: remove **does** show an "Are you sure?" confirm dialog | High | `[Playwright: invite-sitter.spec.js]` (spec 0073) |
| Invite Sitter: the invited-sitters list shows as soon as the dialog opens, and each remove button is at least 44px (spec 0073, PA-53/54) | High | `[Playwright: invite-sitter.spec.js]` — flaky in CI until PA-64 is fixed (measures mid-animation). |
| Invite Sitter: an invite the database refuses shows "Couldn't save this invite. Please try again." and the button works again | High | `[Playwright: invite-sitter.spec.js]` |
| **Sitter lockdown (spec 0073):** a stranger can't create a sit that lists someone else's pet (alone or mixed with their own), a sit with no pets is refused, and an owner can't edit a sit to add a pet they don't own | Critical | `[Deno: supabase/tests/sitter_access.test.ts]` |
| Sitter lockdown: nobody can create a sitter invite with an account already attached, or invite on someone else's sit; an email-only invite from the owner works once claimed | Critical | `[Deno: supabase/tests/sitter_access.test.ts]` |
| Sitter lockdown: a linked sitter sees the pet, its photo, check-ins, observations, the sit and its checklist from the day before the sit through the day after it, and nothing 2+ days outside that, on the **owner's** calendar (the sitter's own time zone doesn't matter) | Critical | `[Deno: supabase/tests/sitter_access.test.ts]` |
| Sitter lockdown: checklist entries must be for a pet in that sit; `profiles.email` can't be changed; `is_pet_sitter`/`is_pet_sit_sitter` only answer about the caller | High | `[Deno: supabase/tests/sitter_access.test.ts]` |
| Each environment's sitter policies match migration 0057: on `pet_sits`, `pet_sits_select_any_owner`, `_insert_every_owner`, `_update_every_owner`, `_delete_every_owner` plus 0030's `pet_sits_select_sitter`; on `pet_sitter_access`, `_select_sitter_or_owner`, `_insert_every_owner`, `_delete_every_owner` (no update policy); on `pet_sit_logs`, `_select_owner_or_open_sitter`, `_insert_pet_in_sit`, plus 0004's `_update_owner`/`_delete_owner` | Critical | `[Manual]` — run `select tablename, policyname from pg_policies where schemaname='public' and tablename in ('pet_sits','pet_sitter_access','pet_sit_logs')` on each project after pushing 0057. Run 2026-11-21, pass on dev, staging and prod (spec 0073 Build Note 7). |
| **Co-owner lockdown (spec 0072):** a stranger can't add themselves as co-owner of someone else's pet, by attaching their account directly, by naming the real owner as inviter, or by an email-only entry they then claim | Critical | `[Deno: supabase/tests/co_owner_access.test.ts]` |
| Co-owner lockdown: a co-owner can't add another co-owner; even the primary owner can't add one with an account already attached; an email-only invite from the primary owner still works once claimed | Critical | `[Deno: supabase/tests/co_owner_access.test.ts]` |
| Co-owner lockdown: every owner of a pet sees its full co-owner list; a stranger sees none | High | `[Deno: supabase/tests/co_owner_access.test.ts]` |
| Co-owner lockdown: only the primary owner can remove a co-owner; a removed co-owner loses access and can't add themselves back | Critical | `[Deno: supabase/tests/co_owner_access.test.ts]` |
| Co-owner lockdown: `is_primary_pet_owner()` is not callable by signed-out visitors | High | `[Deno: supabase/tests/co_owner_access.test.ts]` |
| **"Entered by" (spec 0083 AC5, AC6, FR5, FR6, PA-25):** on every record table in migration 0062 that exists (check-ins, observations, vaccinations, medications, bloodwork, food, foods, baselines, onboarding, checklist, and the old symptom/wellness tables), a co-owner's new record is always stamped with the co-owner, whatever ID (or none) is sent; an owner's later edit can't change or clear it; "Skip today" on a day a co-owner logged keeps the co-owner as author | Critical | `[Deno: supabase/tests/co_owner_access.test.ts]` on dev. Tables already dropped (spec 0081) are skipped; all 12 existed on dev 2026-11-24, so the skip itself is unexercised there. |
| **No direct pet deletion (spec 0083 AC7, FR7, PA-24):** a co-owner, a primary owner with co-owners, and a sole owner each deleting a pet straight from the database delete nothing; Delete in the app (the `delete-pet` function) still works for each (D5 scenarios) | Critical | `[Deno: supabase/tests/co_owner_access.test.ts]` + `[Deno: supabase/functions/delete-pet/index.test.ts]` |
| **Primary owner and sit creator are locked (spec 0083 AC8, FR8, PA-24):** neither a co-owner nor the primary owner can change `pets.created_by` or `pet_sits.created_by` to themselves, a co-owner, a stranger, or nobody (null); the server's hand-off still can | Critical | `[Deno: supabase/tests/co_owner_access.test.ts]` + `[Deno: supabase/functions/delete-account/index.test.ts]` / `delete-pet/index.test.ts` (hand-off) |
| Everything a co-owner does in the app still works after spec 0083: edit the pet, change its photo, log a check-in, add a vaccination (AC10, FR9) | High | Existing `[Playwright]` suite (119/119 on dev 2026-11-24) + `[Manual]` as coowner1@ (`co-owner.spec.js` is local only) |
| Co-owner Edit Pet while the primary owner changes the photo (spec 0083, reviewer item): the co-owner's later Save of other fields succeeds and keeps the owner's new photo, because Edit Pet only sends the photo if it was changed in that form | High | `[Vitest: src/lib/petEditPayload.test.js]` (payload) + `[Deno: supabase/tests/private_uploads.test.ts]` (database accepts the save, and refuses the old payload that re-sent the stale photo) + `[Manual]` two browsers, test1@ and coowner1@ |
| Each environment has migration 0062's triggers (`protect_pet_photo_path` and `protect_record_creator` on `pets`, `protect_record_creator` on `pet_sits`, `stamp_record_author` on each record table that exists) and **no** delete policy on `pets` | Critical | `[Manual]` after pushing 0062: `select event_object_table, trigger_name from information_schema.triggers where trigger_name in ('protect_pet_photo_path','protect_record_creator','stamp_record_author')` and `select policyname, cmd from pg_policies where schemaname='public' and tablename='pets'` (expect no `DELETE`/`ALL`; the migration itself also refuses to finish if one is left). Plus the 0006 §11 function-permission query. |
| Edit Pet as a co-owner: the button reads **View Co-Owners**, the list is read-only ("Only the primary owner can add or remove co-owners."), with no email field or remove buttons | High | `[Playwright: co-owner.spec.js]` — local only: signs in as coowner1@, which CI has no secret for. |
| Invite Co-Owner: an invite the database refuses shows "We couldn't add that co-owner. Please try again." and the button works again | High | `[Playwright: co-owner.spec.js]` |
| Each environment's `pet_co_owners` policies match migration 0056: `pet_co_owners_insert_primary_owner`, `pet_co_owners_select_any_owner`, `pet_co_owners_delete_primary_owner`, and none of 0004's three | Critical | `[Manual]` — E2E and Deno only target dev. Run `select policyname from pg_policies where schemaname='public' and tablename='pet_co_owners'` on each project after pushing 0056. Run 2026-11-20, pass on dev, staging and prod (spec 0072 Build Note 6). |
| **Invite email lockdown (spec 0077):** invite-co-owner sends only for the pet's primary owner and a pending invite for that address; a stranger, a non-primary co-owner, or an address with no pending invite gets "Invite not found" and no email | Critical | `[Deno: supabase/tests/invite_emails.test.ts]` |
| Invite email lockdown: invite-sitter sends only for the sit's creator and a pending sitter invite for that address; otherwise "Invite not found" | Critical | `[Deno: supabase/tests/invite_emails.test.ts]` |
| Invite email lockdown: an address that already has an account gets the "added you" email (`co-owner-added` / `sitter-added`) and the same reply as a new address; no reply carries a `messageId` | High | `[Deno: supabase/tests/invite_emails.test.ts]` |
| Invite email lockdown: the 11th invite request in an hour (both functions together, refused ones included) gets "too many invites" and no email | High | `[Deno: supabase/tests/invite_emails.test.ts]` |
| Invite dialogs show the rate-limit message ("…you've sent a lot of invites in the last hour…"); re-inviting a co-owner who hasn't accepted resends and lists them once | High | `[Playwright: invite-email-responses.spec.js]` |
| "Added you" emails arrive and read right: from a **non-test** account, invite `coowner1@` (co-owner) and `petsitter1@` (sitter) | High | `[Manual]` — test accounts' emails are dropped by design (spec 0077) |
| **Function lockdown (spec 0077):** logged-out and signed-in callers can't run any server-only database function (including the fake-bounce one); signed-in-only helpers still work; `is_pet_owner` only answers about the caller | Critical | `[Deno: supabase/tests/function_permissions.test.ts]` |
| Each environment's function permissions match migration 0059 (run the check query in `0006 Technical Standards.md` §11 on dev, staging and prod) | Critical | `[Manual]` — run after any migration that adds or changes a function |

### 5.8 Account / Settings — Critical (destructive flows)

| Case | Priority | Coverage |
|---|---|---|
| Profile: Save is disabled unless a field is dirty | Medium | `[Manual]` |
| Profile: edits survive a background auth-token refresh (deliberately does not resync mid-edit) | High | `[Manual]` — a real edge case worth verifying stays true. |
| Profile: Timezone "return to automatic detection" link appears only after a manual change | Medium | `[Manual]` |
| Settings: Sign Out requires confirm, failure shows toast not a block | Medium | `[Manual]` |
| **Account deletion keeps shared history (spec 0075):** when the primary owner of a pet with two co-owners deletes their account, every check-in and vaccination any of the three entered survives (the departed owner's with no name), the oldest co-owner becomes primary, the other co-owner keeps access, both can open the pet's photo and scanned document, the owner's pet sit and sitter invite pass to the new owner, and a retry after a half-finished attempt sends no second notification | Critical | `[Deno: supabase/functions/delete-account/index.test.ts]` |
| Account deletion: a departing co-owner's records stay with the pet; a solo pet's photo and documents and every file in the folder (past the first 100) are deleted; a sitter's own invite row is removed when they delete their account | Critical | `[Deno: supabase/functions/delete-account/index.test.ts]` |
| Remove a shared pet (spec 0075): every co-owner except the promoted one keeps access; a sit for only that pet passes to the new owner; a sit that also covers a kept pet stays with the leaving owner, minus this pet. Deleting a solo pet removes its photo and scans, except a scan another pet still uses | Critical | `[Deno: supabase/functions/delete-pet/index.test.ts]` |
| **Ownership scenarios still hold with migration 0062 live (spec 0083 AC9, D5):** S1.1 co-owner deletes account (owner keeps the pet), S1.2 owner deletes account (pet and records pass to the co-owner), S2.1 co-owner taps Delete (only their access goes), S2.2 owner taps Delete (pet passes on), S3 sole owner taps Delete (pet and files gone); account deletion still clears "entered by" on records the departed person wrote on a shared pet, even though 0062 now stamps authors | Critical | `[Deno: supabase/functions/delete-account/index.test.ts]` + `[Deno: supabase/functions/delete-pet/index.test.ts]` on dev, re-run 2026-11-24 by QA with 0062 live: pass |
| The deletion database functions (`prepare_account_deletion`, `transfer_pet_ownership`) refuse logged-out and signed-in callers | Critical | `[Deno: supabase/tests/account_deletion.test.ts]` |
| Each environment's record tables keep a departed person's entries: every `created_by` foreign key to `auth.users` on the 13 tables in migration 0058 is `ON DELETE SET NULL`, and `pet_sitter_access.sitter_user_id` is `CASCADE` | Critical | `[Manual]` — run the pre-check query in 0058's header on each project after pushing; expect `n` for every `created_by` row and `c` for `sitter_user_id`. |
| Storage backup ages out deleted files (spec 0075): a file deleted from prod moves to `deleted/uploads/` in the `whisker-watch-storage-backups` R2 bucket on the next nightly run, and R2's lifecycle rule on `deleted/` removes it after 30 days; the run stops with an error, moving nothing, if Supabase lists no files or the move would touch over half the backup | High | `[Manual]` — production only. Delete a test file on prod, run `storage-backup.yml` by hand, check R2. Logic dry-run with a fake storage CLI during the spec 0075 build. |
| Every Edge Function starts after a deploy: after any function deploy, every function on that project answers an `OPTIONS` request with 200. A 500 `WORKER_ERROR` means it crashed on startup | Critical | `[Manual]` — no automated check yet (PA-62). Found 2026-11-21: an unpinned `@sentry/deno` picked up 11.16.0 and crashed `sign-up` on staging and prod for 22 hours; no test caught it. |
| **Delete Account: two-step type-"DELETE"-to-confirm actually deletes** | Critical | `[Manual]` — Given a **non-test** account (e.g. Lynn's own login on dev — the delete-account function refuses `test`/`demo` accounts by design, so test1–4@, coowner1–2@ and petsitter1–2@ can't run this) with one solely-owned pet and one co-owned pet, When Delete Account is completed, Then the solely-owned pet is deleted and the co-owned pet's ownership transfers rather than being deleted. This is the single highest-blast-radius flow in the app and has zero automated coverage today. Backend deletion logic (guard, sole-owner delete, ownership transfer, co-owner leave) is covered by the Deno suite `supabase/functions/delete-account/index.test.ts`, run on all 3 projects 2026-10-22/23 (spec 0066). The UI flow itself is still manual. |
| Reset Test/Demo Account tools only appear for internal account types | High | `[Manual]` |
| Notifications: vaccination-due "View"/"Update" wording matches stage, Snooze 7 Days hides the item | High | `[Playwright: vaccination-due-reminders.spec.js]` — **local only**: skipped on GitHub since spec 0067 (seeding needs `supabase db query --linked`; CI has no linked project). Fails locally while leftover `E2E%` vaccinations sit on test1@'s dev account (48 found 2026-11-14). |
| Notifications: empty state | Low | `[Manual]` |
| Notifications: dismiss one deletes it; Mark all read marks notices read and hides vaccine reminders; Clear all (after confirming) deletes notices and marks reminders read, and the daily job doesn't bring a cleared reminder back; Cancel changes nothing (spec 0076, PA-58) | High | `[Playwright: notifications-clear.spec.js]` — **local only**, same CLI seeding as `vaccination-due-reminders.spec.js`. Plus `[Vitest: notificationClient.test.js]` for which rows are deleted vs marked read, and the failure case. |
| Notifications: a failed dismiss/clear puts the notification back and shows "Couldn't update your notifications. Please try again." | Medium | `[Vitest: notificationClient.test.js]` (the error reaches the page) + `[Manual]` (go offline, tap Clear all) |
| PWA "Install App" row persists correctly across navigation | Medium | `[Playwright: pwa-install-prompt.spec.js]` |
| Preferences placeholder renders without crashing | Low | `[Manual]` |

### 5.9 Legal / Support — Medium

| Case | Priority | Coverage |
|---|---|---|
| Support FAQ: accordion items expand/collapse independently | Medium | `[Playwright: support-faq.spec.js]` |
| Support: "Email support" mailto link targets the correct address | Medium | `[Playwright: support-faq.spec.js]` |
| Privacy/Terms: section list navigates to each detail page | Low | `[Manual]` |
| Privacy/Terms and their section pages open while signed out, with no app frame; signed in, they keep the bottom nav (spec 0074) | Critical | `[Playwright: public-legal-and-reset.spec.js]` |
| Privacy/Terms: Back on a page opened in a fresh tab goes to Login (signed out), the Menu (signed in), or the document's list (section pages) (spec 0074) | Medium | `[Playwright: public-legal-and-reset.spec.js]` |
| About page renders and Back works | Low | `[Manual]` |

### 5.10 Admin — High

| Case | Priority | Coverage |
|---|---|---|
| `/admin/beta-signups` lists all signups with correct badges | Medium | `[Playwright: beta-signup.spec.js]` |
| Mark Reviewed toggles per row, persists on reload | Medium | `[Playwright: beta-signup.spec.js]` |
| **A non-admin account is actually blocked from `/admin/beta-signups`** | High | `[Playwright: beta-signup.spec.js]` — `AdminRoute` rejection of a non-admin (and of a logged-out visitor) is covered end-to-end; this is the only admin-gated route in the app (per CLAUDE.md). |

### 5.11 Public Marketing Pages — Critical (first-touch, no auth)

| Case | Priority | Coverage |
|---|---|---|
| `/beta`: Get Early Access reveals the combined email + 4-question form in place, no page nav, submit disabled until all fields answered + CAPTCHA present | Critical | `[Playwright: beta-signup.spec.js]` |
| `/beta`: invalid email rejected inline | High | `[Playwright: beta-signup.spec.js]` |
| `/beta`: Submit button does not move when the CAPTCHA finishes (Turnstile reserves its 71px up front) | High | `[Playwright: beta-signup.spec.js]` (spec 0067) — the test holds Cloudflare's script until the "before" reading and waits for pill animations to finish, so only the CAPTCHA can move anything. Shared component: also covers `/early-adopters`. |
| `/early-adopters`: submit disabled until consent + CAPTCHA, invalid email rejected inline | Critical | `[Playwright: early-adopters.spec.js]` |
| Both public forms: hero copy avoids internal-mechanics language (brand-voice check) | Medium | `[Playwright: beta-signup.spec.js, early-adopters.spec.js]` |

### 5.12 Cross-cutting / Error Monitoring — High

| Case | Priority | Coverage |
|---|---|---|
| A toast (any of the ~6 call sites app-wide — Account, Home, Settings, VetExport, Bloodwork, Vaccinations) actually renders pinned to the viewport, not just fires without visual effect | High | `[Playwright: toast-visibility.spec.js]` — regression coverage for the 2026-08-29 toast-positioning bug (every toast since the app's first commit rendered off-screen; see CLAUDE.md). Deliberately standalone, not tied to any one feature, since the fix is in the one shared `Toaster`/`ToastViewport`. Confirmed by temporarily reverting the fix locally and re-running this test — it fails against the broken version. |
| **Production** client and Edge Function errors reach Sentry when `VITE_SENTRY_DSN`/`SENTRY_DSN` are configured and the environment is `production` | High | `[Manual]` — no automated test checks delivery (Sentry is external; spec 0052). Since spec 0084 only production reports, so check on production only, after each production deploy. History: Edge Function side run 2026-10-23 on all 3 environments via a deliberate `invite-co-owner` error (spec 0066); client side confirmed 2026-09-01 (spec 0065). Both were before the production-only rule. |
| Test and demo account errors are excluded from the app's reports; `production`, `owner` and not-yet-signed-in errors are sent (**client side only**) | High | `[Vitest: src/lib/errorMonitoring.test.js]` (`shouldSendEvent`, spec 0078; before 0078, `owner` was dropped too; spec 0084 AC4 checks both filters together). Edge Functions still have **no account-type filter**, but since spec 0084 they report only from production, so a test account's backend error reaches Sentry only if it happens on production (test runs on dev/staging/CI send nothing). |
| Every app error goes through `reportClientError` (no bare `console.error` in `src/`), and Supabase's plain error objects reach Sentry with their message | High | `[Vitest: src/lib/errorMonitoring.test.js]` (spec 0078) |
| The five palette colors (teal, amber, red, gray, sky blue) are defined once in `src/index.css` (hex plus `--…-rgb` channels); no app file hand-types one as `rgba()`/`rgb()` or hex, and `tint()`/`PALETTE_SOFT` produce the exact strength asked for | Medium | `[Vitest: src/lib/toneColors.test.js]` (spec 0079 AC7/AC8: the guard fails and names each offending file) |
| Tinted backgrounds, borders and glows look the same as before spec 0079 Part B (Home with a pet, Settings, a pet profile, Medications, the AI Insights panel) | Medium | `[Manual]` — visual spot-check once per environment after deploy. Build evidence: every replaced color and strength computes to the same color in Chromium (spec 0079 AC9). |
| An Edge Function's unexpected error gives the browser only "Something went wrong. Please try again.", with the detail in Sentry; every `npm:`/`jsr:` import names an exact version | High | `[Deno: supabase/tests/function_hygiene.test.ts]` in CI (spec 0078). Live check 2026-11-22 on dev: a malformed body sent to `ask-vet-assistant` got the plain message in 1.3s. |
| Edge Function Sentry reports arrive even though the function may stop right after replying (flush) | High | `[Deno: supabase/tests/error_reporting.test.ts]` (spec 0084 QA: in production every report hands its flush to `EdgeRuntime.waitUntil`; outside production nothing is flushed) + `[Manual]` — Sentry is external. Spec 0078: look for the deliberate `ask-vet-assistant` `SyntaxError` in Sentry after the **production** deploy (since spec 0084, dev and staging send nothing, so there's nothing to find there). |
| Delete Pet / Delete Account / Reset / Seed / demo sign-in show the server's reason or a plain fallback, never "Edge Function returned a non-2xx status code" | High | `[Playwright: friendly-function-errors.spec.js]` for Delete Pet and Delete Account (function calls answered in the browser, nothing deleted); the shared `functionErrorMessage` is unit-tested in `errorMonitoring.test.js` (spec 0078). |
| Invite dialogs never stay stuck on saving; a failed sitter removal shows an error | High | `[Playwright: invite-email-responses.spec.js, invite-sitter.spec.js]` (spec 0078 AC9/AC10) |
| Every Edge Function on dev, staging and prod **starts** (no `WORKER_ERROR` crash) | Critical | `[Script: scripts/check-functions-start.sh <url>]` after every function deploy, and hourly by `.github/workflows/function-health.yml` (spec 0078). Requires 200 plus `x-deno-execution-id`, since a bare 200 can come from Supabase without running the function. Proves start-up only, not correct behavior. |
| App still loads and navigates normally with no Sentry DSN configured | Medium | `[Playwright: error-monitoring.spec.js]` — the one Sentry behavior that file actually tests. |
| **Only production reports, app (spec 0084) AC1:** with `VITE_SENTRY_ENVIRONMENT` set to `development`, `staging`, unset, or a near miss (`Production`, ` production`, `prod`), nothing is sent and `Sentry.init` never runs, even with a DSN; account-type tagging on login/logout does nothing; with exactly `production` and a DSN, errors are sent and `beforeSend` applies both filters | Critical | `[Vitest: src/lib/errorMonitoring.test.js]` + `[Manual]` after rollout: the production Cloudflare build's `VITE_SENTRY_ENVIRONMENT` must be exactly `production` (AC5's live error proves it) |
| **Only production reports, backend (spec 0084) AC2:** `isReportingEnvironment` is true only for exactly `production`; with a DSN, `sentryEnabled` is off for `development`, `staging`, `Production`, ` production`, empty and unset, and off in production with no DSN; outside production `reportError`/`serverError` send and flush nothing, and `serverError` still answers 500 with the plain message | Critical | `[Deno: supabase/tests/error_reporting.test.ts]` in CI's `edge-functions` job + `[Manual]` before the backend deploy: compare the production Supabase project's `SENTRY_ENVIRONMENT` hash with `production` (`supabase secrets list` shows SHA-256 only) |
| **Network-drop filter (spec 0084) AC3:** the app drops errors containing "Failed to fetch" (including Chrome's "Failed to fetch (host)"), Safari's "Load failed", Firefox's "NetworkError when attempting to fetch resource", and any `AuthRetryableFetchError`, anywhere in the exception chain; "Failed to fetch dynamically imported module" (and Firefox's/Safari's wording for the same old-copy-after-deploy problem) is kept; malformed events never throw and are kept | High | `[Vitest: src/lib/errorMonitoring.test.js]` (hand-built Sentry-shaped events) + `[Manual]` on production: real Safari/Supabase event shapes weren't captured, so a week after promotion check Sentry has no new "Load failed" / `AuthRetryableFetchError` issues |
| **Readable production errors (spec 0084) AC5:** a deliberate error on the live production site shows a real `src/` file and line in Sentry, and a release matching the deployed commit | High | `[Manual]` after Lynn promotes `main`'s Spec 0084 build: run the console one-liner from the spec while signed out, then open the event in Sentry. Also check the Cloudflare build log has no `[sentry-vite-plugin] source map upload failed` line and never shows the token |
| **No public source maps (spec 0084) AC6:** the finished build has no `.map` files and no `sourceMappingURL` comments, the service worker precaches none, and `dist/.assetsignore` lists `*.map` (from `public/.assetsignore`; the Cloudflare plugin adds `wrangler.json` and `.dev.vars`); on the live site `/assets/<any>.js.map` returns the app page or 404, never code | Critical | `[Vitest: src/lib/sentryBuildConfig.test.js]` (config guard) + build check: `npm run build` with a dummy `SENTRY_AUTH_TOKEN` against an unreachable `SENTRY_URL` and against a fake Sentry answering 401 (QA 2026-11-25: 0 maps left in `dist/`, maps deleted even though the upload failed, token never in the log or `dist/`) + `[Manual]` live check on production after promotion |
| **Token-less build (spec 0084) AC7:** with no `SENTRY_AUTH_TOKEN` (staging project, local, CI) `npm run build` succeeds, generates no maps and uploads nothing; a bad token or unreachable Sentry also never fails the build | High | CI's `build` job must stay green + `[Vitest: src/lib/sentryBuildConfig.test.js]` + local build check (QA 2026-11-25: pass) |
| **Backup cron check-ins (spec 0084) AC8:** with `SENTRY_CRON_URL` set, the backup sends "in progress" first (before checkout), then "ok" on success or "error" on any failure (`if: always()`); the address is built correctly with or without a trailing `/` or an existing query string, and is never printed; a missed run by 09:00 UTC emails Lynn | High | `[Vitest: src/lib/sentryBuildConfig.test.js]` (runs each step's real script under `bash -eo pipefail` with a stand-in curl) + `[Manual]` Lynn: Actions → Database Backup → Run workflow; the Sentry monitor shows in progress then OK. The "error" and job-timeout-cancel paths aren't run for real (we don't break the backup on purpose); Sentry's max-runtime / missed check covers a cancelled job |
| **Backup safe without Sentry (spec 0084) AC9:** with `SENTRY_CRON_URL` unset, or the check-in request failing, the backup job still completes and reports success when the backup succeeded | Critical | `[Vitest: src/lib/sentryBuildConfig.test.js]` (unset sends nothing; a failing curl still exits 0) + `[Manual]` one Run workflow before `SENTRY_CRON_URL` is added must pass |
| All 14 Edge Functions on dev/staging/prod match main, with `resend-webhook`'s JWT check off and the other 13 on | Critical | `[Manual]` — verify with `supabase functions list --project-ref <ref> -o json` per project (`updated_at`, `verify_jwt`). Run 2026-10-23, pass (spec 0066). |
| App Shell bottom nav / Menu tab navigation works from every page | High | `[Playwright: bottom-nav-menu-tab.spec.js]` |
| **Rate limiter (spec 0080) AC7, FR13:** a rate-limit check for one key never erases another key's history; each limit counts over its own window (10 minutes, 1 hour, 24 hours), and cleanup only removes rows older than 2 days. The new `check_and_record_rate_limits_windowed` is all-or-nothing and refuses bad inputs | High | `[Deno: supabase/tests/rate_limits.test.ts]` on dev |
| `check_and_record_rate_limits_windowed` (migration 0060) is server-only | Critical | `[Deno: supabase/tests/function_permissions.test.ts]` + `[Manual]` the 0006 §11 check query on each project after pushing 0060 |
| **Edge Function type check (spec 0080, PA-65) AC12:** CI's `edge-functions` job runs `deno check` on every function, its tests and `supabase/tests/`; a type error fails it | High | CI itself (the PR's own run must be green). Run locally 2026-11-24 by QA: exit 0. |
| Deleting a pet only removes its `photo_path` file; the old `photo_url` fallback is gone (spec 0080, PA-52) | High | `[Deno: supabase/tests/pet_photo.test.ts]` + `[Deno: supabase/functions/delete-pet/index.test.ts]` |
| Each environment's `storage.objects` RLS policies match the spec-0071 set: `uploads_read_permitted` plus insert/update/delete own-folder-only, **no** `uploads_public_read`, and the `uploads` bucket `public = false` with a 10 MB / photo+PDF limit | Critical | `[Manual]` — E2E only targets dev, so verify each environment with `supabase db query --linked "select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects'"` and `select public, file_size_limit, allowed_mime_types from storage.buckets where id='uploads'`. History: production had zero policies before migration `0052` (spec 0063); spec 0071 then replaced 0052's public-read rule. Migration history alone is not proof (CLAUDE.md). |
| A real file upload (e.g. Vaccinations "Scan Record") succeeds on a real production account | Critical | `[Manual]` — requires a real production account/file, outside what automated suites can safely simulate. Run 2026-08-30, pass, Lynn — confirmed after migration `0052` shipped. See spec 0063. |
| **Private uploads (spec 0071): each role opens exactly what it should** — owner and co-owner open the pet photo and its scanned documents; the pet's sitter opens the photo but not documents; a stranger opens neither and can't list the owner's folder; any signed-in user opens the stock demo photos in `shared/` | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` — runs in CI's `edge-functions` job against dev, with a throwaway owner/co-owner/sitter/stranger household per test. |
| Private uploads: a signed-out visitor gets nothing — no signed link, no listing, and old `/object/public/uploads/…` links no longer serve files | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` on dev; on staging/prod, open a pet photo's old public link in a private window after Phase 2 and confirm it fails. Add `?nocache=1` to the link, or wait about 2 hours, since the CDN can serve cached copies after the lock. Run on prod 2026-11-18: pass. |
| Private uploads: document links (`pet_documents`) can only be made by an owner, for a file in their own folder; sitters can't see links exist | High | `[Deno: supabase/tests/private_uploads.test.ts]` |
| Private uploads: the bucket refuses files over 10 MB and anything that isn't JPEG/PNG/WebP/GIF/PDF (including CSV) | High | `[Deno: supabase/tests/private_uploads.test.ts]` + `[Vitest: src/api/__tests__/storageClient.test.js]` for the in-app check (size checked before type; scan photos capped at 5 MB, the AI's image limit). |
| `ask-vet-assistant` refuses outside links, `..` paths, and files the caller can't open (another user's, or a document for a sitter), without calling the AI | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` |
| **AI scan file paths (spec 0082) AC1:** `ask-vet-assistant` only accepts a file path in the uploader's shape (`<folder>/<name>.<ext>`); `%2e%2e`, `..\`, `./`, double-encoded `%252e`, extra folders, leading/trailing slashes, any `%`, `?`, `#` or backslash get 400 `invalid_file`, without downloading or calling the AI. Real uploads with awkward extensions (`.rabies cert`, `.jpg-large`, `.résumé`) still pass the shape check | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` on dev |
| AI scan file paths (spec 0082) AC2: a stranger, a removed co-owner and a sitter asking to scan another person's document by its real path get 403 `forbidden_file` | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` on dev |
| AI scan file paths (spec 0082) AC3: an owner scanning a file they just uploaded, and a co-owner scanning a document linked to their pet, still work | High | `[Playwright]` the existing scan tests (AI stubbed) + `[Manual]` one real vaccine-photo scan on dev with a real AI answer |
| AI scan file paths (spec 0082) AC4: `ask-vet-assistant` downloads files with the caller's own access, never the service-role client (every `.storage` call is on `supabaseClient`), so storage's rules (migration 0054) also decide | Critical | `[Deno: supabase/tests/function_hygiene.test.ts]` in CI + code review |
| A photo added in Edit Pet saves as a private file and shows through a signed link; a photo over 10 MB or a non-photo file shows the approved message and uploads nothing | High | `[Playwright: private-storage.spec.js]` |
| The pet photo shows on every screen that has one: Pets, pet profile, Trends, Home summary card, Vet Report export, onboarding/Edit Pet identity field | High | `[Manual]` — all six use the shared `PetPhoto` component; the Playwright test covers the component on the profile. Check each screen once per environment after Phase 2, including a memorial pet (grayscale). |
| Co-owner sees the pet photo (coowner1@ on a test1@ pet) | High | `[Manual]` — `e2e/co-owner.spec.js` (spec 0072) now seeds a co-owner household with coowner1@, but doesn't check photos; the rule itself is covered by the Deno test above. |
| Scan Record: confirming keeps the scanned file, linked to the pet as a `vaccination` document; closing without confirming deletes the file | High | `[Playwright: vaccination-scan-review.spec.js]` — local only (that file is skipped in CI, spec 0067). |
| Bloodwork import and onboarding vaccine/medication scans: Save keeps and links the file (`bloodwork`/`vaccination`/`medication`), closing or failing deletes it; bloodwork's button no longer offers CSV | High | `[Manual]` — same shared `usePendingScan` helper as Scan Record. Check with `select kind, storage_path from pet_documents where pet_id = '…'` after each. |
| A scan photo over 5 MB shows "That photo is too large to scan. Try a smaller photo or a PDF." | Medium | `[Vitest: src/api/__tests__/storageClient.test.js]` + `[Manual]` once in the browser. |
| iPhone: picking a photo (pet photo and Scan Record) from the photo library uploads as JPEG, not HEIC | High | `[Manual]` on a real iPhone — HEIC is not on the allowed list; if Safari doesn't convert it, file a follow-up (spec 0071 flag 8). |
| Demo account: Maple and Cooper (stock photos) show on each environment | Medium | `[Manual]` — they load from that environment's own `shared/` folder (spec 0071). |
| **Pet photo must be your own upload (spec 0083 AC1, AC2, FR1, PA-73):** setting a pet's photo, on create or change, to another person's file (their document or photo), a path with `..`, an extra folder, a leading `/`, an empty name, an empty string, or anything outside `<your id>/<file>` and `shared/<file>` is refused, and the stranger still can't open the file; owners and co-owners can set their own upload, a `shared/` demo photo, or no photo; a co-owner can edit a pet whose photo another owner uploaded, and re-saving the unchanged photo is fine | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` on dev |
| Pet photo, percent-encoded paths (spec 0083, reviewer item): a photo path like `<own id>/..%2F<other id>%2Fscan.png` (also `%2e%2e%2f`, double-encoded `%252F`, `%5C`) is accepted by the database, because it has no real `/`, but stays harmless: stored literally, no signed link or download serves anything, and deleting that pet through Delete leaves the other person's file in place | High | `[Deno: supabase/tests/private_uploads.test.ts]` on dev (2026-11-24: all four saved, none opened or deleted anything) |
| **Shared photo kept (spec 0083 AC3, FR3):** deleting a sole-owner pet deletes its photo and scans unless another pet still uses that file as its photo or a scanned document; an unused one is still deleted; a lookup failure keeps every file and reports it | High | `[Deno: supabase/functions/delete-pet/index.test.ts]` on dev + `[Deno: supabase/tests/pet_photo.test.ts]` (shared helper, also used by `reset-sandbox-account`, which isn't run on dev because it wipes the demo account) |
| Deleting a pet removes its photo file and its document links | High | `[Deno: supabase/functions/delete-pet/index.test.ts]` (document *files* staying behind is punch list PA-14) |
| After Phase 2 on prod: Auggie's, Harper's and Tribble's photos still show | Critical | `[Manual]`, Lynn — the only real photos in the app (spec 0071 AC10). |

### 5.13 Device / Browser Compatibility — High (Beta gate requirement, §2.7)

| Case | Priority | Coverage |
|---|---|---|
| iOS Safari: manual install-banner path still works | High | `[Playwright: pwa-ios-safari.spec.js]` (desktop-emulated WebKit) + `[Manual]` on a real iOS device before Beta gate. |
| Android Chrome: PWA install path | High | `[Manual]` on a real Android device before Beta gate — no automated coverage of the Android path exists. |

**Coverage summary:** of the ~35 page routes and 8 major modal/sheet flows in the app, 19 Playwright spec files (~48 tests) give automated coverage to roughly a third of them, concentrated in Auth, Onboarding, core Daily Check-In, and the two public marketing pages. The largest gaps are: the full Catch-Up calendar/exceptions/bulk-apply logic, the co-owner check-in conflict dialog, both invite dialogs, Symptoms/Trends/Timeline, and every Settings destructive flow (Delete Account above all). These are exactly the `[Manual]` `Critical`/`High` cases listed above — closing them (turning `[Manual]` into `[Playwright: …]`) is the natural backlog this document now makes visible and trackable, per §6.

---

## 6. Keeping this current

- **Every new feature spec** (`docs/features/00NN_*`) must add its own `[Manual]` or `[Playwright: …]` test cases to the relevant §5 area in the same PR that ships the feature — the same discipline spec-writer already applies to Playwright tests for that one feature; this document is where they also get indexed for gate-tracking purposes.
- **Every new Playwright spec file** flips its corresponding case(s) here from `[Manual]` to `[Playwright: filename.spec.js]` in the same PR.
- **A `[Manual]` case that's been run** gets a one-line dated note appended (e.g. "Run 2026-08-19, pass, Lynn") rather than silently trusted — a stale "we checked this once" is exactly the trap Task 22's own note warns about.
- This file lives outside `docs/features/` (in `docs/testing/`) deliberately — it's not a single feature's spec, it's the cross-cutting index every feature spec feeds into, matching how `docs/foundation/` already holds cross-cutting, not per-feature, documents.

---

## 7. Performance Testing (placeholder — Launch Plan Task 26)

**Not built as of this spec.** Task 26 is Medium priority and explicitly non-blocking for the PWA/Alpha gate in the Launch Plan today, so this document does not invent a requirement that doesn't exist yet. Placeholder for when it's picked up:

- **Recommended approach (not yet decided/built):** Lighthouse CI as a new GitHub Actions job, with budgets on page-load performance for the highest-traffic pages (Home, Daily Check-In, Login) — flagged here so a future spec doesn't have to re-derive the option from scratch.
- **Becomes required, not placeholder, before:** the Release/App Store gate (§2.8) — native-wrapper performance (Capacitor) has a materially different risk profile than PWA web performance, so this should be scoped as its own spec once Beta approaches, not folded into this one.
