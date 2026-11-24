# 0083_Access_Control_Tightening_Specification_v1

**Status:** Approved by Lynn 2026-11-24. Amended 2026-11-24 with Lynn's D4 (app-only control) and D5 (ownership scenarios): deleting a pet is now app-only.
**Date:** 2026-11-24
**Branch:** `claude/spec-0083-access-control` (off `main` at `ddd3d81`)
**Migration:** `0062_access_control_tightening.sql` (reserved). Spec 0081 is being built in parallel on migration 0061.
**Punch list:** PA-73 (P0), PA-72, PA-25, PA-24 (Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`)
**Process:** `/ship-feature`. Type: **PROTECTED** (storage rules, co-owner rights, RLS, a migration, service-role Edge Functions). Merging needs Lynn's OK after review passes.
**Related files:** `supabase/migrations/0004_co_owner_accounts.sql`, `0054_private_uploads_phase1.sql`, `0056_*.sql`, `0058_account_deletion_data_safety.sql`; `supabase/functions/delete-pet/index.ts`, `reset-sandbox-account/index.ts`, `generate-vet-report/index.ts`, `_shared/petPhoto.ts`; `src/api/entityClient.js`; `supabase/tests/private_uploads.test.ts`, `co_owner_access.test.ts`, `sitter_access.test.ts`; `e2e/co-owner.spec.js`, `friendly-function-errors.spec.js`, `invite-email-responses.spec.js`, `invite-sitter.spec.js`; `docs/testing/QA_Test_Plan.md`

## Lynn — what I need from you

1. ~~Review and approve this spec~~ Approved 2026-11-24.
2. **Later, before merge:** OK the PROTECTED merge after the reviewer passes it. You'll get a plain "who can see/do what" summary.
3. **Nothing to promote in Cloudflare.** This is database and server only, with no app changes. I deploy the migration and functions to dev myself, then to staging and prod after your merge OK.

## Decisions already made (Lynn, 2026-11-24)

- **D1.** Only the primary owner (the person who added the pet) can delete a pet.
- **D2.** Nobody can change a pet's primary owner by hand. Inviting a co-owner adds an owner without replacing the primary one.
- **D3.** Keep spec 0075's automatic hand-off: when the primary owner deletes the pet or their whole account while co-owners exist, the server passes the pet to the longest-standing co-owner. Only the server can do this.
- **D4.** Owners and co-owners control pets only through the app. The database allows a signed-in person nothing the app doesn't offer. Lynn's own work in the Supabase dashboard and the server's routines (master key) are not limited.
- **D5. The ownership scenarios (Lynn, 2026-11-24).** These all go through the app, already work this way today, and must keep working:

| # | Starting point | What happens | Result | Existing test |
|---|---|---|---|---|
| S1.1 | Owner1 and Co-Owner1 both own PetA | Co-Owner1 deletes their account | Owner1 still owns PetA; Co-Owner1's access is gone; Owner1 is notified | `account_deletion.test.ts` |
| S1.2 | Owner1 and Co-Owner1 both own PetA | Owner1 deletes their account | PetA passes to Co-Owner1, with its records, photo and documents | `account_deletion.test.ts` |
| S2.1 | Owner2 and Co-Owner2 both own PetB | Co-Owner2 taps Delete on PetB | Only Co-Owner2's access is removed; Owner2 keeps PetB and is notified | `delete-pet/index.test.ts` |
| S2.2 | Owner2 and Co-Owner2 both own PetB | Owner2 taps Delete on PetB | PetB passes to Co-Owner2, nothing is lost | `delete-pet/index.test.ts` |
| S3 | Owner3 owns PetC alone | Owner3 taps Delete on PetC | PetC and its files are deleted for good | `delete-pet/index.test.ts` |

  S3 wasn't in Lynn's list. It's today's behavior, listed so the full picture is in one place. With more than one co-owner, S1.2 and S2.2 pass the pet to the longest-standing one, and the others keep their access.

## Before You Approve This

1. **PA-73 is a live P0 hole, found by reading the rules, never tried on a server.** Anyone signed in who knows the file path of someone else's private document (a vet invoice, say) can set their own pet's photo to that path. The storage rule then lets them open it as "their pet's photo". It can also **delete** that person's file: deleting your own pet makes the server delete "its photo" with the master key. Dev has 3 pet photos and none point outside their owners' folders, so there's no sign it has been used there. I'll run the same check on staging and prod before the change goes out (Rollout step 1).
2. **Co-owners lose two powers they have today, by design (D1, D2).** Through the database, a co-owner can currently (a) delete the pet outright, skipping the hand-off, and (b) make anyone, even a stranger, the pet's primary owner. In the app, a co-owner's "Delete" already only removes their own access, so **nothing changes on screen**.
3. **Deleting a pet only works through the app's Delete button (D4).** Today anyone who owns or co-owns a pet can delete it straight from the database, skipping the scenarios in D5: no hand-off, and no file cleanup. After this, nobody signed in can delete a pet directly. The app's Delete button already goes through the server's delete-pet routine, which follows D5, so nothing changes on screen. Four e2e tests clean up their test pets with a direct delete and are switched to the same routine (Technical Spec).
4. **"Entered by" becomes the original author and can't be changed.** Today the app sends whoever is signed in as "entered by", and the database doesn't check it on 12 record tables (check-ins, observations, vaccinations, medications, bloodwork and others). So anyone could log a record "as" a co-owner, or rewrite who entered an old one. After this, the database fills it in itself. One visible side effect: "Skip today" on a day a co-owner already logged now keeps the co-owner as the author. That's already how saving a Great/Off/Tough day works (the check-in save routine keeps the original author), so the two now behave the same.
5. **The same lock covers pet sits.** Today an owner can change a sit's "created by" to anyone. That matters because a sitter's access window is worked out on the creator's calendar (spec 0073). A sit's creator now can't be changed by hand either. The hand-off in D3 still moves it, server-side.
6. **PA-72: the Vet Report server refuses sitters.** Today only the screen stops a sitter. The function's own header comment says sitters may build reports during a sit, which contradicts PA-72 and spec 0076's owners-only page. The comment gets corrected.
7. **Overlap with spec 0081 (building in parallel).** 0081 deletes three old tables (`symptom_logs`, `wellness_scores`, `food_logs`) and edits `generate-vet-report`. This migration skips any table that's already gone, so either can land first. The `generate-vet-report` change here is a few lines near the top; whichever PR merges second takes care of the overlap.
8. **Self-review:** no conflicts with locked decisions. No new duplicate code: the "is this file still used?" check reuses the rule `prepare_account_deletion()` already applies. No new debt. Making deletion app-only also closes an old gap: a pet deleted directly in the database used to leave its files behind in storage.

## Functional Requirements

**Pet photos (PA-73)**
1. A pet's photo can only be set to a file in your own upload folder, one of the shared demo photos, or nothing. This applies when adding a pet and when changing its photo. Leaving the photo as it is is always allowed, even if a co-owner uploaded it.
2. The server's own routines (account deletion, pet hand-off, demo reset) are not limited by FR1.
3. When a pet is deleted, or a demo account is reset, its photo file is only deleted if no other pet uses it as a photo and no scanned document record points to it. Shared demo photos are never deleted (as today).

**Vet Report (PA-72)**
4. Only a pet's owner or co-owners can generate its Vet Report. A sitter, during a sit or not, gets the existing "You do not have access to this pet" refusal, and so does a stranger.

**Entered by (PA-25)**
5. On every record a person adds (check-ins, observations, vaccinations, medications, bloodwork, food, baselines, onboarding answers, sit checklist rows and any remaining old tables), "entered by" is always the signed-in person, whatever the app sends.
6. Nobody can change "entered by" on an existing record. The server's routines can (account deletion already clears it to "no name" by design, spec 0075).

**Co-owner limits (PA-24)**
7. A pet can only be deleted through the app's Delete button, which follows D5: the primary owner's Delete hands the pet on if there are co-owners and deletes it for good if not, and a co-owner's Delete removes only their own access. Nobody signed in can delete a pet directly in the database.
8. Nobody can change a pet's primary owner, or a pet sit's creator, by hand (D2). Only the server's hand-off routine can (D3).
9. Everything else a co-owner can do today stays the same: edit the pet's details and photo, add and edit records, invite sitters (if they own every pet in the sit).

## Acceptance Criteria

1. **AC1:** Given a stranger who knows another user's document path, when they set their own pet's photo to that path (on create or update), then the save is refused, and they still can't open the file.
2. **AC2:** Given an owner or co-owner, when they set the pet's photo to a file in their own folder, a `shared/` demo photo, or nothing, then it saves. Saving other pet details without touching the photo still works when the photo is in another owner's folder.
3. **AC3:** Given a pet whose photo path is also used by another pet or by a scanned document record, when the pet is deleted through `delete-pet` (or a demo reset runs), then that file still exists in storage. A photo nobody else uses is still deleted, as today.
4. **AC4:** Given a sitter during an open sit, and a stranger, when either calls `generate-vet-report` for the pet, then they get 403 `forbidden`. An owner and a co-owner still get a PDF.
5. **AC5:** Given a co-owner, when they add a record and send someone else's ID (or nothing) as "entered by", then the saved row's "entered by" is the co-owner. This holds for each table in FR5 that exists.
6. **AC6:** Given an existing record, when an owner updates it and sends a different "entered by", then the stored value doesn't change.
7. **AC7:** Given a co-owner, a primary owner with co-owners, and a sole owner, when any of them tries to delete the pet directly in the database, then nothing is deleted.
8. **AC8:** Given a co-owner or the primary owner, when they try to change the pet's primary owner (to themselves, a co-owner or a stranger), then it's refused. The same goes for a pet sit's creator.
9. **AC9:** Every scenario in D5 (S1.1, S1.2, S2.1, S2.2, S3) still gives the result in its table, proven by its existing test. The hand-off still changes the primary owner, and account deletion still clears authors.
10. **AC10:** Given a co-owner in the app, when they edit the pet, change its photo, log a check-in and add a vaccination, then everything works as before (existing e2e suite).

## Test Plan

- AC1, AC2 → **Deno integration tests** in `supabase/tests/private_uploads.test.ts` (reuses its household fixture: owner, co-owner, stranger, a linked document). The stranger's create and update are refused, and their storage download still fails. Owner and co-owner set own-folder, `shared/` and null paths, and a co-owner edits the pet's name while the photo sits in the owner's folder.
- AC3 → **Deno tests** against `delete-pet` (the existing `supabase/functions/delete-pet/index.test.ts`): a sole-owner pet whose photo path is also a second pet's photo (set up with the admin client, since FR1 now blocks doing it as a user) and also a `pet_documents` path. The file survives. An unshared photo is deleted. `reset-sandbox-account` uses the same shared helper and gets a unit-level check in `supabase/tests/pet_photo.test.ts`. It isn't run against dev, because it wipes the demo account.
- AC4 → **Deno tests** in `supabase/tests/sitter_access.test.ts`: sitter during an open sit gets 403, stranger gets 403, owner and co-owner get 200 with `application/pdf`.
- AC5, AC6 → **Deno test** in `co_owner_access.test.ts`, looping over every FR5 table that exists (`to_regclass`, so it passes before and after 0081): a co-owner's insert with a forged `created_by` is stamped with their ID, and an owner's update can't change it.
- AC7, AC8 → **Deno tests** in `co_owner_access.test.ts`: the three direct-delete cases, and `created_by` changes on `pets` and `pet_sits` by a co-owner and by the primary owner, to self, a co-owner and a stranger.
- AC9 → existing tests, unchanged, must pass.
- AC10 → existing e2e suite (`co-owner.spec.js` and others). No new Playwright test: nothing on screen changes. The four e2e cleanups listed in the Technical Spec are updated so they still remove their test pets.
- **Seeding/access constraints:** cross-user setups (a second pet sharing a photo path) need the admin client, which Deno tests already use (`adminClient()`). Users are created and signed in once per file, per CLAUDE.md's sign-in limit note. Everything runs on `wysker-watch-dev`.

## Visual Reference

None. No screen changes.

## Technical Spec

- **Schema, migration `0062_access_control_tightening.sql` (one transaction):**
  1. **`protect_pet_photo_path()`**, a `before insert or update` trigger on `pets`. When `auth.role() = 'authenticated'` and (insert, or `new.photo_path is distinct from old.photo_path`), `new.photo_path` must be null, start with `shared/`, or have match `^<auth.uid()>/[^/]+$` (your folder, one level, no `..`). Otherwise it raises `'photo must be one of your own uploads'`. The service role and migrations (no JWT) are exempt, the same way `protect_privileged_profile_fields()` is (0057).
  2. **`pets.created_by` and `pet_sits.created_by` are locked** by the same trigger family: on update, if `auth.role() <> 'service_role'` and `new.created_by is distinct from old.created_by`, it raises. `transfer_pet_ownership()` and `prepare_account_deletion()` run under the service role, so they're unaffected (AC9 proves it).
  3. **`stamp_record_author()`**, a `before insert or update` trigger on each FR5 table, looped with a `to_regclass` skip like 0058's: `daily_check_ins`, `observations`, `vaccinations`, `medications`, `bloodwork`, `food_logs`, `pet_foods`, `pet_baselines`, `pet_onboarding`, `symptom_logs`, `wellness_scores`, `pet_sit_logs`. For the `authenticated` role: on insert, `new.created_by := auth.uid()`; on update, `new.created_by := old.created_by`. Everything else is untouched. The trigger acts only for `authenticated`. Account deletion's `SET NULL` cascade (0058) does fire the trigger, but it runs without a user session (`auth.role()` isn't `authenticated`), so authors are still cleared (AC9 proves it).
  4. **`pets_delete_owner` is dropped and not replaced.** With RLS on and no delete rule, no signed-in user can delete a `pets` row. `delete-pet`, `delete-account` and `reset-sandbox-account` use the service role and are unaffected.
  5. All new functions follow 0059's rules. Trigger functions are `security definer`, `set search_path = public`, with execute revoked from `public`, `anon` and `authenticated`. They're added to `supabase/tests/function_permissions.test.ts`'s trigger list.
- **Edge Functions:**
  - `_shared/petPhoto.ts`: add `photoPathStillInUse(admin, path, excludingPetIds)`, which checks `pets.photo_path` on other pets and any `pet_documents.storage_path`. That's the same rule as `prepare_account_deletion()` step (e). `delete-pet` (sole-owner branch) and `reset-sandbox-account` call it before deleting a photo.
  - `generate-vet-report`: after reading the pet, call `rpc('is_pet_owner', { p_pet_id, p_user_id })` with the caller's own client (already granted to `authenticated` by 0059). If it's false, return the existing 403 `forbidden`. Correct the header comment (it says sitters may generate reports).
  - Deploy `delete-pet`, `reset-sandbox-account` and `generate-vet-report` to dev, then staging and prod after Lynn's OK, then `scripts/check-functions-start.sh` on each (§11).
- **App: no change.** `src/api/entityClient.js` keeps sending `created_by`. On the FR5 tables the trigger overwrites it, and on `upsert` it keeps the original author. The tables whose insert rules check `created_by = auth.uid()` (`pets`, `pet_sits`, `pet_co_owners`, `pet_sitter_access`) still need the client to send it, so leaving the client alone is the safe choice.
- **e2e cleanups:** `co-owner.spec.js`, `friendly-function-errors.spec.js`, `invite-email-responses.spec.js` and `invite-sitter.spec.js` delete pets directly, which will now silently do nothing and leave test pets behind. Switch each cleanup to the app's own path: the primary owner removes any `pet_co_owners` rows (allowed by 0056), then calls `delete-pet`, which deletes a pet with no co-owners for good (S3).
- **Design System compliance:** no UI changes; nothing to check.
- **Constraints from CLAUDE.md / locked decisions:** follows 0056's co-owner model (primary-owner-only management), 0057's service-role-exempt trigger pattern, 0058's hand-off and `SET NULL` authors, 0059's locked-by-default function permissions, and 0071's private bucket. The 0011 SDLC PROTECTED gate applies.

## Rollout

1. **Before pushing 0062 anywhere,** run this read-only check on staging and prod: pets whose `photo_path` isn't `shared/…` and isn't in the folder of the pet's creator or any linked co-owner. Report the count to Lynn. The migration changes no existing rows. A non-zero count is either a removed co-owner's old upload (harmless) or a sign of misuse, and Lynn decides what to do with it.
2. `supabase migration list` on dev, to check for another session's unmerged migration (0081's 0061). Then push 0062 to dev and run the tests.
3. After merge and Lynn's OK: push 0062 to staging and prod, deploy the three functions, and run the §11 function-permission check query and `check-functions-start.sh` on each project.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** the "is this file still used?" rule already exists inside `prepare_account_deletion()` (0058). The new helper copies its logic for the two Edge Functions instead of inventing a different rule. A database function shared by all three would remove the copy, but would mean changing 0058's routine. Not done here, to keep this spec small.
- **Technical debt nearby:** `entityClient.js` has stamped `created_by` on the client since the Base44 move ("Base44 `created_by` behavior" comment). The database now has the final say. Until now, the `upsert` path overwrote the author on every save, unlike the check-in save routine. The client-side stamp stays, because four insert rules rely on it; removing that Base44-era comment belongs to PA-50 (spec 0081). Before this spec, pets deleted directly in the database left their files behind; FR7 closes that.
- **Orphaned features nearby:** none new. `wellness_scores`, `food_logs` and `symptom_logs` are being removed by spec 0081.
- **Punch list / known issues in this area:** PA-60 (sitters can't tick the checklist) touches `pet_sit_logs`' rules but isn't changed here. FR5's stamping works the same whenever PA-60 lets sitters add rows. PA-68 (`getSitterOnlyPetIds` swallows errors) is nearby but separate.

## Non-Goals

- A "hand this pet to someone" feature (D2: there isn't one).
- Removing the automatic hand-off (D3 keeps it).
- Letting sitters edit the checklist (PA-60).
- Any change to who can read records; this spec only changes who can write and delete.

## Open Questions

None. D1 to D3 settle the ownership questions.
