# 0072_CoOwner_Access_Lockdown_Specification_v1

**Status:** Approved (Lynn, 2026-11-18). Built 2026-11-19 on branch `spec-0072-co-owner-lockdown`; migration 0056 pushed to dev only (see Build Notes).
**Date:** 2026-11-18
**Punch list:** PA-02 (Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`). Source finding: spec 0068 P0-2.
**Related files:** `supabase/migrations/0004_co_owner_accounts.sql`, `supabase/migrations/0016_link_pending_co_owner_invites.sql`, `src/components/InviteCoOwnerDialog.jsx`, `src/components/InviteSitterDialog.jsx` (confirmation pattern reused), `src/pages/PetEdit.jsx`, `src/components/DailyCheckInSheet.jsx`, `src/components/PetProfileContent.jsx`, `supabase/functions/invite-co-owner/index.ts`, `supabase/functions/delete-pet/index.ts`, `supabase/functions/delete-account/index.ts`, `supabase/tests/private_uploads.test.ts` (test pattern reused)

## Before You Approve This

1. **New visitor-facing copy (approved 2026-11-18).** Co-owners see a **View Co-Owners** button in place of **Invite Co-Owner**, and the list shows: *"Only the primary owner can add or remove co-owners."* (Built without the first name: see Build Notes #3.) The remove confirmation reads: **Remove {email} as a co-owner?** / *They'll lose access to {pet name}'s profile and records right away. Anything they've already logged stays. You can invite them again later.* / [Cancel] [Remove].
2. **The invite email is still unguarded.** That's PA-10, a separate item. After this fix a stranger can still trigger an invite email that names a pet, but the email no longer gives anyone access to the pet.
3. **The check-in label is only partly fixed.** When another *co-owner* edits today's check-in, the warning will name them. When the *primary owner* edits it, it still says "Your co-owner", because the primary owner isn't on the co-owner list.
4. **Co-owners lose the ability to remove people they invited.** Anyone a co-owner already invited stays a co-owner. From now on, only the primary owner can remove them. This is the chosen behavior, but it changes things for anyone who used that path.
5. **Removing a co-owner now asks for confirmation first** (wording in #1). It's one step, the same as the sitter list, not the type-to-confirm delete flow. Removing a co-owner can be undone by inviting them again.
6. **The database fix has to be pushed to all 3 Supabase projects** (dev, staging, prod). This is manual, as usual.

## Functional Requirements

1. Only a pet's **primary owner** can add a co-owner. The primary owner is the person who added the pet, or the person it was transferred to. A co-owner, a sitter or a stranger can't add one, even by going around the app.
2. Nobody can attach an account directly when adding a co-owner. An account only becomes a co-owner when the invited person signs in with the invited email address.
3. Only the primary owner can remove a co-owner. A co-owner can still leave on their own through "Remove from my account", as they can today.
4. Every owner of a pet, primary or co-owner, can see the full co-owner list. Co-owners see it read-only, with no Invite or Remove controls.
5. Before the fix ships, a read-only check runs on dev, staging and prod and reports any existing co-owner entry that looks like this hole was already used. Nothing is deleted automatically. Lynn reviews each one and decides.
6. The primary owner must confirm before a co-owner is removed. Cancelling leaves them in place.

## Acceptance Criteria

- **AC1.** **Given** a stranger, **when** they try to add themselves as co-owner of someone else's pet (by any method, including going around the app), **then** the attempt is refused and they gain no access.
- **AC2.** **Given** a stranger, **when** they add an entry with their own email and then sign in again, **then** they still get no access, because the entry was never created.
- **AC3.** **Given** a co-owner, **when** they try to add another co-owner, **then** it is refused.
- **AC4.** **Given** the primary owner, **when** they add a co-owner with an account already attached, **then** it is refused. **When** they add one with only an email, **then** it works, and the invitee gets access after signing in.
- **AC5.** **Given** a co-owner, **when** they open the co-owner list, **then** they see every co-owner, with no Invite or Remove controls.
- **AC6.** **Given** a co-owner, **when** they try to remove another co-owner, **then** it is refused. **Given** the primary owner, **when** they remove a co-owner, **then** it works.
- **AC7.** **Given** a co-owner who was removed, **when** they try to add themselves back, **then** it is refused, and they can no longer edit or delete the pet.
- **AC8.** **Given** a co-owner, **when** they leave through "Remove from my account", **then** it still works.
- **AC9.** **Given** the primary owner, **when** an invite fails to save for any reason, **then** the dialog shows an error instead of hanging on "Saving".
- **AC10.** The pre-fix check has run on all 3 projects and its results have been shown to Lynn before the migration is pushed.
- **AC11.** **Given** the primary owner, **when** they tap remove on a co-owner, **then** a confirmation shows that co-owner's email and the pet's name. Cancel keeps them on the list; Remove takes them off.

## Test Plan

- **AC1–AC4, AC6–AC7** → new Deno test file `supabase/tests/co_owner_access.test.ts`. It uses the same throwaway-household pattern as `private_uploads.test.ts`: each test creates a fresh owner, co-owner and stranger (`createScratchUser`), and deletes them afterward, so tests don't depend on each other's data or on the shared test1@/test2@ accounts. Add the file to the CI step in `.github/workflows/ci.yml` that already runs `private_uploads.test.ts`. Cases:
  - Stranger inserts a row for the owner's pet with `co_owner_user_id` = self → refused (AC1).
  - Stranger inserts with `owner_id` = self and their own email → refused. Calling `claim_pending_co_owner_invites()` afterward → still no access to the pet (AC2).
  - Linked co-owner inserts a new co-owner row → refused (AC3).
  - Owner inserts with `co_owner_user_id` already set → refused. Owner inserts with email only → succeeds; invitee claims → `is_pet_owner` access works (AC4).
  - Co-owner deletes another co-owner's row → nothing deleted. Owner deletes it → removed (AC6).
  - Removed co-owner re-inserts themselves → refused; their update on `pets` → no rows changed (AC7).
  - Co-owner selects `pet_co_owners` for the pet → sees all rows; stranger → sees none (database side of AC5).
- **AC8** → covered by the existing `supabase/functions/delete-pet/index.test.ts` (co-owner self-removal path). Re-run it, no changes.
- **AC5 (UI)** → new Playwright test in `e2e/co-owner.spec.js`. *As built:* no privileged write was needed after all. `coowner1@` (spec 0070's manual co-owner inbox, dev login in `.env.playwright`) creates a throwaway pet and an email-only invite for test1@, which test1@ then claims with `claim_pending_co_owner_invites()`, the same calls the app makes. The test skips when the coowner1@ login isn't available, which includes CI. It deletes the pet directly afterward (not through delete-pet, which would hand the pet to test1@).
- **AC9** → Playwright test as the primary owner. *As built:* the test makes the save request fail on purpose (Playwright intercepts it and answers 403, as the database would), because the build also fixed the dialog's duplicate check to ignore capitals, so a different-capitals duplicate no longer reaches the database. The dialog must show an error and re-enable the button.
- **AC11** → Playwright test as test1@ (primary owner): invite a throwaway `E2E` address, tap remove → Cancel → still listed; tap remove → Remove → gone. It creates and removes its own entry, so test order doesn't matter.
- **AC10** → not a test. It's a one-time pre-deploy check, with results recorded in this spec's Build Notes.
- **Seeding/access constraints:** none in the end. Everything runs as normal signed-in sessions (AC5 uses coowner1@, see above). No service-role key is added to `.env.playwright`.

## Visual Reference

No mockups. The only UI changes:
- In the existing Share dialog (`InviteCoOwnerDialog.jsx`), co-owners see the same co-owner list with no email field, no Invite button and no remove buttons, plus the "Only … can add or remove co-owners." line.
- On Edit Pet, the button says **View Co-Owners** for co-owners and **Invite Co-Owner** for the primary owner.
- A one-step confirmation before removing a co-owner, matching `InviteSitterDialog.jsx`'s "Remove this sitter?" box.

## Technical Spec

- **Schema:** new migration `supabase/migrations/0056_co_owner_access_lockdown.sql`:
  - New helper `public.is_primary_pet_owner(p_pet_id uuid, p_user_id uuid) returns boolean`: `select exists (select 1 from public.pets where id = p_pet_id and created_by = p_user_id)`. `security definer` (runs with the database's own permissions, so it can check ownership without looping back into the access rules), `set search_path = public`, `stable` — the same build as `is_pet_owner`. `revoke execute ... from public, anon; grant execute ... to authenticated;` (new functions are callable by everyone by default; PA-05's lesson).
  - Drop `pet_co_owners_insert_owner_only`; create `pet_co_owners_insert_primary_owner` with check: `auth.uid() = owner_id and auth.uid() = created_by and co_owner_user_id is null and public.is_primary_pet_owner(pet_id, auth.uid())`. The `co_owner_user_id is null` part leaves `claim_pending_co_owner_invites()` as the only way to link an account.
  - Drop `pet_co_owners_select_owner_or_self`; create `pet_co_owners_select_any_owner` using: `public.is_pet_owner(pet_id, auth.uid()) or auth.uid() = co_owner_user_id`.
  - Drop `pet_co_owners_delete_owner_only`; create `pet_co_owners_delete_primary_owner` using: `public.is_primary_pet_owner(pet_id, auth.uid())`. It no longer checks `owner_id`, which can be stale after an ownership transfer.
  - No update policy, deliberately (unchanged from today).
  - Header comment records the pre-fix read-only check query: flag any row where `co_owner_user_id` is set and that account's `auth.users.email` ≠ `lower(co_owner_email)`, or where `owner_id` is neither `pets.created_by` nor a linked co-owner of that pet. Run it on all 3 projects before pushing; report results to Lynn; delete nothing.
  - Push to dev → staging → prod (CLAUDE.md: backend changes go to all three, manually).
- **Components/files touched:**
  - `src/pages/PetEdit.jsx`: button label and dialog mode depend on `pet.created_by === user.id` (**Invite Co-Owner** + editable, otherwise **View Co-Owners** + `readOnly`).
  - `src/components/InviteCoOwnerDialog.jsx`: new `readOnly` prop (hides form and remove buttons, shows the "Only … can add or remove co-owners." line, using the primary owner's first name if available, else "the primary owner"). Wrap `entities.PetCoOwner.create()` in try/catch so a refused insert shows an error and resets `saving` (AC9). Add `removeConfirmId` state and an `AlertDialog` confirmation copied from `InviteSitterDialog.jsx` (AC11). Replace the hand-rolled remove `<button>` with the shared `IconButton`. Update the header comment to match the new rules.
  - `src/components/DailyCheckInSheet.jsx`, `src/components/PetProfileContent.jsx`: no changes. They read `pet_co_owners` by `pet_id` and pick up the wider list automatically.
- **API / Edge Functions:** none changed. `delete-pet` and `delete-account` use the service role (privileged access that skips the access rules), so the new rules don't affect their transfer or self-removal logic. `invite-co-owner`'s missing ownership check is PA-10, out of scope.
- **Design System compliance:** checked against `docs/foundation/0005 Design System.md` including its Amendments. The dialog's existing remove button is hand-rolled at about 22px (`p-1` + `h-3.5` icon), breaking the 44px touch-target rule and Amendment #11 (one shared icon-button component everywhere). This spec touches that row, so it fixes both by switching to `IconButton`. The success message uses raw `text-emerald-500`; swap it for an existing design token if one matches, otherwise log it rather than invent one. The new confirmation reuses the existing `AlertDialog` pattern from `InviteSitterDialog.jsx`, not a new one-off. Run `design-system-check` after the edit.
- **Constraints from CLAUDE.md / locked decisions:** matches migration 0004's original intent ("only the original owner can manage who the co-owners are"). Doesn't touch the Vibe/scoring model. New copy reviewed and approved by Lynn (2026-11-18) before build.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none. There is one co-owner dialog and one claim function. The sitter list has its own, separate remove confirmation; this spec copies its pattern so the two stay identical.
- **Technical debt nearby:** `pet_co_owners.owner_id` goes stale after ownership transfers, and two Edge Functions patch it by hand. This spec stops relying on it for access checks but keeps the column. The dialog also never handled a failed save (it would hang on "Saving"); this spec fixes that.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:**
  - PA-03/PA-04 (sitter access) are the same kind of bug, but stay a separate spec.
  - PA-10 covers the invite email's missing ownership check and rate limit.
  - PA-18 covers the claim function not requiring a confirmed email (0069 suggested a one-line `email_confirmed_at is not null` backstop; left to PA-18).
  - PA-24: any co-owner can still change the pet's `created_by` (hand off primary ownership) or delete the pet directly. That remains open after this fix and is the remaining way a rogue co-owner could take control.
  - PA-06 covers records a departing account entered being deleted along with the account. Until that lands, the confirmation's "Anything they've already logged stays" is true for removal, but not if that person later deletes their whole account.

## Non-Goals

- Invite-email ownership checks and rate limits (PA-10).
- Sitter access rules (PA-03/PA-04).
- The confirmed-email check in the claim functions (PA-18).
- Limits on what co-owners can do to the pet record itself (PA-24).
- Merging the co-owner and sitter remove confirmations into one shared component.

## Open Questions

None. Lynn settled who manages the list (primary owner only), co-owner visibility (read-only list), handling of suspicious existing entries (report only, Lynn decides), and the remove confirmation (one step, wording above) on 2026-11-18.

## Build Notes

1. **Pre-fix check (AC10), 2026-11-18, read-only, run by Claude.** Dev: 0 `pet_co_owners` rows. Staging: 0 rows. Prod: 3 rows, **none flagged** (every linked account's email matches its invite, and every inviter owns the pet). No sign the hole was ever used. Live policies on all three projects were checked directly (not just migration history, per spec 0063) and matched 0004 exactly; all three were on migration 0055. Query recorded in 0056's header.
2. **Tests.** `co_owner_access.test.ts` was run against dev *before* 0056: 6 of 9 failed, showing the hole was real. After pushing 0056 to dev (2026-11-19): 9/9 pass. Existing `delete-pet`, `delete-account` and `private_uploads` Deno tests: 14/14 pass (AC8). `e2e/co-owner.spec.js`: 3/3 pass locally. Lint, typecheck, build pass. Vitest: 1 of 135 failed on the first run and 135/135 passed on the next two, name not captured (punch list PA-56). CI step added for the new Deno file.
3. **Copy change.** The read-only line always says "the primary owner". `profiles` is readable only by its own owner (migration 0001), so a co-owner can't look up the primary owner's first name, and widening profile access wasn't worth it for one label.
4. **Bug found and fixed in scope.** The co-owner list had never shown on Edit Pet, even for primary owners. `InviteCoOwnerDialog` loaded it only from `handleOpenChange`, which Radix calls only for the dialog's own changes (closing), never when the parent sets `open=true`. It now loads in a `useEffect` on `open`. The same bug exists in `InviteSitterDialog.jsx` (punch list PA-53, not fixed here).
5. **Also changed:** the dialog's duplicate-invite check now ignores capitals; the success message uses `PALETTE.teal` instead of raw `text-emerald-500`; long emails wrap instead of overflowing. Design-system-check on both changed files: clean. Pre-existing issues it found nearby went on the punch list: PA-54 (sitter remove button ~22px) and PA-55 (Edit Pet chip "x" buttons under 44px).
6. **Not done yet:** push 0056 to staging and prod (it can go before the frontend: it only blocks things, and primary-owner invites keep working on the current frontend; a co-owner who tries to invite on the old frontend gets a stuck button until the new frontend is live). Then Lynn promotes the frontend. Then verify each project's policies (QA_Test_Plan row) and mark PA-02 Complete.
