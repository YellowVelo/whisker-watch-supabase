# 0071_Private_Uploads_Storage_Specification_v1

**Status:** Shipped 2026-11-17. Merged as PR #30 (+ #31, #32). Phase 1 (`0054`) and Phase 2 (`0055`) are live on all three projects (dev, staging, prod). The uploads bucket is private everywhere. Follow-up: a small cleanup PR to remove the temporary `file_url` shortcut and the `photo_url` fallback (punch list PA-52).
**Date:** 2026-11-15
**Punch list:** PA-01 (Pre-Alpha Audit tab, P0). Source: spec 0068 P0-1, plus 0069's note that `observations.photo_url` accepts any outside link.
**Related files:**
- `supabase/migrations/0002_storage_bucket.sql`, `0052_restore_storage_policies.sql` (the public bucket and its public-read rule)
- `supabase/migrations/0004_co_owner_accounts.sql` (`is_pet_owner`), `0031_pets_select_sitter.sql` (`is_pet_sitter`)
- `supabase/migrations/0001_init_schema.sql` (`pets.photo_url`), `0014_daily_checkins_wellness.sql` (`observations.photo_url`)
- `src/api/storageClient.js`, `src/api/aiClient.js`
- Photo upload: `src/pages/PetEdit.jsx`, `src/components/onboarding/PetInfoCard.jsx`, `src/components/onboarding/fields/PetIdentityFields.jsx`
- Photo display: `src/pages/Pets.jsx`, `src/pages/PetTrends.jsx`, `src/pages/VetExport.jsx`, `src/components/PetSummaryCard.jsx`, `src/components/PetProfileContent.jsx`, `PetIdentityFields.jsx`
- Scans: `src/components/VaccinationSection.jsx`, `src/components/ScanReviewSheet.jsx`, `src/components/BloodworkSection.jsx`, `src/components/onboarding/VaccinationEntryCard.jsx`, `src/components/onboarding/MedicationEntryCard.jsx`
- `src/lib/seedTestData.js` (demo pet photos), `src/lib/checkin/checkinClient.js`
- `supabase/functions/ask-vet-assistant/index.ts`, `delete-pet/index.ts` (+ `index.test.ts`), `reset-sandbox-account/index.ts`, `delete-account/index.ts`
- `.github/workflows/storage-backup.yml`, `docs/testing/QA_Test_Plan.md`

## Before You Approve This

