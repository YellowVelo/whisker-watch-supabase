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

Exception (spec 0075, migration 0058): a record's `created_by` → `auth.users` is `ON DELETE SET NULL`, so deleting an account never erases what that person entered on a shared pet. New record tables follow this.

4. Edge Function Standards

General Rules

All backend logic lives in Edge Functions

Functions must require authentication

Secrets must be stored in Supabase’s encrypted secret store

AI Function (ask-vet-assistant)

Must validate session before processing

Must branch on file type (image vs PDF)

Must never expose API keys to the client

Accepts only the 8 named tasks (spec 0080); never a prompt, schema or file link from the browser. The server writes the instructions and loads pet data with the caller's own access.

Limits: 20 requests per 10 minutes plus 100 per person per day (migration 0060). Replies answered without the AI don't count, except scan files found missing, the wrong type or too large after the limit check. One Sentry warning per person per day at the cap.

Error Handling

Return structured JSON errors

Never leak stack traces to the client

5. Storage Standards

Bucket Structure

uploads/{userId}/... (plus shared/ for the stock demo photos)

Private bucket, restricted write (spec 0071). Files are shown only through short-lived signed links (src/api/storageClient.js getSignedUrls/getSignedUrl, 1 hour). Store the file's path (e.g. pets.photo_path, pet_documents.storage_path), never a link. Who may open a file is defined by the storage read rule uploads_read_permitted (migration 0054): your own folder; shared/; a pet's photo for its owners, co-owners and sitters; a scanned document for its owners and co-owners only. Edge Functions never fetch a caller-supplied URL. A function that reads a file on a user's behalf (ask-vet-assistant) downloads it with the caller's own client, so this rule also decides, and accepts only paths in the uploader's shape (<folder>/<name>.<ext>; spec 0082). Only server housekeeping (moving or deleting files for account and pet deletion, backups) uses the service role. Known gap: the pet-photo part of this rule trusts pets.photo_path, which anyone can set on their own pet. Punch list PA-73 (P0).

Making a file private or deleting it does not remove copies the CDN already holds. They can keep loading for over an hour (seen on prod, spec 0071). If something must disappear immediately, the cache needs clearing too.

File Types

