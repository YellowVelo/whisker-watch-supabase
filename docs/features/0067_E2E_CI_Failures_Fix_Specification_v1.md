# 0067_E2E_CI_Failures_Fix_Specification_v1

**Status:** Approved (2026-10-21) — not yet built
**Date:** 2026-10-21
**Related files:** `src/components/Turnstile.jsx`, `e2e/beta-signup.spec.js`, `e2e/early-adopters.spec.js`, `e2e/pet-sitter.spec.js`, `e2e/vaccination-due-reminders.spec.js`, `.github/workflows/ci.yml`, `docs/testing/QA_Test_Plan.md`

## Before You Approve This

1. **The e2e CI job has never passed — not once since it was added on 2026-08-15.** CLAUDE.md and the e2e-trial memory say it was due to become a required check after 2026-09-03. It never was, which was lucky: it would have blocked every PR. This spec gets it green but does **not** make it required — that's a separate decision, best made after a few green runs.
2. **Two steps need Lynn because they involve passwords:** adding the test4@ login to GitHub, and re-entering the test3@ login there. Claude does not enter passwords into GitHub.
3. **The 3 vaccination-reminder tests will show as "skipped" on GitHub** (Lynn's decision, 2026-10-21). They only protect us when run locally.
4. **One real page change:** the CAPTCHA box reserves its space from the start. It's a shared component, so it also affects the Early Adopters page. Visitors see a ~65px empty gap for a second until the box loads, instead of the Submit button jumping.
5. **Spec number:** 0067 was also used by an abandoned spec on closed PR #19 (branch `claude/cranky-ptolemy-795759`). That never reached main, so the number is free here, but the two could be confused in GitHub history.
6. **Not covered:** intermittent failures seen occasionally on main (check-in history on 09-01; bottom nav, home cards, pet editing on 08-19).

## Functional Requirements

- On the beta signup page, the Submit button never moves when the CAPTCHA finishes, so a tap always lands where the visitor aimed.
- The e2e check on GitHub finishes with no failures. Tests that can't run on GitHub say "skipped," never "passed."
- Every test checks the page as it actually looks today.

## Acceptance Criteria

1. **Given** a visitor has filled in the beta form, **when** the CAPTCHA finishes its check, **then** the Submit button stays in exactly the same position.
2. **Given** the beta form with an invalid email, **when** the visitor clicks Submit after the CAPTCHA finishes, **then** "Please enter a valid email address." appears and nothing is saved.
3. **Given** the Early Adopters page's current, approved copy, **when** its test runs, **then** it checks the headings that actually exist ("Another pet tracking app? Nah.", "What we're building", "Want to know the moment it's ready?") and no longer looks for the removed "Sound familiar?".
4. **Given** GitHub has the test4@ login, **when** the Pet Sitter tests run on GitHub, **then** all 5 pass.
5. **Given** GitHub has a correct test3@ login, **when** the beta admin test (AC6 in `beta-signup.spec.js`) runs on GitHub, **then** it passes.
6. **Given** the tests are running on GitHub, **when** the 3 vaccination-reminder tests come up, **then** they're marked skipped, with a note saying they need a local run.
7. **Given** the tests are running locally with the CLI linked to dev, **when** the vaccination-reminder tests come up, **then** they run and pass as they do today.
8. **Given** all of the above, **when** the full e2e check runs on a PR, **then** it ends with 0 failures.

## Test Plan

- AC1 → new Playwright check in `beta-signup.spec.js`: record Submit's position before and after the CAPTCHA token arrives, and assert it didn't move.
- AC2 → existing beta tests AC3, AC4 and AC9, updated to wait until Submit is enabled before clicking.
- AC3 → updated AC1 test in `early-adopters.spec.js`.
- AC4, AC5 → existing tests, confirmed in a GitHub run once Lynn adds the logins. No code change for AC5.
- AC6 → the CI run shows those 3 tests as skipped. AC7 → a local run of `vaccination-due-reminders.spec.js`.
- AC8 → a full CI run on the PR.
- **Existing order dependency (flagged, not fixed):** the beta admin test relies on an earlier test in the same file having created an `e2e-scratch-` signup. True today, and it works because `playwright.config.js` runs tests one at a time (`workers: 1`).
- **Seeding/access constraints:** none new. The vaccination tests keep their existing local-only CLI seeding.
- New cases get added to `docs/testing/QA_Test_Plan.md` in the same change.

## Visual Reference

None provided. The only visual change is the reserved CAPTCHA space (AC1).

## Technical Spec

- **`src/components/Turnstile.jsx`:** give the widget container a minimum height of 65px (Cloudflare's standard widget height), so the space is reserved before the widget renders.
- **`e2e/beta-signup.spec.js`:** in the 3 submit tests, wait until Submit is enabled before clicking. Add the AC1 position check.
- **`e2e/early-adopters.spec.js`:** replace the removed "Sound familiar?" heading assertion with the current h1.
- **`e2e/vaccination-due-reminders.spec.js`:** skip when running on GitHub (`process.env.CI` is set), with a clear reason.
- **`.github/workflows/ci.yml`:** pass `PLAYWRIGHT_TEST4_SITTER_EMAIL` / `PLAYWRIGHT_TEST4_SITTER_PASSWORD` to the e2e job. Lynn creates those two GitHub secrets and re-enters `PLAYWRIGHT_TEST3_ADMIN_EMAIL` / `PLAYWRIGHT_TEST3_ADMIN_PASSWORD`.
- **Schema:** no changes.
- **Design System compliance:** the only UI change is a height reserve on the Turnstile container — no color, type, icon or touch-target changes. The `design-system-check` skill runs on it as part of the build.
- **Constraints from CLAUDE.md / locked decisions:** no conflicts. CLAUDE.md's e2e-trial note (non-blocking "through 2026-09-03") is stale and gets updated by `doc-updater` afterwards.

## Repo Findings & Risks

- **Root causes (investigated 2026-10-21):**
  - *Beta form (AC3/AC4/AC9):* Submit stays disabled until the CAPTCHA token arrives. When it arrives, the widget appears and pushes Submit down 69px. Playwright clicks the instant Submit enables, at its old position, and misses. Reproduced locally. A replay that waited one second after Submit enabled submitted correctly and showed the expected error. Broke on 2026-08-21 with the single-step form rewrite (`795fa16`).
  - *Early Adopters (AC1):* the "Sound familiar?" heading was removed in the 2026-08-15 brand-voice rewrite (`4821525`); the test was never updated.
  - *Pet Sitter:* the e2e job never receives `PLAYWRIGHT_TEST4_*` (the secrets don't exist in GitHub, and `ci.yml` doesn't pass them), so the sitter-invite insert fails with a null `sitter_email`. The other 4 tests in that file are skipped behind it.
  - *Vaccination reminders:* the tests call `supabase db query --linked`, and the CI machine has no linked project ("Cannot find project ref").
  - *Beta admin (AC6):* passes locally and fails on GitHub right after logging in as test3@. This strongly indicates the GitHub-stored test3@ login is wrong or stale. Secret values can't be read, so it isn't proven.
- **Duplicate/overlapping functionality:** none found.
- **Technical debt nearby:** the e2e job ran for two months without anyone noticing it never passed.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** the abandoned PR #19/#20 work (a dev-only guard for the vaccination test's `--linked` call, and cleanup on failure) is related but not part of this spec.

## Non-Goals

- Making e2e a required check.
- Fixing the intermittent failures.
- Redoing the abandoned PR #19/#20 work.

## Open Questions

None.
