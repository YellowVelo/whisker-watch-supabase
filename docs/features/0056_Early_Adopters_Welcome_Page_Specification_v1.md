# 0056_Early_Adopters_Welcome_Page_Specification_v1

**Status:** Shipped — migration 0050 + early-adopter-signup live on dev/staging/prod; Test Plan (Deno + Playwright) written and passing
**Date:** 2026-08-15
**Related files:** `src/App.jsx`, `src/pages/EarlyAdopters.jsx`, `src/pages/BetaSignup.jsx` (closest precedent, contrast below), `src/components/AuthLayout.jsx`, `supabase/functions/beta-signup/index.ts` (structural precedent), `supabase/functions/early-adopter-signup/index.ts`, `supabase/migrations/0047_signup_consent.sql` (consent-recording precedent), `supabase/migrations/0048_beta_signups.sql` (table pattern precedent), `supabase/migrations/0050_early_adopters.sql`, `supabase/functions/_shared/email/sendEmail.ts`, `supabase/functions/_shared/email/templates/early-adopter-confirmation.ts`, `docs/foundation/0005 Design System.md`, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`

## Before You Approve This

- **This is not the same as `/beta`.** `/beta` (spec 0053) screens people to become active testers of a rough, unfinished app right now — 4 qualifying questions, low volume, reviewed personally by Lynn. This page is the opposite audience: general social traffic who aren't testers, just want to be told when the real thing ships. Mixing them into one table would corrupt both, so they're separate tables (`beta_signups` vs `early_adopters`).
- **No dedicated admin review page, confirmed with Lynn.** She reads/exports this list directly via the Supabase dashboard, same access she already uses across all three Wysker Watch projects.
- **No duplicate or conflicting functionality found.** Confirmed no existing waitlist/early-adopter table or page anywhere in the codebase.
- **Correction from the draft:** the draft of this spec guessed this page fulfills Launch Plan task 65 ("Watch List / signup campaign"). That was wrong — confirmed with Lynn that "Early Adopters" (this page, pre-PWA-launch) and "Watch List" (a separate, later, pre-App-Store-phase list, not built yet) are two different things on two different timelines. Task 65 is the Watch List and is **not** this spec; do not conflate them later.
- **No conflict with CLAUDE.md's locked Vibe/scoring model** — copy stays silent on internal mechanics, same rule `/beta` already follows.
- **Build/deploy split:** this spec was fully written (migration, Edge Function, email template, page, route) in a Cowork session. Cowork's sandbox doesn't have the Supabase CLI or a confirmed Playwright install, and pushing schema changes to live projects isn't appropriate from an ephemeral session anyway — so the code was done but **not yet pushed to any Supabase project, not deployed, and not tested.** That was CC's half: push migration `0050` to all three projects (dev/staging/prod), deploy `early-adopter-signup`, and run the Test Plan below before considering this done.
  - **Update 2026-08-15 (CC):** migration `0050` and the `early-adopter-signup` function are now deployed to all three projects (`wysker-watch-dev`, `wysker-watch-staging`, `Whisker-Watch` prod). The Deno integration tests (`supabase/functions/early-adopter-signup/index.test.ts`) and Playwright e2e tests (`e2e/early-adopters.spec.js`) described in the Test Plan below are written and passing against dev.

## Functional Requirements

1. **Public welcome page**, no account or login needed, reachable at `/early-adopters`. Leads with the problem Wysker Watch solves, not a signup pitch — written for someone arriving fresh from a social post, not someone who already knows the product.
2. **Early Adopters capture form**: first name, email, and a required consent checkbox reading "Yes! I'm Adopting Early" with a plain-language line next to it ("you'll get an email invite the moment Wysker Watch is ready to sign up") so the fun label doesn't leave anyone unsure what they agreed to. Unchecked by default.
3. **Confirmation email** sent immediately after signup, thanking them and telling them they'll hear from Lynn when it's time to sign up for real — adjusted from `/beta`'s confirmation copy to not imply they're becoming a tester.
4. **Abuse protection**, same standard as `/beta`: rate-limited by email and IP (3/email, 20/IP per hour), gated behind Cloudflare Turnstile.
5. **Data lands in its own table** (`early_adopters`), separate from `beta_signups`, with an `invited_at` field Lynn can set later to track who's gotten the launch invite.

## Acceptance Criteria

1. **Given** a visitor with no account, **when** they open `/early-adopters` on a phone, **then** they see problem/solution copy and the capture form, with no mention of Vibe/check-in/symptom mechanics and no implication they're signing up to test anything.
2. **Given** a visitor fills in first name + email but leaves the consent checkbox unchecked, **when** they try to submit, **then** submission is blocked with an inline message and nothing is stored.
3. **Given** a visitor fills in all fields correctly and passes the CAPTCHA, **when** they submit, **then** a row is stored with their name, email, and a consent timestamp, they see an on-page thank-you, and a confirmation email arrives.
4. **Given** an invalid or empty email, **when** they try to submit, **then** they see an inline validation error and nothing is stored.
5. **Given** the same email or IP submits repeatedly beyond the configured limit, **when** they try again, **then** the request is rejected with a generic "try again later" message.
6. **Given** a visitor fails or skips the CAPTCHA, **when** they try to submit, **then** the submission is rejected and nothing is stored.

## Test Plan

- AC1 → Playwright test loads `/early-adopters` at mobile viewport, asserts problem/solution copy present, asserts none of "Vibe", "Great", "Off day", "Tough day", "symptom count", or "beta"/"testing" appear in rendered text.
- AC2 (consent required) → Playwright test fills name+email, leaves checkbox unchecked, asserts submit stays disabled and no network call fires.
- AC3 (full flow) → Playwright test completes the flow with a fixed test email (Turnstile always-pass test key), asserts on-page thank-you. Row-write proof: no admin page to read it back through the app, so this is verified via a direct Supabase query in the test setup/teardown against the linked dev project — new test infrastructure, no existing precedent in `e2e/` for this. Confirmation email delivery is checked manually after deploy, same posture as `/beta`'s AC3.
- AC4 → Playwright test submits invalid/empty email, asserts inline error, nothing stored.
- AC5 → Two tests, reusing `/beta`'s exact pattern: a Deno integration test (`supabase/functions/early-adopter-signup/index.test.ts`, structured like `beta-signup/index.test.ts`) against the real rate-limit RPC, plus a Playwright test mocking a 429 to check the UI message.
- AC6 → Playwright test mocks a failed/missing Turnstile token, asserts rejection and no thank-you shown.
- **Seeding/access constraints:** AC3's direct-table read is new test infrastructure this spec needs (see above) — not reused from an existing pattern.

## Visual Reference

No mockup provided. Layout follows `/beta`'s established structure (hero → problem → solution → capture card), copy adjusted per Functional Requirements above, capture form simplified to 3 fields instead of a multi-step screener.

## Technical Spec

- **Schema:** `supabase/migrations/0050_early_adopters.sql` — `early_adopters` table: `id`, `first_name`, `email`, `consented_at` (not null, set at insert), `invited_at` (nullable, for Lynn to mark later), `created_at`. RLS enabled, no policies (service-role-only, matching `email_logs`/`rate_limit_hits` pattern). No admin-gated policy, per the confirmed no-admin-page decision.
- **Components/files touched:**
  - `src/pages/EarlyAdopters.jsx` (new) — the public page.
  - `src/App.jsx` — `/early-adopters` added to the existing unauthenticated route group alongside `/beta`, `/login`.
- **API / Edge Function:** `supabase/functions/early-adopter-signup/index.ts` (new), structured identically to `beta-signup/index.ts`: scoped CORS, service-role client, Turnstile verification before rate limiting, `check_and_record_rate_limits` (3/email, 20/IP, 1-hour window), insert into `early_adopters`, best-effort confirmation email via the new `early-adopter-confirmation` template (registered in `_shared/email/templates/index.ts`), sent from `Lynn @ Wysker Watch <support@wyskerwatch.com>`.
- **Design System compliance:** Checked against the 2026-07-30 Amendments and re-checked post-write via the `design-system-check` skill's mechanical greps (emoji, serif residue, glass-card, raw status color, sub-13px type, sub-44px touch targets) — all clean. Reuses `Button`'s compliant `default`/`outline` variants, `bg-card`/`border-border` card tokens, the existing `Checkbox`/`Label`/`Input` components (same 44px-min pattern as `Register.jsx`), Inter-only type. No new component patterns introduced. One soft, non-blocking spacing note: a couple `space-y-5` (20px) gaps fall outside the documented 4/8/12/16/24/32 scale, but this directly mirrors already-shipped spacing in `BetaSignup.jsx`, not a new deviation.
- **Constraints from CLAUDE.md:** Respected — no Vibe/scoring/check-in references in copy. Frontend deploy stays manual (Lynn promotes in Cloudflare). No AI-generated imagery used or planned for this page — text-only, consistent with the hard rule in CLAUDE.md's Launch planning section.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None. `/beta` and `/register` are both confirmed distinct in purpose.
- **Technical debt nearby:** None found.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** None — see the correction above re: Launch Plan task 65 (that's the separate, later Watch List, not this).

## Non-Goals

- No admin review UI for this list.
- No double opt-in / confirm-your-email step — single checkbox + timestamp.
- No automated sending of the actual launch invite — this spec only captures the list; sending invites at launch is a separate, later action.
- No changes to `/beta`, `/register`, or any existing flow.
- No Watch List (pre-App-Store phase) — separate, future spec.

## Open Questions

None remaining — URL (`/early-adopters`), no-admin decision, and consent copy were all confirmed in chat before/during the build.
