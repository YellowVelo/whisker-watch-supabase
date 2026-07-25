# Requirements: Centralize Test/Demo Email Suppression in sendEmail()

**Status:** Implemented and deployed (2026-07-24/25). Live on `wysker-watch-dev`, `wysker-watch-staging`, and prod (`Whisker-Watch`). Verified live on dev and prod (a `sentByUserId` pointing at a `test`-type account correctly returned `suppressed: true` with no Resend call, and produced an `email_logs` row with `status: 'suppressed'`). Not independently verified on staging — see the deploy note below.
**Date:** 2026-07-24

## Deploy Notes (added after shipping)

- **Migration history gaps on dev/staging.** Pushing migration 0032 first required reconciling pre-existing gaps in each project's migration history — unrelated to this change. `0003_real_data_import.sql` and `0007_restore_real_data_new_account.sql` insert your real personal pet data (Harper/Auggie/Tribble) under specific production `user_id`s, and `0027_migrate_symptom_logs_to_checkins.sql` is a one-time backfill of that same data — none of these belong on dev/staging, so they were marked resolved in each project's migration history via `supabase migration repair --status applied` (which records them as done *without running their SQL*) rather than actually run. Staging was also missing `0026_vibe_and_symptom_count.sql`, a real (and self-described idempotent/safe-to-rerun) schema migration — that one was genuinely applied via `db push`, not skipped.
- **Staging verification gap.** Staging's service-role REST access to `profiles`/`daily_check_ins` returned `permission denied` (a Postgres grants issue, not RLS) — pre-existing, unrelated to this change, but it meant the same live check done on dev/prod couldn't be run on staging. This has been flagged separately for investigation since it could affect other Edge Functions that query `profiles` via the admin client. Staging's migration + function deploys themselves completed without error.
**Related files:**
[supabase/functions/_shared/email/sendEmail.ts](../../supabase/functions/_shared/email/sendEmail.ts),
[supabase/functions/_shared/email/types.ts](../../supabase/functions/_shared/email/types.ts),
[supabase/functions/invite-co-owner/index.ts](../../supabase/functions/invite-co-owner/index.ts),
[supabase/functions/invite-sitter/index.ts](../../supabase/functions/invite-sitter/index.ts),
[supabase/functions/send-email/index.ts](../../supabase/functions/send-email/index.ts),
[supabase/migrations/0018_email_logs.sql](../../supabase/migrations/0018_email_logs.sql),
[supabase/migrations/0019_email_logs_idempotency.sql](../../supabase/migrations/0019_email_logs_idempotency.sql),
[docs/launch-punch-list.md](../launch-punch-list.md) (P2).

## Before You Approve This

- **This does touch the database.** `email_logs.status` currently only allows `'pending' | 'sent' | 'failed'` (set in migration 0019). Per your answer, a suppressed send should still be logged, which means adding `'suppressed'` as a fourth allowed value — a small migration, not just an application code change.
- **No conflicts with locked decisions in CLAUDE.md** — this is purely email-delivery plumbing, nothing touches check-in/Vibe/scoring logic.
- **This does not fix `delete-account/index.ts`'s separate `account_type` check**, per your answer — that check blocks account deletion, a different concern from suppressing an email, and is left as-is.
- **This does not build the Resend bounce/delivery webhook** (the other email-related P2 item) — that's a separate, larger piece of work and not bundled into this spec.
- **A behavior change for the two existing callers, not just a refactor:** today, a suppressed send produces zero trace in `email_logs`. After this change, it produces a `'suppressed'` row. This is the point of your answer above, but it's worth naming plainly: anyone who has learned to read "no row = test/demo account" will need to instead look for `status = 'suppressed'`.

## Functional Requirements

### 1. One place decides whether a send is real or suppressed

Right now, two different Edge Functions (`invite-co-owner`, `invite-sitter`) each independently look up the sending account's type and skip the real email themselves. Going forward, the shared email-sending code itself (`sendEmail()`) should be the one place that makes this decision, given who is sending. Any future feature that sends email gets this protection automatically, without needing to remember to add the same check itself — which is exactly what didn't happen safely: the shared code's own comments have been warning since day one that a second caller needing this guard was the signal to centralize it, and that has now happened twice.

### 2. Test and demo accounts still never trigger a real outbound email

