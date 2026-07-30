# Wysker Watch — Product & Engineering Overview

*Compiled from `/docs/foundation/` and `/docs/features/`. Last updated: 2026-07-30.*

> **A note on the data model, since it's referenced everywhere below:** Wysker Watch retired three prior scoring systems (Wellness Score V1 0–100, Health Score V2 0–10, an equal-weight multi-select version). The current and only model: `daily_check_ins.status` is a subjective **Vibe** (`great`/`off`/`tough`/`skipped`, owner-reported) plus an unweighted **symptom count** (objective, direction-only: up/down/equal). The two signals never combine into a score. Any mention of a numeric score, ring, or Stable/Declining/Monitor label anywhere below is historical/retired, not current behavior.

---

## 1. Foundation

**Product Context** — Wysker Watch is a proactive health-management platform for cats and dogs, built around daily behavior-based observation rather than diagnosis. It unifies daily logs, medications, nutrition, weight, preventive care, vaccinations, lab results, and vet visits into one chronological health timeline per pet. Primary users are pet owners (especially those managing chronic conditions or focused on prevention); secondary users include multi-pet households, co-owners, sitters, and vets reviewing history. V1 scope explicitly excludes practice-management software, EMR, telemedicine, diagnostics, wearables, and multi-species support.

**Product Vision** — The mission is to help owners recognize meaningful changes early through simple, consistent observation, strengthening (never replacing) the owner–vet partnership. The core belief is that every pet has its own "normal," and that preserving a pet's full health story — not just medical records — leads to earlier intervention and better care. The five-year vision is to become the most trusted companion for proactive pet health, never becoming a diagnostic tool, a source of fear, or a burdensome system.

**Product Principles** — These are the durable decision filters for every feature: behavior over diagnosis, individual baselines first, longitudinal stories over isolated events, insight over raw data collection, and "log changes, not routines." A key principle (#6, "Missing Data Is Meaningful") requires the system to distinguish "nothing happened" from "nothing was logged" from "logging was intentionally skipped" — this directly shapes the Vibe/skip model. AI must support understanding but never diagnose. Decision tradeoffs favor simplicity over completeness and transparency over automation.

**UX Principles** — Define how the product should *feel*: effortless, calm, predictable, and respectful of the owner's time and attention. Interactions should assume real-life interruptions and missed days, never shame or guilt the owner, and communicate their purpose within three seconds. AI should explain and summarize, never diagnose or create panic. Tradeoffs favor usability over beauty, clarity over animation, and predictability over personalization.

**Design System** — Establishes a calm, premium, Oura-inspired visual language: a dark charcoal/sky-blue/teal palette, Inter typography, line-based icons (Phosphor/Lucide), rounded cards, generous spacing, and subtle motion. Explicitly notes that no current screen uses the "Metric Circle/Score Badge" pattern it originally described — those were retired along with the scoring model in favor of Vibe icons and direction chips. Accessibility (high contrast, 44px touch targets, never color-only) is mandatory, not optional.

**Technical Standards** — Frontend is React + Vite (plain JS/JSX, no TypeScript despite an earlier stated standard); backend is Supabase (Postgres, Auth, Storage, Edge Functions in TypeScript); AI runs through Claude via a Supabase Edge Function (`ask-vet-assistant`). Deployment is Cloudflare Workers with a manual, dashboard-only deploy gate — not Netlify/Vercel as an earlier version claimed. Mobile (Capacitor/native) is entirely unstarted; the app currently ships only as an installable PWA. Backend changes must be manually pushed to all three Supabase projects (dev/staging/prod), a step that has been missed before. Integration test coverage (Deno, CI-gated) currently exists only for `delete-pet`/`delete-account`.

**Data Model** — A relational, owner-scoped Postgres schema (24 tables) secured by a single shared RLS helper, `is_pet_owner()`. Central entities: `pets`, `daily_check_ins`/`observations` (the current check-in system), `pet_onboarding` (fixed-form baseline, actually used) vs. `pet_baselines` (generalized per-metric baseline, built but never populated), and a legacy `symptom_logs` table now scoped to exactly one remaining purpose — weight — since every other behavioral metric now flows through `observations`. `wellness_scores` is dead schema (kept for historical rows only, nothing reads/writes it). Newer tables (`email_logs`, `resend_webhook_events`, `email_suppressions`) support the transactional email system.

**Navigation & Information Architecture** — The app has exactly three bottom-nav destinations: **Home**, **Pets**, and **Menu** (account-level only). As of the 2026-07-28 App Shell refactor (spec 0023), every authenticated screen sits inside a persistent header (brand, global "Ask Wysker" AI action, notifications) plus the same bottom nav. Tapping a pet card on Home or Pets goes to **Trends**, never Pet Profile; Pet Profile is reached primarily by expanding a pet's card inline on Pets ("Show More"). The per-pet CareMenu hamburger, and Menu-nested Pet Sitter/AI directories, were all retired in that refactor — Pet Sitter is now a household-level page launched from Home, and AI is a global header action.

**Terminology** — Defines the product's vocabulary: Vibe, Symptom Count, Baseline (a pet's normal, currently meaning "yesterday" more than a stored `pet_baselines` row), Co-Owner (full-parity, shipped), Sitter (temporary, limited access). Explicitly flags "Health Score" as a retired term with no current or planned equivalent.

