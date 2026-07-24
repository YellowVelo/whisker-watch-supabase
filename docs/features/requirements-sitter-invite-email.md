# Requirements: Sitter Invite Email + Access Linking

**Status:** Implemented (2026-07-24). Live on dev, staging, and prod.
**Date:** 2026-07-24
**Related files:**
[src/components/InviteSitterDialog.jsx](../../src/components/InviteSitterDialog.jsx),
[src/components/PetSittingSection.jsx](../../src/components/PetSittingSection.jsx),
[src/lib/petsClient.js](../../src/lib/petsClient.js),
[src/lib/AuthContext.jsx](../../src/lib/AuthContext.jsx),
[supabase/functions/invite-co-owner/index.ts](../../supabase/functions/invite-co-owner/index.ts) (the pattern this mirrors),
[supabase/functions/_shared/email/sendEmail.ts](../../supabase/functions/_shared/email/sendEmail.ts),
[supabase/functions/_shared/email/templates/index.ts](../../supabase/functions/_shared/email/templates/index.ts),
[supabase/migrations/0001_init_schema.sql](../../supabase/migrations/0001_init_schema.sql) (`pet_sitter_access`, `pet_sit_logs`),
[supabase/migrations/0016_link_pending_co_owner_invites.sql](../../supabase/migrations/0016_link_pending_co_owner_invites.sql) (the linking bug this same pattern already caused once, for co-owners).

## Post-Implementation Note (added after shipping)

Manually testing this end to end (against `wysker-watch-dev`) surfaced two more pre-existing bugs beyond the two already called out below — `pet_sitter_access` was missing a `created_by` column every insert needs (migration `0029`), and the database had no rule letting a sitter read the `pet_sits`/`pets` rows for what they're sitting for at all (migrations `0030`, `0031`). Fixing that last one exposed a side effect in `Pets.jsx`: it had assumed anything visible to a user was something they owned, so a sitter would've shown up with a full owner-management card instead of a limited view. Fixed by having `Pets.jsx`/`petsClient.js` explicitly check *why* a pet is visible, and renaming the "Shared with Me" section to **"Pets I Sit"** (owners see no change). None of this is reflected in the Technical Spec section below, which describes the plan as originally approved — this note exists so a reader isn't confused why the shipped code has more moving parts than the spec.

## Before You Approve This

- **This spec grew in scope during investigation, with your sign-off.** What started as "send the missing sitter email" turned up a second, unrelated bug: the column that's supposed to record a sitter's real account (`pet_sitter_access.sitter_user_id`) is never set anywhere in the code. That means a sitter can currently see they've been granted access, but the database rule that lets them actually log a feeding/meds entry checks that same never-set column — so logging silently fails to be *allowed* even once they sign up. You confirmed this should be fixed together with the email, not deferred, so both are in this spec.
- **This is the second time this exact bug pattern has happened.** The co-owner feature had the identical bug (an "I'll link on login" column that nothing ever updated) — see `supabase/migrations/0016_link_pending_co_owner_invites.sql`'s own header comment describing the incident. This spec's technical approach deliberately copies that fix's shape (a `SECURITY DEFINER` database function, called once per login) rather than inventing a new mechanism, specifically so it doesn't quietly diverge from the pattern that's already been proven to work.
- **No conflicts with locked decisions in CLAUDE.md** — this doesn't touch check-in/scoring logic at all.
- **One naming inconsistency worth knowing about, not fixing here:** `docs/launch-punch-list.md` (P5 tier) already flags that test/demo account checks are compared against lowercase string literals in a few places instead of the shared `src/lib/accountType.js` constants. The new code in this spec will use the shared `isTestAccount`/`isDemoAccount` helper pattern correctly on the frontend, but the Edge Function side (like `invite-co-owner` today) still compares against literal `'test'`/`'demo'` strings server-side, since Edge Functions can't import frontend `src/lib` code across the client/server boundary. Same as the existing pattern — not a new inconsistency, just repeating the existing one.

## Functional Requirements

