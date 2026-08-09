# 0049_Storage_Bucket_Backup_Specification_v1

**Status:** Draft
**Date:** 2026-08-09
**Related files:** [supabase/migrations/0002_storage_bucket.sql](../../supabase/migrations/0002_storage_bucket.sql), [.github/workflows/db-backup.yml](../../.github/workflows/db-backup.yml), [scripts/backup-db.sh](../../scripts/backup-db.sh), [docs/features/requirements-database-backups.md](requirements-database-backups.md), [docs/launch-punch-list.md](../launch-punch-list.md)

## Before You Approve This

- **This needs one manual step in the Supabase dashboard before it can be built** — generating an "S3 Access" key for the production project's Storage bucket. That credential doesn't exist yet, isn't something a migration or CLI command can create, and only Lynn (or whoever has dashboard access) can generate it. Implementation can't start until that happens.
- **A second manual step in the Cloudflare dashboard**: provisioning the new, dedicated `whisker-watch-storage-backups` R2 bucket and a set of R2 API credentials scoped only to it (kept separate from the existing database-backup bucket's credentials, so a compromise of one doesn't expose the other).
- **Only production is covered, on purpose.** Dev and staging buckets hold only test/demo data (confirmed live: dev's bucket is completely empty), so backing those up would burn effort protecting nothing real. If that assumption changes later (e.g. staging starts holding real-looking data), this should be revisited.
- **The backup only ever adds files, never deletes from the backup copy.** If a photo or document is deleted from the app (intentionally or by accident), its backup copy in R2 stays. This is deliberate — it's what makes this useful as protection against an accidental delete, not just a lost bucket — but it also means the R2 copy grows over time and nothing here prunes it. At today's volume (2 files, 103KB) that's irrelevant; flagged as a Non-Goal to revisit once real usage exists.
- **No automated restore drill in this first version**, unlike the database backup's spec 0048. The database got its quarterly automated drill after the manual backup had already been running and proven for weeks. Recommend the same order here: ship the backup, verify it manually once, consider an automated drill later if this bucket's real-world size ever makes "did the last backup actually work" worth checking automatically.
- No duplicate/overlapping functionality, locked-decision conflicts, or Design System conflicts found — this is a backend/CI-only change with no UI.

## Functional Requirements

1. The actual photo and document files that owners upload (pet photos, vaccine record scans, bloodwork reports) get copied somewhere independent of Supabase on a regular schedule — today, if the Supabase Storage system that holds these files were ever lost or corrupted, there would be no way to get them back, even though the *database* (which just stores a link to each file, not the file itself) is already backed up nightly.
2. This should reuse the pattern already built and proven for the database backup — a nightly GitHub Actions job, copying to Cloudflare R2 — so there's one consistent "how we back things up" story instead of two unrelated ones, while still keeping the two backups' credentials fully separate (see Technical Spec).
3. Deleting a file from the app should not delete its backup copy — the backup exists specifically to survive both "the whole system got wiped" and "someone accidentally deleted a real file."
4. This covers every file type in the bucket, not just photos — vaccine record scans, bloodwork reports, and any other document scans an owner uploads get backed up exactly the same way, since the backup job copies by file, not by file type.

## Acceptance Criteria

- Given the nightly workflow runs, when it finishes successfully, then every file currently in production's `uploads` bucket has a matching copy in the dedicated R2 backup bucket, and the GitHub Actions run shows green.
- Given a file was previously backed up and is later deleted from the live app, when the next nightly run happens, then the file's backup copy in R2 is untouched (not deleted).
- Given someone needs to recover a lost or deleted file, when they look in the R2 backup bucket, then they can find and download the original file by its original path (`{user_id}/{filename}`).
- Given the nightly job fails for any reason, when the failure happens, then GitHub's built-in failed-workflow email reaches the repo owner — no new alerting system is built, matching the existing database-backup job's behavior.

## Test Plan

- "Every file gets a matching R2 copy" → not Playwright-testable (infrastructure/CI, no browser involved, and there's currently no real user-uploaded content to exercise in the UI anyway). Verified manually: trigger the workflow once via `workflow_dispatch`, then confirm via `aws s3 ls` (or the Cloudflare dashboard) that both current production objects (`shared/cooper.jpg`, `shared/maple.jpg`) appear in the R2 destination with matching file sizes.
- "Deleting a file from the app doesn't delete its backup" → not Playwright-testable. Verified manually during implementation: delete or overwrite a test file in a non-production bucket, run the sync, and confirm the R2 copy remains.
- "Recoverable by original path" → not Playwright-testable. Verified manually: after a sync run, confirm the R2 object key preserves the `{user_id}/{filename}` structure rather than flattening or renaming it.
- "Failure email reaches the repo owner" → not Playwright-testable (GitHub-hosted behavior). Verified manually the same way spec 0048 verified this for the database backup: force one run to fail and confirm the notification email arrives.
- **Seeding/access constraints:** None of this touches the app itself or the Playwright suite's fixture session — it's entirely GitHub Actions/Supabase Storage infrastructure, same category as the existing database backup workflow.

## Visual Reference

No mockups or screenshots provided — this is a backend/CI change with no UI.

## Technical Spec

- **New Supabase credential (manual, dashboard-only):** In the production project's dashboard → Storage → S3 Access, generate an access key + secret scoped to Storage. This is a *different* credential from the existing Publishable/Secret API keys — it authenticates against Supabase Storage's S3-compatible API, not the regular Supabase API.
- **New, dedicated R2 bucket:** `whisker-watch-storage-backups` (separate from `whisker-watch-db-backups`), so a compromise of one backup's credentials doesn't expose the other. Provisioned once in the Cloudflare dashboard (or via `wrangler r2 bucket create`), same category of one-time setup as the existing DB-backup bucket.
- **New R2 credentials, scoped only to the new bucket:** `R2_STORAGE_ACCESS_KEY_ID`, `R2_STORAGE_SECRET_ACCESS_KEY`, `R2_STORAGE_BUCKET_NAME` — deliberately *not* reusing the existing `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, for the same isolation reason above. (`R2_ACCOUNT_ID` is account-level, not bucket-scoped, so that one secret is safely shared between both jobs.)
- **New secrets required (GitHub repo → Settings → Secrets and variables → Actions):**
  - `SUPABASE_STORAGE_S3_ACCESS_KEY_ID`, `SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY` — from the manual Supabase dashboard step above.
  - `SUPABASE_STORAGE_S3_ENDPOINT` — the production project's S3-compatible endpoint URL; exact region string needs confirming against the dashboard's displayed value at setup time (Supabase's docs show the endpoint pattern but the region portion varies by project).
  - `R2_STORAGE_ACCESS_KEY_ID`, `R2_STORAGE_SECRET_ACCESS_KEY`, `R2_STORAGE_BUCKET_NAME` — from the manual Cloudflare dashboard step above.
- **New script:** `scripts/backup-storage.sh`, using `aws s3 sync` (no `--delete` flag — additive only, per the Functional Requirements above) from Supabase Storage's S3-compatible endpoint (`https://<project-ref>.supabase.co/storage/v1/s3`) to the new `whisker-watch-storage-backups` R2 bucket — object keys keep their original `{user_id}/{filename}` path, no flattening.
- **New GitHub Actions workflow:** `.github/workflows/storage-backup.yml`, nightly at 08:15 UTC — 15 minutes after `db-backup.yml`'s 08:00 UTC run, so the two jobs never contend for R2 access at the same instant — plus `workflow_dispatch` for manual runs, mirroring `db-backup.yml`'s structure.
- **No encryption at rest applied by this job** (unlike the database backup, which is GPG-encrypted before upload) — R2 already encrypts data at rest by default, and unlike the database dump (which contains all users' data in one file), each object here is a single file already scoped to one user's folder; matching the database backup's extra encryption layer isn't necessary for this to be a meaningful improvement over "no backup at all." Flagged here explicitly since it's a real difference from the pattern being reused, not an oversight.
- **Design System compliance:** Not applicable — no UI, component, or page files touched.
- **Constraints from CLAUDE.md / locked decisions:** None conflicted. CLAUDE.md doesn't currently mention storage-bucket backups at all; once this ships, its "Deployed on Cloudflare Workers" bullet block (where the DB backup pipeline is described) should get a short addition — handled via `doc-updater` after approval, per this repo's convention.
- **Doc updates required after implementation:**
  - `requirements-database-backups.md`'s "Known Limitations" bullet ("Storage bucket file contents are not backed up...") gets replaced with a description of this new coverage.
  - Same doc's inaccurate "R2-backed bucket" phrasing (describing the *source* `uploads` bucket, which is plain Supabase Storage, not Cloudflare R2) gets corrected — it's currently misleading because it uses the same "R2" term used correctly elsewhere in that doc for the actual R2 backup destination.
  - `docs/launch-punch-list.md`'s already-checked-off P0 backup item currently says "storage bucket files are not covered" — update once this ships to reflect that they now are.
  - All via `doc-updater` after this spec is approved and implemented, not hand-edited now.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None — this is the first storage-bucket-backup mechanism in the repo; it extends the existing R2-backup pattern rather than creating a competing one.
- **Technical debt nearby:** The "R2-backed bucket" documentation inaccuracy described above (found in `requirements-database-backups.md`) — not something this change introduces, but worth fixing while touching this exact area.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** This *is* the gap `requirements-database-backups.md`'s Known Limitations and spec 0048's Non-Goals both point at without resolving — confirmed via re-reading both. Once approved, `launch-punch-list.md`'s existing checked-off P0 backup item should be updated (see Technical Spec) rather than a new punch-list item created from scratch, since it already exists and just needs its "not covered" caveat corrected.

## Non-Goals

- Does not add an automated restore drill for storage files (parallel to spec 0048's database drill) — manual verification only in this first version.
- Does not back up dev or staging bucket contents — production only, since those two only ever hold test/demo data.
- Does not add retention/expiry/cleanup logic for the R2 backup destination — every backed-up file stays indefinitely; revisit if real usage volume makes this a real cost or clutter concern.
- Does not change the `uploads` bucket's public-read behavior, RLS policies, or upload path convention (`storageClient.js` is untouched).
- Does not attempt point-in-time recovery of storage files — only "most recent synced copy," the same freshness model already accepted for the nightly database backup.

## Open Questions

None — resolved during review: a new dedicated R2 bucket (`whisker-watch-storage-backups`) will be used rather than reusing the database-backup bucket, for credential isolation; the nightly schedule is 08:15 UTC, 15 minutes after the database backup.
