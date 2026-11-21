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
| Invite Co-Owner: self-invite and duplicate-invite both rejected with correct copy | High | `[Manual]` |
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

### 5.6 AI Assistant ("Ask Wysker") — Critical

| Case | Priority | Coverage |
|---|---|---|
| "Ask Wysker" reachable from a pet screen, screen name reaches the AI request | High | `[Playwright: ask-wysker-guardrails.spec.js]` |
| Disclaimer banner visible in both general and pet-scoped modes | Critical | `[Playwright: ask-wysker-guardrails.spec.js]` |
| Emergency-keyword hard-stop fires with no bypass, before any AI call | Critical | `[Playwright: ask-wysker-guardrails.spec.js]` |
| AI-flagged `urgent: true` backstop discards the AI's own answer in favor of the emergency notice | Critical | `[Manual]` — requires provoking a specific AI response shape; not practical to force deterministically in Playwright today. Flag as an Open Question in spec 0058 for whether a mocked-response test is worth building. |
| Rate-limited AI call shows the correct `aiErrorText()` copy, not a generic failure | High | `[Manual]` |
| **Adversarial/edge-case prompt set** (per Launch Plan Risk row 38 "AI Assistant quality concerns") | Critical | `[Manual, content TBD]` — content not yet decided (confirmed 2026-08-19, spec 0058 Open Question #1). Placeholder shape only: a dedicated prompt set run against the live AI, reviewed by Lynn for tone/safety per `src/lib/aiGuardrails.js`'s disclaimer and hard-stop rules. Revisit before this case can be marked closeable. |

### 5.7 Sitter / Co-Owner — High

**Which accounts to use (spec 0070):** `coowner1@`/`coowner2@` and `petsitter1@`/`petsitter2@wyskerwatch.com` are real inboxes with logins on all three environments (dev logins in `.env.playwright`). All are classified `test`, and so is test1–4@. Emails *sent by* a `test` account are silently dropped (`sendEmail.ts`), so: to check an invite **email** arrives and reads right, send the invite from a non-test account (e.g. Lynn's own login) to one of these inboxes; to check only that the invite **links** on login, any account can send it.

| Case | Priority | Coverage |
|---|---|---|
| Pet Sitter page reachable, all sits listed | High | `[Playwright: pet-sitter.spec.js]` |
| Wellbeing badges: 5 groups, correct direction labels, "no check-in yet" state, single-tap-only navigation | High | `[Playwright: pet-sitter.spec.js]` |
| A sitter who opens Edit Pet or Vet Report for a pet they only sit for sees "Only this pet's owners can do this." and no form or download (spec 0076, PA-28) | High | `[Playwright: pet-sitter.spec.js]` |
| Scan Record only offers the AI, and only matches lines to, pets the owner owns or co-owns, never a pet they only sit for; an owner who is also listed as a sitter on their own pet keeps full access to it (spec 0076, PA-28) | High | `[Vitest: src/lib/petsClient.test.js]` + `[Manual]` scan of a multi-pet invoice from an account that also sits for a friend's pet |
| Invite Sitter: blocked on demo accounts, self-invite/duplicate rejected | High | `[Manual]` |
| Invite Sitter: remove **does** show an "Are you sure?" confirm dialog | High | `[Playwright: invite-sitter.spec.js]` (spec 0073) |
| Invite Sitter: the invited-sitters list shows as soon as the dialog opens, and each remove button is at least 44px (spec 0073, PA-53/54) | High | `[Playwright: invite-sitter.spec.js]` |
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
| Edit Pet as a co-owner: the button reads **View Co-Owners**, the list is read-only ("Only the primary owner can add or remove co-owners."), with no email field or remove buttons | High | `[Playwright: co-owner.spec.js]` — local only: signs in as coowner1@, which CI has no secret for. |
| Invite Co-Owner: an invite the database refuses shows "We couldn't add that co-owner. Please try again." and the button works again | High | `[Playwright: co-owner.spec.js]` |
| Each environment's `pet_co_owners` policies match migration 0056: `pet_co_owners_insert_primary_owner`, `pet_co_owners_select_any_owner`, `pet_co_owners_delete_primary_owner`, and none of 0004's three | Critical | `[Manual]` — E2E and Deno only target dev. Run `select policyname from pg_policies where schemaname='public' and tablename='pet_co_owners'` on each project after pushing 0056. Run 2026-11-20, pass on dev, staging and prod (spec 0072 Build Note 6). |

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
| Client and Edge Function errors reach Sentry when `VITE_SENTRY_DSN`/`SENTRY_DSN` configured | High | `[Manual]` — no automated test checks delivery (Sentry is external; spec 0052). Edge Function side run 2026-10-23, pass, Lynn: all 3 environments, via a deliberate `invite-co-owner` error (spec 0066). Client side confirmed 2026-09-01 (spec 0065). |
| Sandbox/test/demo account errors are tagged and excluded from prod signal (**client side only**) | High | `[Manual]` — only `src/lib/errorMonitoring.js` filters by `account_type`. Edge Function errors are **not** filtered, so test-account backend errors do reach Sentry (confirmed 2026-10-23, spec 0066). |
| App still loads and navigates normally with no Sentry DSN configured | Medium | `[Playwright: error-monitoring.spec.js]` — the one Sentry behavior that file actually tests. |
| All 14 Edge Functions on dev/staging/prod match main, with `resend-webhook`'s JWT check off and the other 13 on | Critical | `[Manual]` — verify with `supabase functions list --project-ref <ref> -o json` per project (`updated_at`, `verify_jwt`). Run 2026-10-23, pass (spec 0066). |
| App Shell bottom nav / Menu tab navigation works from every page | High | `[Playwright: bottom-nav-menu-tab.spec.js]` |
| Each environment's `storage.objects` RLS policies match the spec-0071 set: `uploads_read_permitted` plus insert/update/delete own-folder-only, **no** `uploads_public_read`, and the `uploads` bucket `public = false` with a 10 MB / photo+PDF limit | Critical | `[Manual]` — E2E only targets dev, so verify each environment with `supabase db query --linked "select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects'"` and `select public, file_size_limit, allowed_mime_types from storage.buckets where id='uploads'`. History: production had zero policies before migration `0052` (spec 0063); spec 0071 then replaced 0052's public-read rule. Migration history alone is not proof (CLAUDE.md). |
| A real file upload (e.g. Vaccinations "Scan Record") succeeds on a real production account | Critical | `[Manual]` — requires a real production account/file, outside what automated suites can safely simulate. Run 2026-08-30, pass, Lynn — confirmed after migration `0052` shipped. See spec 0063. |
| **Private uploads (spec 0071): each role opens exactly what it should** — owner and co-owner open the pet photo and its scanned documents; the pet's sitter opens the photo but not documents; a stranger opens neither and can't list the owner's folder; any signed-in user opens the stock demo photos in `shared/` | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` — runs in CI's `edge-functions` job against dev, with a throwaway owner/co-owner/sitter/stranger household per test. |
| Private uploads: a signed-out visitor gets nothing — no signed link, no listing, and old `/object/public/uploads/…` links no longer serve files | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` on dev; on staging/prod, open a pet photo's old public link in a private window after Phase 2 and confirm it fails. Add `?nocache=1` to the link, or wait about 2 hours, since the CDN can serve cached copies after the lock. Run on prod 2026-11-18: pass. |
| Private uploads: document links (`pet_documents`) can only be made by an owner, for a file in their own folder; sitters can't see links exist | High | `[Deno: supabase/tests/private_uploads.test.ts]` |
| Private uploads: the bucket refuses files over 10 MB and anything that isn't JPEG/PNG/WebP/GIF/PDF (including CSV) | High | `[Deno: supabase/tests/private_uploads.test.ts]` + `[Vitest: src/api/__tests__/storageClient.test.js]` for the in-app check (size checked before type; scan photos capped at 5 MB, the AI's image limit). |
| `ask-vet-assistant` refuses outside links, `..` paths, and files the caller can't open (another user's, or a document for a sitter), without calling the AI | Critical | `[Deno: supabase/tests/private_uploads.test.ts]` |
| A photo added in Edit Pet saves as a private file and shows through a signed link; a photo over 10 MB or a non-photo file shows the approved message and uploads nothing | High | `[Playwright: private-storage.spec.js]` |
| The pet photo shows on every screen that has one: Pets, pet profile, Trends, Home summary card, Vet Report export, onboarding/Edit Pet identity field | High | `[Manual]` — all six use the shared `PetPhoto` component; the Playwright test covers the component on the profile. Check each screen once per environment after Phase 2, including a memorial pet (grayscale). |
| Co-owner sees the pet photo (coowner1@ on a test1@ pet) | High | `[Manual]` — `e2e/co-owner.spec.js` (spec 0072) now seeds a co-owner household with coowner1@, but doesn't check photos; the rule itself is covered by the Deno test above. |
| Scan Record: confirming keeps the scanned file, linked to the pet as a `vaccination` document; closing without confirming deletes the file | High | `[Playwright: vaccination-scan-review.spec.js]` — local only (that file is skipped in CI, spec 0067). |
| Bloodwork import and onboarding vaccine/medication scans: Save keeps and links the file (`bloodwork`/`vaccination`/`medication`), closing or failing deletes it; bloodwork's button no longer offers CSV | High | `[Manual]` — same shared `usePendingScan` helper as Scan Record. Check with `select kind, storage_path from pet_documents where pet_id = '…'` after each. |
| A scan photo over 5 MB shows "That photo is too large to scan. Try a smaller photo or a PDF." | Medium | `[Vitest: src/api/__tests__/storageClient.test.js]` + `[Manual]` once in the browser. |
| iPhone: picking a photo (pet photo and Scan Record) from the photo library uploads as JPEG, not HEIC | High | `[Manual]` on a real iPhone — HEIC is not on the allowed list; if Safari doesn't convert it, file a follow-up (spec 0071 flag 8). |
| Demo account: Maple and Cooper (stock photos) show on each environment | Medium | `[Manual]` — they load from that environment's own `shared/` folder (spec 0071). |
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
