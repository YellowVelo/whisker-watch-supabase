# Requirements: Transactional Email System

**Status:** Implemented (07-07/07-08), undocumented. This doc describes the system as built, including two security fixes already applied.
**Source files:** [supabase/functions/send-email/index.ts](../../supabase/functions/send-email/index.ts), [supabase/functions/_shared/email/](../../supabase/functions/_shared/email/), migrations `0018`–`0020`.

## Purpose

Every outbound transactional email (co-owner invitations + reminders, welcome, verify-email, password-reset) goes through one shared service (`sendEmail.ts`) backed by Resend, rather than each Edge Function building its own HTML or calling Resend directly. This exists so template rendering, delivery logging, and — critically — CTA-link safety checks live in exactly one place. The system has already needed two security fixes since shipping (an auth bypass risk and an open-redirect risk), which is exactly the kind of subsystem where undocumented assumptions cause the *next* fix to regress the first one. This doc is the guardrail against that.

## Functional Requirements

- **Templates** (registered in `templates/index.ts`, a `Map` — deliberately not a plain object, to avoid prototype-pollution lookups like `templates['__proto__']` resolving to a truthy value): `co-owner-invitation`, `co-owner-invitation-reminder`, `welcome`, `verify-email`, `password-reset`.
- **Two call paths:**
  1. Direct import of `sendEmail()` from `_shared/email/sendEmail.ts` — used by Edge Functions (e.g. `invite-co-owner`) that already run server-side and need no network hop.
  2. The `send-email` HTTP Edge Function — for callers that aren't themselves an Edge Function with module access (scheduled jobs, external workers, manual QA via curl).
- **Every send is logged** to `email_logs` (recipient, template, status, provider message id, error code/message, related entity) — logging is best-effort and never masks the real send result (a logging failure is swallowed and console-logged, not surfaced to the caller).
- **Idempotency:** an optional `idempotencyKey` lets a retried request (client timeout, at-least-once job delivery, a double-tapped button) replay the original result instead of sending a duplicate email. Implemented via `claim_email_idempotency_key`, a single atomic `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE` so concurrent callers can't both win a claim on the same key.
- **CTA/URL variables** (`accept_url`, `verify_url`, `reset_url`, `app_url`) are validated by `isSafeEmailUrl` before being placed in an `href`: must be `https:` (or `http(s)://localhost` / `127.0.0.1` for local dev), and the host must be in an allowlist (default: `www.wyskerwatch.com` only; overridable via the `EMAIL_LINK_ALLOWED_HOSTS` secret, comma-separated).
- **`send-email` auth:** requires a Supabase `service_role` JWT specifically — checked by decoding the (already gateway-verified) JWT's `role` claim, not by string-comparing against a stored service-role key value. A regular user session must never be able to call this endpoint.

## Empty States / Load Errors

- Missing template name → `missing_template` (400).
- Missing/empty required template variable → `missing_variable` (400).
- Invalid/missing recipient email → `invalid_recipient` (400).
- Missing or non-`service_role` Authorization header on the HTTP endpoint → `unauthorized` (401).
- Resend request fails or returns non-2xx → `provider_error` (502) — the raw Resend response body/status is logged server-side (truncated to 300 chars, never echoed to the caller) and never surfaced to the caller.
- `RESEND_API_KEY` not configured → `provider_error` (502), logged distinctly as a config issue.
- Unclaimable idempotency key (RPC failure) → fails closed with `unknown_error` rather than silently sending without duplicate protection.

## Business Rules