### 1. Sitter actually gets emailed

When a pet owner invites a sitter (enters an email in the "Share with Sitter" dialog and taps Invite), the sitter must receive a real email telling them:
- Who invited them (the owner's name)
- Which pet(s) and which date range they've been given access to
- A clear button/link to accept and get set up in the app

Today, nothing is sent — the invite silently only creates a database record, and the sitter has no way to find out except being told directly by the owner (confirmed on the launch punch list).

The email should be kept simple: owner name, pet name(s), the sit's date range, and the accept link. It should **not** list out the specific daily tasks (AM/PM food, meds, custom checklist items) the owner set up for the sit — that level of detail belongs in the app once the sitter is logged in, not in the notification email.

### 2. New sitters get a proper account setup, not Supabase's bare-bones default

If the invited email has never used Wysker Watch before, the invite email itself creates their account behind the scenes and the link in the email takes them straight to a branded "set your password" screen — the same experience a newly-invited co-owner already gets today. They should not be dropped into a generic sign-up form or Supabase's own unbranded confirmation email.

If the invited email already belongs to an existing Wysker Watch account, the email instead simply lets them know the pet(s) are now shared with their existing account.

### 3. Test and demo accounts never trigger a real email

Wysker Watch has shared `test`/`demo` login accounts used for internal QA and the public demo. If one of those accounts invites a sitter, the database record should still be created (so the feature is testable end-to-end), but no real email should go out — matching the existing rule for co-owner invites.

### 4. Once a sitter accepts, they can actually use the access they were given

Today, even a sitter who successfully signs in with the invited email cannot actually record anything for the pet(s) they were granted access to — a separate database rule blocks it because of the linking bug described above. This spec fixes that so accepting the invite (or simply logging in, for an already-registered sitter) actually finishes connecting their account to the access they were granted, the same way it already works for co-owners.

### 5. Revoking a sitter's access also revokes their ability to log entries

If an owner taps "Remove" on an invited sitter (the existing trash-can control in the Share with Sitter dialog), that sitter should immediately lose the ability to record feeding/meds/task entries for that pet-sit, not just disappear from the owner's list. This already happens automatically once Functional Requirement 4 above is in place: removing deletes the `pet_sitter_access` row entirely, and the database rule that allows a sitter to write log entries requires that row to exist. No new revocation code is needed — this is called out explicitly so it's verified as part of testing this change, not assumed.

### 6. Re-inviting the same sitter email

If an owner enters an email that's already listed as an invited sitter for that pet-sit, no second record and no second email is created — same as today's existing behavior (the dialog already silently no-ops in this case). This spec does not add a "resend" button; that's out of scope (see Non-Goals).

## Acceptance Criteria

- **Given** an owner (real, production account) invites a sitter by email for a pet-sitting period, **when** they submit the form, **then** the sitter receives an email within a normal delivery window naming the owner, the pet(s), and the sit dates, with a working link.
- **Given** the invited email has no existing Wysker Watch account, **when** they open the email link, **then** they land on a branded "accept invite, set password" screen (not a generic sign-up form), and after setting a password they can see the shared pet(s).
- **Given** the invited email already has a Wysker Watch account, **when** they open the email link (or just log in normally after being invited), **then** they see the shared pet(s) without any password-reset detour.
- **Given** a `test` or `demo` account invites a sitter, **when** they submit the form, **then** the database record is created exactly as today, but no real email is sent.
- **Given** a sitter has accepted an invite (or logged in after being invited), **when** they try to log a feeding/meds/task entry for that pet-sit, **then** the entry saves successfully (this does not work today, even after "accepting").
- **Given** a linked sitter currently has access, **when** the owner taps "Remove" on that sitter, **then** the sitter can no longer log entries for that pet-sit on their next attempt.
- **Given** an owner invites an email that's already an invited sitter for that same pet-sit, **when** they submit the form again, **then** no duplicate record is created and no duplicate email is sent (existing behavior, unchanged).

## Visual Reference

No mockups or screenshots were provided for this change. The email itself should visually match the existing co-owner invitation email's layout (see `co-owner-invitation.ts`'s rendered output) for consistency, just with sitter-appropriate copy and pet-sit details in place of co-owner copy.

