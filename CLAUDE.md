# CLAUDE.md — Wysker Watch

This file is read automatically at the start of every Claude Code session in this repo. Keep it short — it's an index, not a copy of the docs themselves.

## Start here
Read `/docs/foundation/Product Context.md` first, every session, before doing anything else.

## Current data model — read before touching scoring/check-in logic
`/docs/features/0012_DailyCheckIn_Vibe_Trends_Specification_v5.md` is the canonical source for all Vibe/scoring/check-in logic. (A byte-identical `.txt` copy also exists under `/docs/Archive/` — that copy is a leftover duplicate, not a separate source; always use the `.md` one in `/docs/features/`.) The app has retired three prior scoring systems (Wellness Score V1, Health Score V2, and an equal-weight multi-select version) — if any other file, doc, or piece of code appears to reference a 0–100 score, a 0–10 Health Score, or Stable/Declining/Monitor labels, treat it as outdated and check this spec first.

Current model in one line: `daily_check_ins.status` is `great` / `off` / `tough` / `skipped` (Vibe, subjective, owner-reported) plus an unweighted symptom count (objective, direction-only). The two signals never inform each other.

## Doc folder structure
- `/docs/foundation/` — Product Context, Vision, Principles, UX Principles, Design System, Technical Standards, Data Model, Navigation & IA, Terminology. Cross-cutting, locked. Safe to treat as ground truth.
- `/docs/features/` — feature-specific specs confirmed current against the codebase. Safe to build against.
- `/docs/review-features/` and `/docs/archive/` — both folders have been removed from the repo to avoid confusion. You will no longer find them in /docs. This is intentional.

## Key architecture
- `src/api/entities.js` — entity CRUD
- `src/api/storageClient.js` — file uploads
- `src/api/aiClient.js` + `supabase/functions/ask-vet-assistant` — AI features via Anthropic API through a Supabase Edge Function
- `src/lib/checkin/{scoring,config,chipLabels,checkinClient}.js` — current Vibe/symptom-count logic
- Deployed on Cloudflare Workers (`wrangler.jsonc`). A manual-deploy gate exists in the Cloudflare dashboard — not represented in-repo config.
- Local dev and production currently share the same Supabase project (known issue, tracked in `docs/launch-punch-list.md` P0 — do not assume separate environments).

## Working conventions
- This is a READ-ONLY exploration by default. Do not edit, create, or delete files unless the task explicitly asks for changes, or Plan Mode has been used and the plan approved first.
- When asked to review or audit, always compare docs against actual code/git history — do not rely on doc content alone, since docs have historically lagged fast-moving code changes here (4 scoring-model iterations shipped in 8 days).
- Foundation and confirmed-current feature docs are trustworthy. Everything in `/review-features` is not, until checked.
