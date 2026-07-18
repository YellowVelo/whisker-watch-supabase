# Feature Specification: Co-owner Invitation Email

> **Status: Shipped, spec reconciled to actual implementation on 2026-07-17.**
> This feature was originally scoped around a bespoke token-hash invite table.
> The implementation instead uses Supabase's own `admin.generateLink()` /
> `verifyOtp()` mechanism plus a `claim_pending_co_owner_invites()` RPC that
> links on next login by matching email. This document has been updated to
> describe what actually shipped. The "Prompt for Claude Code" section at the
> bottom is kept for history only — it describes the original ask, not the
> current system, and should not be replayed against this codebase.

## Purpose

Allow an owner to invite another person to become a co-owner for a specific pet by email.

The system must create a pending co-owner invite, send a transactional email, allow the invited user to accept the invite, and link the invited account to the pet once the invite is accepted.

## Functional Requirements

### 1. Invite Co-owner

The owner must be able to invite a co-owner from the pet’s sharing/co-owner action.

The invite form must collect:
- Email address

On submit:
- Validate the current user owns the pet.
- Validate the invitee email.
- Create the `pet_co_owners` row (email only — no token/expiry columns exist).
- Call the `invite-co-owner` Edge Function, which mints a Supabase auth link
  (`admin.generateLink()`) and sends the email.
- Show success state.

### 2. Email Sending

Use a Supabase Edge Function for all email sending.

Function name:
- `invite-co-owner`

Email provider:
- Resend, via the shared `_shared/email/sendEmail.ts` service.

The frontend must not call Resend directly.

### 3. Invite Email

