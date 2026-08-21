# 0053_Beta_Signup_Landing_Page_and_Screener_Specification_v2

**Status:** Draft — amends v1 (shipped 2026-08-11, verified against code 2026-08-18) after Lynn reviewed the live page and asked for a brand-voice copy rewrite and a simpler signup flow. v1 is deleted; this file supersedes it, per this repo's existing convention for amending a shipped spec (e.g. `0012_DailyCheckIn_Vibe_Trends_Specification_v5.md`) — a new version number replaces the old file rather than the two coexisting.
**Date:** 2026-08-19
**Related files:** Same as v1 (`src/App.jsx`, `src/components/AuthLayout.jsx`, `src/pages/Login.jsx`/`Register.jsx`, `src/lib/AuthContext.jsx`, `src/components/ProtectedRoute.jsx`, `src/api/entities.js`, `supabase/functions/sign-up/*`, `e2e/ask-wysker-guardrails.spec.js`, `supabase/functions/_shared/*`, relevant migrations, `docs/foundation/0005 Design System.md`), plus the files this amendment actually touches:
- `src/pages/BetaSignup.jsx` (already partially edited — hero copy — this amendment finishes the flow change)
- `e2e/beta-signup.spec.js` (tests need rewriting to match the new flow)

## Before You Approve This

- **No backend changes at all.** The `beta-signup` Edge Function, the `beta_signups` table, CAPTCHA, rate limiting, and the confirmation email are all untouched — this is a frontend-only restructuring of how a visitor reaches the same one submission.
- **The live page's automated test (`e2e/beta-signup.spec.js`) is currently broken**, independent of this amendment — it checks for headings ("The Problem," "The Solution") that the copy rewrite already removed from the code. This amendment fixes that as part of rewriting the flow tests, not a separate cleanup step.
- **This significantly simplifies the page** — v1's two-step flow (email box → screener appears after submitting that) and this amendment's one-trigger flow (button reveals the whole form at once) both still exist as concepts in v1's copy doc language ("shown after email signup, or as a short form" — the doc's own notes left this ambiguous). This amendment resolves that ambiguity in favor of the simpler reading, confirmed directly with Lynn across several rounds of back-and-forth after she saw the live page and it didn't match what she'd pictured.
- **No Design System conflicts** — same components/tokens as v1, just reorganized into fewer visible states.

## What changed from v1 (the actual delta)

**Copy (already implemented directly in code per Lynn's dictation, not drafted by me):** The old hero ("Finally know if your pet is actually doing better...") plus separate "The Problem"/"The Solution"/"Who it's for" sections are replaced by one voice-driven block:

> Another pet health tracker?
> We know. We rolled our eyes too.
>
> So we built Wysker Watch.
>
> It's for people who know exactly how many bites of breakfast their cat left behind, can hear a suspicious noise from three rooms away, and have absolutely Googled something unhinged at 2:13 AM.
>
> You know your pet.
>
> We're building something that makes all that paying attention actually useful — without turning you into their unpaid medical records department.

This also removes v1's leaked "Great day, Off day, Tough one" phrasing (Vibe-model language that shouldn't have been public-facing) and the "you're guessing" framing Lynn flagged as reading as scary/anxiety-inducing — both align better with CLAUDE.md's locked brand-voice rule (compassionate first, sarcasm aimed at the owner's own anxious habits, never at the pet's health).

**Flow (not yet implemented — what this amendment scopes):**
- **v1:** Landing page shows hero + a visible box containing an email-only field and its own "Get Early Access" heading/paragraph. Submitting that reveals a second box with the 4 screener questions, submitted separately.
- **v2:** Landing page shows only the pitch copy and a single "Get Early Access" button — no email field, no questions, no box visible at all. Clicking that button reveals, in place on the same page (no navigation, no new URL), one form with the email field **and** all 4 questions together. One Submit, one network call — same `beta-signup` payload shape as today.

Confirmed explicitly with Lynn: same URL throughout (`/beta`), not a separate route — an earlier idea of a distinct `/beta/apply` page was considered and explicitly rejected in favor of keeping this a same-page reveal.

## Functional Requirements (supersedes v1 §1-2)

1. **Public pitch page.** `/beta`, reachable with no account/login. Shows the hero copy above, and nothing else pitch-related — no separate Problem/Solution/Who-it's-for sections (folded into the hero block itself).
2. **Single-trigger combined form.** One "Get Early Access" button. Clicking it reveals, in place, one form containing: the email field and all 4 screener questions (condition status, current tracking method, open-text frustration, comfort with a rough beta) — visible together, not gated behind a separate email-only step. Submitting stores the email and all 4 answers together via the existing `beta-signup` Edge Function and shows an on-page thank-you message.

*(Functional Requirements 3-5 from v1 — confirmation email, admin review page, abuse protection — are unchanged and carry forward as-is.)*

## Acceptance Criteria (supersedes v1 AC1, AC2, AC4; AC3/AC5-9 carry forward with minor wording adjustment)

