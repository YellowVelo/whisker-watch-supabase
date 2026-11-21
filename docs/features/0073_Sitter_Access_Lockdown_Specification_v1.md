# 0073_Sitter_Access_Lockdown_Specification_v1

**Status:** Approved (Lynn, 2026-11-20). Built 2026-11-20 on branch `build-0073-sitter-access`. Migration 0057 and the `sign-up` function are live on dev only; staging and prod come after merge.
**Date:** 2026-11-20
**Punch list:** PA-03, PA-04 (both P0), PA-26, PA-27, PA-53, PA-54 (P2), plus the sitter-function part of PA-05 (Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`). Source findings: spec 0068 P0-3; spec 0069 P0-1 and three of its P2s.
**Related files:** `supabase/migrations/0004_co_owner_accounts.sql`, `0011_protect_privileged_profile_fields.sql`, `0028_link_pending_sitter_invites.sql`, `0030_pet_sits_sitter_select.sql`, `0031_pets_select_sitter.sql`, `0045_daily_check_ins_observations_select_sitter.sql`, `0054_private_uploads_phase1.sql` (photo rule reuses `is_pet_sitter`), `src/components/InviteSitterDialog.jsx`, `src/components/PetSittingSection.jsx`, `src/lib/petsClient.js`, `src/pages/Pets.jsx`, `src/lib/privacyPolicyContent.js`, `supabase/functions/invite-sitter/index.ts`, `supabase/tests/co_owner_access.test.ts` (test pattern reused), `e2e/pet-sitter.spec.js`

## Before You Approve This

1. **Access window, as you decided:** a sitter can see the pets from **the day before the sit starts** through **the day after it ends**, counted in **the owner's time zone** (the time zone saved on the account of whoever created the sit; UTC if none is saved). Outside that window, the pets disappear from the sitter's "Pets I Sit" list and the pet pages stop loading for them. Photos follow the same rule automatically.
2. **A sitter invited weeks ahead sees nothing until the day before.** The invite email already lists the sit's dates (`invite-sitter` sends `start_date`/`end_date`), but after they accept, the app shows no "upcoming sit" message, just no pets. This is the cost of the window. A "your sit starts on…" note is left out (new copy and new work). Related: when the sitter already has an account, the owner's dialog said *"{email} already has a Whisker Watch account and can now see this pet sit."* With the window, "now" is only true close to the sit, and "Whisker" is a misspelling. **Approved replacement (Lynn, 2026-11-20):** *"{email} already has a Wysker Watch account. They'll see this pet sit from the day before it starts."* The co-owner dialog's matching message has the same misspelling. Only "Whisker" → "Wysker" changes there (these are the only two user-facing copies of the misspelling in `src/`).
3. **Privacy Policy wording (approved, Lynn, 2026-11-20).** The sitter sentence changes from "…limited access to the specific pet-sitting period and pets you grant them." to *"…limited access to the pets you grant them, from the day before the pet-sitting period until the day after it ends."* `PRIVACY_POLICY_LAST_UPDATED` moves to the build date, as the policy's own "Last updated" paragraph promises for material changes.
4. **Sitters still can't tick the checklist or write notes.** Added to the punch list as **PA-60**, per your decision. Until it ships, the grace day only gives sitters more time to *view*.
5. **People can no longer change the email saved on their profile** (PA-27). The app never lets anyone change it today, and nothing in the app changes it, so nobody should notice. It only closes the go-around-the-app path.
6. **Sits must now include only pets you own (or co-own).** If you co-own one pet and own another, you can still put both in one sit. You can't add a pet you don't own, which is the hole (PA-03).
7. **The invite email check is still separate.** `invite-sitter` already checks that the caller created the sit, so after this fix a stranger can't build a sit around your pet to email about. The wider invite-email limits are PA-10.
8. **The database fix has to be pushed to all 3 Supabase projects** (dev, staging, prod), by hand as usual, after a read-only pre-check on each (like 0072's).

## Functional Requirements

1. A pet sit can only include pets the person creating or editing it owns or co-owns. Nobody can put someone else's pet in a sit, even by going around the app.
2. Only owners of every pet in a sit can invite or remove its sitters. Nobody can attach an account directly to a sitter invite. An account only becomes the sitter when the invited person signs in with the invited email address (same rule as co-owners, spec 0072).
3. A sitter can see the sit's pets (profile, photo, check-ins, observations), the sit itself and its checklist only from the day before the sit starts through the day after it ends, by the owner's calendar. Outside that window they see none of it.
4. Checklist entries can only be added for pets that are part of that sit.
5. A sitter invite is matched to a person by their real login email, never by the editable email copy on their profile. That profile copy can no longer be changed by the user.
6. The database's "is this person a sitter?" checks only answer about the person asking, never about someone else.
7. On the "Share with Sitter" dialog, the list of invited sitters shows as soon as the dialog opens, and each sitter's remove button is a full-size (44px) button.
8. If an invite fails to save, the dialog shows an error instead of hanging on "Saving".
9. Before the fix ships, a read-only check runs on dev, staging and prod and reports any existing sit, sitter invite, checklist entry or profile that looks like these holes were used. Nothing is deleted automatically. Lynn reviews and decides.

## Acceptance Criteria

- **AC1.** **Given** a stranger, **when** they create a sit that lists someone else's pet (alone or mixed with their own pet), **then** it is refused.
- **AC2.** **Given** an owner of a sit, **when** they edit it to add a pet they don't own, **then** it is refused. **When** they edit it with only their own pets, **then** it works.
- **AC3.** **Given** anyone, **when** they create a sitter invite with an account already attached, **then** it is refused. **Given** a stranger, **when** they create a sitter invite on someone else's sit, **then** it is refused. **Given** the owner, **when** they invite by email only, **then** it works, and the invitee becomes the sitter after signing in.
- **AC4.** **Given** a linked sitter, **when** today (owner's time zone) is the day before the sit starts, any sit day, or the day after it ends, **then** they can read the sit, its pets, their photos, check-ins and observations, and the sit's checklist.
- **AC5.** **Given** a linked sitter, **when** today (owner's time zone) is two or more days before the start or after the end, **then** all of those reads return nothing.
- **AC6.** **Given** an owner and sitter in different time zones, **when** their calendars disagree about what day it is, **then** the owner's calendar decides (the sitter's own time zone setting has no effect).
- **AC7.** **Given** a sitter or owner, **when** they add a checklist entry for a pet that isn't in that sit, **then** it is refused.
- **AC8.** **Given** a user, **when** they change their profile email to someone else's, **then** it is refused, and they can't see sitter invites addressed to that person.
- **AC9.** **Given** a signed-in user, **when** they ask the database "is user X a sitter of pet Y?" about anyone but themselves, **then** the answer is always no.
- **AC10.** **Given** an owner, **when** they open "Share with Sitter" on a sit that already has an invited sitter, **then** that sitter is listed right away, and the remove button is 44px. Remove → confirm → gone.
- **AC11.** **Given** an owner, **when** an invite fails to save, **then** the dialog shows an error and the Invite button works again.
- **AC12.** Existing flows still work: the `pet-sitter.spec.js` badge tests, co-owner tests (`co_owner_access.test.ts`), and the `delete-pet` / `delete-account` / `private_uploads` Deno tests all pass unchanged.
- **AC13.** The pre-fix check has run on all 3 projects and its results have been shown to Lynn before the migration is pushed.

## Test Plan

- **AC1–AC9** → new Deno test file `supabase/tests/sitter_access.test.ts`, same pattern as `co_owner_access.test.ts`: create one throwaway owner, sitter and stranger (`createScratchUser`), sign each in **once per file** (Supabase's sign-in rate limit, spec 0072 Build Note 7), and give every check its own fresh pet and sit. The owner's profile time zone is set explicitly at the start, so "today" is computed the same way in the test and the database. Cases:
  - Stranger inserts a sit with only the owner's pet, and with their own pet plus the owner's pet → both refused (AC1).
  - Owner updates their sit to add the stranger's pet → refused; updates with own pets only → works (AC2).
  - Owner inserts a sitter invite with `sitter_user_id` set → refused; stranger inserts an invite on the owner's sit → refused; owner invites by email → works; sitter calls `claim_pending_sitter_invites()` → linked (AC3).
  - Window, one sit per case, dates relative to the owner's "today": starts tomorrow → visible; starts in 2 days → hidden; ended yesterday → visible; ended 2 days ago → hidden. "Visible" checks `pets`, `pet_sits`, `pet_sit_logs`, `daily_check_ins`, `observations` and the pet photo download; "hidden" expects 0 rows / refused download (AC4, AC5).
  - Owner zone `Pacific/Kiritimati` (UTC+14), sitter zone `Pacific/Pago_Pago` (UTC−11): these are always on different calendar days. Set the sit so it's inside the window by the owner's date and outside by the sitter's (or the reverse) → the owner's date wins (AC6).
  - Sitter and owner insert a checklist entry with a `pet_id` not in the sit → refused (AC7).
  - User updates `profiles.email` → refused; selecting invites addressed to someone else's email → 0 rows (AC8).
  - Signed-in stranger calls `is_pet_sitter(pet, sitter_id)` and `is_pet_sit_sitter(sit, sitter_id)` for the real sitter → `false` (AC9).
  - Add the file to the CI Deno step in `.github/workflows/ci.yml` (next to `co_owner_access.test.ts`).
- **AC10, AC11** → new Playwright tests in `e2e/pet-sitter.spec.js` (or a new `e2e/invite-sitter.spec.js`), as test1@: create a sit and an email-only `E2E` invite with normal signed-in calls, open Share with Sitter from the Pet Sitter page → the invite is listed; remove → confirm → gone. For AC11, Playwright intercepts the save request and answers 403 (same approach as 0072's AC9). Each test makes and cleans up its own sit, so order doesn't matter.
- **AC12** → re-run the existing suites, no changes expected. `pet-sitter.spec.js` seeds a sit dated "today" in UTC; with a day of grace on each side, that's inside the window in any owner time zone.
- **AC13** → not a test. A one-time pre-deploy check; results go in Build Notes.
- **QA catalog:** add these cases to `docs/testing/QA_Test_Plan.md` in the same PR that ships the build (spec 0058's rule).
- **Seeding/access constraints:** none. Everything runs as normal signed-in sessions. Setting a scratch user's own `profiles.timezone` is allowed by RLS. No service-role key is added to `.env.playwright`.

## Visual Reference

No mockups. The only visible changes are in the existing Share with Sitter dialog: the list shows on open, and the remove control becomes the shared round icon button (same swap 0072 made on the co-owner dialog). For sitters, pets simply appear the day before the sit and disappear the day after it.

## Technical Spec

- **Schema:** new migration `supabase/migrations/0057_sitter_access_lockdown.sql`. ("Security definer" below means the function runs with the database's own permissions, so it can check a row without looping back into the access rules.)
  - **Helpers** (all `stable`, `security definer`, `set search_path = public`, built like `is_pet_owner`):
    - `public.caller_owns_every_pet(p_pet_ids uuid[]) returns boolean` → `cardinality(p_pet_ids) > 0 and not exists (select 1 from unnest(p_pet_ids) pid where not public.is_pet_owner(pid, auth.uid()))`.
    - `public.caller_owns_pet_sit(p_pet_sit_id uuid) returns boolean` → reads `pet_sits.pet_ids` and applies the check above. Reading `pet_sits` inside a definer function avoids the two-table loop 0030 warned about.
    - `public.pet_sit_today(p_owner_id uuid) returns date` → `(now() at time zone coalesce((select timezone from public.profiles where id = p_owner_id), 'UTC'))::date`. `profiles.timezone` is always a valid zone (0017's trigger).
    - `public.pet_in_sit(p_pet_sit_id uuid, p_pet_id uuid) returns boolean`.
  - **Replace** `is_pet_sitter(p_pet_id, p_user_id)` and `is_pet_sit_sitter(p_pet_sit_id, p_user_id)` (`create or replace`, same names and parameters, so the five policies and the storage rule that use them don't need rebuilding). The new body adds `p_user_id = auth.uid()` (PA-05's "answer only for the caller") and `public.pet_sit_today(ps.created_by) between ps.start_date - 1 and ps.end_date + 1`. **Both functions must use the identical window.** If only one did, `Pets.jsx` could see a pet without its sit and show it under "My Pets" with owner controls.
  - **`pet_sits`**: drop the 4 policies from 0004. New: select → owns any pet in `pet_ids` (the bare `created_by` shortcut is dropped); insert → `auth.uid() = created_by and caller_owns_every_pet(pet_ids)`; update → `using` and `with check` both `caller_owns_every_pet(pet_ids)` (today's update has no `with check`, so an edit could add someone else's pet); delete → `caller_owns_every_pet(pet_ids)`. `pet_sits_select_sitter` (0030) stays, now windowed through `is_pet_sit_sitter`.
  - **`pet_sitter_access`**: drop 0004's 4 policies. New: select → `sitter_user_id = auth.uid() or lower(sitter_email) = lower(auth.jwt() ->> 'email') or caller_owns_pet_sit(pet_sit_id)`; insert → `auth.uid() = owner_id and auth.uid() = created_by and sitter_user_id is null and caller_owns_pet_sit(pet_sit_id)`; delete → `caller_owns_pet_sit(pet_sit_id)`. **No update policy**: nothing in the app updates these rows (`grep` found only `create`/`delete`), and `claim_pending_sitter_invites()` is a definer function that doesn't need one. Select uses "owns every pet" too, so a co-owner of just one pet in a mixed sit can't see its sitters. That's the edge case Open Question 1 asks about.
  - **`pet_sit_logs`**: drop the 0004 select and insert policies. Select → `is_pet_owner(pet_id, auth.uid()) or is_pet_sit_sitter(pet_sit_id, auth.uid())` (windowed). Insert → `pet_in_sit(pet_sit_id, pet_id) and (caller_owns_pet_sit(pet_sit_id) or is_pet_sit_sitter(pet_sit_id, auth.uid()))`. Update and delete are unchanged (owner-only; the sitter side is PA-60).
  - **`protect_privileged_profile_fields()`** (0011): add the same "not service role → refuse" check for `email`.
  - **Grants:** the new helpers get `revoke execute ... from public, anon; grant execute ... to authenticated;` (PA-05's lesson). The two replaced functions keep their current grants. They now answer `false` to logged-out callers anyway (`auth.uid()` is null). Revoking `anon` on functions that policies call could turn a logged-out read into an error instead of an empty result, so it's left to PA-05's own spec.
  - **Header comment** records the read-only pre-check query (AC13): sits containing a pet that `created_by` doesn't own; invites whose `owner_id` doesn't own every pet in the sit, or whose linked account's email ≠ `sitter_email`; checklist entries whose `pet_id` isn't in the sit; profiles whose `email` ≠ `auth.users.email`.
  - Push dev → staging → prod, each with a dry run first, then check the live policies directly (spec 0063's lesson).
- **Components/files touched:**
  - `src/components/InviteSitterDialog.jsx`: load the list in `useEffect` on `[open, petSitId]` (the 0072 fix), drop the `loaded` gate from `handleOpenChange`'s open path, keep its reset-on-close. Wrap `PetSitterAccess.create()` in try/catch → error message + reset `saving` (AC11). Make the duplicate check ignore capitals. Swap the hand-rolled remove `<button>` for `IconButton` (`icon={Trash2}`, `aria-label={\`Remove ${a.sitter_email}\`}`), and let long emails wrap.
  - Same file: the "already has an account" message becomes the approved wording (Before You Approve #2).
  - `src/components/InviteCoOwnerDialog.jsx`: "Whisker Watch" → "Wysker Watch" in its "already has an account" message. No other change.
  - `src/lib/privacyPolicyContent.js`: the approved sitter sentence (Before You Approve #3), and `PRIVACY_POLICY_LAST_UPDATED` set to the build date.
  - No other frontend changes. `getSitterOnlyPetIds()` (`petsClient.js`) already matches on the login email (`auth.getUser()`) and tolerates a sit it can't read (`.catch(() => null)`), so it works with the window as is.
- **API / Edge Functions:** none changed. `invite-sitter` already requires the caller to be the sit's `created_by`. `delete-pet` / `delete-account` use the service role and skip these rules.
- **Design System compliance:** checked against `docs/foundation/0005 Design System.md` including its Amendments. The sitter remove button (~22px, `p-1` + `h-3.5` icon) breaks the 44px touch-target rule and Amendment #11. Fixed here by switching to `IconButton`, the same swap 0072 made. Nearby and **not** fixed: `PetSittingSection.jsx`'s per-sit Edit/Delete/Invite icons use the same small hand-rolled pattern. That file is out of scope here and belongs with PA-60, which reworks that screen. Run `design-system-check` after the edit.
- **Constraints from CLAUDE.md / locked decisions:** no Vibe/scoring changes. Backend change goes to all three projects. New copy: only the AC11 error message (reuse 0072's co-owner wording, adjusted for sitters). All new copy approved by Lynn (2026-11-20) before build: the AC11 error *"Couldn't save this invite. Please try again."*, the "already has an account" message (flag 2), and the Privacy Policy sentence (flag 3).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none new. The dialog fixes copy what 0072 already did for co-owners, so the two dialogs stay alike.
- **Technical debt nearby:**
  - The sit checklist creates one row per day attached to the sit's *first* pet (`ensureLogsForSit`), though the schema is per pet. PA-26's rule ("the pet must be in the sit") is compatible with that.
  - `pet_sitter_access.owner_id` records who sent the invite and isn't used for access after this spec (same as `pet_co_owners.owner_id` after 0072). The column stays.
  - `PetSittingSection.jsx` has no error handling on save, edit, delete or checklist taps, so refused writes fail silently. That's part of PA-60.
- **Orphaned features nearby:** `pet_sit_logs.notes`, `appetite`, `energy_level`, `stool_quality` and `vomiting` exist in the database but no screen reads or writes them (logged under PA-60).
- **Punch list / known issues in this area:**
  - **PA-60 (new):** sitters can't tick the checklist or write notes, and they see owner-only buttons on the Pet Sitter page.
  - PA-10: invite-email ownership checks and rate limits (co-owner and sitter).
  - PA-18: the claim functions don't require a confirmed email.
  - PA-14: when a sitter deletes their account, their invite row keeps their email, so re-registering restores the invite (now only within the sit's window).
  - PA-05: the rest of it (revoking server-only functions, `is_pet_owner`'s "answers for anyone", the fake-bounce hole) stays open.
  - PA-28: sitter-only pets still show up in owner-only flows (Scan Record matching, Edit Pet, Vet Report) during the window.

## Non-Goals

- Sitter checklist ticking, notes, and hiding owner controls from sitters (PA-60).
- An "upcoming sit" message for sitters before their window opens (flag 2).
- Invite-email limits (PA-10), confirmed-email claim check (PA-18), the rest of PA-05, sitter-only pets in owner flows (PA-28).
- Any other Privacy Policy or Terms changes beyond the one sitter sentence.

## Open Questions

None. Lynn settled the window (day before through day after), whose clock (owner's), sitter notes (out of scope → PA-60), all copy, and the mixed-ownership case (accepted, below) on 2026-11-20.

**Settled: mixed-ownership sits (accepted as is).** Say you own Pet A and Pet B, and Sam co-owns only Pet A. If you make one sit for both pets, Sam can see the sit (Sam owns one of its pets) but can't edit it, delete it, or see or manage its sitters (Sam doesn't own every pet in it). Loosening that would let Sam add a sitter who can then see Pet B, which Sam has no rights to. Prod has 0 sits. Lynn accepted this behavior (2026-11-20).

## Build Notes

1. **Pre-fix check (AC13), 2026-11-20, read-only, run by Claude.** Dev had 5 sits, 5 sitter invites and 0 checklist rows; staging and prod had none of any. Nothing was flagged anywhere. Live policies on all three matched 0004/0030 exactly, and all three were on migration 0056. Staging and prod were queried from scratch-folder links, so the repo stayed linked to dev. Prod's `is_pet_sitter`/`is_pet_sit_sitter` hashed differently from dev's and staging's, but the only difference is Windows line endings (CRLF); the logic is identical. The query is recorded in 0057's header.
2. **Design change from the spec: one window helper.** Instead of a `pet_sit_today()` helper with the date check repeated in both sitter functions, the window lives in one function, `pet_sit_is_open(p_pet_sit_id)`, which both call. They can't disagree. Lynn wrote a first version of its body (Learning mode); Claude corrected it. New policies are also `to authenticated`, so a logged-out visitor gets no rows rather than a permission error from the helpers' revoked `anon` grant.
3. **Tests.** `sitter_access.test.ts` was run against dev *before* 0057: 8 of 9 checks failed, showing every hole was real. The one that passed (AC4) checks that a sitter sees things *inside* the window, which was already true because access had no end. After pushing 0057 to dev (dry run first, listing only 0057): 9/9 pass. Existing Deno suites (`save_daily_check_ins`, `private_uploads`, `co_owner_access`, `delete-pet`, `delete-account`): 18/18 pass (AC12). Playwright: the new `invite-sitter.spec.js` (2), `pet-sitter.spec.js` (5) and `co-owner.spec.js` (3) are 10/10 locally. Lint, typecheck, vitest (135/135) and build pass. CI step updated to run the new Deno file.
4. **Found and fixed in scope: the sign-up function's copy of the policy date.** `PRIVACY_POLICY_LAST_UPDATED` is also stored as the version each person agrees to at sign-up, and `supabase/functions/sign-up/index.ts` keeps its own hand-synced copy (`PRIVACY_VERSION`). It was updated to "November 20, 2026" and `sign-up` redeployed to dev; **it must also be deployed to staging and prod** with the migration. Nothing compares stored versions, so existing users aren't re-prompted or locked out.
5. **Local test setup (not a code issue).** On Lynn's machine, Deno's shared cache had a broken copy of the Supabase library ("Cannot find module 'tslib'"), so *every* Deno test failed to load, including the existing ones. The tests were run with a clean cache (`DENO_DIR` pointed at a scratch folder) and the dev secret key from `.env` (`DEV_SUPABASE_SECRET_KEY`; the `sb_secret` line there has spaces around `=` and doesn't load in a shell). CI is unaffected.
6. **Design-system-check** on `InviteSitterDialog.jsx` and `InviteCoOwnerDialog.jsx`: clean.
7. **Still to do:** after merge, push 0057 to staging then prod (dry run first), deploy `sign-up` to both, and check the live policies on each (QA plan row). Then Lynn promotes the frontend (Cloudflare row on branch `main`, by commit message), and PA-03/04/26/27/53/54 are marked Complete.
