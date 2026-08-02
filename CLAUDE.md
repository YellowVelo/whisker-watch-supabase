# CLAUDE.md — Wysker Watch

This file is read automatically at the start of every Claude Code session in this repo. Keep it short — it's an index, not a copy of the docs themselves.

## Start here
Read `/docs/foundation/Product Context.md` first, every session, before doing anything else.

## Current data model — read before touching scoring/check-in logic
`/docs/features/0012_DailyCheckIn_Vibe_Trends_Specification_v5.md` is the canonical source for all Vibe/scoring/check-in logic. The app has retired three prior scoring systems (Wellness Score V1, Health Score V2, and an equal-weight multi-select version) — if any other file, doc, or piece of code appears to reference a 0–100 score, a 0–10 Health Score, or Stable/Declining/Monitor labels, treat it as outdated and check this spec first.

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
- `src/lib/checkin/{scoring,config,chipLabels,checkinClient}.js` — current Vibe/symptom-count logic
- `src/components/catchup/` (`CatchUpFlow.jsx`, `BulkApplySheet.jsx`) — multi-day Catch-Up Check-In UI (2+ missed days), see `0015_MultiDay_CatchUp_CheckIn_Specification_v1.md`. The single-day "catch up yesterday" flow still lives in `DailyCheckInSheet.jsx`/`DailyCheckInModal.jsx`, unchanged.
- `src/components/{BottomSheet,ConfirmDeleteDialog,IconButton,ListRow,PillToggle}.jsx` — shared primitives from spec 0025's de-duplication pass. Check here before hand-rolling a new bottom sheet/pill-toggle/back-button/delete-confirmation/nav-row — 5+ separate copies of these existed before 2026-07-31.
- `e2e/` — Playwright E2E suite (`npm run test:e2e`), local-only (not wired into CI), always targets `wysker-watch-dev` via `.env.playwright` (gitignored; see `.env.playwright.example`). See `0024_Playwright_E2E_Testing_Specification_v1.md`.
- Deployed on Cloudflare Workers (`wrangler.jsonc`). A manual-deploy gate exists in the Cloudflare dashboard — not represented in-repo config. **Frontend deploys are done manually by Lynn, not Claude.**
- Three separate Supabase projects exist: `Whisker-Watch` (prod), `wysker-watch-dev` (local dev), `wysker-watch-staging`. Local `.env` points at `wysker-watch-dev` — confirmed 2026-07-21, see `.env.example`. This corrects an earlier, stale version of this file that claimed local dev and prod shared one project. **Backend changes (migrations, Edge Functions) should be pushed to all three projects as part of shipping — this is manual, not automated, and has been missed before (see `0006 Technical Standards.md` §11).**
- CI (`.github/workflows/ci.yml`) runs lint/vitest/build + Edge Function integration tests, required on `main` via branch protection as of 2026-07-24 — note: this gates PR merges; an account with bypass permission can still push directly without CI blocking it (see `docs/launch-punch-list.md` P0).

## Working conventions
- This is a READ-ONLY exploration by default. Do not edit, create, or delete files unless the task explicitly asks for changes, or Plan Mode has been used and the plan approved first.
- When asked to review or audit, always compare docs against actual code/git history — do not rely on doc content alone, since docs have historically lagged fast-moving code changes here (4 scoring-model iterations shipped in 8 days).
- Foundation and confirmed-current feature docs are trustworthy. Everything in `/review-features` is not, until checked.
- Use the `spec-writer` skill for new features/changes/fixes before implementing; use `doc-updater` after a change lands to keep docs in sync. Both are project skills under `.claude/skills/`.
- Run the `design-system-check` skill after writing or editing any page/component `.jsx` file — don't wait to be asked. It audits the changed files against `/docs/foundation/0005 Design System.md` (emoji-as-icon, serif fonts, raw colors, sub-13px text, sub-44px touch targets, hand-rolled duplicates of `BottomSheet`/`PillToggle`/`IconButton`/`ListRow`/`ConfirmDeleteDialog`, etc.) and reports findings before the turn ends. This doc has drifted from shipped code before (spec 0028 found 6+ violations in one pass) — catch it per-change, not in a big retroactive sweep.
