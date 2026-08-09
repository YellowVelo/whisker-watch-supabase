# CLAUDE.md — Wysker Watch

This file is read automatically at the start of every Claude Code session in this repo. Keep it short — it's an index, not a copy of the docs themselves.

## Start here
Read `/docs/foundation/Product Context.md` first, every session, before doing anything else.

## Current data model — read before touching scoring/check-in logic
`/docs/features/0012_DailyCheckIn_Vibe_Trends_Specification_v5.md` is the canonical source for all Vibe/scoring/check-in logic. This model is stable and settled — the prior iterations (Wellness Score V1, Health Score V2, an equal-weight multi-select version) are retired history, not an ongoing concern. If any other file, doc, or piece of code appears to reference a 0–100 score, a 0–10 Health Score, or Stable/Declining/Monitor labels, treat it as outdated and check this spec first.

Current model in one line: `daily_check_ins.status` is `great` / `off` / `tough` / `skipped` (Vibe, subjective, owner-reported) plus an unweighted symptom count (objective, direction-only). The two signals never inform each other.

## Doc folder structure
- `/docs/foundation/` — Product Context, Vision, Principles, UX Principles, Design System, Technical Standards, Data Model, Navigation & IA, Terminology. Cross-cutting, locked. Safe to treat as ground truth.
- `/docs/features/` — feature-specific specs confirmed current against the codebase. Safe to build against.
- `/docs/review-features/` and `/docs/archive/` — both folders have been removed from the repo to avoid confusion. You will no longer find them in /docs. This is intentional.