1. **`send-email` (the HTTP endpoint) is service-role-only, full stop.** Templates accept an arbitrary `to` and CTA URL; allowing a regular user session to call this would let any account send Wysker-Watch-branded phishing email to any third party. This is the subject of security fix #1 (JWT role-claim check replacing key comparison — see below).
2. **CTA URLs must resolve through the shared allowlist check, never be inserted raw.** This is the subject of security fix #2: an earlier version of the allowlist included `wyskerwatch.app`, a domain the project doesn't actually own, caught via a broken link in a test welcome email. The allowlist now only contains domains actually owned (`www.wyskerwatch.com`).
3. **`email_logs` stores metadata only, never rendered HTML/text body.** The template name + variables used to generate an email already live with the workflow that triggered it (e.g. the `pet_co_owners` invite row), so this table doesn't become a second place PII-bearing email content has to be protected.
4. **A row's `status: 'sent'` means "accepted by Resend," not "confirmed delivered."** There's no Resend webhook receiver updating rows after acceptance — a known, deliberate gap, not an oversight.
5. **Test/demo account send-suppression is a caller responsibility, not `sendEmail`'s.** `sendEmail` only knows the recipient address, not which internal account triggered the send. `invite-co-owner` already checks `account_type` before sending (see [invite-co-owner/index.ts:109-112](../../supabase/functions/invite-co-owner/index.ts#L109)); any new caller needing the same guard should follow that pattern. If a third workflow needs it, that's the signal to centralize by threading a `sentByUserId` through `sendEmail` itself.
6. **`{{key}}` tokens for unknown variables are left as literal text, not silently dropped** — a typo'd variable name should be visibly wrong in a preview/QA send, not vanish.

## Data Requirements

- `email_logs`: `recipient_email`, `template_name`, `status` (`pending` | `sent` | `failed`), `provider_message_id`, `error_code`, `error_message`, `related_entity_type`/`related_entity_id`, `idempotency_key` (unique where non-null), `sent_at`, `created_at`. RLS enabled with **zero policies** — service role bypasses RLS entirely; every other role is denied by default, since there is no client-side insert path.
- `email_has_password(email)` (migration 0020): a `security definer` function returning only a boolean, restricted to `service_role`, used by `invite-co-owner` to distinguish "already has a password, fully registered" from "invited once, `auth.users` row exists, never completed setup" — a distinction Supabase's admin API otherwise collapses into the same "already registered" error for both. Deliberately minimal: never exposes any other `auth.users` field, since "does this email have a password" is itself an account-enumeration signal.

## Acceptance Criteria

- [ ] A new doc (`docs/transactional-email.md` or a README section) explains: what the system is, the two call paths, the template list, and the idempotency mechanism.
- [ ] Both security fixes are documented with their *reasoning*, not just "fixed" — specifically: (1) why JWT role-claim decoding was chosen over key comparison, and (2) why the CTA allowlist must only ever contain domains actually owned, with the `wyskerwatch.app` incident as a concrete cautionary example.
- [ ] The doc states plainly that `send-email` (HTTP) must remain `service_role`-only and explains the phishing-primitive risk if that ever loosens.
- [ ] The doc lists `EMAIL_LINK_ALLOWED_HOSTS` as the mechanism for adding a new first-party domain later, so nobody re-hardcodes a new host inline.
- [ ] No code changes — this is documentation of existing, already-shipped behavior.

## Edge Cases

- Two overlapping requests with the same `idempotencyKey`: one claims the row (`pending`), the other sees `in_progress` and returns without sending — never a double send, but also never a fabricated `messageId` for the losing request.
- A retried request after a prior *failure* for the same key is allowed to re-claim (`failed` → `pending`), unlike a prior *success*, which always replays without resending.
- A CTA variable pointing at `http://` (not `https://`) for a non-localhost host is rejected outright, even if the host itself is allowlisted.
- Resend accepts the send but the message later bounces or is marked spam — `email_logs` has no way to reflect this today (no webhook receiver); don't assume `status = 'sent'` means the user actually received it.

## Implementation Notes for Claude Code

- This is a documentation task against already-shipped code — do not modify `sendEmail.ts`, `send-email/index.ts`, `utils.ts`, or the templates while writing this doc.
- Link the two security-fix commits by name/intent so the doc stays useful even if someone can't immediately find them in `git log`: "Fix send-email auth to check JWT role claim instead of key comparison" (8e7e2eb) and "Fix CTA link allowlist to only permit the domain actually owned" (47d5dd4).
- If a third caller ever needs test/demo send-suppression, that's a code change (centralizing via `sentByUserId`) — flag it as a follow-up, don't silently build it while "just documenting."
