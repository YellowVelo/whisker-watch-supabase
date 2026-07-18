

You are a senior engineer implementing the Wysker Watch Email feature.

Read the Foundation documents first: `docs/foundation/` in this repository (Product Context, Design System, Technical Standards, Data Model, Navigation & Information Architecture, Terminology). The original version of this spec pointed at a local OneDrive path outside the repo — that path is not part of the project and should not be used; the foundation docs now live in-repo under `docs/foundation/`.

Build only the Email feature described in this specification.

Implement:

Resend integration through Supabase Edge Functions.
Shared server-side sendEmail service.
Shared email template renderer.
Shared branded HTML email layout.
Plain text fallback for every email.
Initial templates:
co-owner-invitation
welcome
verify-email
password-reset
email_logs table migration.
Structured error handling.
Logging for successful and failed sends.
Manual QA steps for local and production testing.

Do not create a user-facing Email screen.
Do not redesign existing app UI.
Do not call Resend from frontend code.
Do not expose API keys or provider errors.
Do not implement the full co-owner invitation flow in this feature.
Only create the reusable Email system and initial templates.

When complete, return:

Changed files
Migration name
Edge Function/shared module names
Required environment variables/secrets
Manual QA steps

**Status: Reconciled to current implementation as of 2026-07-18 (see Revision Notes at the end). The four templates and scope above describe the original V1 build; a fifth template and an idempotency mechanism were added afterward and are documented below.**




# Feature Specification: Email

## Purpose

Enable Wysker Watch to send branded transactional emails from server-side code.

This feature creates the shared email system used by current and future product workflows, including co-owner invitations.

## Functional Requirements

### 1. Email Provider

Use Resend as the transactional email provider.

All email sending must happen server-side through Supabase Edge Functions.

The frontend must never call Resend directly.

Required secret:
- `RESEND_API_KEY`

Required sender:
- `Wysker Watch <no-reply@wyskerwatch.com>`

The generic `send-email` HTTP Edge Function (the network entry point over the shared service) only accepts a **service_role** Supabase JWT as its bearer token — not a regular logged-in user's session token. This is deliberately stricter than "server-side only": templates like `password-reset` and `verify-email` accept an arbitrary `to` and CTA URL, so allowing any authenticated user session to call this endpoint directly would let any account send Wysker-Watch-branded email with an attacker-controlled link to any address. Edge Functions that need to send email should import `sendEmail` from the shared module directly instead of going over HTTP.

### 2. Shared Email Service

Create a reusable server-side email service.

The service must support:

- Template-based email sending
- HTML email body
- Plain text fallback
- Dynamic variable replacement
- Subject variable replacement
- Preview text
- Error handling
- Structured logging
- Provider response capture
- Idempotent retries (see §7 below)

Standard interface (as actually implemented in `supabase/functions/_shared/email/sendEmail.ts`):

```typescript
sendEmail({
  to: string,
  template: string,
  variables: Record<string, string>,
  replyTo?: string,
  relatedEntityType?: string,
  relatedEntityId?: string,
  idempotencyKey?: string
})
```

`relatedEntityType`/`relatedEntityId` and `idempotencyKey` were not in the original interface description — they exist to link a log row back to the record that triggered the send (e.g. a `pet_co_owners` invite row) and to make retried sends safe (see §7).

3. Email Templates

Create a shared template system.

Each template must include:

Template name
Subject
Preview text
HTML body
Plain text body
Required variables

Templates must live in a shared server-side location, not inside UI components.

Actual structure (one template beyond the original plan):

supabase/
  functions/
    _shared/
      email/
        sendEmail.ts
        renderTemplate.ts
        templates/
          co-owner-invitation.ts
          co-owner-invitation-reminder.ts
          welcome.ts
          password-reset.ts
          verify-email.ts

`co-owner-invitation-reminder.ts` was added after this spec's original scope, for re-sending an invitation to someone who hasn't accepted yet — see `docs/features/0013 CoOwner EmailsV2.md`.

4. Template Rendering

Template rendering must:

Replace all required variables
Fail safely if required variables are missing (`missing_variable` error)
Escape user-provided values where appropriate — every variable is HTML-escaped except URL-typed variables, which are instead validated against an allowlist (see below) rather than escaped
Produce both HTML and plain text output
Return structured errors

**URL variables are validated more strictly than "must be valid URLs."** Any variable recognized as a URL (e.g. `accept_url`, `reset_url`, `verify_url`) must be a valid **https** URL on an **allowed Wysker Watch domain** — an arbitrary external URL is rejected with `missing_variable`, not merely escaped. This closes the phishing-link risk described in §1.

5. Shared Branding

All HTML emails must use a shared layout.

Shared layout must include:

Wysker Watch name (text wordmark, not an image logo)
Dark background
High-contrast body text
Clear primary CTA button
Plain-language footer
Mobile-responsive layout

Do not create a separate visual style per email.

This matches the current implementation (`supabase/functions/_shared/email/layout.ts`): Charcoal background (`#0D0F12`), Pure White body text, a Sky Blue CTA button (Charcoal text — the inverse of the app's own primary button), and a mobile breakpoint at 480px.

6. Templates

Implemented templates (five, not four):

co-owner-invitation
co-owner-invitation-reminder
welcome
verify-email
password-reset

**Only `co-owner-invitation` and `co-owner-invitation-reminder` are actually triggered anywhere in the current codebase** (both from `supabase/functions/invite-co-owner/index.ts`). `welcome`, `verify-email`, and `password-reset` exist as fully-built template files but have **zero callers** anywhere in `supabase/functions/` — no signup flow, no password-reset flow, and no scheduled job currently sends them. If real account-welcome/verify/reset emails are going out today, they're coming from Supabase Auth's own built-in email system, not this one. Wiring these three templates up to real triggers is unbuilt work, not a currently-shipped feature.

Template: Co-owner Invitation

Template name:

co-owner-invitation

Subject:

{{owner_name}} invited you to help care for {{pet_name}} in Wysker Watch

Preview text:

Accept your invitation to help care for {{pet_name}}.

Required variables:

owner_name
pet_name
accept_url
expiration_date

HTML body content:

Hi,

{{owner_name}} invited you to become a co-owner for {{pet_name}} in Wysker Watch.

As a co-owner, you will be able to help track daily check-ins, view trends, manage care information, and support {{pet_name}}'s health story.

Accept invitation:
{{accept_url}}

This invitation expires on {{expiration_date}}.

If you were not expecting this invitation, you can safely ignore this email.

The Wysker Watch Team

Plain text body:

{{owner_name}} invited you to become a co-owner for {{pet_name}} in Wysker Watch.

Accept your invitation:
{{accept_url}}

This invitation expires on {{expiration_date}}.

If you were not expecting this invitation, you can safely ignore this email.

The Wysker Watch Team

Template: Co-owner Invitation Reminder

Template name:

co-owner-invitation-reminder

Added after the original V1 scope — see `docs/features/0013 CoOwner EmailsV2.md` for the full reminder-send business rules (when a reminder is eligible to be sent, cooldown, etc.). Not documented here in detail since it belongs to that feature, not the base email system.

Template: Welcome

Template name:

welcome

Subject:

Welcome to Wysker Watch

Preview text:

Start building your pet's health story.

Required variables:

first_name
app_url

Body:

Hi {{first_name}},

Welcome to Wysker Watch.

You can now add your pets, complete their profiles, and begin tracking daily changes.

Open Wysker Watch:
{{app_url}}

The Wysker Watch Team

**Status: template exists, not currently sent by anything.**

Template: Verify Email

Template name:

verify-email

Subject:

Verify your Wysker Watch email

Preview text:

Confirm your email address to finish setting up your account.

Required variables:

verify_url

Body:

Please verify your email address to finish setting up your Wysker Watch account.

Verify email:
{{verify_url}}

If you did not create this account, you can ignore this email.

The Wysker Watch Team

**Status: template exists, not currently sent by anything.**

Template: Password Reset

Template name:

password-reset

Subject:

Reset your Wysker Watch password

Preview text:

Use this secure link to reset your password.

Required variables:

reset_url

Body:

We received a request to reset your Wysker Watch password.

Reset password:
{{reset_url}}

If you did not request this, you can ignore this email.

The Wysker Watch Team

**Status: template exists, not currently sent by anything.**

UI Components

No primary user-facing screen is required for this feature.

This is a platform feature used by other workflows.

Developer-visible components only:

Shared email service
Template files
Template renderer
Email provider client
Email log handling

User Interactions

No direct user interaction is required in this feature.

Users receive emails triggered by product workflows.

Currently wired-up triggers:

Co-owner invitation
Co-owner invitation reminder

Built but not yet wired to any trigger:

Account welcome
Email verification
Password reset

Navigation

No new app navigation is required.

Email CTA links may route users to:

App home
Email verification route
Password reset route
Accept invite route

Empty States

Not applicable.

Loading States

Not applicable.

Feature workflows that call the email service must handle their own loading states.

Error States

The email service must return structured errors.

Required error types:

missing_template
missing_variable
provider_error
invalid_recipient
unauthorized
unknown_error

Errors returned to the frontend must be user-safe.

Do not expose:

Resend API response details
Stack traces
Secret values
Raw provider errors

Business Rules
Emails must only be sent from authenticated server-side workflows unless explicitly required for auth flows.
Email provider secrets must never be exposed to the frontend.
All transactional emails must have both HTML and plain text versions.
All templates must use the shared layout.
Each email must have a clear purpose.
Product workflows must call the shared email service instead of implementing custom email logic.
Email sending failure must not silently fail.
Email sending must be logged.
Do not send marketing emails through this feature.
**Suppressing sends for test/demo accounts is a deliberately deferred, caller-side responsibility, not something `sendEmail()` itself does** — it only knows the recipient address, not which internal account triggered the send. `invite-co-owner/index.ts` implements this itself (checks the inviting account's `account_type` and skips the real Resend call for `test`/`demo`, still logging the attempt). If a second workflow needs the same guard, that's the signal to thread it through the shared service instead.
**A retried request with the same `idempotencyKey` will never cause a second real send** — see §7.

7. Idempotent Retries

Added after the original V1 scope (migration `0019_email_logs_idempotency.sql`), to address the "Duplicate send request" edge case the original spec left unhandled.

A caller may pass an `idempotencyKey` on `sendEmail()`/the `send-email` endpoint. Behavior:
- A brand-new key: a `pending` row is atomically reserved in `email_logs` (via the `claim_email_idempotency_key` Postgres function) before Resend is called, then finalized to `sent`/`failed`.
- A key that already succeeded: the original result is replayed without sending again.
- A key currently `pending` from a concurrent in-flight request: the second caller backs off without sending, rather than risking a double-send.
- A key whose prior attempt `failed`: eligible for a fresh claim/retry.

This is implemented as a single atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE` so two simultaneous callers racing on the same key can never both win the claim.

Validation Rules

Recipient email:

Required
Must be valid email format
Normalize to lowercase before sending where appropriate

Template:

Required
Must match a known template

Variables:

All required variables for the selected template must be present
Empty required variables should fail validation
URL-typed variables must be valid **https** URLs on an **allowed Wysker Watch domain** (an allowlist check, not just general URL-format validation)

Data Requirements

`email_logs` table (migration `0018_email_logs.sql`, extended by `0019_email_logs_idempotency.sql`).

Fields:

id
recipient_email
template_name
status
provider_message_id
error_code
error_message
related_entity_type
related_entity_id
sent_at
created_at
idempotency_key *(added in migration 0019; nullable — rows without an idempotency key behave exactly as before that migration)*

Statuses:

sent
failed
pending *(added in migration 0019 — a reservation state for an in-flight idempotent send; never a terminal state)*

RLS:

No client-side insert access.
Inserts must happen from Edge Functions using service role.
Admin/service-role only for reads unless a future UI requires owner-visible email history.
Implemented as zero RLS policies on the table (RLS enabled, no policies) — the service role bypasses RLS entirely, and every other role (anon, authenticated) is denied by default with nothing to explicitly grant.

Do not store full email HTML bodies in the database. (Confirmed: the table only ever stores template name, status, and provider/error metadata — never rendered content.)

Acceptance Criteria
Resend API key is stored as a Supabase secret.
Shared email service exists.
Template renderer exists.
Templates support subject, preview text, HTML, and plain text.
Missing template returns structured error.
Missing required variable returns structured error.
Email sends successfully through Resend.
Email failures are logged.
Successful sends are logged.
Co-owner invitation template exists **and is actually triggered** (`invite-co-owner`).
Co-owner invitation reminder template exists and is actually triggered.
Welcome template exists — **not yet triggered by any workflow.**
Verify email template exists — **not yet triggered by any workflow.**
Password reset template exists — **not yet triggered by any workflow.**
No frontend component calls Resend directly.
No email provider secret appears in frontend code.
HTML emails use shared branding.
Plain text fallback is included for every template.
A retried request with the same idempotency key never sends twice.

Edge Cases
Resend API unavailable
Invalid recipient email
Missing template
Missing variable
Expired CTA link generated by calling workflow
Duplicate send request — **handled, via idempotency keys (§7); the original spec left this unhandled**
Provider accepts email but delivery later fails — **still unhandled: there is no Resend delivery/bounce webhook receiver, so a `sent` status only ever means "Resend accepted it," never "confirmed delivered"**
User signs up with uppercase email
Email sent successfully but log insert fails — handled (a logging failure is caught and never surfaces as, or masks, a send failure)
Log insert succeeds but provider send fails
Local development without Resend secret configured — returns a `provider_error`, logged as such

Implementation Notes for Claude Code
Preserve Wysker Watch's existing architecture.
Implement this as shared backend infrastructure, not as UI-specific logic.
Use Supabase Edge Function shared modules where possible.
Store secrets only in Supabase secrets.
Do not call Resend from frontend code.
Do not duplicate email rendering logic across functions.
Keep templates simple and maintainable.
Use the Design System colors and typography direction for HTML email styling.
Keep email language calm, clear, and non-clinical.
Do not include medical advice in transactional emails.
Add manual QA notes for testing email sends in development and production.
If wiring up welcome/verify-email/password-reset to real triggers, decide first whether they should replace or supplement Supabase Auth's own built-in emails for those flows — that decision isn't made anywhere in this spec or the codebase today.

---

## Revision Notes (V1 → V2)

This pass corrected the following against the current codebase
(`supabase/functions/_shared/email/{sendEmail,renderTemplate,layout}.ts`,
`supabase/functions/send-email/index.ts`, `supabase/functions/invite-co-owner/index.ts`,
`supabase/functions/_shared/email/templates/`) and Supabase schema
(migrations `0018_email_logs.sql`, `0019_email_logs_idempotency.sql`):

1. **Added the missing `co-owner-invitation-reminder` template**, built after V1's scope closed.
2. **Corrected which templates are actually triggered.** V1 listed "Co-owner invitation, Account welcome, Email verification, Password reset" as supported triggers without distinguishing built-from-wired. In reality, only the two co-owner templates have any caller anywhere in the codebase — welcome/verify-email/password-reset are fully built but currently dead code from a triggering standpoint.
3. **Documented the idempotency mechanism** (migration 0019, `claim_email_idempotency_key`, the new `pending` status and `idempotency_key` column) — this resolves V1's own "Duplicate send request" edge case, which V1 explicitly left unhandled.
4. **Corrected the `sendEmail()` interface** to include `relatedEntityType`, `relatedEntityId`, and `idempotencyKey`, all present in the real implementation but missing from V1's documented signature.
5. **Corrected URL variable validation.** V1 said "URLs must be valid URLs." The real check is stricter: must be https and on an allowlisted Wysker Watch domain.
6. **Clarified `send-email`'s access control** — service_role-JWT-only, not just "server-side," and explained why (phishing-link risk from arbitrary `to`/CTA-URL templates).
7. **Corrected the stale foundation-docs path** in the preamble (pointed at a local OneDrive path outside the repo; foundation docs now live at `docs/foundation/`).
8. **Added the still-open bounce/delivery-webhook gap** to Edge Cases — `sent` still only means "Resend accepted it," not "delivered," and no webhook receiver exists to update that.