**UX Flow (reference diagram)** — Confirms tapping a pet's card on Home routes to Trends, and Pet Profile is instead reached via Pets → "Show More" (inline expansion, no navigation).

---

## 2. Features

### Onboarding & Pets
- **Add Pet** — Pet-creation flow: species, photo, name/breed/sex/altered status, flexible birth-date precision, microchip, conditional AKC fields for dogs. Excludes health setup. **Shipped.**
- **Pet Onboarding** — Post-Add-Pet, card-based wizard establishing initial behavioral baseline (health status, conditions, medications, "Normally {pet}..." questions). Auto-saves, resumable, editable later. **Shipped.**
- **Pets Feature Spec V3** — Active Pets / "Pets I Sit" (sitter-only) / Rainbow Bridge sections. Cards show Wellbeing attributes collapsed; "Show More" expands full Pet Profile inline. **Shipped.**
- **Pet Profile Feature V4** — Shared `PetProfileContent` component (inline on Pets, or standalone `/pet/:petId`): identity header, Vibe/Weight summary, stacked cards (Baseline, Conditions, Medications, Food, Vaccinations, Weight, Observations, Vet Report, Timeline, Health Records). Two-step, co-owner-aware Delete Pet. **Shipped.**
- **Pet Delete / Test / Demo Accounts V2** — Single-pet deletion with ownership-transfer for co-owned pets; internal Test accounts (allowlist, resettable, banner); Demo accounts (admin-resettable showcase data). **Implemented.**

### Daily Check-In & Trends
- **Daily Check-In, Vibe & Trends v5** — **Canonical spec** for the current data model: Vibe (Great/Off/Tough/Skipped) + objective 11-category symptom count, never blended. **Shipped**; ground truth per CLAUDE.md.
- **Daily Check-In V2** — Companion UX spec under the v5 model, superseded in authority by v5.
- **Home Feature Spec V2** — Greeting, notification bell, one Vibe-based Pet Summary Card + Check-In status per pet, Catch-Up reminders. **Shipped.**
- **Trends Feature Spec V5** — Per-pet Trends screen: Overview + Trends sub-tabs (Patterns/Compare are unbuilt placeholders). Raw symptom-count states only, never a score. **Shipped**; tap-to-detail and calendar/overflow menu **not implemented**.
- **Multi-Day Catch-Up Check-In** — Full-screen flow for backfilling 2+ missed days, defaults to Great Day, 6-month lookback cap. **Shipped** (2026-07-25).
- **Atomic Daily Check-In Writes** — Single atomic Postgres function replacing partially-failable multi-step writes. **Shipped.**
- **Catch-Up Exceptions Navigation Fix** — Auto-return to Calendar once flagged days resolve. **Shipped.**