Email must include:
- Pet name
- Inviting owner name or email
- Clear CTA to accept invite
- Invite link (expiry is Supabase's own auth-link TTL, not an app-tracked field)

Subject:
- `You’ve been invited to care for {Pet Name} on Wysker Watch`

Two templates exist, selected by whether this is a first-time invite or a
re-invite of a stuck/unaccepted invite:
- `co-owner-invitation` — first send (link type `invite`)
- `co-owner-invitation-reminder` — re-send (link type `recovery`, used when
  the invitee's auth user already exists but never set a password)

CTA URL format:
- `/accept-invite?token_hash={hash}&type={invite|recovery}&petId={petId}`

### 4. Accept Invite

When the recipient opens the invite link:
- If not authenticated, route to login/register.
- After authentication, return to the accept invite route.
- Redeem the token via `supabase.auth.verifyOtp({ token_hash, type })` to
  establish a session (email-match is implicit — `verifyOtp` only redeems
  the token minted for that specific email).
- Prompt the invitee to set a password (shared `SetPasswordForm`).
- Show success and route to `/pet/{petId}`.

Note: linking `co_owner_user_id` to the authenticated user does **not**
happen as part of this flow. It happens separately, via the
`claim_pending_co_owner_invites()` RPC, which the client calls once per
login/session-restore and which matches by lowercased email — independent
of whether the invite was ever opened or accepted through this route.

## UI Components

### Invite Co-owner Modal

Fields:
- Email address input
- Send Invite button
- Cancel button

States:
- Default
- Sending
- Success
- Error

### Pending Invite Display

There is no distinct "pending invite" UI state. `InviteCoOwnerDialog.jsx`
shows a flat co-owner list (email only) with a single "Remove" action per
row — no visual distinction between a pending (`co_owner_user_id IS NULL`)
and accepted co-owner, and no separate Resend or Cancel actions:
- Co-owner email
- Remove action (hard-deletes the `pet_co_owners` row)

Re-sending an invite is implicit: inviting the same email again re-runs the
`invite-co-owner` function, which falls back to a `recovery`-type link and
the reminder template if that email's auth user already exists without a
password.

### Accept Invite Screen

States:
- Loading invite
- Login/register required
- Accepting invite
- Success
- Expired invite
- Invalid invite
- Email mismatch

## User Interactions

### Owner Sends Invite

1. Owner opens Pet Profile.
2. Owner taps Share / Invite Co-owner.
3. Owner enters email.
4. Owner taps Send Invite.
5. System sends email.
6. Modal shows success confirmation.

### Invitee Accepts Invite

1. Invitee clicks email link.
2. App opens accept invite route.
3. If needed, invitee signs in or creates account.
4. System validates invite.
5. System grants access.
6. Invitee lands on pet profile or confirmation screen.

## Navigation

Owner flow:
- Pet Profile
- Invite Co-owner modal
- Return to Pet Profile

Invitee flow:
- Email link
- `/accept-invite?token_hash=...&type=invite|recovery&petId=...`
- `verifyOtp` redemption + set-password screen
- Pet Profile

## Empty States

If no co-owners or pending invites exist:
- Show: `No co-owners have been invited yet.`

If invitee opens accept screen without token:
- Show: `This invite link is missing or invalid.`

## Loading States

Show loading indicators for:
- Sending invite (also covers implicit resend — same action, same email)
- Verifying invite token (`verifyOtp`)
- Setting password / accepting invite
- Removing a co-owner

Buttons must be disabled while requests are in progress.

## Error States

Show user-safe errors only.

Examples:
- `Unable to send invite. Please try again.`
- `This invitation link is invalid or has expired. Ask the pet owner to send a new invite.`
- `You do not have permission to invite co-owners for this pet.`

Do not expose stack traces, provider errors, or raw database errors.

## Business Rules

- Only the primary owner may invite or remove co-owners.
- Co-owners have full pet access once accepted (via `is_pet_owner()`, giving
  the same rights as the original owner, including delete — see
  [0004_co_owner_accounts.sql:56](../../supabase/migrations/0004_co_owner_accounts.sql)).
- A pending invite (`co_owner_user_id IS NULL`) does not grant access.
- Linking on acceptance is done by email match (`claim_pending_co_owner_invites()`),
  not by an explicit token-to-invite validation step.
- Owners cannot invite themselves (enforced client-side in the invite dialog).
- Invite emails must be sent only from server-side code (the `invite-co-owner`
  Edge Function).
- There is no app-level "canceled" or "expired" state — removing a co-owner
  hard-deletes the row, and link expiry is whatever Supabase's own auth-link
  TTL is.
- There is currently no database constraint preventing duplicate
  `pet_co_owners` rows for the same pet/email pair; the invite dialog only
  guards against this in the UI (checking its already-loaded list), not at
  the database level.

## Validation Rules

Email:
- Required
- Must be valid email format
- Normalize to lowercase before storing/comparing
- Cannot equal current owner email

Invite token:
- `token_hash` and `type` (`invite` or `recovery`) must be present in the
  accept-invite URL.
- Redemption and all validity checks (expiry, single-use, matching email)
  are delegated to Supabase's `auth.verifyOtp()` — there is no app-level
  token table to validate against.

## Data Requirements

`pet_co_owners` (as implemented — see
[0004_co_owner_accounts.sql:16-24](../../supabase/migrations/0004_co_owner_accounts.sql)):

- `id`
- `pet_id`
- `owner_id` — the primary owner who owns the invite
- `created_by` — who clicked invite (kept for parity with the generic entity-create helper)
- `co_owner_email`
- `co_owner_user_id` — null until claimed; set by `claim_pending_co_owner_invites()`
- `created_at`

No `invite_token_hash`, `invite_expires_at`, `accepted_at`, `canceled_at`,
`last_sent_at`, or `updated_at` columns exist. Acceptance state is inferred
purely from `co_owner_user_id`: `NULL` = pending, non-null = accepted.
Tokens are never stored in this table at all — Supabase's own
`generateLink()`/`verifyOtp()` mechanism owns token issuance and redemption
entirely outside this schema.

RLS ([0004_co_owner_accounts.sql:35-43](../../supabase/migrations/0004_co_owner_accounts.sql)):
- Primary owner can create, view, and delete co-owner rows for owned pets.
- A co-owner can view their own row.
- **No update policy exists.** `co_owner_user_id` is only ever written by the
  SECURITY DEFINER `claim_pending_co_owner_invites()` RPC
  ([0016_link_pending_co_owner_invites.sql](../../supabase/migrations/0016_link_pending_co_owner_invites.sql)),
  which runs once per login/session-restore and matches on lowercased email.
- No anonymous access.

This aligns with the existing co-owner model where co-owner access depends
on `co_owner_user_id` being linked — but that linking happens via the
login-time RPC, not via the accept-invite route itself.

## Acceptance Criteria

- Owner can send a co-owner invite from a pet.
- Invite email is delivered through server-side email function.
- Co-owner appears in the list immediately after sending (pending state, i.e.
  `co_owner_user_id IS NULL`).
- Re-inviting the same email resends (falls back to a `recovery` link +
  reminder template if the invitee already has an unclaimed auth user).
- Invitee can accept invite after logging in / setting a password.
- Accepted co-owner (`co_owner_user_id` linked) can view and manage the pet
  with full owner parity.
- Pending invitee cannot access the pet before `claim_pending_co_owner_invites()`
  links their account.
- All database access follows existing data layer standards.
- No Supabase calls are made directly from UI components (email-sending and
  admin operations go through the `invite-co-owner` Edge Function).

## Edge Cases

- Invitee clicks link after Supabase's auth-link TTL has passed.
- Invitee forwards email to another person (their `verifyOtp` call fails/
  establishes a session for the wrong identity if already logged in as
  someone else — not specifically guarded against beyond normal auth).
- Invitee signs up with different email casing (mitigated by lowercasing on
  both write and RPC match).
- Owner re-invites the same email multiple times (falls back to
  `recovery`-type link once an unclaimed auth user exists).
- Pet is deleted before invite is accepted (`pet_co_owners.pet_id` cascades
  on delete).
- Owner account is deleted before invite is accepted (`owner_id` cascades on
  delete).
- Email provider fails (function returns a 502; the `pet_co_owners` row still
  exists, so the invite dialog reports partial success and suggests retry or
  "Forgot password").
- Network fails after invite row is created but before email sends (same as
  above — row persists, re-inviting resends).
- Invitee's email is already a genuinely registered account (`email_has_password()`
  returns true) — treated as "already exists," no re-invite email is sent.
- Multiple pets invite the same email — each is an independent
  `pet_co_owners` row; no cross-pet dedup.

## Implementation Notes

- Preserve the existing visual style, spacing, and component patterns defined by the Design System.
- Follow the project architecture: frontend remains thin, backend logic belongs in Supabase Edge Functions, and UI components must not call Supabase tables directly.
- Route data access through the existing entity/data layer.
- Store email provider API keys only in Supabase secrets.
- Use structured JSON responses from Edge Functions.
- Never leak provider errors or stack traces to the client.
- **Not implemented:** the `co_owner_invite_started/sent/failed/resent/canceled/accepted`
  analytics events described in earlier drafts of this spec do not exist in
  `InviteCoOwnerDialog.jsx` or `invite-co-owner/index.ts`. Treat as a real
  gap if analytics coverage for this flow is wanted, not as documentation of
  current behavior.

# Prompt for Claude Code (historical — original ask, superseded by the above)

The section below is preserved for history. It describes the feature as
originally scoped, before implementation deviated from it (bespoke token
table → Supabase Auth links; resend/cancel actions → plain remove). Do not
replay this prompt against the current codebase — it would contradict the
Functional Requirements/Data Requirements sections above, which describe
what actually shipped.

You are implementing the Wysker Watch Co-owner Invitation Email feature.

Read the Foundation documents first:
- Product Context
- Design System
- Technical Standards
- Data Model
- Navigation & Information Architecture
- Terminology

Build only the feature described in this specification.

Implement:
1. Supabase migration updates for co-owner invite token, expiration, accepted/canceled states, and timestamps.
2. Supabase Edge Function `send-co-owner-invite`.
3. Server-side transactional email sending using Resend unless an email provider is already configured.
4. Frontend invite modal from the pet sharing/co-owner action.
5. Pending invite display with resend and cancel actions.
6. `/accept-invite` route for accepting invites.
7. Login/register redirect handling for unauthenticated invitees.
8. Validation that authenticated user email matches invited email.
9. RLS-safe access control consistent with the existing `pet_co_owners` model.
10. Loading, empty, success, and error states.

Do not redesign the UI.
Do not introduce direct Supabase table calls inside UI components.
Do not use Supabase Auth invites for this feature.
Do not expose raw invite tokens in the database.
Do not grant pet access until the invite is accepted and `co_owner_user_id` is linked.

Return a summary of changed files, migrations, Edge Functions, and manual QA steps when complete.