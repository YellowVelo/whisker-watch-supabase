Technical Standards

Purpose

These standards define how Wysker Watch is engineered. They ensure reliability, maintainability, security, and consistency across the entire system—from frontend to backend to AI integrations.

Wysker Watch is built for long-term stability and rapid iteration. These standards serve as the foundation for every engineer and AI agent contributing to the codebase.

1. Architecture Overview

Wysker Watch uses a modern, modular architecture:

Frontend: React + Vite

Backend: Supabase (Postgres, Auth, Storage, Edge Functions)

AI: Claude via Supabase Edge Functions

Deployment: Cloudflare Workers (`wrangler.jsonc`). Pushing to the tracked branch triggers Cloudflare's git-integration build; a manual promotion step in the Cloudflare dashboard (performed by Lynn) then ships that build to production — push alone does not deploy. `npm run deploy`/`wrangler deploy` exists locally but is not part of this pipeline. **not** Netlify/Vercel (§11 previously said otherwise)

Mobile: **not yet built.** A Capacitor wrapper for iOS/Android is planned (see §7) but entirely unstarted, and it's the single largest blocker standing between this app and either app store — there are no `ios`/`android` folders and no `capacitor.config` anywhere in the repo. Treat every claim in this document about Capacitor/native behavior as target architecture, not current state.

Version Control: GitHub

Principles

Keep frontend thin and declarative

Keep backend logic in Edge Functions

Keep database schema clean, relational, and RLS‑secured

2. Code Standards

Languages & Frameworks

TypeScript for all backend code (Supabase Edge Functions — this is consistently followed). **The frontend uses a lighter-weight form of this standard**: there is no `tsconfig.json` and `src/` is still `.js`/`.jsx` (one stray `.ts` utility file exists, `src/utils/index.ts`), but `jsconfig.json` enables TypeScript's `checkJs` mode — type-checking driven by JSDoc annotations rather than full `.ts` conversion — and `npm run typecheck` runs as a required CI check on every merge to `main` as of 2026-08-04 (spec `0044`, 308 pre-existing errors fixed to reach zero). Full `.ts`/`.tsx` conversion has not been adopted; if that's still a real goal, it hasn't started — but "no type-checking at all" is no longer accurate.

React with functional components and hooks

Supabase JS SDK for data access

Style Guidelines

Use ESLint + Prettier

Prefer pure functions

Avoid side effects in UI components

Use descriptive variable names (e.g., petId, not id)

**Found 2026-07-31, spec 0028:** a shared clickable row/card component (`ListRow.jsx`) rendered as a `<Link>` (an `<a>` tag) with a `w-full` class but no explicit `display` — since anchors default to `display: inline`, and `width: 100%` has no effect on inline elements, every row silently shrink-wrapped to its own content width instead of stretching, with no error or warning. When building a shared component that can render as different tags (`<Link>`/`<button>`/`<div>`) to get one full-width, consistently-sized result across all of them, set `display` explicitly (e.g. `block`) rather than relying on each tag's own default — `<a>`, `<button>`, and `<div>` don't all default to the same one.

Folder Structure

src/
  api/
  components/
  hooks/
  pages/
  lib/
  styles/

3. Data Access Standards

Supabase Client Usage

All data access goes through entityClient.js and entities.js

Exception: `src/lib/checkin/checkinClient.js` calls `supabase.rpc(...)` directly (e.g. `save_daily_check_ins`, migration `0034`, spec `0016`, 2026-07-25) for atomic multi-statement writes that `entityClient.js`'s generic per-table CRUD wrapper can't express — a stored Postgres function, not a table, so there's no per-table wrapper to route it through. Same data-access-layer rationale as this file's existing direct read calls: `checkinClient.js` is itself a data-access layer, not a UI component, so this doesn't violate "never call Supabase directly inside UI components" below.

Never call Supabase directly inside UI components

Always handle errors explicitly

Row Level Security (RLS)

Every table must enforce owner‑scoped RLS

Policies must use auth.uid()

No table should allow anonymous access

Foreign Keys

All relationships must use real foreign keys

Use ON DELETE CASCADE consistently

4. Edge Function Standards

General Rules

All backend logic lives in Edge Functions

Functions must require authentication

Secrets must be stored in Supabase’s encrypted secret store

AI Function (ask-vet-assistant)

Must validate session before processing

Must branch on file type (image vs PDF)

Must never expose API keys to the client

Error Handling

Return structured JSON errors

Never leak stack traces to the client

5. Storage Standards

Bucket Structure

uploads/{userId}/...

Public read, restricted write

File Types

Images: JPG/PNG

Documents: PDF

Naming

Use UUIDs for filenames

Avoid user‑provided names

6. Authentication Standards

Auth Provider

Supabase Auth (email/password + magic link + Google OAuth)

Rules

Require email confirmation

Never store passwords client‑side

Use context provider (AuthContext.jsx) for session state

7. Mobile Standards (Capacitor) — target architecture, not yet built (see §1)