## Key architecture
- `src/api/entities.js` — entity CRUD
- `src/api/storageClient.js` — file uploads
- `src/api/aiClient.js` + `supabase/functions/ask-vet-assistant` — AI features via Anthropic API through a Supabase Edge Function
- `src/lib/aiGuardrails.js` — shared AI safety guardrails (spec 0041): emergency-keyword hard-stop, the `urgent`-flag backstop, and the disclaimer text every AI-facing prompt must use. Check here before writing a new AI-facing prompt or disclaimer — 3 near-duplicate copies existed before 2026-08-02.
- `src/lib/checkin/{scoring,config,chipLabels,checkinClient}.js` — current Vibe/symptom-count logic. `checkinClient.js`'s `markGreatDay`/`markOffTough` support opt-in co-owner conflict detection (spec 0043, migration 0046) via an `expectedUpdatedAt` param — check here before adding a new single-day check-in save path so it doesn't silently skip this.
- `src/components/catchup/` (`CatchUpFlow.jsx`, `BulkApplySheet.jsx`) — multi-day Catch-Up Check-In UI (2+ missed days), see `0015_MultiDay_CatchUp_CheckIn_Specification_v1.md`. The single-day "catch up yesterday" flow still lives in `DailyCheckInSheet.jsx`/`DailyCheckInModal.jsx`, unchanged.
- `src/components/{BottomSheet,ConfirmDeleteDialog,IconButton,ListRow,PillToggle}.jsx` — shared primitives from spec 0025's de-duplication pass. Check here before hand-rolling a new bottom sheet/pill-toggle/back-button/delete-confirmation/nav-row — 5+ separate copies of these existed before 2026-07-31.
- `src/hooks/useFocusTrap.js` — shared keyboard focus-trap + Escape-to-close hook (spec 0045), used by `BottomSheet.jsx` and the full-screen overlays `CatchUpFlow.jsx`/`OnboardingShell.jsx`. Check here before adding a new modal/full-screen overlay so it doesn't silently ship without a focus trap the way `CatchUpFlow`/`OnboardingShell` originally did.
- `src/lib/pendingOAuthConsent.js` — sessionStorage handoff for state that needs to survive a Google OAuth full-page redirect (spec 0047: the signup-consent checkbox answer, read back by `AuthContext.jsx` once a fresh session exists). Check here before adding new state that needs to persist across an OAuth redirect, rather than inventing a new one-off sessionStorage key.
- `e2e/` — Playwright E2E suite (`npm run test:e2e`), local-only (not wired into CI), always targets `wysker-watch-dev` via `.env.playwright` (gitignored; see `.env.playwright.example`). See `0024_Playwright_E2E_Testing_Specification_v1.md`.
- `e2e/fixtures.js` — shared Playwright test helpers (`dismissAnyOpenSheet`, `waitForOnboardingStep`). Check here before hand-rolling a new step-transition wait or sheet-dismissal pattern in a new e2e spec — the same "Step N of 6" wait was silently duplicated across 3 spec files before spec 0046 consolidated it.
- Deployed on Cloudflare Workers (`wrangler.jsonc`). Deploy pipeline: push to the tracked branch → Cloudflare's git-integration build → Lynn manually promotes the build to production in the Cloudflare dashboard — push alone does not deploy. `npm run deploy` (`wrangler deploy`) exists locally but is a separate command, not part of this shipped pipeline. **Frontend deploys are done manually by Lynn, not Claude.**
- Three separate Supabase projects exist for the app itself: `Whisker-Watch` (prod), `wysker-watch-dev` (local dev), `wysker-watch-staging`. Local `.env` points at `wysker-watch-dev` — confirmed 2026-07-21, see `.env.example`. This corrects an earlier, stale version of this file that claimed local dev and prod shared one project. **Backend changes (migrations, Edge Functions) should be pushed to all three projects as part of shipping — this is manual, not automated, and has been missed before (see `0006 Technical Standards.md` §11).** A 4th Supabase project, `wysker-watch-restore-scratch`, also exists but is not part of the app's deploy targets — it's a disposable scratch database the quarterly automated restore drill wipes and rebuilds every run (spec `0048`); never push migrations or app data to it.
- CI (`.github/workflows/ci.yml`) runs lint/typecheck/vitest/build + Edge Function integration tests, required on `main` via branch protection as of 2026-07-24 — note: this gates PR merges; an account with bypass permission can still push directly without CI blocking it (see `docs/launch-punch-list.md` P0). `typecheck` was added 2026-08-04 (spec `0044`) after clearing 308 pre-existing errors — see `0006 Technical Standards.md` for the frontend's `checkJs`-based approach.
- **Backups:** Nightly `pg_dump` → R2 (`db-backup.yml`, spec pre-0048) covers the database. A separate nightly job, `storage-backup.yml` (spec `0049`), syncs the `uploads` Supabase Storage bucket (pet photos, document scans) into a *different* dedicated R2 bucket (`whisker-watch-storage-backups`) — additive-only, production only. Check `docs/features/requirements-database-backups.md` before assuming either backup covers something it doesn't; the two are separate systems with separate credentials.

## Working conventions
- This is a READ-ONLY exploration by default. Do not edit, create, or delete files unless the task explicitly asks for changes, or Plan Mode has been used and the plan approved first.
- When asked to review or audit, always compare docs against actual code/git history — do not rely on doc content alone, since docs have occasionally lagged shipped code here.
- Foundation and confirmed-current feature docs are trustworthy. Everything in `/review-features` is not, until checked.
- Use the `spec-writer` skill for new features/changes/fixes before implementing; use `doc-updater` after a change lands to keep docs in sync. Both are project skills under `.claude/skills/`.
- Run the `design-system-check` skill after writing or editing any page/component `.jsx` file — don't wait to be asked. It audits the changed files against `/docs/foundation/0005 Design System.md` (emoji-as-icon, serif fonts, raw colors, sub-13px text, sub-44px touch targets, hand-rolled duplicates of `BottomSheet`/`PillToggle`/`IconButton`/`ListRow`/`ConfirmDeleteDialog`, etc.) and reports findings before the turn ends. This doc has drifted from shipped code before (spec 0028 found 6+ violations in one pass) — catch it per-change, not in a big retroactive sweep.