## Technical Spec

### Schema / migration

New migration `0028_link_pending_sitter_invites.sql` (next unused number in `supabase/migrations/`), modeled directly on `0016_link_pending_co_owner_invites.sql`:

```sql
create or replace function public.claim_pending_sitter_invites()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pet_sitter_access
  set sitter_user_id = auth.uid()
  where sitter_user_id is null
    and lower(sitter_email) = lower((select email from auth.users where id = auth.uid()));
end;
$$;

grant execute on function public.claim_pending_sitter_invites() to authenticated;
```

No column changes needed — `pet_sitter_access.sitter_user_id` already exists (migration `0001`); it has just never been written to.

### Frontend: `src/lib/AuthContext.jsx`

Add a call to `supabase.rpc('claim_pending_sitter_invites')` in `doLoadUserWithProfile()`, right alongside the existing `claim_pending_co_owner_invites` call (line ~88). Same "safe to call every time, no-op once linked" behavior.

### Frontend: `src/components/InviteSitterDialog.jsx`

- After `entities.PetSitterAccess.create(...)` succeeds, call a new `invite-sitter` Edge Function (mirroring `InviteCoOwnerDialog.jsx`'s call to `invite-co-owner`), passing `petSitId` and the sitter's email.
- Surface the same three outcome states `InviteCoOwnerDialog.jsx` already handles: sent, `test_or_demo_account` (no real email), and `exists` (already has an account) — same success-message pattern, sitter-appropriate wording.
- Remove the stale "Phase D — not yet built" comment block (lines 43–50) once this ships.

### New Edge Function: `supabase/functions/invite-sitter/index.ts`

Structured like `invite-co-owner/index.ts`, with these differences:

- **Input:** `{ sitterEmail, petSitId }`. Unlike co-owner invites (which take `petName` from the client), this function looks up the `pet_sits` row itself by `petSitId` (`pet_ids`, `start_date`, `end_date`) and joins `pets` to get pet name(s) for the email — the dialog currently has no pet-name prop plumbed to it, and fetching server-side avoids adding new props through `PetSittingSection.jsx` just to pass data the function can look up directly.
- **Test/demo check:** identical pattern to `invite-co-owner/index.ts` lines 103–116 — look up the inviting owner's `profiles.account_type`, return `{ sent: false, reason: 'test_or_demo_account' }` without calling Resend if `test`/`demo`.
- **New-vs-existing-account branching:** reuse the same `admin.generateLink()` / `email_has_password()` / recovery-link logic as `invite-co-owner/index.ts` (lines 144–225), since the "already registered vs. stuck pending invite" ambiguity is identical here.
- **Redirect target:** reuse the existing `/accept-invite` page (`src/pages/AcceptInvite.jsx`) rather than building a second accept page — that page's `verifyOtp()` + set-password flow is generic to "an invite token for this email," not co-owner-specific. It will need a small update (see below) to route to the pet-sit view instead of `/pet/{petId}` when the invite is a sitter invite.
- **Email templates:** two new templates registered in `templates/index.ts`, following the `co-owner-invitation(-reminder)` pattern: `sitter-invitation` and `sitter-invitation-reminder`. Variables: `owner_name`, `pet_names` (joined string), `start_date`, `end_date`, `accept_url`. Deliberately **no** task/checklist variables — per product decision, the email stays to owner, pet(s), dates, and the accept link only; daily-task detail is an in-app concern once the sitter is logged in.
- **`email_logs` correlation:** `relatedEntityType: 'pet_sitter_access'`, `relatedEntityId` = the `pet_sitter_access` row's own id (looked up the same way `invite-co-owner` looks up its `pet_co_owners` row id — see lines 252–259 of that function) — not `petSitId`, for the same reason given in that function's comment (a different table's id shouldn't be reused under one `related_entity_type` label).
- **Idempotency:** pass a fresh `idempotencyKey: crypto.randomUUID()` on every call, same as `invite-co-owner`.

### `src/pages/AcceptInvite.jsx`

Needs to distinguish a co-owner accept link from a sitter accept link (e.g. an extra `role=sitter` style query param, alongside a `petSitId` instead of `petId`) so it redirects to the right place after password setup. **Confirmed destination: the Pets screen** (where `PetSittingSection.jsx` lives), not a specific pet's profile — a pet-sit can cover multiple pets, so there's no single profile page to land on.

Note: the product owner has flagged that the sitter feature's overall behavior (how sitting periods and access work) is expected to change later. This redirect target is being built for how the feature works *today* — if the sitter model changes, this destination may need to change with it, but that's a separate future change, not something to design around now.

### Constraints from CLAUDE.md / locked decisions

No conflict — this doesn't touch check-in/Vibe/scoring logic (CLAUDE.md's locked area) at all.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None. This is genuinely new code (an Edge Function, two templates, one migration) — nothing existing already does this.
- **Technical debt nearby:** `InviteSitterDialog.jsx` has a large comment block (lines 43–50) explicitly marking this as unfinished "Phase D" work — this spec resolves that comment, which should be deleted once implemented rather than left to rot as a stale note.
- **Orphaned features nearby:** `pet_sitter_access.sitter_user_id` — a column that's existed since the very first schema migration and is referenced by two Row-Level-Security policies (the database rules controlling who can read/write `pet_sit_logs`), but is never written to anywhere in the codebase. Confirmed by a full-repo search for any `UPDATE`/RPC touching it — there is none. This is the "second finding" flagged at the top of this document.
- **Punch list / known issues in this area:** Directly addresses two P2 items from `docs/launch-punch-list.md`: "Test/demo account email suppression isn't centralized" (this spec adds a second call site following the existing pattern — it does not centralize the check itself, see Non-Goals) and "Sitter invite emails never actually send." The `sitter_user_id` linking bug found during investigation is not on the punch list at all yet; recommend it either gets folded into this spec's implementation (as currently written) or added as its own punch-list line if this spec is deferred without it.