1. **Given** a visitor with no account, **when** they open `/beta` on a phone, **then** they see the new hero copy and a single "Get Early Access" button — no email field, no questions, no old Problem/Solution/Who-it's-for headings, and nothing mentioning Vibe/check-in/symptom-count mechanics.
2. **Given** a visitor on `/beta`, **when** they click "Get Early Access," **then** one form appears in place (same page, same URL) showing the email field and all 4 screener questions together.
3. **Given** a visitor who has filled in email and all 4 answers, **when** they submit, **then** a row is stored with their email and all 4 answers, they see an on-page thank-you message, and a confirmation email arrives at the address they gave.
4. **Given** a visitor submits with an invalid or empty email, **when** they try to submit, **then** they see an inline validation error and nothing is stored.
5. *(unchanged from v1)* Rate limiting.
6. *(unchanged from v1)* Admin sees all signups.
7. *(unchanged from v1)* Non-admin redirected from admin page.
8. *(unchanged from v1)* Logged-out redirected to login from admin page.
9. *(unchanged from v1)* CAPTCHA failure rejected.

## Test Plan (supersedes v1's AC1/AC2/AC4/AC9/AC3 rows; AC5-8 rows unchanged)

- AC1 (pitch renders, no old sections, no internal mechanics) → Playwright test loads `/beta`, asserts the new hero heading text is present, asserts the retired headings ("The Problem," "The Solution," "Who it's for") are **not** present, and asserts none of "Vibe," "symptom count," "daily_check_ins," "wellness score," "Great day," "Off day," "Tough" appear anywhere in the rendered text (tightened from v1 — the old test only checked internal-mechanics terms, not that the retired sections were actually gone).
- AC2 (button reveals combined form in place) → Playwright test clicks "Get Early Access," asserts the email field and all 4 question prompts are visible together, and asserts the URL never changes (`toHaveURL(/\/beta$/)`).
- AC3 (full submission) → Playwright test fills email + all 4 answers in the single revealed form and submits once; asserts the thank-you message. Same "not automated" caveat as v1 for confirming the email actually arrives (manual spot-check).
- AC4 (invalid email rejected) → Playwright test reveals the form, fills an invalid email (and valid answers to the other 4 fields, since they're now all visible together and native/JS validation could trigger on any invalid field), submits, and asserts the inline email error appears and nothing is stored.
- AC5-9: unchanged from v1 — same Deno rate-limit test, same CAPTCHA-mock test, same admin-page tests. These don't reference the removed email-only step, so they need no changes beyond whatever selector updates fall out of the component restructuring (e.g. AC9's test still fills the same 4 fields + email, just no longer in two separate `fill → click → fill more` phases).

## Technical Spec

- **Components/files touched:**
  - `src/pages/BetaSignup.jsx` — state simplifies from three steps (`'email' | 'screener' | 'success'`) to two (`'form' | 'success'`). The separate email-only form and its heading/paragraph are deleted entirely; the single combined form (email input + the existing `SingleSelectQuestion`/`Textarea`/`Turnstile` fields, unchanged) renders when `step === 'form'` after the hero button is clicked, replacing the current two-form conditional. The hero "Get Early Access" button's `onClick` changes from a `scrollIntoView` call (scrolling to an always-visible section) to a state-setter that reveals the now-hidden-by-default combined form.
  - `e2e/beta-signup.spec.js` — AC1/AC2/AC4/AC9/AC3 tests rewritten per the Test Plan above. AC5-8 tests carry forward with selector touch-ups only.
- **API / Edge Functions:** No changes. Same `beta-signup` function, same request body shape (`email`, `condition_status`, `tracking_method`, `frustration`, `beta_comfort`, `turnstile_token`).
- **Schema:** No changes.
- **Design System compliance:** No new conflicts — same `Button`/`Input`/`Textarea`/`PillToggle`/`Turnstile` components and tokens as v1, just fewer visible states. Re-run `design-system-check` on `BetaSignup.jsx` after the edit per standing CLAUDE.md convention, since the file is being restructured, not just re-styled.
- **Constraints from CLAUDE.md / locked decisions:** Unchanged from v1 — still no Vibe/symptom-count/medication-architecture references in the copy; still no custom domain work in scope.

## Repo Findings & Risks

Unchanged from v1 — no new duplicate functionality, technical debt, or orphaned code introduced by this amendment. The one addition: v1's own copy doc was ambiguous about whether the screener was "shown after email signup, or as a short form" (its own words) — that ambiguity is what led to the mismatch Lynn caught on the live page. Worth knowing for future specs: when a requirement doc itself hedges between two options, that hedge should be resolved with an explicit question before building, not assumed — this spec should have asked which reading Lynn meant the first time around instead of picking one silently.

## Non-Goals

Unchanged from v1: no real Wysker Watch account created, no auto-accept/reject logic, no custom domain/DNS work, no changes to the real `sign-up` flow, no bulk admin actions. Additionally for this amendment: no new route (`/beta/apply` was considered and explicitly rejected — stays a single-page reveal).

## Open Questions

None remaining — every question from this amendment's back-and-forth (copy content, question count, flow structure, same-page vs. new-route) was resolved directly with Lynn before this draft was written.