1. **This ships in two phases, and the order matters on every environment.** Phase 1 adds the new pieces without taking anything away. Phase 2 actually locks the bucket. Phase 2 can only run on an environment **after** that environment's website is running the new code. On prod, that means after you promote the Cloudflare build. If Phase 2 ran first, every pet photo on prod would go blank and scanning would stop working until the website caught up.
2. **Making the bucket "private" takes two separate switches, not one.** Supabase has a bucket-level "public" setting that skips all our access rules for direct links, and it also has the read rule itself. Both have to change. Turning off only one would look fixed but wouldn't be.
3. **Sitters' photo access inherits two open bugs.** Sitters can see pet photos (your choice). The check used for that today has the PA-03 hole (strangers can fake a sit) and the PA-04 hole (access never ends). This spec reuses that check on purpose, so the PA-03/04 fix will cover photos too, but until it ships, those holes reach photos as well. Scanned documents are owner/co-owner only, so they aren't affected.
4. **Files uploaded before this ships can't be linked to a pet.** They were never recorded against one. After this spec they become private (only the person who uploaded them can open them) but they won't show up in any future "this pet's documents" feature. From this spec on, every new scan is linked.
5. **A scan is kept only if the owner saves it (Lynn, 2026-11-15).** The file is linked when the owner taps Save or Confirm. If they cancel, close the sheet, or the scan fails, the file is deleted straight away. One edge case: if the browser is closed mid-review, neither happens and the file stays private but unlinked in the owner's folder. A later cleanup can sweep those up; it isn't built here.
6. **One invoice can cover several pets.** Scan Record already splits lines across pets. A document gets one link per pet it was used for. Deleting one of those pets removes only that pet's link, not the file.
7. **Demo pets currently load their photos from prod's bucket, even on dev and staging.** The plan is to copy the two demo photos (`shared/maple.jpg`, `shared/cooper.jpg`) into each environment's bucket and let any signed-in user view that `shared/` folder. Lynn confirmed 2026-11-15 that they're stock photos, not real animals, so copying them is fine.
8. **File rules (my defaults, easy to change):** 10 MB maximum per file. Only JPEG, PNG, WebP, GIF and PDF. Those are the types the AI can read. Two side effects:
   - **Bloodwork CSV.** The bloodwork import button offers CSV. That option came over in the original Base44 import (2026-06-21), where Base44's own file-reading tool handled CSV. When the app moved to Supabase, all imports started going through our AI function, which treats anything that isn't a PDF as an image. From reading the code, a CSV import has most likely failed every time since then (not yet confirmed with a live test). Lynn wants spreadsheet import, because owners keep bloodwork in Excel. **Decision (Lynn, 2026-11-15): spreadsheet import gets its own spec (punch list PA-51).** Until that ships, this spec hides CSV from the bloodwork button. The new file-type rule would refuse a CSV anyway, and a button that can only fail is worse than no button. PA-51 brings it back, working.
   - **iPhone HEIC photos.** Safari normally converts them to JPEG when you pick from the photo library, but I'll confirm on a real iPhone during the build. If it doesn't, HEIC needs its own small follow-up.
9. **Size limits, in one place:**
   - **Pet photo:** up to 10 MB (our rule).
   - **PDF scan:** up to 10 MB (our rule; the AI accepts larger).
   - **Photo scan** (a picture of an invoice or label): up to **5 MB**. This isn't our choice: it's the AI service's own limit for images, per Anthropic's documentation, and it's re-checked during the build. Today a 5–10 MB scan photo just fails with a generic error. After this spec, the app checks before uploading and shows "That photo is too large to scan…". A typical phone photo is 2–4 MB, so most owners will never see it.