### Navigation / App Shell
- **Navigation Refresh V2** — Original three-tab (Home/Pets/Menu) IA refactor. **Implemented** (partially superseded).
- **Menu Screen Specification** — User summary card, account rows, Sign Out / Delete Account flows, internal Seed/Reset tooling. **Implemented**, later simplified.
- **App Shell / Navigation IA Refactor (0023)** — 2026-07-28 restructuring: persistent header, global AI sheet, household-level Pet Sitter, retires per-pet CareMenu and Menu-nested Pet Sitter/AI/Insurance/Documents. **Shipped**, all 12 steps complete.

### Email & Notifications
- **Co-Owner Invitation Email V2** — Full-access co-owner invite via Supabase `generateLink()`/`verifyOtp()`. **Shipped.**
- **Email Send Feature V2** — Shared transactional email system (`sendEmail()`, Resend, branded layout). `welcome` template is dead code. **Shipped.**
- **Transactional Email requirements docs** (reply-to, suppression, security posture) — **Documentation of shipped work.**
- **Sitter Invite Email fix** — Fixed silent gap where invited sitters never got email + related access-linking bug. **Shipped**, all environments.
- **Resend Bounce/Delivery Webhook** — Signature-verified webhook recording delivery/bounce/complaint, auto-suppression. **Design finalized**, migration applied per later docs.
- **Branded Signup Confirmation Email** — Server-side account creation so signup email matches branded family. **Deployed and verified on prod** (2026-07-26).
- **Deliverability Warm-Up (0022)** — Monitoring runbook confirming DNS/SPF/DKIM/DMARC correct; sets checkpoint before tightening DMARC. **Approved, ongoing, no code changes.**

### Account & Data Management
- **User Profile & Timezone Settings** — Editable name, auto-detected timezone. **Shipped** (2026-07-06).
- **Account Deletion Edge Function** — Sole-owner pets cascade-delete; co-owned pets transfer ownership; Apple compliance requirement. **Implemented.**
- **`owner` Account Type requirements** — Four-value `account_type` model, excludes real personal account from destructive tooling. **Documentation-only.**
- **Demo Account Read-Only Enforcement** — Would have blocked demo-account writes. **Reverted** (2026-07-26) — demo accounts are writable again.
- **Database Backups requirements** — Nightly encrypted export to Cloudflare R2, manual restore drill. **Implemented** (2026-07-21); storage-bucket files remain unbacked-up (known gap).
- **Staging Missing Table Grants Fix** — Found/fixed staging-wide missing role grants. **Implemented** (2026-07-26), all environments.

### Testing / Infra
- **Cloudflare Deploy Config / Manual Deploy Gate requirements** — Document existing hosting and the deliberate manual gate. **Documentation only.**
- **Playwright E2E Testing (0024)** — Proposes first browser-driven E2E suite (Login, Add Pet, Daily Check-In, Vet Report, Pet Sitting) against dev, local/manual only. **Status: Draft — not yet built.**

### Analytics
- **Analytics Feature** — First-party event log + hourly rollup for DAU/funnel counts. **Implemented**, but `checkins_completed` has undercounted since 2026-07-13 (retired event names), and rollups blend prod/test/demo/owner usage.
- **Analytics Events & Rollup requirements** — Companion as-built catalog doc. **Documentation-only.**

### Other
- **PWA Feature** — Manifest + service worker, Android/Chromium install prompt, manual iOS banner, offline banner. **Implemented**; no install nudge on Firefox/non-Safari iOS.
- **Vet Export** — On-demand clinic-ready PDF via Edge Function. **Implemented**, but "Wellness Overview" section reads from the dead `wellness_scores` table and shows "no data" for essentially all pets — open product decision. Email-to-vet and photo-inclusion enhancements unbuilt.

---

## Cross-cutting themes worth flagging

- **Scoring is fully retired** — any Score/ring/Stable-Declining-Monitor reference is stale, three iterations back.
- **Backend changes require manual triple-deployment** (dev/staging/prod) — missed before, caused real staging outages.
- **Most "requirements-*" docs document already-shipped work**, not new build specs.
- **Demo Account Read-Only Enforcement shipped and was reverted the same week.**
- **Playwright E2E (0024) is the one clearly not-yet-built item** — everything else is shipped, documentation, or in a finalized design/monitoring stage.
