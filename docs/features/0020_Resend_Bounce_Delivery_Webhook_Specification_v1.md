# 0020_Resend_Bounce_Delivery_Webhook_Specification_v1

**Status:** Draft (revised after external technical review — see Revision
Notes at the end)
**Date:** 2026-07-26
**Related files:**
[supabase/functions/_shared/email/sendEmail.ts](../../supabase/functions/_shared/email/sendEmail.ts),
[supabase/functions/_shared/email/types.ts](../../supabase/functions/_shared/email/types.ts),
[supabase/functions/_shared/email/utils.ts](../../supabase/functions/_shared/email/utils.ts),
[supabase/functions/send-email/index.ts](../../supabase/functions/send-email/index.ts),
[supabase/functions/invite-co-owner/index.ts](../../supabase/functions/invite-co-owner/index.ts),
[supabase/functions/invite-sitter/index.ts](../../supabase/functions/invite-sitter/index.ts),
[src/components/InviteCoOwnerDialog.jsx](../../src/components/InviteCoOwnerDialog.jsx),
[src/components/InviteSitterDialog.jsx](../../src/components/InviteSitterDialog.jsx),
[supabase/migrations/0018_email_logs.sql](../../supabase/migrations/0018_email_logs.sql),
[supabase/migrations/0019_email_logs_idempotency.sql](../../supabase/migrations/0019_email_logs_idempotency.sql),
[supabase/migrations/0032_email_logs_suppressed_status.sql](../../supabase/migrations/0032_email_logs_suppressed_status.sql),
[supabase/migrations/0035_fix_staging_table_grants.sql](../../supabase/migrations/0035_fix_staging_table_grants.sql),
[docs/launch-punch-list.md](../launch-punch-list.md) (P2),
[docs/features/requirements-transactional-email.md](requirements-transactional-email.md),
[docs/features/requirements-centralized-email-suppression.md](requirements-centralized-email-suppression.md).

## Before You Approve This

Plain-language flags from the self-review pass, updated after a second,
external technical review caught several real problems in the first draft:

- **This spec grew past the one-line punch-list item.** The punch-list entry
  only asked for "an Edge Function verifying Resend's signature and updating
  `email_logs`." Your answers in the clarifying-questions step added two real
  pieces of new behavior beyond that: (1) a delivery lifecycle recorded per
  message instead of one overwritten status column, and (2) automatically
  blocking future emails to an address that hard-bounced or complained, plus
  a way to undo that block. Both are reasonable, common practice — but
  worth naming plainly since it's more than "just log it."
- **The first draft of this spec got Resend's own bounce model wrong**,
  which a second technical review caught. Resend does not send one
  "bounced" event with a hard/soft flag — it sends a genuinely *permanent*
  `email.bounced` event, and reports *temporary* delivery problems (like a
  full mailbox) as a completely separate `email.delivery_delayed` event that
  this spec deliberately doesn't handle. The earlier draft asked for
  "soft bounces shouldn't suppress" but then excluded the only event that
  could tell us about one — an unbuildable requirement. This revision fixes
  it by treating every `email.bounced` event as what Resend itself defines
  it as: permanent. There's no more hard/soft distinction to make, so that
  column and acceptance criterion are removed below.
- **The first draft's webhook processing could permanently lose events on a
  database hiccup.** It recorded "we've seen this event" *before* confirming
  the resulting database update actually succeeded — if that update then
  failed, Resend's retry would arrive, see "already seen," and skip it
  forever, silently losing the bounce/delivery record. This revision makes
  the whole thing one atomic database operation instead (see Technical
  Spec), so a failure rolls back cleanly and Resend's retry does what a
  retry is supposed to do.
- **The first draft would have shown a wrong, misleading message to a real
  user.** `InviteCoOwnerDialog.jsx`/`InviteSitterDialog.jsx` already have
  specific copy for "no email sent because the inviter is a test/demo
  account." A recipient-address suppression is a different situation
  entirely (the invitee's own email address is the problem, not the
  inviter's account) but the earlier draft didn't say how the two calling
  files would tell those apart — without a fix, a suppressed-recipient case
  would have silently fallen into the generic "this person already has an
  account" message, which is simply false. This revision adds the missing
  piece (see Technical Spec) and lists both dialog files as touched.
- **The first draft under-specified how to actually verify Resend's
  signature**, and hand-rolling that logic wrong is a real risk (rejecting
  legitimate mail providers or, worse, accepting forged requests). This
  revision spells out the exact verification steps rather than gesturing at
  "verify the signature."
- **This function must accept requests Supabase's own login system never
  signed.** Every other Edge Function in this repo either requires a
  logged-in user's session token or a service-role token, both issued by
  Supabase. Resend is a third party — it will never hold a Supabase token.
  This function has to be deployed with Supabase's normal token check turned
  off for this one endpoint, and instead verify a signature Resend attaches
  to each request. That's a real, easy-to-forget deploy step (see Technical
  Spec) and a deliberate exception to "Functions must require [Supabase]
  authentication" in `0006 Technical Standards.md` — the authentication
  still happens, just via a different mechanism than every other function in
  this repo.
