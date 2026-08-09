# 0048_Automated_Quarterly_Restore_Drill_Specification_v1

**Status:** Draft
**Date:** 2026-08-09
**Related files:** [.github/workflows/db-restore-test.yml](../../.github/workflows/db-restore-test.yml), [.github/workflows/db-backup.yml](../../.github/workflows/db-backup.yml), [scripts/restore-test.sh](../../scripts/restore-test.sh), [docs/features/requirements-database-backups.md](requirements-database-backups.md)

## Before You Approve This

Plain-language flags from the self-review pass:

- **This adds a 4th Supabase project.** CLAUDE.md and `0006 Technical Standards.md` currently describe exactly three Supabase projects (prod, dev, staging). You already confirmed you're fine adding a dedicated scratch project for this, but flagging it again here because it's a change to a documented, locked-sounding fact — both docs need updating once this ships (see Technical Spec).
- **The restore script deletes everything in its target every run, on purpose.** `restore-test.sh` runs `DROP SCHEMA public CASCADE` and `DELETE FROM auth.users` at the start of every drill. That's correct and intentional for a dedicated scratch project — but it means this workflow must never be pointed at dev, staging, or prod, even temporarily for a one-off test. The spec below adds a same-project guard to make an accidental prod/dev/staging target fail loudly instead of silently wiping real data.
- **No new secret-scanning risk found.** The new scratch project's DB URL reuses the exact same `RESTORE_TEST_DB_URL` secret pattern the manual workflow already uses — no new kind of credential introduced.
- Other than the above, nothing in this draft conflicts with existing code, docs, or the punch list.

## Functional Requirements

1. The database restore drill (proving that a backup can actually be turned back into a working database) runs automatically once per quarter, without anyone needing to remember to click a button.
2. It always runs against a dedicated, disposable practice database — never the real dev, staging, or production databases used by the actual app.
3. A run doesn't just "not crash" — it also checks that real data actually came back (not just an empty, technically-successful restore).
4. If a quarterly run fails for any reason, Lynn finds out without having to go check manually.
5. The existing manual "run this anytime" button for the drill keeps working exactly as it does today — this adds a scheduled trigger, it doesn't replace the manual one.

## Acceptance Criteria

- Given the quarterly schedule fires, when the drill runs, then it restores the most recent nightly backup into the dedicated scratch project and the GitHub Actions run shows green on success.
- Given a drill run completes without a script error, when the post-restore check runs, then it confirms at least one row exists in each of `profiles`, `pets`, and `daily_check_ins` in the scratch project — and the run fails (goes red) if any of those come back empty.
- Given the drill is accidentally configured to point at anything other than the dedicated scratch project, when it starts, then it refuses to run and fails immediately with a clear error, before touching any data.
- Given a scheduled run fails (script error or row-count check failure), when the failure happens, then GitHub's built-in "scheduled workflow failed" email reaches the repo owner — no new alerting system is built.
- Given someone wants to run the drill outside the quarterly schedule (e.g. right after a migration change), when they trigger it manually via Actions → Run workflow, then it behaves exactly as it does today, unchanged.

## Test Plan

- "Runs automatically once per quarter" → not covered by a Playwright test — this is a GitHub Actions cron schedule, not a UI. Verified by confirming the workflow's `schedule:` trigger is present and by triggering it manually once (via `workflow_dispatch`) as a stand-in for a real scheduled fire, then confirming the run appears in the Actions history and completes successfully.
- "Restores into dedicated scratch project only" → not Playwright-testable (infrastructure/CI, no browser involved). Verified manually: run the workflow once against the new scratch project's `RESTORE_TEST_DB_URL` and confirm via the Supabase dashboard's Table Editor that the scratch project — not dev/staging/prod — received the restored rows.
- "Fails loudly if pointed at the wrong project" → not Playwright-testable. Verified manually: temporarily point `RESTORE_TEST_DB_URL` at a project lacking the new guard marker (e.g. a throwaway local Postgres or a copy of the dev connection string in a test-only run, never actually executed against real dev) and confirm the guard step fails before any `DROP SCHEMA` runs. This check happens once during implementation, not as a recurring automated test.
- "Row-count check catches an empty restore" → not Playwright-testable. Verified manually during implementation: run the drill against a scratch project with an intentionally-empty restore (e.g. skip the `pg_restore` step once) and confirm the workflow goes red instead of green.
- "Failure email reaches the repo owner" → not Playwright-testable (GitHub-hosted behavior, not app code). Verified manually: force one run to fail (see row-count case above) and confirm a GitHub notification email actually arrives, since GitHub's default is to email but per-account notification settings can suppress it.
- **Seeding/access constraints:** None of the above touch the app itself or the Playwright suite's `wysker-watch-dev` fixture session — this whole feature lives in GitHub Actions/Supabase infrastructure, outside what a normal signed-in app user can see or trigger. No new seeding pattern needed; verification is manual, by design, and stated as such above rather than skipped silently.