No change in outcome for the two existing flows (inviting a co-owner, inviting a sitter): a `test` or `demo` account triggering either flow must still result in no real email being sent, exactly as today.

### 3. Suppressed sends are now visible in the delivery log

Today, a suppressed send leaves no record anywhere in `email_logs` — the only way to know it happened is that the feature "worked" (the invite record was created) but no email arrived, which is indistinguishable from a silent failure. Going forward, a suppressed send is recorded with a distinct status, so anyone looking at delivery history can tell "this was deliberately skipped for a test/demo account" apart from "this failed" or "this was never attempted."

### 4. The two existing callers stop doing their own lookup

`invite-co-owner` and `invite-sitter` currently each query the sender's account type themselves before deciding whether to call `sendEmail()` at all. Once the shared code does this itself, these two callers should stop duplicating that lookup and instead just tell the shared code who's sending, letting it decide.

## Acceptance Criteria

- **Given** a `test` or `demo` account invites a co-owner or a sitter, **when** they submit the form, **then** the underlying record (co-owner/sitter access) is still created exactly as today, but no real email is sent to Resend.
- **Given** a `test` or `demo` account triggers a suppressed send, **when** you look at the `email_logs` table afterward, **then** there is a new row for that attempt with a status that clearly means "suppressed," not "sent" or "failed," and not simply absent.
- **Given** a real (production/owner) account invites a co-owner or a sitter, **when** they submit the form, **then** behavior is unchanged — a real email sends, and `email_logs` records it exactly as it does today.
- **Given** the existing frontend messaging that tells a test/demo user "no real email was sent" (the `sent: false, reason: 'test_or_demo_account'` response `InviteCoOwnerDialog.jsx`/`InviteSitterDialog.jsx` already handle), **when** this change ships, **then** that same user-facing message still appears — the internal mechanism moves, but nothing the user sees changes.
- **Given** the `send-email` HTTP endpoint (used by ops/scheduled callers, not by these two flows), **when** a caller doesn't pass any sender identity, **then** behavior is unchanged from today (no suppression applied, since there's no account to check) — this endpoint is not required to gain suppression as part of this spec, only to not break.

## Visual Reference

No mockups or screenshots apply — this is backend delivery-logic plumbing with no new UI. The one user-visible surface (the "no real email sent for test/demo accounts" message in `InviteCoOwnerDialog.jsx`/`InviteSitterDialog.jsx`) is explicitly required to stay unchanged, per the acceptance criteria above.

## Technical Spec

- **Schema:** New migration `0032_email_logs_suppressed_status.sql` (next unused number in `supabase/migrations/`), modeled on how `0019_email_logs_idempotency.sql` altered the same constraint:
  ```sql
  alter table public.email_logs
    drop constraint email_logs_status_check,
    add constraint email_logs_status_check check (status in ('pending', 'sent', 'suppressed', 'failed'));
  ```
  No new columns needed — the existing `error_code`/`error_message` fields stay null for a suppressed row; there's no error, so nothing to populate there.

- **`supabase/functions/_shared/email/types.ts`:**
  - `SendEmailParams` gains an optional field, e.g. `sentByUserId?: string` — the id of the `profiles` row responsible for triggering this send. Callers that don't pass it (like today's `send-email` HTTP endpoint) get no suppression check, same as today.
  - `SendEmailResult` gains an optional `suppressed?: boolean` (true only when the send was skipped for this reason), so callers can still distinguish "real send happened" from "skipped for test/demo" without doing their own lookup.

- **`supabase/functions/_shared/email/sendEmail.ts`:**
  - Near the top of `sendEmail()`, if `params.sentByUserId` is present, query `profiles.account_type` for that id using the existing admin client (`getAdminClient()`, already used elsewhere in this file).
  - If `account_type` is `'test'` or `'demo'`: skip the `renderTemplate`/Resend call entirely, write an `email_logs` row with `status: 'suppressed'` (via `insertLog`/`finalizeLog`, same as the existing logging paths — including the idempotency-key claim path, so a suppressed send still correctly finalizes a claimed row rather than leaving it stuck at `'pending'`), and return `{ success: true, messageId: null, suppressed: true }`.
  - Otherwise, proceed exactly as today.
  - Update the file's header comment (lines 15–21) to remove the "deliberately deferred gap" note, since this is what it was describing.