## Non-Goals

- **Not centralizing test/demo email suppression.** `sendEmail()` itself still won't know about account types — this spec adds a second call site that checks `account_type` before calling `sendEmail()`, following the exact pattern `invite-co-owner` already uses. Centralizing that check (e.g. threading a `sentByUserId` through `sendEmail()` itself) is a separate, larger change noted in `sendEmail.ts`'s own comments and the punch list — not part of this spec.
- **Not adding a "resend invite" button.** Co-owner invites don't have one either (the reminder-template logic only fires automatically when Supabase reports "already registered" for a stuck pending invite) — this spec keeps sitter invites at the same level of polish, not ahead of it.
- **Not adding bounce/delivery tracking.** Whether the sitter invite email actually arrives (vs. just being accepted by Resend) is the same known, separate gap already on the punch list ("No bounce/delivery-webhook handling for Resend") — not addressed here.
- **Not changing what a sitter can see or do once linked**, beyond fixing the existing broken link — no new permissions, no new UI for sitters.
- **Not fixing the P5 lowercase-string-literal vs. shared-constants inconsistency** for account-type checks — flagged above, but pre-existing and out of scope for this fix.

## Open Questions

None outstanding. All three raised in the previous draft were resolved 2026-07-24:
1. Email content stays simple (pet names + dates, no task checklist) — reflected in Functional Requirement 1 and the template variable list above.
2. Post-password-setup redirect confirmed as the Pets screen — reflected in the `AcceptInvite.jsx` section above, with a note that the sitter feature's underlying model is expected to change later (separate, future work).
3. Revoking a sitter should revoke write access — confirmed this already falls out of Functional Requirement 4's fix for free (removing the `pet_sitter_access` row removes the thing the write-access rule checks for), captured as Functional Requirement 5 and its own acceptance criterion so it gets verified rather than assumed.
