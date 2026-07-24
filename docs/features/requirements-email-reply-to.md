# Requirements: Default Reply-To for Transactional Email

**Status:** Implemented (07-24). This doc describes what exists today.
**Source files:** [supabase/functions/_shared/email/sendEmail.ts](../../supabase/functions/_shared/email/sendEmail.ts), [supabase/functions/_shared/email/types.ts](../../supabase/functions/_shared/email/types.ts)

## Purpose

Every transactional email Wysker Watch sends (currently: co-owner pet-sharing
invites and their reminders) comes from `no-reply@wyskerwatch.com` — an
address nobody reads. If a recipient hit "Reply," that reply went nowhere.
Now that `support@wyskerwatch.com` is a real, monitored Google Workspace
mailbox (set up 2026-07-24), replies from any transactional email default to
that address instead.

## Functional Requirements

- `sendEmail()` (`supabase/functions/_shared/email/sendEmail.ts`) sets
  `reply_to: support@wyskerwatch.com` on every Resend send unless the caller
  explicitly passes a different `replyTo` in `SendEmailParams`.
- This applies automatically to any future email type built on the shared
  service (`welcome`, `verify-email`, `password-reset`, and anything later)
  — no per-caller change needed to get the default.
- No visible change to email content: same "From" address
  (`no-reply@wyskerwatch.com`), subject, and body as before.

## Business Rules

- The default lives as one constant (`DEFAULT_REPLY_TO`) in `sendEmail.ts`,
  matching the existing pattern for `FROM_ADDRESS` — not sourced from an
  env var/secret, since it's not expected to change often and isn't
  sensitive.
- `SendEmailParams.replyTo` remains a valid override for any caller that
  needs a different reply-to address in the future (e.g. a future billing
  or ops-specific email).

## Data Requirements

None — no schema change. `email_logs` is unaffected (reply-to isn't logged
there today, same as before this change).

## Acceptance Criteria

- [x] Sending the co-owner invite or reminder email sets `reply_to:
  support@wyskerwatch.com` when the caller doesn't pass its own `replyTo`.
- [x] A caller can still override the default via `SendEmailParams.replyTo`.
- [x] No other visible email content changed.

## Non-Goals

- Resend delivery/bounce webhook handling — separate, still-open item on
  `docs/launch-punch-list.md`.
- Building the sitter-invite email trigger — no email is sent for that flow
  at all today; unrelated to this change.
- Wiring `welcome`/`verify-email`/`password-reset` to real triggers —
  deliberately deferred; they'll pick up this default automatically
  whenever that work happens.
- Any DNS/DMARC change — outside the codebase.

## Related Findings (from spec discussion, not part of this change)

- The root domain's DNS was reviewed alongside this change (Google
  Workspace MX/SPF added 2026-07-24). SPF is correctly configured
  (`v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all` on
  the root; Resend's SPF/DKIM live correctly on the `send.` subdomain and
  `resend._domainkey`). No DMARC record (`_dmarc.wyskerwatch.com`) exists
  yet — a real, still-open gap, but pure DNS, not tracked here.
- `staging.wyskerwatch.com` is already wired to a Cloudflare Pages project
  (`wysker-watch-staging.pages.dev`) — discovered during this review, not
  previously documented anywhere in this repo.