Images: JPEG/PNG/WebP/GIF — up to 10 MB; up to 5 MB when sent to the AI for scanning (the AI's own image limit)

Documents: PDF — up to 10 MB

Enforced twice: by the bucket itself (file_size_limit, allowed_mime_types) and by checkUploadFile() in storageClient.js, which shows the approved message before anything uploads.

Naming

Files are named `{userId}/{timestamp}-{random}.{ext}` by `uploadFile()`. Never build a path by hand.

Avoid user‑provided names

6. Authentication Standards

Auth Provider

Supabase Auth (email/password + magic link + Google OAuth)

Google sign-in is switched off for now (spec 0076, PA-20): the provider isn't enabled in Supabase, so the button is hidden. Turn it back on with `GOOGLE_SIGN_IN_ENABLED` in `src/lib/authProviders.js` after enabling Google on all 3 projects.

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

As of 2026-07-31, this covers `delete-pet`/`delete-account` (14 Deno integration tests as of 2026-11-21: delete-account 8, delete-pet 6, plus the database tests in `supabase/tests/`) and `resend-webhook` (11 Deno integration tests, `supabase/functions/resend-webhook/index.test.ts`) — all run against real `wysker-watch-dev` data via `.github/workflows/ci.yml`, required on `main`. The resend-webhook suite needed one extra secret beyond the others' pattern: its one suppression-round-trip test calls `send-email`/`clear-email-suppression` with a service_role bearer token, and those functions' auth check needs a legacy-JWT-format credential (a decodable `role` claim) rather than the newer opaque `sb_secret_...` key used elsewhere in CI — wired in as the `DEV_LEGACY_JWT_SECRET` GitHub secret. Not yet extended to other Edge Functions beyond these three.

Test database migrations

Browser/E2E Tests

As of 2026-07-31, a Playwright suite (`e2e/*.spec.js`, run via `npm run test:e2e`) covers Login, Add Pet, Daily Check-In, Vet Report generation, and Pet Sitter navigation against real `wysker-watch-dev` data, using a saved session (`e2e/global-setup.js`) rather than re-logging-in per test. As of 2026-08-15, also runs in CI on every PR/push to main via a dedicated `e2e` job (see `0055_E2E_CI_Integration_Specification_v1.md`) — still non-blocking (`continue-on-error`), not a required merge gate like the `frontend`/`edge-functions` jobs. Its 3-week trial ended 2026-09-03 without a single green run, so it was never made required; spec 0067 (2026-11-14) fixed the CI-specific failures, and making it required is a separate, pending decision. "Test daily check‑in flow" under Manual QA below is now partially automated by this suite.

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

**Edge Function versions and startup check (added 2026-11-21, spec 0075).** Every `npm:`/`jsr:` import in an Edge Function names an exact version. An unpinned `@sentry/deno` picked up 11.16.0 on deploy and crashed `sign-up` on staging and prod for 22 hours (01:11–23:12 UTC), and no test noticed. Followed everywhere since spec 0078 (PA-62: `supabase-js@2.119.2`, `@std/encoding@1.0.11`, `@sentry/deno@11.15.0`), and enforced in CI by `supabase/tests/function_hygiene.test.ts`, which fails on any import without an exact `x.y.z`. After any function deploy, run `bash scripts/check-functions-start.sh https://<project-ref>.supabase.co` for that project. It sends every function folder an `OPTIONS` request and expects 200 **plus** the `x-deno-execution-id` header. A bare 200 isn't proof, because other Supabase layers answer some `OPTIONS` requests without running any function (found in spec 0078). A 500/503 with `WORKER_ERROR` means the function crashed on startup. `.github/workflows/function-health.yml` runs the same script hourly on dev, staging and prod, though GitHub may start it late (PA-63). It proves each function *starts*, not that it works. A local run doesn't prove a version is safe, because Supabase runs an older Deno (`supabase-edge-runtime-1.79.1`, compatible with Deno 2.1.4) than a current local install.

**Database function permissions (added 2026-11-22, spec 0077).** Since migration `0059`, a new function in `public` can't be run by logged-out (`anon`) or signed-in (`authenticated`) users unless its migration grants it on purpose. A helper that RLS rules call as the user needs `grant execute on function … to authenticated` (never `anon`). A function only Edge Functions call needs only `service_role`. Revoking from `public` alone is not enough: Supabase grants `anon`/`authenticated` separately, and that gap is how PA-05 happened. Migration history doesn't prove permissions match across projects (0066 missed it), so after pushing any migration that adds or changes a function, run this on **each** project and compare. No row may show `anon=` or a bare `=X/` (everyone), and the `postgres`/`public` default-privileges row must not list `anon` or `authenticated`:

```sql
select p.proname, p.proacl::text acl, coalesce(array_to_string(p.proconfig, ','), '-') cfg
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;

select coalesce(defaclnamespace::regnamespace::text, 'ALL') schema, defaclacl::text acl
from pg_default_acl where defaclrole = 'postgres'::regrole and defaclobjtype = 'f';
```

`supabase/tests/function_permissions.test.ts` checks every function's group on dev in CI. When you add a function, add it to that file's lists and to the right group in migration `0059`'s pattern.

**Supabase Auth → Redirect URLs (dashboard, not in the repo)** (added 2026-11-21, spec 0074). Supabase only sends people back to addresses on each project's Authentication → URL Configuration → Redirect URLs list. Anything missing silently falls back to the Site URL (Home), with no error anywhere. On 2026-11-21, prod's list was found missing `/reset-password` (most likely dropped when it was rewritten on 2026-07-26, spec 0021), so reset links landed signed in on Home instead of Set New Password. Every project must list every address below, on its own app domain:

| Address | Used by |
|---|---|
| `/` (the Site URL) | Google sign-in, `Login.jsx` / `Register.jsx` (button hidden while Google is off, spec 0076; keep this address listed) |
| `/reset-password` | Forgot Password, `ForgotPassword.jsx` |
| `/verify-email` | Signup confirmation, `sign-up` function |
| `/accept-invite` | Co-owner and sitter invites, `invite-co-owner` / `invite-sitter` |

Domains: prod is the bare `https://wyskerwatch.com` plus `https://www.wyskerwatch.com`; dev is `http://localhost:5173`; staging uses its own address. Prod lists no `localhost` and no broad wildcards (spec 0069). **Rule:** any new `redirectTo` in code is added to this table and to all three dashboards in the same change. `supabase/tests/password_reset_redirect.test.ts` checks `/reset-password` on dev in CI; run it by hand against staging/prod with that project's keys and `RESET_REDIRECT_BASE`.

**Auth emails go through Supabase's custom SMTP, not `sendEmail.ts`** (added 2026-11-21, spec 0074). Password-reset emails are sent by Supabase Auth itself, through Resend's SMTP (`smtp.resend.com`, sender `Wysker Watch <no-reply@wyskerwatch.com>`, one Resend API key per project), on all three projects. Before 2026-11-21, prod used Supabase's built-in mailer, which only delivers to Supabase team members. The Reset Password template in each dashboard is a rendered copy of `supabase/functions/_shared/email/templates/password-reset.ts` (via `layout.ts`, link `{{ .ConfirmationURL }}`); change both together. The app's test-account email suppression doesn't apply to these emails.

**Spec 0080 deploy order and type check (added 2026-11-24).** Migration `0060` must be on a project before `ask-vet-assistant` is deployed there, or every AI request is refused (503). CI now runs `deno check --node-modules-dir=none` on every function and test; keep it at 0 errors.

**Per-function deploy settings live in `supabase/config.toml`** (added 2026-10-19, spec 0066). Today that's only resend-webhook's `verify_jwt = false`. Always pass `--project-ref` explicitly rather than relying on the linked project. Spec 0066 found the CLI linked to prod during routine work.

**Migration history intentionally diverges between projects.** `0003`, `0007`, and `0027` contain one-time inserts of real personal pet data tied to specific production `user_id`s — they were deliberately never run on `wysker-watch-dev`/`wysker-watch-staging` and are reconciled there via `supabase migration repair --status applied` (marks them resolved without executing their SQL) rather than run. If `supabase db push` on dev/staging ever refuses with "Found local migration files to be inserted before the last migration," check whether the blocking file is one of these three (or a similar prod-only data migration) before reaching for `--include-all` — that flag would actually try to run them.

Frontend

Use Vite build

Deploy to **Cloudflare Workers** (`wrangler.jsonc`) — not Netlify/Vercel, which this document previously said. Pushing to the tracked branch triggers Cloudflare's git-integration build; Lynn then manually promotes that build to production in the Cloudflare dashboard — push alone does not deploy. `npm run deploy`/`wrangler deploy` exists locally but is not part of this pipeline.

Mobile

Not yet built — see §1 and §7. Nothing to deploy through App Store / Play Store pipelines until Capacitor wrapping exists.

Summary

These technical standards ensure Wysker Watch is stable, secure, maintainable, and ready to scale. They provide a shared foundation for all engineering work and guarantee that every feature aligns with the product’s long‑term vision.