The app currently ships as an installable PWA (`vite-plugin-pwa`, iOS/Chromium install banners) — a real, shipped alternative to native wrapping, not documented elsewhere in this file. Everything below this line is planned, not current.

Native Plugins

Notifications

File system

Camera

Guidelines

Keep native code minimal

Use Capacitor APIs instead of platform‑specific code

8. Performance Standards

Frontend

Use React Suspense for async boundaries

Lazy‑load heavy components

Avoid unnecessary re-renders

Backend

Use indexed queries

Avoid N+1 queries

Cache AI results when possible

9. Security Standards

Data Protection

Enforce RLS on all tables

Store secrets only in Supabase

Never log sensitive data

API Security

Validate all inputs

Reject unauthenticated requests

Use HTTPS everywhere

10. Testing Standards

Unit Tests

Test pure functions

Test entity clients

Integration Tests

Test Edge Functions

As of 2026-07-31, this covers `delete-pet`/`delete-account` (8 Deno integration tests) and `resend-webhook` (11 Deno integration tests, `supabase/functions/resend-webhook/index.test.ts`) — all run against real `wysker-watch-dev` data via `.github/workflows/ci.yml`, required on `main`. The resend-webhook suite needed one extra secret beyond the others' pattern: its one suppression-round-trip test calls `send-email`/`clear-email-suppression` with a service_role bearer token, and those functions' auth check needs a legacy-JWT-format credential (a decodable `role` claim) rather than the newer opaque `sb_secret_...` key used elsewhere in CI — wired in as the `DEV_LEGACY_JWT_SECRET` GitHub secret. Not yet extended to other Edge Functions beyond these three.

Test database migrations

Browser/E2E Tests

As of 2026-07-31, a Playwright suite (`e2e/*.spec.js`, run via `npm run test:e2e`) covers Login, Add Pet, Daily Check-In, Vet Report generation, and Pet Sitter navigation against real `wysker-watch-dev` data, using a saved session (`e2e/global-setup.js`) rather than re-logging-in per test. Local/manual-only for now — not wired into CI (see `0024_Playwright_E2E_Testing_Specification_v1.md`). "Test daily check‑in flow" under Manual QA below is now partially automated by this suite.

Manual QA

Test daily check‑in flow

Test multi‑pet logging

Test AI document extraction

11. Deployment Standards

Supabase

Deploy migrations via CLI

Deploy Edge Functions via CLI

**Corrected 2026-07-21** — this section previously said local dev and production shared one Supabase project. That was already false: three separate projects exist for the app (`Whisker-Watch` prod, `wysker-watch-dev`, `wysker-watch-staging`), and local `.env` points at `wysker-watch-dev` (confirmed via `supabase projects list`/`api-keys` and `.env.example`, which documents which project each deploy target should use). No deploy pipeline currently wires `wysker-watch-staging` to a branch/environment automatically — that project exists but isn't yet integrated into the build process.

**Added 2026-08-09** — a 4th Supabase project, `wysker-watch-restore-scratch`, exists solely as the target for the automated quarterly database restore drill (`.github/workflows/db-restore-test.yml`, see `docs/features/0048_Automated_Quarterly_Restore_Drill_Specification_v1.md`). It is not a deploy target — never run `supabase db push` or deploy Edge Functions to it. The restore drill wipes and rebuilds its `public` schema and `auth.users` from scratch on every run, so treat anything in it as disposable.

**Convention (not automated, easy to miss):** every migration and Edge Function deploy should be pushed to all three projects — dev, staging, and prod — as part of shipping a change, not left on dev alone. This is manual (`supabase link --project-ref <ref>` then `db push`/`functions deploy`, repeated per project) and has been missed before (2026-07-25/26: two specs shipped to dev only, staging and prod caught up a day later once the gap was noticed).

**Migration history intentionally diverges between projects.** `0003`, `0007`, and `0027` contain one-time inserts of real personal pet data tied to specific production `user_id`s — they were deliberately never run on `wysker-watch-dev`/`wysker-watch-staging` and are reconciled there via `supabase migration repair --status applied` (marks them resolved without executing their SQL) rather than run. If `supabase db push` on dev/staging ever refuses with "Found local migration files to be inserted before the last migration," check whether the blocking file is one of these three (or a similar prod-only data migration) before reaching for `--include-all` — that flag would actually try to run them.

Frontend

Use Vite build

Deploy to **Cloudflare Workers** (`wrangler.jsonc`) — not Netlify/Vercel, which this document previously said. Pushing to the tracked branch triggers Cloudflare's git-integration build; Lynn then manually promotes that build to production in the Cloudflare dashboard — push alone does not deploy. `npm run deploy`/`wrangler deploy` exists locally but is not part of this pipeline.

Mobile

Not yet built — see §1 and §7. Nothing to deploy through App Store / Play Store pipelines until Capacitor wrapping exists.

Summary

These technical standards ensure Wysker Watch is stable, secure, maintainable, and ready to scale. They provide a shared foundation for all engineering work and guarantee that every feature aligns with the product’s long‑term vision.