## Visual Reference

No mockups or screenshots were provided — this is a backend/CI change with no UI.

## Technical Spec

- **New Supabase project:** A 4th Supabase project, dedicated to restore drills (suggested name: `wysker-watch-restore-scratch`, but naming is Lynn's call). Free tier is sufficient — it only ever holds a quarter's worth of restored data and gets wiped every run.
- **Schema/migration changes:** None. This doesn't touch `supabase/migrations/`.
- **`.github/workflows/db-restore-test.yml` changes:**
  - Add a `schedule:` trigger (quarterly cron: `0 9 15 1,4,7,10 *` — 09:00 UTC on the 15th of Jan/Apr/Jul/Oct) alongside the existing `workflow_dispatch` trigger. Both remain available side by side.
  - Add a new step after the restore completes that runs a row-count sanity check (`SELECT count(*) FROM public.profiles`, same for `pets` and `daily_check_ins`) and fails the job (non-zero exit) if any come back 0. This is a non-empty check, not a fixed-count match — it only catches a restore that silently returned nothing; it doesn't compare against last quarter's numbers, so normal growth in the data over time never trips it.
- **`scripts/restore-test.sh` changes:**
  - Add a guard near the top of the script that refuses to proceed unless `RESTORE_TEST_DB_URL` matches an expected scratch-project marker (e.g. a `RESTORE_TEST_ALLOW_TARGET` secret containing the scratch project's ref/host, checked against the connection string before any destructive step runs). This is the only way to make "wrong target" fail safely for a scheduled run with nobody watching, since the workflow can no longer rely on a human double-checking `backup_key`/target before clicking Run.
- **Secrets (GitHub repo → Settings → Secrets and variables → Actions):**
  - `RESTORE_TEST_DB_URL` — becomes a **permanent** secret pointing at the new dedicated scratch project (previously documented as something to update "before each drill if using a fresh scratch project" — that caveat goes away).
  - New secret: a scratch-project identifier for the same-target guard above (exact form depends on implementation — e.g. `RESTORE_TEST_ALLOW_TARGET`).
- **Design System compliance:** Not applicable — no UI, component, or page files are touched by this change.
- **Constraints from CLAUDE.md / locked decisions:** CLAUDE.md's "Three separate Supabase projects exist" statement becomes stale the moment a 4th project is created. This spec's implementation must update that line in CLAUDE.md and in `0006 Technical Standards.md` (wherever the three-project list is stated) to mention the 4th, scratch-only project and its purpose — otherwise this repeats the exact "docs say three, reality says otherwise" staleness pattern CLAUDE.md itself warns about elsewhere.
- **Doc updates required after implementation:** `requirements-database-backups.md`'s "Known Limitations" bullet ("No automated recurring restore drills yet...") should be updated or removed once this ships, and its Acceptance Criteria list should get a new checked item for the automated drill. Per this repo's convention, use the `doc-updater` skill for that after the change lands rather than hand-editing it now.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found — `db-restore-test.yml` and `restore-test.sh` are the only restore-drill code in the repo, and this spec extends them rather than creating a parallel path.
- **Technical debt nearby:** `requirements-database-backups.md`'s own "Known Limitations" section already names this exact gap ("No automated recurring restore drills yet... Recommend running it against a fresh scratch project periodically"), so this spec is closing a gap the team already flagged in writing, not discovering a new one.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** The P0 backup item on `docs/launch-punch-list.md` is already checked off and points at `requirements-database-backups.md` for details — that item doesn't need to be reopened; this spec just closes the one remaining gap its own linked doc calls out.

## Non-Goals

- Does not change anything about the nightly backup job (`db-backup.yml`) itself — only the restore-drill side.
- Does not add Slack, PagerDuty, or any new alerting integration — failure notification is GitHub's existing default email behavior, confirmed working, not built.
- Does not attempt to back up or restore Storage bucket files (pet photos/documents) — that gap is already documented as out of scope in `requirements-database-backups.md` and stays that way here.
- Does not change PITR status (still deliberately not enabled pre-launch, per the existing doc).
- Does not change the three excluded one-off historical migrations' handling (`0003`, `0007`, `0027`) — the restore script's existing skip-list behavior is unchanged.

## Open Questions

None — resolved during review: schedule is the 15th of Jan/Apr/Jul/Oct at 09:00 UTC; new scratch project is named `wysker-watch-restore-scratch`.
