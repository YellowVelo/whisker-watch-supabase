# Feature Specification: Co-owner Invitation Email

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
- Create or update a pending co-owner invite.
- Generate an invite token.
- Send an invitation email.
- Show success state.

### 2. Email Sending

Use a Supabase Edge Function for all email sending.

Function name:
- `send-co-owner-invite`

Email provider:
- Use Resend unless an existing transactional email provider is already configured.

The frontend must not call Resend directly.

### 3. Invite Email

Email must include:
- Pet name
- Inviting owner name or email
- Clear CTA to accept invite
- Expiring invite link

Subject:
- `You’ve been invited to care for {Pet Name} on Wysker Watch`

CTA URL format:
- `/accept-invite?token={invite_token}`

### 4. Accept Invite

When the recipient opens the invite link:
- If not authenticated, route to login/register.
- After authentication, return to the accept invite route.
- Validate token.
- Confirm authenticated user email matches invite email.
- Link `co_owner_user_id` to authenticated user.
- Mark invite accepted.
- Show success screen.
- Provide CTA to open the pet.

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

Show pending invited co-owner email with:
- Pending status
- Resend invite action
- Cancel invite action

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
- `/accept-invite?token=...`
- Login/Register if unauthenticated
- Accept Invite confirmation
- Pet Profile

## Empty States

If no co-owners or pending invites exist:
- Show: `No co-owners have been invited yet.`

If invitee opens accept screen without token:
- Show: `This invite link is missing or invalid.`

## Loading States

Show loading indicators for:
- Sending invite
- Loading invite token
- Accepting invite
- Resending invite
- Canceling invite

Buttons must be disabled while requests are in progress.

## Error States

Show user-safe errors only.

Examples:
- `Unable to send invite. Please try again.`
- `This invite has expired. Ask the owner to send a new invite.`
- `This invite was sent to a different email address. Please sign in with the invited email.`
- `You do not have permission to invite co-owners for this pet.`

Do not expose stack traces, provider errors, or raw database errors.

## Business Rules

- Only the primary owner may invite or remove co-owners.
- Co-owners have full pet access once accepted.
- A pending invite does not grant access.
- Invite acceptance requires authenticated user email to match invited email.
- Duplicate pending invites to the same email for the same pet should not create duplicate rows.
- Resending an invite should refresh token and expiration.
- Canceled invites cannot be accepted.
- Expired invites cannot be accepted.
- Owners cannot invite themselves.
- Invite emails must be sent only from server-side code.

## Validation Rules

Email:
- Required
- Must be valid email format
- Normalize to lowercase before storing/comparing
- Cannot equal current owner email

Invite token:
- Required
- Must match active pending invite
- Must not be expired
- Must not be accepted
- Must not be canceled

## Data Requirements

Update `pet_co_owners` or create related invite fields/table.

Required fields:
- `id`
- `pet_id`
- `owner_id`
- `co_owner_email`
- `co_owner_user_id`
- `invite_token_hash`
- `invite_expires_at`
- `accepted_at`
- `canceled_at`
- `last_sent_at`
- `created_at`
- `updated_at`

Do not store raw invite tokens. Store only token hash.

RLS:
- Primary owner can create, view, resend, and cancel invites for owned pets.
- Invited user gains pet access only after `co_owner_user_id` is linked.
- No anonymous access.

This must align with the existing co-owner model where co-owner access depends on `co_owner_user_id` being linked. :contentReference[oaicite:0]{index=0}

## Acceptance Criteria

- Owner can send a co-owner invite from a pet.
- Invite email is delivered through server-side email function.
- Pending invite appears after sending.
- Owner can resend pending invite.
- Owner can cancel pending invite.
- Invitee can accept invite after logging in.
- Invitee cannot accept invite using a different email.
- Expired invite cannot be accepted.
- Canceled invite cannot be accepted.
- Accepted co-owner can view and manage the pet.
- Pending invitee cannot access the pet before accepting.
- Duplicate invites to the same pet/email do not create duplicate active invites.
- All database access follows existing data layer standards.
- No Supabase calls are made directly from UI components.

## Edge Cases

- Invitee clicks link after expiration.
- Invitee forwards email to another person.
- Invitee signs up with different email casing.
- Owner resends invite multiple times.
- Owner cancels invite after email was sent.
- Pet is deleted before invite is accepted.
- Owner account is deleted before invite is accepted.
- Email provider fails.
- Network fails after invite row is created but before email sends.
- User is already a co-owner.
- User is already the primary owner.
- Multiple pets invite the same email.

## Implementation Notes for Claude Code

- Preserve the existing visual style, spacing, and component patterns defined by the Design System.
- Follow the project architecture: frontend remains thin, backend logic belongs in Supabase Edge Functions, and UI components must not call Supabase tables directly. :contentReference[oaicite:1]{index=1}
- Use TypeScript where applicable.
- Route data access through the existing entity/data layer.
- Implement schema changes through Supabase migrations.
- Store email provider API keys only in Supabase secrets.
- Use structured JSON responses from Edge Functions.
- Never leak provider errors or stack traces to the client.
- Add analytics events:
  - `co_owner_invite_started`
  - `co_owner_invite_sent`
  - `co_owner_invite_failed`
  - `co_owner_invite_resent`
  - `co_owner_invite_canceled`
  - `co_owner_invite_accepted`

# Prompt for Claude Code

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