# Wysker Watch — QA Test Plan & Exit Criteria

**Status:** Approved (2026-08-19), one open item — see spec [0058](../features/0058_QA_Test_Plan_And_Exit_Criteria_Specification_v1.md)'s Open Questions #1 (adversarial AI prompt-set content not yet decided)
**Established by:** spec 0058, fulfilling Launch Plan Task 22 ("QA test plan defined per area"), Task 23 ("Regression testing"), Task 25 ("Accessibility pass"), Task 26 ("Performance pass")
**This is a living document.** Every new feature spec must add its test cases here in the same PR that ships the feature — see "Keeping this current" at the bottom. A test plan that lags the app is worse than none, because it lies about coverage.

---

## 1. How to read this document

Each test case is tagged:

- **`[Playwright: file.spec.js]`** — already automated, runs in CI on every PR/push. "Passing" means that file is green in the CI `e2e` job.
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
| Sign in with Google (OAuth) completes and lands logged in | Critical | `[Manual]` — Given a registered Google account, When "Continue with Google" is clicked and consent granted, Then the user lands on Home signed in. (OAuth automation is explicitly out of scope for Playwright per spec 0024 — stays manual.) |
| Wrong password shows a generic, non-enumerating error | High | `[Manual]` |
| Unconfirmed-email login shows inline "Resend confirmation email" with a 60s cooldown | Medium | `[Manual]` |
| Demo account login triggers a full sandbox reset before landing on Home | High | `[Manual]` — Given a demo-type account, When login succeeds, Then a "Setting up your demo…" state appears and resolves to a freshly-seeded scenario. |
| `/register`: password mismatch and <8-char password are blocked client-side before any network call | High | `[Manual]` |
| `/register`: successful signup shows "check your email" state | Critical | `[Manual]` |
| `/forgot-password`: submitting a non-existent email still shows the same success copy (enumeration-safe) | High | `[Manual]` |
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
| Pet Conditions page: category search + save persists | High | `[Playwright: pet-edit-conditions.spec.js]` |
| Retired `/pet/:petId` and `/pet/:petId/profile` routes still resolve (redirect to `/pets?highlight=`) | Medium | `[Manual]` — regression case for old bookmarks/links. |
| Invite Co-Owner: blocked entirely on demo accounts | High | `[Manual]` |
| Invite Co-Owner: self-invite and duplicate-invite both rejected with correct copy | High | `[Manual]` |
| Invite Co-Owner: remove has **no** confirm dialog (delete fires immediately) | High | `[Manual]` — confirm this asymmetry with sitter-remove (5.9) is intentional, not a bug. |
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

| Case | Priority | Coverage |
|---|---|---|
| Pet Sitter page reachable, all sits listed | High | `[Playwright: pet-sitter.spec.js]` |
| Wellbeing badges: 5 groups, correct direction labels, "no check-in yet" state, single-tap-only navigation | High | `[Playwright: pet-sitter.spec.js]` |
| Invite Sitter: blocked on demo accounts, self-invite/duplicate rejected | High | `[Manual]` |
| Invite Sitter: remove **does** show an "Are you sure?" confirm dialog | High | `[Manual]` — confirm asymmetry with co-owner-remove (5.3) is intentional. |

### 5.8 Account / Settings — Critical (destructive flows)

| Case | Priority | Coverage |
|---|---|---|
| Profile: Save is disabled unless a field is dirty | Medium | `[Manual]` |
| Profile: edits survive a background auth-token refresh (deliberately does not resync mid-edit) | High | `[Manual]` — a real edge case worth verifying stays true. |
| Profile: Timezone "return to automatic detection" link appears only after a manual change | Medium | `[Manual]` |
| Settings: Sign Out requires confirm, failure shows toast not a block | Medium | `[Manual]` |
| **Delete Account: two-step type-"DELETE"-to-confirm actually deletes** | Critical | `[Manual]` — Given a test account with one solely-owned pet and one co-owned pet, When Delete Account is completed, Then the solely-owned pet is deleted and the co-owned pet's ownership transfers rather than being deleted. This is the single highest-blast-radius flow in the app and has zero automated coverage today. |
| Reset Test/Demo Account tools only appear for internal account types | High | `[Manual]` |
| Notifications: vaccination-due "View"/"Update" wording matches stage, Snooze 7 Days hides the item | High | `[Playwright: vaccination-due-reminders.spec.js]` |
| Notifications: empty state | Low | `[Manual]` |
| PWA "Install App" row persists correctly across navigation | Medium | `[Playwright: pwa-install-prompt.spec.js]` |
| Preferences placeholder renders without crashing | Low | `[Manual]` |

### 5.9 Legal / Support — Medium

| Case | Priority | Coverage |
|---|---|---|
| Support FAQ: accordion items expand/collapse independently | Medium | `[Playwright: support-faq.spec.js]` |
| Support: "Email support" mailto link targets the correct address | Medium | `[Playwright: support-faq.spec.js]` |
| Privacy/Terms: section list navigates to each detail page | Low | `[Manual]` |
| About page renders and Back works | Low | `[Manual]` |

### 5.10 Admin — High

| Case | Priority | Coverage |
|---|---|---|
| `/admin/beta-signups` lists all signups with correct badges | Medium | `[Manual]` |
| Mark Reviewed toggles per row | Medium | `[Manual]` |
| **A non-admin account is actually blocked from `/admin/beta-signups`** | High | `[Manual]` — no test today confirms `AdminRoute` actually rejects a non-admin; this is the only admin-gated route in the app (per CLAUDE.md) and its access control has never been independently verified end-to-end. |

### 5.11 Public Marketing Pages — Critical (first-touch, no auth)

| Case | Priority | Coverage |
|---|---|---|
| `/beta`: email → screener transition, no page nav, submit disabled until all 4 answered + CAPTCHA present | Critical | `[Playwright: beta-signup.spec.js]` |
| `/beta`: invalid email rejected inline | High | `[Playwright: beta-signup.spec.js]` |
| `/early-adopters`: submit disabled until consent + CAPTCHA, invalid email rejected inline | Critical | `[Playwright: early-adopters.spec.js]` |
| Both public forms: hero copy avoids internal-mechanics language (brand-voice check) | Medium | `[Playwright: beta-signup.spec.js, early-adopters.spec.js]` |

### 5.12 Cross-cutting / Error Monitoring — High

| Case | Priority | Coverage |
|---|---|---|
| Client and Edge Function errors reach Sentry when `VITE_SENTRY_DSN`/`SENTRY_DSN` configured | High | `[Playwright: error-monitoring.spec.js]` |
| Sandbox/test/demo account errors are tagged and excluded from prod signal | High | `[Playwright: error-monitoring.spec.js]` |
| App Shell bottom nav / Menu tab navigation works from every page | High | `[Playwright: bottom-nav-menu-tab.spec.js]` |

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