- **`supabase/functions/invite-co-owner/index.ts`:**
  - Remove the existing `profiles.account_type` lookup and the `if (inviterProfile?.account_type === 'test' || ...)` early-return block (lines ~107–116). The function still needs `inviterProfile.first_name` for the email body/subject, so it keeps a lookup for the profile row, just without branching on `account_type` itself.
  - Pass `sentByUserId: userData.user.id` into the `sendEmail()` call.
  - After `sendEmail()` returns, check `emailResult.suppressed` — if true, return the existing `{ sent: false, reason: 'test_or_demo_account' }` response instead of `{ sent: true, ... }`, preserving the current frontend contract.

- **`supabase/functions/invite-sitter/index.ts`:** Same shape of change as `invite-co-owner`, mirroring its existing pattern (lines ~90–99 for the removed check, same `sentByUserId`/`suppressed` wiring around its `sendEmail()` call).

- **`supabase/functions/send-email/index.ts`:** Optionally accept `sentByUserId` in the request body and pass it straight through to `sendEmail()`, for symmetry — but no caller today has a use for it (this endpoint is service-role-only, called by ops/scheduled jobs with no single "acting user"). Not required by the acceptance criteria; include it only if trivial, since it costs nothing to plumb through.

- **Constraints from CLAUDE.md / locked decisions:** None — no check-in/Vibe/scoring logic touched.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** This is the finding that motivates the whole spec — `invite-co-owner/index.ts` and `invite-sitter/index.ts` each independently implement the identical account-type check before calling `sendEmail()`. This spec removes the duplication rather than adding a third copy.
- **Technical debt nearby:**
  - `sendEmail.ts`'s own header comment (lines 15–21) has been explicitly flagging this exact gap as "deliberately deferred" and naming the trigger condition ("if a second workflow needs the same guard, that's the signal to centralize it") since before either of the two current call sites existed. That trigger condition has now been met twice.
  - Both existing call sites compare against the lowercase string literals `'test'`/`'demo'` directly rather than a shared constant (`src/lib/accountType.js` has `isTestAccount`/`isDemoAccount` helpers, but Edge Functions can't import frontend `src/lib` code across the client/server boundary — this is a known, separate, pre-existing inconsistency, already flagged on the punch list under P5, not something this spec fixes). After this change, the literal comparison exists in exactly one place (`sendEmail.ts`) instead of two, which shrinks — but doesn't eliminate — that debt.
- **Orphaned features nearby:** The `welcome`, `verify-email`, and `password-reset` email templates (`supabase/functions/_shared/email/templates/`) are registered but have no caller anywhere in the codebase today — confirmed by a full-repo search for those template name strings outside their own definitions. This isn't caused by or fixed by this spec, but it's directly adjacent code worth knowing about: `sendEmail()`'s new suppression logic will apply to these templates too, whenever/if something eventually calls them.
- **Punch list / known issues in this area:** Directly resolves the P2 item "Test/demo account email suppression isn't centralized" in `docs/launch-punch-list.md`. Does not address the adjacent P2 item "No bounce/delivery-webhook handling for Resend" (separate spec, per your earlier decision) or the P5 lowercase-literal-vs-shared-constant item (noted above, not in scope).

## Non-Goals

- **Not building the Resend bounce/delivery webhook.** Separate P2 item, separate spec.
- **Not fixing the P5 lowercase-string-literal vs. shared-constants inconsistency.** The literal comparison moves to one place; it isn't replaced with the frontend's shared helper (which Edge Functions structurally can't import).
- **Not changing `delete-account/index.ts`'s account_type check.** Confirmed out of scope — different purpose (blocking a destructive action, not suppressing an email), left as-is.
- **Not adding suppression to the `send-email` HTTP endpoint's real behavior** beyond optionally accepting the new parameter — no current caller of that endpoint has an acting user to pass.
- **Not changing anything about `email_logs`'s `'pending'`/`'sent'`/`'failed'` statuses** or the idempotency-key mechanism — this only adds a fourth status value alongside them.

## Open Questions

None outstanding — both decisions needed to draft this (whether to log suppressed sends, and whether to touch `delete-account`) were resolved in conversation before drafting:
1. Suppressed sends will be logged to `email_logs` with a new `'suppressed'` status (requires the small migration described above).
2. `delete-account/index.ts`'s separate account_type check is out of scope and untouched.