- **Un-suppressing an address now keeps a record instead of erasing it.**
  The first draft's "clear" endpoint deleted the only evidence an address had
  ever bounced or complained. This revision keeps the row and marks it
  cleared instead (see Technical Spec), so there's still a trail if the same
  address bounces again later, or if anyone ever needs to explain why an
  address stopped receiving mail.
- **No duplicate or conflicting feature found.** Confirmed no
  `resend-webhook` function, no signature-verification code, and no
  suppression-list table exist anywhere in the repo today.
- **No conflict with the locked Vibe/Symptom-Count scoring model** — this
  only touches email delivery bookkeeping, nothing in check-in/scoring logic.
- **One inconsistency this spec does not fix:** the two existing suppression
  checks in `sendEmail.ts` (test/demo accounts) compare against the literal
  strings `'test'`/`'demo'` rather than a shared constant, a debt item already
  flagged on the punch list (P5) as out of scope for prior work. This spec
  adds a *third* kind of suppression check (recipient-address-level, not
  account-level) alongside it — same file, same pattern, not the same debt,
  but worth knowing they'll sit near each other in `sendEmail.ts`.

## Functional Requirements

1. **Know when an email actually arrives, not just that Resend accepted it.**
   Today, `email_logs.status = 'sent'` only means Wysker Watch handed the
   message to Resend — it says nothing about whether the recipient's mail
   server actually accepted it. This feature records, for each sent email,
   whether it was later confirmed **delivered**, permanently **bounced**
   (a real, terminal delivery failure — e.g. the mailbox doesn't exist), or
   reported as **spam/complaint** by the recipient's mail provider. A
   message can legitimately be marked both delivered and later complained
   about (the recipient received it, then flagged it as spam) — these are
   tracked as separate facts, not one overwritten state.
2. **Stop repeatedly emailing an address that's confirmed dead or
   complaining.** If an address permanently bounces or the recipient marks
   a Wysker Watch email as spam, no further emails are sent to that address
   automatically, until someone manually clears it.
3. **The schema and code ship to all three environments, but Resend is only
   ever told about production.** `Whisker-Watch` (prod), `wysker-watch-dev`,
   and `wysker-watch-staging` all get the new tables and Edge Functions,
   matching the existing convention that backend changes ship to all three
   — and `wysker-watch-dev` specifically needs this to exercise the new CI
   integration tests (see Tests). But dev/staging/prod currently all send
   real email through **the same single Resend account** (confirmed:
   `sendEmail.ts` sends from one hardcoded `no-reply@wyskerwatch.com` in
   every environment, with no per-environment branching). Resend's webhooks
   are a property of the account, not of any one environment, so registering
   three separate webhook endpoints there wouldn't cleanly separate "prod's
   bounces" from "dev's bounces" — every registered endpoint would receive
   every environment's events. Since only production's delivery data is
   actually acted on operationally, only **one** webhook endpoint (prod's)
   is registered in Resend's dashboard. Dev and staging get the fully
   working code and schema (so this is testable and consistent across
   environments) but are never wired into Resend as a live destination — see
   the rollout order below.
4. **A blocked address can be manually un-blocked**, for the rare case
   someone confirms an address was fine after all (e.g. a typo'd address
   gets corrected, or a one-off bounce turns out not to reflect a truly dead
   mailbox). Clearing it keeps a record that it happened, rather than
   erasing the fact the address ever bounced.
5. **A caller that gets a suppressed result can tell why.** Today, the only
   reason `sendEmail()` ever suppresses a send is "the sending account is
   test/demo," and the two callers that check for this
   (`invite-co-owner`, `invite-sitter`) assume that's always the reason.
   Once a second kind of suppression exists (a bad recipient address), those
   callers need to distinguish the two — showing "you already have an
   account" to someone whose email just bounced would be actively wrong.

## Acceptance Criteria

- **Given** Wysker Watch sends an email and the recipient's mail server
  confirms it arrived, **when** Resend notifies us of that, **then** the
  corresponding `email_logs` row records the delivery time.
- **Given** Wysker Watch sends an email and it permanently bounces (e.g.
  "no such mailbox" — the only kind of bounce Resend reports as
  `email.bounced`), **when** Resend notifies us, **then** the `email_logs`
  row records the bounce, and that recipient's address is added to a block
  list so no further Wysker Watch email is sent to it automatically.
- **Given** a recipient marks a Wysker Watch email as spam, **when** Resend
  notifies us, **then** the `email_logs` row records the complaint (even if
  that same message was already marked delivered), and that address is
  added to the block list, same as a bounce.
- **Given** an address is on the block list, **when** any future workflow
  (co-owner invite, sitter invite, etc.) tries to email that address,
  **then** no real email is sent, the attempt is recorded distinctly (not
  indistinguishable from a real send, a real failure, or a test/demo-account
  suppression), and the calling screen shows the recipient the correct,
  honest explanation rather than a copy-pasted "you already have an
  account" message meant for a different situation. This holds in every
  environment, even though only prod's webhook is ever registered with
  Resend — dev/staging's `email_suppressions` table simply never gets real
  bounce/complaint rows populated by Resend itself, but the block-list check
  in `sendEmail()` works identically everywhere.
- **Given** a notification arrives that isn't validly signed by Resend,
  **when** it hits this function, **then** it is rejected (401) and nothing
  in `email_logs` or the block list changes.
- **Given** a validly-signed notification arrives for a message this system
  has no record of (e.g. an old, already-cleaned-up row, or a message sent
  before this feature existed), **when** it's processed, **then** the
  function acknowledges it (200, so Resend doesn't keep retrying) but makes
  no `email_logs` change, and this is visible in the function's own logs as
  a non-error "no matching row" case rather than silently succeeding or
  throwing.
- **Given** a validly-signed notification arrives with a shape this function
  doesn't recognize (missing required fields, or an event type outside the
  three this function subscribes to), **when** it's processed, **then** it's
  acknowledged (200) without changing anything, and malformed JSON is
  rejected (400).
- **Given** Resend re-sends the same notification more than once (its own
  retry behavior, not something Wysker Watch controls), **when** the
  duplicate arrives, **then** it does not double-apply, and does not
  re-trigger the block list a second time.
- **Given** a database error happens while processing a genuinely new event,
  **when** that happens, **then** the event is not marked as handled, so
  Resend's real retry mechanism gets a fair chance to actually retry it
  (see Technical Spec's atomicity requirement).
- **Given** someone needs to remove an address from the block list,
  **when** they do so, **then** future emails to that address send normally
  again, and the record that it was once blocked (and later cleared) still
  exists afterward rather than being deleted.

## Visual Reference

No mockups apply — this is mostly a backend delivery-tracking feature.
The one real user-facing surface is the corrected messaging in
`InviteCoOwnerDialog.jsx`/`InviteSitterDialog.jsx` for a recipient-suppressed
invite (see Technical Spec) — plain confirmation text, not a new screen or
visual design.

## Technical Spec

**A note on terms used below:** "webhook" means Resend calling *our* server
to tell us something happened (the reverse of the app calling Resend).
"Signature verification" means checking a cryptographic stamp Resend attaches
to each webhook request, proving it actually came from Resend and wasn't
sent by an attacker pretending to be Resend. "Atomic" means a set of database
changes either all happen together or none of them do — there's no in-between
state where some happened and others didn't.

### Resend's actual event model (corrected)

Resend's webhook can send: `email.sent`, `email.delivered`,
`email.delivery_delayed`, `email.bounced`, `email.complained`,
`email.opened`, `email.clicked`. Of these, `email.bounced` is a **permanent**
failure signal — Resend reports temporary/transient problems (mailbox full,
receiving server briefly unavailable) as the separate `email.delivery_delayed`
event instead. This function subscribes to and handles exactly three:
`email.delivered`, `email.bounced`, `email.complained`. `email.sent` is
redundant with what `sendEmail.ts` already records at send time.
`email.opened`/`email.clicked` involve tracking-pixel/link-rewriting
mechanics, a separate privacy consideration outside this spec.
`email.delivery_delayed` is explicitly not handled — it's informational
noise for a transient condition, and (per the correction above) is not the
same thing as a "soft bounce," so there is no unhandled "temporary bounce"
case this spec needs to account for. **Configure the Resend webhook
endpoint in each project's dashboard to send only these three event types**,
so the function only ever receives what it expects; it also defensively
no-ops (200, no state change) on any other event type it might still
receive, in case that dashboard configuration is ever changed.

### New Edge Function: `supabase/functions/resend-webhook/index.ts`

- **Signature verification, not Supabase auth.** Resend signs each webhook
  request the same way Svix does: three headers (`svix-id`, `svix-timestamp`,
  `svix-signature`) verified against a per-endpoint secret Resend generates
  when the webhook is created in their dashboard. Verification must:
  1. Read the **raw request body as text**, before any JSON parsing —
     signature verification is computed over the exact bytes Resend sent,
     not a re-serialized version of the parsed object.
  2. Build the signed content string: `${svix-id}.${svix-timestamp}.${rawBody}`.
  3. Base64-decode the webhook secret (after stripping its `whsec_` prefix)
     to get the raw signing key.
  4. Compute HMAC-SHA256 over the signed content using that key (via Deno's
     built-in `crypto.subtle`), base64-encode the result.
  5. `svix-signature` may contain multiple space-separated `v1,<base64>`
     entries (Resend can rotate/dual-sign). Compare the computed signature
     against **each** `v1` entry using a **constant-time comparison** (not a
     plain `===`/string equality check, which leaks timing information) —
     match if any entry matches.
  6. Reject (401) if `svix-timestamp` is more than 5 minutes from the
     current time, even if the signature itself is valid — this bounds how
     old a replayed-but-genuinely-signed request can be.
  A request failing any of these checks is rejected (401) before touching
  the database. No third-party signature-verification library is added —
  this uses only Deno's built-in Web Crypto API, matching how every other
  Edge Function here only imports `jsr:@supabase/supabase-js`.
- **Must be deployed with Supabase's own JWT check turned off**
  (`supabase functions deploy resend-webhook --no-verify-jwt`) — Resend
  will never present a Supabase-issued token, so leaving the default JWT
  gate on would reject every real webhook call. This is the one function
  in the repo that needs this flag; call it out explicitly in the deploy
  step so it isn't lost the first time this function is redeployed (there is
  no committed `supabase/config.toml` in this repo pinning function-level
  JWT settings — deploy flags are the only mechanism today, so this has to
  be a documented, repeatable step, not tribal knowledge).
- **Payload validation, after signature verification:** parse the raw body
  as JSON (invalid JSON → 400). Require `type` (must be one of the three
  handled event names, else 200 no-op) and `data.email_id` (Resend's id for
  the message, matching `email_logs.provider_message_id`) and, for
  `email.bounced`/`email.complained`, `data.to` (array; take the first
  address). Missing required fields for an otherwise-recognized event type
  → 400.
- **Processing is one atomic database operation, not "record the event, then
  separately update state."** A single Postgres function (mirroring the
  existing `claim_email_idempotency_key` pattern in
  `0019_email_logs_idempotency.sql`) does all of the following in one
  transaction:
  1. Attempt to insert the event id into a dedup ledger
     (`resend_webhook_events`), `on conflict (event_id) do nothing`. If this
     insert affects zero rows, the event was already processed — the
     function returns immediately (still a 200 to the caller: this is Resend
     correctly retrying something we already handled, not an error) and
     nothing else runs.
  2. Otherwise (this is a genuinely new event), look up the `email_logs` row
     by `provider_message_id`. If none is found, the function still commits
     the dedup-ledger insert (so a legitimate retry of this same unmatched
     event doesn't reprocess it every time) and returns a distinct "no
     matching row" result — logged server-side, not surfaced as an error,
     still a 200 response.
  3. If found, update the matching field (`delivered_at`, `bounced_at`, or
     `complained_at`) with the event's own timestamp
     (`data.created_at` from the webhook payload — not "whenever our server
     happened to process it," so retried/delayed delivery of the webhook
     itself doesn't skew the recorded time).
  4. For `email.bounced`/`email.complained` only, also upsert into
     `email_suppressions` — insert a new row for this address, or, if a row
     already exists and was previously **cleared** (see below), re-arm it
     (clear the `cleared_at` timestamp and record the new reason). If a row
     already exists and is **currently active** (not cleared), leave it
     alone — the address is already blocked; a second bounce/complaint while
     already suppressed doesn't need to change anything.
  Because steps 1–4 are one transaction, any failure partway through rolls
  back the whole thing — including the dedup-ledger insert from step 1 —
  so a transient database error results in the event genuinely being
  unprocessed, and Resend's real retry can actually retry it, rather than
  the earlier draft's problem of marking an event "seen" and then silently
  losing the actual state update if the next step failed.

### Schema — one new migration, `0038_resend_delivery_webhook.sql`

(next unused number after `0037`):

- `email_logs` gains: `delivered_at timestamptz`, `bounced_at timestamptz`,
  `complained_at timestamptz`. (No `bounce_type` column — see the corrected
  event model above; there is no hard/soft distinction to store, since
  `email.bounced` is inherently permanent.) These sit alongside the existing
  `status` column rather than replacing it — `status` still reflects the
  original send outcome (`sent`/`failed`/`suppressed`), and these new
  columns layer the later delivery lifecycle on top. `delivered_at` and
  `complained_at` can both be set on the same row (delivered, then later
  reported as spam) — they are independent facts, not mutually exclusive
  states.
- New index `email_logs_provider_message_id_idx on email_logs(provider_message_id)`
  — the webhook looks up a row by this column on every event; today it's
  unindexed.
- New table `resend_webhook_events` (`event_id text primary key`,
  `event_type text not null`, `provider_message_id text`,
  `received_at timestamptz not null default now()`) — the dedup ledger for
  the idempotency check above. Storing `event_type`/`provider_message_id`
  alongside the bare id (not just the id alone) costs nothing and makes the
  table useful for debugging a specific incident later, without needing to
  cross-reference Resend's own dashboard. RLS enabled, zero policies (service-role-only, same pattern as `email_logs`). No automatic
  purge/retention policy for this table in this spec — its rows are small
  and low-volume; a cleanup job can be added later if it ever becomes large
  enough to matter, same as this app has no data-retention/expiry system
  anywhere else today.
- New table `email_suppressions`:
  - `id uuid primary key default gen_random_uuid()`
  - `email text not null unique`
  - `reason text not null check (reason in ('bounced', 'complained'))`
  - `created_at timestamptz not null default now()` — when the address was
    first suppressed.
  - `cleared_at timestamptz` — null while the suppression is active; set
    when someone manually clears it (see below). A row is only treated as
    "currently blocking sends" when this is null.
  - `cleared_by text` — free-text identifier of who cleared it (e.g. an
    email address or name), for a minimal audit trail. Nullable.
  - `cleared_note text` — optional free-text reason for clearing it.
    Nullable.
  RLS enabled, zero policies — written only by the webhook function and
  `sendEmail.ts`/the clearing endpoint, all via the service-role client.
  Rows are never deleted by this feature — clearing updates `cleared_at`,
  it doesn't remove the row — so there's always a record that an address
  bounced/complained at some point, even after it's been cleared.

### `supabase/functions/_shared/email/sendEmail.ts`

- Near the existing test/demo `account_type` check, add a second check:
  look up the normalized `recipientEmail` (via the existing
  `normalizeEmail()` from `utils.ts`, so casing matches whatever the webhook
  inserted) in `email_suppressions` **where `cleared_at is null`**. If a
  matching row exists, skip `renderTemplate`/Resend entirely, log the
  attempt with `status: 'suppressed'` and `error_message` set to a
  distinguishing note (e.g. `'recipient previously hard-bounced'` or
  `'recipient previously complained'`), and return
  `{ success: true, messageId: null, suppressed: true, suppressionReason: 'recipient_suppressed' }`.
  If this lookup itself fails (a database error, not "no row found"),
  **fail closed the same way the existing account-type suppression check
  does today** — do not silently proceed to send; treat it as a
  `provider_error` the same way a missing `RESEND_API_KEY` is handled
  elsewhere in this file, since sending to a known-bad address is worse than
  a delayed send.
- `SendEmailResult` (in `types.ts`) gains an optional
  `suppressionReason?: 'test_or_demo_account' | 'recipient_suppressed'`, set
  whenever `suppressed: true` is returned, from either suppression path.
  This is what lets callers tell the two cases apart instead of assuming
  every suppressed result means "test/demo account" (see the two invite
  functions below).

### `supabase/functions/invite-co-owner/index.ts` and `invite-sitter/index.ts`

- Both currently do: `if (emailResult.suppressed) { return { sent: false,
  reason: 'test_or_demo_account' } }`. This assumption is no longer safe
  once a second suppression reason exists. Change both to branch on
  `emailResult.suppressionReason` and return the matching reason string:
  `'test_or_demo_account'` or `'recipient_suppressed'`. The invite record
  itself (co-owner/sitter access row) is still created exactly as today in
  either case — only the email differs.

### `src/components/InviteCoOwnerDialog.jsx` and `InviteSitterDialog.jsx`

- Both currently have: `else if (fnResp.data?.reason === 'test_or_demo_account') { ... }
  else if (fnResp.data?.sent === false) { /* "already has an account" copy */ }`.
  Without a new branch, a `reason: 'recipient_suppressed'` response would
  fall into that second branch and show the wrong message (claiming the
  invitee already has an account, which isn't the actual situation). Add a
  new branch for `reason === 'recipient_suppressed'`, placed before the
  generic `sent === false` fallback, with honest copy — e.g. "{email} was
  added as a co-owner, but Wysker Watch couldn't email them (their address
  has previously failed to receive mail from us). They can still be reached
  another way to get access set up." Exact wording is a product-copy detail,
  not a technical one — flagged here so it isn't silently skipped, not to
  prescribe final copy.

### New Edge Function: `supabase/functions/clear-email-suppression/index.ts`

- A small ops-only endpoint to un-block an address, mirroring `send-email`'s
  existing service-role-JWT-only auth pattern exactly (no new auth mechanism
  invented) — kept as an Edge Function rather than a raw SQL runbook
  specifically because every other ops action in this codebase already
  follows that pattern (`send-email`, `reset-sandbox-account`), and this
  keeps the audit trail (`cleared_by`/`cleared_note`) enforced in one place
  instead of relying on whoever runs a manual query to remember to fill
  those fields in.
- Takes `{ email: string, clearedBy: string, note?: string }`. Sets
  `cleared_at = now()`, `cleared_by`, `cleared_note` on the matching
  (currently active) `email_suppressions` row. Does not delete the row.
  Returns not-found if no active suppression exists for that address.
- No UI calls this — it's invoked manually (e.g. via `curl` with a
  service-role token), the same way `send-email` already is for ops use.

### Secrets

`RESEND_WEBHOOK_SECRET` — one distinct value per environment (dev/staging/
prod each has its own webhook endpoint URL configured in Resend's dashboard,
and Resend issues a separate signing secret per endpoint), stored via
Supabase's encrypted secret store on each of the three projects. **Not**
added to `.env.example` — consistent with how `RESEND_API_KEY` and
`EMAIL_LINK_ALLOWED_HOSTS` are already handled today: `.env.example` in this
repo only documents frontend `VITE_*` variables, and Edge Function secrets
are managed exclusively via `supabase secrets set`, never through a
committed file. Adding this one secret there would be a new, inconsistent
pattern, not a missing one.

### Rollout order

Steps 1–5 apply to **all three environments** (dev, then staging, then
prod) — ordering matters within each: deploying an updated `sendEmail.ts`
that queries `email_suppressions` before that table exists would break
every email send in that environment, not just this feature. Steps 6–7
(actually telling Resend this endpoint exists) happen for **production
only** — see Functional Requirement 3 for why.

1. Apply migration `0038_resend_delivery_webhook.sql` (schema first).
2. **Verify grants on the two new tables** in that project immediately after
   — this repo has hit a real, silent grants gap before
   (`0035_fix_staging_table_grants.sql`), so confirm the service-role client
   can actually read/write `email_suppressions` and `resend_webhook_events`
   before relying on them, the same live check that migration's fix used.
3. Deploy the updated `sendEmail.ts`/`types.ts` and the two updated invite
   functions (recipient-suppression check now live; nothing yet populates
   `email_suppressions`, so this is a safe no-op until a real bounce/complaint
   is ever processed).
4. Deploy `clear-email-suppression`.
5. Deploy `resend-webhook` with `--no-verify-jwt`, and set a
   `RESEND_WEBHOOK_SECRET` value for that project. Dev needs a real (even if
   arbitrary) value here regardless of Resend registration — CI's integration
   tests (see Tests) sign their own test payloads with it and call the
   deployed function directly over HTTP, the same way `delete-pet`/
   `delete-account`'s tests already call deployed functions directly rather
   than going through a live trigger. Staging can use a placeholder value
   since nothing will ever call it there.
6. **Production only:** in Resend's dashboard, register the webhook endpoint
   for prod's function URL, selecting only `email.delivered`, `email.bounced`,
   `email.complained`. Dev and staging are deliberately never registered —
   see Functional Requirement 3.
7. **Production only:** send one real test email and confirm the
   corresponding `email_logs` row picks up a `delivered_at` (or trigger a
   bounce/complaint via Resend's test tools, if available, and confirm
   `email_suppressions` gets a row).

**Rollback:** migration `0038` is purely additive (new columns/tables,
nothing dropped or altered) — safe to leave in place even if the feature is
disabled. To disable without a schema rollback, unregister the webhook in
Resend's dashboard (stops new events arriving) and/or undeploy
`resend-webhook`; `sendEmail.ts`'s new suppression check simply finds no
rows and behaves as a no-op, so normal sending is unaffected either way.

**If a second Resend account is ever created later** (e.g. to isolate
dev/staging's sending reputation from prod's, a tradeoff deliberately not
taken now — see Functional Requirement 3), dev/staging's already-deployed
`resend-webhook` function and schema need no changes to start receiving
real events; only steps 6–7 above would need to be repeated for that new
account/environment.

### Tests

Following the existing Deno integration-test convention in this repo
(`supabase/functions/delete-pet/index.test.ts`,
`supabase/functions/delete-account/index.test.ts`, run against
`wysker-watch-dev` in CI's `edge-functions` job), add
`supabase/functions/resend-webhook/index.test.ts` covering:

- A validly-signed `email.delivered` payload updates the matching
  `email_logs` row's `delivered_at`.
- A validly-signed `email.bounced` payload updates `bounced_at` **and**
  creates an active `email_suppressions` row.
- A validly-signed `email.complained` payload updates `complained_at` and
  creates an active `email_suppressions` row, even when `delivered_at` is
  already set on that row.
- An invalid or missing signature is rejected (401), with no database
  change.
- A timestamp outside the 5-minute tolerance is rejected (401) even with an
  otherwise-valid signature.
- The same event id delivered twice only applies its effect once.
- A payload referencing an unknown `provider_message_id` is acknowledged
  (200) with no `email_logs` change.
- An unrecognized event type is acknowledged (200) with no state change.
- Malformed JSON is rejected (400).
- Once an address is in `email_suppressions` (active), `sendEmail()` skips
  Resend and returns `suppressed: true, suppressionReason: 'recipient_suppressed'`.
- After `clear-email-suppression` clears an address, `sendEmail()` sends
  normally again for that address.

CI's `edge-functions` job will need `RESEND_WEBHOOK_SECRET` (a test value)
added alongside its existing `SUPABASE_DEV_*` secrets to exercise signature
verification in these tests. One test ("a suppressed recipient stays
suppressed until cleared") additionally needs a legacy-JWT-format
service_role credential — the `DEV_LEGACY_JWT_SECRET` GitHub secret —
since `send-email`/`clear-email-suppression`'s auth check can't decode a
`role` claim from the newer opaque `sb_secret_...` key format used for
`SUPABASE_SERVICE_ROLE_KEY` elsewhere in CI.

### Constraints from CLAUDE.md / locked decisions

None conflict — no Vibe/scoring/check-in logic touched. The one deliberate,
flagged exception is `0006 Technical Standards.md`'s "Functions must require
authentication" rule, satisfied here via signature verification instead of a
Supabase JWT (see Before You Approve This).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found — no existing
  `resend-webhook` function, no signature-verification code anywhere in the
  repo, no suppression-list table.
- **Technical debt nearby:**
  - `sendEmail.ts`'s header comment (lines 15–19) explicitly names this
    exact gap as a known, deliberately deferred limitation — this spec is
    what resolves that comment; it should be removed/updated once this ships,
    the same way the test/demo-suppression work updated a similar comment.
  - The existing account-type suppression check compares against literal
    strings `'test'`/`'demo'` rather than a shared constant (already
    flagged, P5, out of scope). This spec's new recipient-suppression check
    lives in the same function, which is worth knowing even though it's not
    the same debt and this spec doesn't fix it either.
- **Orphaned features nearby:** Unchanged from the last time this was
  checked (`requirements-centralized-email-suppression.md`) — the `welcome`,
  `verify-email`, and `password-reset` templates are registered but have no
  caller anywhere. Not touched by this spec, but this webhook will start
  tracking delivery/bounce state for those templates too, whenever/if
  something eventually calls them.
- **Punch list / known issues in this area:** Directly resolves the P2 item
  "No bounce/delivery-webhook handling for Resend." Does not touch the
  adjacent P2 items on the same list (unbranded signup confirmation email,
  account-type blending in analytics, demo-account read-only enforcement).
- **A locked-decision-adjacent note, not a conflict:** `0006 Technical
  Standards.md` §4 states "Functions must require authentication" as a
  blanket rule. This spec's webhook function necessarily can't require a
  Supabase-issued token (see Technical Spec) — flagged above as a deliberate,
  documented exception rather than a silent violation.
- **Foundation doc gap, pre-existing:** `0007 Data Model_V2.md`'s own
  revision history already admits `email_logs`'s `suppressed` status
  (migration 0032) was never folded into that doc. This spec adds more to
  `email_logs` (plus two new tables) that will need the same catch-up —
  run `doc-updater` against the Data Model doc once this ships, same as
  should have happened after migration 0032. This is listed as an explicit
  Acceptance Criterion below, not left as an implicit "someday" — that was
  too weak in the first draft given CLAUDE.md's stance that foundation docs
  are ground truth.
- **No existing admin role/ownership process for a block list like this.**
  This app has no admin UI beyond a single `role === 'admin'` conditional
  note on the 404 page — there's no existing place to build proper
  ownership/escalation/expiry policy for `email_suppressions` into, and
  building one is explicitly out of scope (see Non-Goals). The ops-only
  Edge Function pattern is the same interim mechanism this codebase already
  relies on elsewhere (`send-email`, `reset-sandbox-account`), not a new
  category of risk this spec introduces.

## Non-Goals

- **No admin UI for viewing or managing the suppression list**, and no new
  access-control/ownership process beyond the existing service-role-JWT
  pattern. `clear-email-suppression` is invoked manually, not a page in the
  app.
- **No automatic expiry of a suppression.** Once added, it stays active
  until someone explicitly clears it — no time-based auto-clear.
- **No handling of `email.opened` / `email.clicked` events.** Out of scope
  — those involve open/click tracking (a tracking pixel and link-rewriting),
  a separate privacy consideration from delivery/bounce/complaint
  confirmation.
- **No handling of `email.delivery_delayed`.** Per the corrected event
  model above, this is a transient-condition signal, not a form of bounce,
  and isn't part of this spec.
- **Not fixing the P5 `'test'`/`'demo'` literal-vs-shared-constant debt** in
  `sendEmail.ts` — noted as adjacent, not addressed here.
- **Not changing the unbranded Supabase signup-confirmation email** or any
  other separate P2 punch-list item — this spec is scoped to the bounce/
  delivery webhook only.
- **Not retroactively backfilling delivery status for emails already sent**
  before this ships — only messages sent after this goes live will have
  Resend deliver these webhook events for them.
- **No automatic retention/cleanup job for `resend_webhook_events`** in this
  pass — flagged as a possible future addition if the table ever grows large
  enough to matter, not a blocking requirement now.
- **No webhook registered with Resend for dev or staging.** Only prod's
  endpoint is added in Resend's dashboard — a deliberate choice (see
  Functional Requirement 3), not an oversight. Dev/staging still get the
  full schema and function deployment (needed for CI tests and environment
  parity), they just never receive real traffic from Resend. Splitting into
  separate Resend accounts per environment, which would make per-environment
  registration meaningful, is explicitly not being done now.

## Acceptance Criteria (documentation)

- [ ] `docs/foundation/0007 Data Model_V2.md` is updated (via `doc-updater`)
  to include `email_logs`'s new columns and both new tables, in the same
  pass this feature ships — not deferred as a "someday" item, given the
  Data Model doc's own stated role as ground truth.

## Open Questions

None outstanding — all decisions needed to draft this (environment scope,
which events to handle, schema shape for delivery lifecycle, whether to
auto-suppress, suppression storage, and whether un-suppression is buildable)
were resolved in the clarifying-questions step before drafting. A second,
external technical review of the first draft surfaced implementation-level
corrections (Resend's actual event semantics, atomicity of webhook
processing, suppression-reason plumbing through the two invite flows,
signature-verification specifics, and un-suppression auditability) — all
addressed above, none left open.

## Revision Notes

This draft was reviewed by an independent technical review (Codex) before
implementation, which found:

1. The original bounce model (`hard`/`soft` derived from `email.bounced`
   alone) doesn't match how Resend actually reports bounces, and directly
   contradicted the spec's own decision to exclude `email.delivery_delayed`
   (the event that would have carried the "soft"/transient signal). Fixed by
   removing the hard/soft distinction entirely — `email.bounced` is treated
   as the permanent event it actually is.
2. The original wording claimed a message can't be both delivered and later
   complained about. Corrected — Resend's own complaint model is "delivered,
   then later reported as spam," so both fields can be set on the same row.
3. Webhook processing in the original draft recorded the dedup entry before
   confirming the resulting update succeeded, risking silently losing an
   event forever if that update then failed. Fixed by making the entire
   operation (dedup claim + state update + suppression upsert) one atomic
   database transaction.
4. The original draft didn't address that `invite-co-owner`/`invite-sitter`
   and their dialog components already hardcode a single suppression reason
   — a second suppression cause would have silently shown the wrong message
   to a real user. Fixed by adding a `suppressionReason` field through
   `sendEmail()` and updating both Edge Functions and both dialog components.
5. Signature verification was previously described only in general terms.
   This draft now specifies the exact Svix-style verification steps
   (raw-body signing, timestamp tolerance, constant-time comparison).
6. Un-suppression previously deleted the only record an address had ever
   bounced/complained. Fixed with a `cleared_at`/`cleared_by`/`cleared_note`
   model that preserves history instead of erasing it.
7. Added an explicit per-environment rollout order (schema → app code →
   webhook function → dashboard registration), a grants-verification step
   (this repo has hit a real cross-environment grants bug before), a
   rollback note, and a test-coverage section matching this repo's existing
   Deno integration-test convention.
8. Clarified that `RESEND_WEBHOOK_SECRET` intentionally does **not** go into
   `.env.example`, consistent with how `RESEND_API_KEY` is already handled
   (a correction to a suggestion in the external review that would have
   introduced a new, inconsistent pattern rather than fixed a real gap).
9. **Scope decision, made after the technical review:** confirmed dev,
   staging, and prod currently share a single Resend account (same hardcoded
   `no-reply@wyskerwatch.com` sender in `sendEmail.ts` across all three, no
   per-environment branching). Since Resend webhooks are account-scoped, not
   environment-scoped, registering three endpoints there wouldn't actually
   separate each environment's events. Decided to register only prod's
   endpoint with Resend — dev/staging still get the schema and function
   code (for CI testing and environment parity) but are never wired in as a
   live destination. See Functional Requirement 3, the Rollout order, and
   Non-Goals.