10. **`observations.photo_url` gets deleted (Lynn, 2026-11-15).** It is **not** from Base44. It was added on 2026-07-05 with the retired Wellness Score V1 model, as a planned "attach a photo to a check-in answer" feature that never got a screen. No screen sets or shows it, and dev has 0 rows using it. Deleting it means updating the check-in save function (`save_daily_check_ins`, the version with co-owner conflict detection from spec 0043) and `checkinClient.js` so neither mentions it. The existing check-in e2e tests then confirm saving still works.
11. **Delete Account (PA-07) overlaps.** When a co-owner who uploaded a scan deletes their account, today's code deletes everything in their folder, including scans now linked to a pet the other owner keeps. This spec doesn't fix that. It belongs to PA-07, which already plans to move files for transferred pets, and its spec must now include linked documents.
12. **A temporary compatibility shortcut, removed in Phase 2.** The backend (database + Edge Functions) and the website (the app's screens, deployed through Cloudflare) go live separately. On prod there's a gap between the backend going out and you promoting the new Cloudflare build. During that gap, people are still using the currently live version of the screens, which sends the AI public links. During that window only, the AI function accepts a public link if it points at the caller's own folder in this project's bucket. Phase 2 deletes this. It's written down here so it doesn't become permanent.
13. **Self-review found no duplicate feature.** There's no existing signed-link helper or document list in the code. It did find six screens that each hand-build the same "pet photo or placeholder" circle. This spec replaces them with one shared component, since every one of them has to change anyway.
14. **Existing pet photos are converted automatically.** For each pet, the migration (a change to the database's structure) works out the file location from the saved public link. The only real pets are Lynn's own on prod (Auggie, Harper, Tribble). Everything else is test or demo data, and Maple/Cooper are stock photos. So the real check is that **Auggie's, Harper's and Tribble's photos still show on prod after Phase 2**. That's added to AC10, along with a read-only check before Phase 1 that their links convert cleanly.

## Build Notes (2026-11-15)

Where the build differs from the plan below, and why:

1. **Phase 2 has a safety check.** `supabase db push` applies every pending migration at once, so `0055` would otherwise go out together with `0054` and lock the bucket before the new frontend is live. `0055` refuses to run until the environment is marked ready by hand. The snippet is in the migration's header and records `spec_0071_frontend_live` in `private.deploy_markers`. Proved on dev: the first push stopped at 0055 with nothing changed.
2. **Phase 2 drops `pets.photo_url` straight away.** The Edge Functions' compatibility shortcut (`file_url` accepted in `ask-vet-assistant`) and the `photo_url` fallback (`_shared/petPhoto.ts`) stay until **all three** environments are on Phase 2, because Edge Function code is shared across environments. They're written to work whether or not the column exists (`select('*')`). Removing them is a small follow-up PR after prod's Phase 2.
3. **Access rules are tested with Deno, not Playwright.** AC3–AC5 and AC8 are in `supabase/tests/private_uploads.test.ts`, which builds a throwaway owner/co-owner/sitter/stranger household per test. The Playwright suite only has single fixture logins. It runs in CI's required `edge-functions` job.
4. **`PetPhoto.jsx` replaces the photo-or-placeholder *inside* each screen's circle.** Each screen keeps its own sized container, so layouts are unchanged.
5. **`delete-pet` and `reset-sandbox-account` never delete `shared/` files.** Before this, a demo-account reset on prod could have deleted the shared stock demo photos every demo pet points at.
6. **Pet photo uploads no longer clear the old `photo_url`.** Phase 2 drops the column, so nothing writes to it.

### Rollout status

Rollout lessons (2026-11-17):
- **Supabase's CDN can keep serving recently fetched public files for over an hour after the bucket goes private.** On prod, old links still loaded at 72 minutes and were refused when checked on 2026-11-18. Storage itself refuses them immediately. To check whether the lock worked, add a cache-busting query string to the link (e.g. `?nocache=…`). To be sure no copy is still out there, check the plain link too, after the cache has expired.
- **Cloudflare version IDs are not git commit IDs, and builds from non-`main` branches appear in the same list and can be promoted to prod.** On prod, the PR branch build (`cdc6034e`) went live before Phase 1, so for a short time the new screens likely showed placeholder icons instead of photos (no `photo_path` yet). Nothing was lost. Promote only builds from `main`, and only at the step the rollout calls for.
| Environment | 0054 (Phase 1) | Frontend on 0071 build | Marker set | 0055 (Phase 2) | Demo photos in `shared/` |
|---|---|---|---|---|---|
| dev | Done 2026-11-15 | Done (local) | Done | Done 2026-11-15 | Done |
| staging | Done 2026-11-17 (0 pets, nothing to convert) | Done 2026-11-17 (`main` → `staging`, bundle confirmed on wysker-watch-staging.pages.dev) | Done | Done 2026-11-17; `private_uploads.test.ts` 5/5 against staging | Done |
| prod | Done 2026-11-17 (all 5 photo links converted: Auggie, Harper, Tribble + stock Maple, Cooper) | Done 2026-11-17 (Lynn promoted Cloudflare version `c62bec9b` = `main` at #31; photos confirmed showing) | Done | Done 2026-11-17. Bucket `public = false`, no public-read rule. A cache-bypassing request to an old public link returns 400. Lynn confirmed Auggie/Harper/Tribble still show (AC10). | already there |

## Functional Requirements

Today every pet photo and every scanned vet document is in a public folder. Anyone on the internet, even someone who has never signed in, can list all of them and download any one. After this change:

1. **Nobody signed out can see or list any uploaded file.**
2. **Pet photos are visible to the people who care for the pet:** the owner, co-owners and the pet's sitter.
3. **Scanned vet documents are visible only to the pet's owner and co-owners**, never to sitters, since they usually show the owner's name, address and phone number.
4. **Every new scan is kept and linked to the pet it belongs to**, with its type (vaccination, bloodwork or medication). That lets a future feature, such as Ask Wysker answering "Tribble hasn't been eating" using recent bloodwork, find the right documents. This spec only builds the link, not that feature.
5. **Uploads are limited to 10 MB** and to photo and PDF files. Anything else gets a clear message saying why, instead of failing silently.
6. **The AI only reads files from Wysker Watch's own storage** that the person asking is allowed to see, not any link on the internet.
7. **Nothing visibly changes for owners.** Existing photos still show, scanning still works, and deleting a pet still removes its photo.

## Acceptance Criteria

1. **Given** a signed-out visitor, **when** they open an old public link to any uploaded file or try to list the bucket, **then** they get nothing back, on all three environments.
2. **Given** an owner, **when** they add or change a pet photo, **then** it shows on Pets, the pet's profile, Trends, the pet summary card and the vet export.
3. **Given** a co-owner or the pet's sitter, **when** they view that pet, **then** the photo shows.
4. **Given** a signed-in user with no connection to a pet, **when** they try to open that pet's photo or one of its documents, **then** they're refused.
5. **Given** a sitter, **when** they try to open a scanned document for a pet they're sitting, **then** they're refused.
6. **Given** an owner scans a vaccine record, bloodwork report or medication label, **when** they save the result, **then** the file is linked to that pet with its type, and only owners and co-owners can open it. For a multi-pet Scan Record, it's linked to every pet that a saved line went to. **When** they cancel instead, or the scan fails, **then** the file is deleted from storage.
7. **Given** a file over 10 MB or not a photo/PDF, **when** someone picks it, **then** nothing uploads and they see a plain message saying why. A photo upload that fails for any reason also shows a message instead of spinning forever (today it spins forever).
8. **Given** a call to the AI with an outside link, or with a file the caller isn't allowed to open, **then** the AI function refuses it and fetches nothing.
9. **Given** an owner deletes a pet, **then** its photo file is still removed, as it is today, and its document links are removed.
10. **Given** each environment after Phase 2, **then** every pet that had a photo before still has one (zero pets with an old photo link and no file location), Auggie's, Harper's and Tribble's photos show on prod, and the demo pets' photos show.
11. **Given** the check-in photo field is deleted, **when** an owner saves a single-day check-in or a multi-day catch-up, **then** it saves exactly as before.

## Test Plan

- AC1 → New `e2e/private-storage.spec.js`: a signed-out Playwright request for a known fixture file's old public link returns an error, and a signed-out bucket listing returns nothing. Also a read-only SQL check per environment after Phase 2 (`storage.buckets.public = false` and no `uploads_public_read` rule), run by Claude with `supabase db query --linked`. That check is needed because the e2e suite only ever runs against dev.
- AC2 → `private-storage.spec.js`: test1@ uploads a fixture photo in Edit Pet. The test checks that the image actually loads (not just that the `<img>` exists) on Pets and the profile, and that its link is a signed one. Trends, summary card and vet export use the same shared component, so one display test covers the component. A manual check per screen goes in the QA plan.
- AC3 (sitter) → extend `e2e/pet-sitter.spec.js` (test4@ already has a sit on test1@'s pet there): the sat pet's photo loads. Co-owner → manual QA case using coowner1@ (no co-owner fixture exists in the automated suite).
- AC4, AC5 → `pet-sitter.spec.js`: signed in as test4@, ask storage for a signed link to (a) a test1@ pet's photo that isn't in the sit and (b) a document linked to the sat pet. Both must be refused. This is a "stranger test" in the sense of PA-22.
- AC6 → `e2e/vaccination-scan-review.spec.js`: after a scan and Confirm, a document link exists for the pet with type `vaccination`. After a scan and Cancel, the file no longer exists in storage and there's no link. **Caveat:** that file is skipped in CI (spec 0067), so this runs locally only. Bloodwork and onboarding scans → manual QA cases. They share one helper with Scan Record, so a unit test (vitest) on that helper covers the linking logic.
- AC7 → `private-storage.spec.js`: pick a generated 11 MB file and a `.txt` file through `setInputFiles` with an in-memory file, and check that the message shows and no upload request was sent.
- AC8 → New Deno test `supabase/functions/ask-vet-assistant/index.test.ts` (test2@, CI-run): outside URL → 400; a path in another user's folder → 403; no Anthropic call is made in either case. These are refusals, so they cost no AI usage.
- AC9 → extend `supabase/functions/delete-pet/index.test.ts`: upload a photo and link a document first, delete the pet, and check the photo file is gone and the links are gone.
- AC10 → read-only SQL per environment (count of pets with `photo_url` set but `photo_path` empty = 0) plus a manual look at the demo account. Not a Playwright test: it checks a one-time data conversion, not ongoing behavior.
- AC11 → the existing check-in and catch-up e2e specs, run unchanged. They already save through `save_daily_check_ins`. Plus one manual save from the previous client shape (flag 10).
- **Seeding/access constraints:** none beyond normal sessions. Every test uploads its own fixture files and deletes them in `afterEach`/`finally`, even on failure. That keeps tests independent of each other and avoids repeating PA-47's leftover-data problem. No Secret key goes into `.env.playwright`.
- **QA_Test_Plan.md** gets these cases plus the manual ones (co-owner view, every photo screen, bloodwork/onboarding scans, demo photos per environment, iPhone HEIC check), in the same PR.

## Visual Reference

No mockups; there are no new screens. The only visible change is the new error messages (AC7), shown as the app's existing destructive toast. Wording, for your review:
- Too large: "That file is over 10 MB. Try a smaller photo or PDF."
- Wrong type: "Wysker Watch can only use photos (JPEG, PNG, WebP, GIF) or PDFs."
- Upload failed: "We couldn't upload that file. Please try again."
- Scan image over the AI's limit: "That photo is too large to scan. Try a smaller photo or a PDF."

## Technical Spec

Terms: a **signed link** is a URL with an expiry built in. A **storage policy** (RLS) is the database rule that decides who may read a file.

### Phase 1: migration `0054_private_uploads_phase1.sql` (adds, removes nothing)
- `pets.photo_path text`, backfilled from `photo_url` with `substring(photo_url from '/object/public/uploads/(.+)$')`. Index on `photo_path`.
- New table `pet_documents`: `id uuid pk`, `pet_id uuid not null references pets on delete cascade`, `storage_path text not null`, `kind text not null check (kind in ('vaccination','bloodwork','medication'))`, `uploaded_by uuid references profiles on delete set null` (matches PA-06's direction: keep the record, clear the name), `created_at timestamptz default now()`, `unique (pet_id, storage_path)`, index on `storage_path`. RLS on: select/delete use `is_pet_owner(pet_id, auth.uid())`. Insert also requires `(storage.foldername(storage_path))[1] = auth.uid()::text`, so you can only link files you uploaded yourself. No update policy. No sitter access.
- New storage select policy `uploads_read_permitted` (added **next to** the old public one for now). A user can read a file if any of these is true:
  - it's in their own folder
  - it's some pet's `photo_path` and they're an owner or sitter of that pet (`is_pet_owner` or `is_pet_sitter`)
  - it's in `pet_documents` for a pet they own (`is_pet_owner` only)
  - it's in `shared/` and they're signed in
- Bucket limits: `file_size_limit = 10485760`, `allowed_mime_types = {image/jpeg,image/png,image/webp,image/gif,application/pdf}`. These only affect new uploads, so they're safe in Phase 1.
- `observations`: drop `photo_url` (flag 10). In the same migration, replace `save_daily_check_ins` (current body from `0046_save_daily_check_ins_conflict_detection.sql`) with an identical copy minus `photo_url` in the insert column list, the select list and the `jsonb_to_recordset` definition. Nothing else in that function changes. This is safe in Phase 1 only if the frontend no longer sends `photo_url`. `jsonb_to_recordset` ignores keys that aren't in its column list, so the currently live screens sending `"photo_url": null` keep working. This is confirmed during the build with a save from the old client shape.

### Phase 2: migration `0055_private_uploads_phase2.sql` (per environment, only after its frontend runs the new code)
- Re-run the `photo_path` backfill. It catches photos the old website uploaded between the two phases.
- `update storage.buckets set public = false where id = 'uploads'`. Drop `uploads_public_read`.
- Drop `pets.photo_url`.
- Redeploy `ask-vet-assistant` without the compatibility shortcut.
- Known side effect: someone with an old copy of the app still open sees blank photos until they refresh. That's acceptable with an alpha-sized audience.

### Frontend
- `storageClient.js`: `uploadFile` checks size and type before uploading (friendly messages, AC7), uploads to the same `{userId}/…` location, and returns `{ path }` instead of `{ file_url }`. New `getSignedUrls(paths)` makes one batched call and caches each link in memory for 50 minutes of its 60-minute life, so the Pets list doesn't make one request per pet.
- New shared `src/components/PetPhoto.jsx`: takes `photoPath`, size, `grayscale` (memorial) and the fallback. It replaces the hand-rolled photo/placeholder in `Pets.jsx`, `PetTrends.jsx`, `VetExport.jsx`, `PetSummaryCard.jsx`, `PetProfileContent.jsx` and `PetIdentityFields.jsx`. While the link loads it shows the existing placeholder, so there's no layout jump.
- `PetEdit.jsx`, `PetInfoCard.jsx`: write `photo_path`. Wrap the upload in try/catch with a toast, which fixes today's endless spinner.
- `aiClient.js`: `invokeAI({ …, file_paths })` replaces `file_urls`.
- New helpers in `src/lib/` (exact file chosen at build time):
  - `linkScannedDocument({ petIds, path, kind })`, called when the owner saves. That means Confirm in `ScanReviewSheet` (with every pet that received at least one saved line, flag 6), Save on the prefilled bloodwork form, and Save on the onboarding vaccination/medication cards.
  - `discardScannedFile(path)`, called on Cancel, on closing the sheet or form, and when the AI read fails.

  Both are needed in all four scan entry points. This "pending scan" state is the one new piece each entry point has to track.
- Scan photos over 5 MB are rejected before upload with the "too large to scan" message. PDFs and pet photos use the 10 MB limit.
- `BloodworkSection.jsx`: remove `.csv` from the file input's `accept` (PA-51 restores spreadsheet import properly).
- `seedTestData.js`: demo pets get `photo_path: 'shared/maple.jpg'` / `'shared/cooper.jpg'`, with no hardcoded prod URL.
- `checkinClient.js`, `DailyCheckInSheet.jsx`, `catchup/BulkApplySheet.jsx`: remove every `photoUrl`/`photo_url` reference.

### Edge Functions
- `ask-vet-assistant`: takes `file_path`. It's only allowed if the path is in the caller's own folder, or appears in `pet_documents` for a pet the caller owns. It downloads with the service role (the server's own full-access key), rejects anything over 10 MB or not on the type list, and never calls `fetch` on a link the caller supplied. Phase 1 only: it also accepts `file_url` if it's this project's `/object/public/uploads/{caller's id}/…` link, converted to a path (flag 12). This does **not** touch PA-11's other work (prompts server-side, daily cap). That stays PA-11.
- `delete-pet`, `reset-sandbox-account`: read `photo_path`. Their link-parsing helper stays only for the Phase 1 window and is deleted in Phase 2. `pet_documents` rows go automatically with the pet. Deleting the document *files* when a pet is deleted is PA-14.
- `delete-account`: no change here (flag 11, PA-07).
- `storage-backup.yml`: uses its own S3 keys, which ignore these rules, so it should be unaffected. The build must confirm the next nightly run still copies files after Phase 2 on prod.

### Rollout (all three projects; backend pushed by Claude, frontend promoted by Lynn)
1. Phase 1 migration + Edge Functions → dev, staging, prod. Nothing visible changes.
2. Copy the demo photos into dev's and staging's `shared/` folders.
3. Frontend: dev (local), then staging (push to `staging`, auto-deploys), then **you promote prod**.
4. Phase 2 per environment, only after step 3 on that environment. Verify AC1/AC10 with the read-only SQL.

- **Design System compliance:** checked against `0005 Design System.md` and its 2026-07-30 Amendments. The only new UI is toasts, which use the existing toast system. `PetPhoto.jsx` keeps the current circular sizes and `bg-card`/`border-border` placeholder tokens. It is itself a fix for Amendment #8-style duplication: six hand-rolled copies become one shared component. `design-system-check` runs on every changed `.jsx` during the build.
- **Constraints from CLAUDE.md / locked decisions:** backend goes to all three projects, verified per project (the 0052/0063 lesson: migration history isn't proof). Frontend deploy is Lynn's. Toasts go through the real Radix system (spec 0062). Scan Record's review-first behavior (spec 0061) and pet attribution are unchanged. The Vibe model is untouched. One branch only.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none for signed links or a document list. Six screens hand-build the same pet photo circle (consolidated here).
- **Technical debt nearby:**
  - `storageClient.js`'s header still describes the Base44 migration and "see chat for the exact steps". It gets rewritten.
  - Photo uploads have no error handling at all (endless spinner on failure).
  - The bloodwork button offers CSV, which can't work (a Base44 leftover).
  - `ask-vet-assistant` assumes anything that isn't a PDF is an image.
  - Base44 references remain in 7 files, mostly comments. This spec removes the ones in files it touches (`storageClient.js`, `aiClient.js`, `BloodworkSection.jsx`, `ask-vet-assistant`). A full Base44 sweep is a separate spec.
- **Orphaned features nearby:**
  - Every scan ever uploaded is an orphaned file. Dev has 435 files in one account's folder against 3 pet photos, mostly e2e scan leftovers. They become private, not deleted. Cleaning up dev's leftovers fits naturally with PA-47.
  - `observations.photo_url` has no UI.
- **Punch list / known issues in this area:**
  - **PA-03/PA-04:** sitter check holes, which photos inherit (flag 3).
  - **PA-07:** delete-account and linked documents (flag 11).
  - **PA-11:** this spec does only the "own storage files with a size cap" part of the AI-proxy fix. Mark that sub-item done on PA-11 when this ships.
  - **PA-14:** deleting document files with the pet.
  - **PA-06:** `uploaded_by` already follows its "keep the record, clear the name" rule.
  - **PA-47:** dev leftovers.
  - The PA-01 row itself should be marked superseded by this spec once approved.

## Non-Goals

- Ask Wysker (or anything else) actually *using* stored documents. This spec only makes them findable.
- A screen for viewing or downloading past documents.
- Linking or cleaning up files uploaded before this spec.
- Fixing sitter access (PA-03/04), delete-account file handling (PA-07), deleting document files on pet deletion (PA-14), and the rest of the AI-proxy fix (PA-11).
- Bloodwork import from spreadsheets (CSV/Excel): PA-51.
- The wider Base44 cleanup: PA-50.
- Moving files to pet-based folders. Files stay in the uploader's folder, and the new link records are what tie them to a pet.

## Open Questions

None open.

Resolved 2026-11-15 by Lynn:
- save-to-keep and cancel-to-delete for scans (flag 5)
- demo photos are stock (flag 7)
- spreadsheet import is its own spec, PA-51 (flag 8)
- delete `observations.photo_url` (flag 10)
- all error wording approved
