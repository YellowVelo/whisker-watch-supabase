# 0066_Supabase_Environment_Sync_PreAlpha_Specification_v1

**Status:** Approved (2026-10-19) — not yet executed
**Date:** 2026-10-19
**Deadline:** before alpha kickoff (2026-11-02)
**Related files:** `supabase/functions/*/index.ts` (all 14), `supabase/functions/_shared/errorReporting.ts`, `supabase/functions/_shared/testHelpers.ts`, `supabase/functions/delete-account/index.test.ts`, `supabase/functions/resend-webhook/index.ts`, `supabase/migrations/`, `supabase/config.toml` (new), `.github/workflows/ci.yml`, `docs/features/0052_Production_Error_Monitoring_Specification_v1.md`, `docs/testing/QA_Test_Plan.md`, `CLAUDE.md`

## Before You Approve This

1. **Order matters for safety.** Staging's and prod's deployed `delete-account` does **not** have the test-account guard (the check that refuses to delete internal test/demo accounts). The guard test tries to delete `test2@` and expects to be refused — run before the redeploy, it would actually delete that account. So on every project: back up → redeploy → test, never test first.
2. **`resend-webhook` must keep its login check switched off** (`verify_jwt=false`) because Resend's servers call it without a login. Every other function has it on. A default redeploy would switch it back on and silently break bounce tracking. This spec records the setting in a new `supabase/config.toml` (so the computer remembers it) and re-reads the live setting after every deploy as a double check.
3. **Every command names its target project** (`--project-ref`) and never relies on the CLI's "linked" project. As of 2026-10-19 the CLI is linked to **prod**, so a command that forgot its target would hit production.
4. **Fast-forwarding staging also redeploys the staging website** — staging auto-promotes with no manual gate. Expected, but it's not Supabase-only.
5. **Prod gets only the guard test.** The three tests that create and delete real-looking (`account_type='production'`) throwaway accounts run on dev and staging only.
6. **The migration check runs first and only reads.** If it finds the databases differ, work stops and the gap gets its own decision — functions aren't deployed on top of a mismatched database.
7. **Self-review:** no conflicts with CLAUDE.md, the Vibe data model, or the Design System (no UI). The only new code is the small `config.toml`.

## Functional Requirements

- Before anything is changed, we know whether the three databases (dev, staging, prod) have the same structure and security rules — checked directly, not just by trusting each project's own record of what it ran.
- All 14 backend functions run the current, reviewed code on dev, staging and prod.
- The setting that lets the email provider reach `resend-webhook` is written down in the code so it can't be forgotten on a future upload.
- Staging's code matches main.
- Account deletion refuses to delete internal test/demo accounts on all three projects.
- An error on the backend of any project is recorded in Sentry, labeled with which project and which function it came from — proven with a real, harmless test error (the check spec 0052 never did).
- Prod is changed only after dev and staging have passed and Lynn says go.

## Acceptance Criteria

1. **Given** the three projects' migration history is unknown, **when** the history is compared across dev, staging and prod and the photo-folder (`storage.objects`) security rules are spot-checked directly, **then** a written report shows whether they match, and no function is uploaded until Lynn has seen that report.
2. **Given** the new `supabase/config.toml` records resend-webhook's "login check off" setting, **when** functions are uploaded to dev, **then** resend-webhook shows `verify_jwt=false`, all 13 others show `true`, and the file has passed the normal CI checks.
3. **Given** a project is running older versions of the functions, **when** all 14 are uploaded to it, **then** the live function list shows all 14 updated that day, with the same login-check settings as AC2.
4. **Given** staging's branch is 4 commits behind main and has no commits of its own, **when** staging is fast-forwarded, **then** `git log origin/staging..origin/main` and `git log origin/main..origin/staging` are both empty.
5. **Given** dev or staging has just received the new `delete-account`, **when** all 4 `delete-account` integration tests run, **then** all pass, the throwaway accounts are gone, and `test2@` still exists and can sign in.
6. **Given** prod has just received the new `delete-account`, **when** only the guard test runs as `test2@`, **then** the deletion is refused (403) and `test2@` can still sign in.
7. **Given** a project's functions now include Sentry reporting, **when** a malformed (non-JSON) request body is sent to `invite-co-owner` while signed in as `test1@`, **then** the request returns 500, a matching event appears in Sentry tagged `function=invite-co-owner` and that project's environment, and no email is sent and nothing is saved.
8. **Given** something goes wrong after uploading to a project, **when** the backed-up pre-deploy versions are uploaded again, **then** that project is back to its previous state.
9. **Given** dev and staging have both passed AC2–AC7, **when** results are reported to Lynn, **then** nothing is uploaded to prod until she says go.

## Test Plan

None of these get a Playwright test — this is backend/infrastructure work with nothing new on screen. Each has an explicit verification instead:

- AC1 → `supabase migration list` per project plus a read-only `select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects'` per project (the query from spec 0063). Report recorded in this spec's Results section. Not UI-observable.
- AC2, AC3 → `supabase functions list --project-ref <ref> -o json`, checking `updated_at` and `verify_jwt` for all 14. CI run on the `config.toml` change. Not UI-observable.
- AC4 → git output. Not UI-observable.
- AC5 → existing Deno suite: `deno test --allow-net --allow-env --node-modules-dir=none supabase/functions/delete-account/index.test.ts`. Order-safe: the guard test changes nothing, and each other test creates its own throwaway accounts and cleans up in `finally`.
- AC6 → same suite with `--filter "guard refuses"` against prod only.
- AC7 → manual check in the Sentry dashboard. Not automatable: the e2e suite deliberately has no Sentry credentials (spec 0052).
- AC8 → backup folder exists with 14 × 3 downloaded functions before any deploy. Restore is only exercised if needed.
- AC9 → process gate, no test.
- **Seeding/access constraints:** the Deno suite needs each project's URL, publishable key, secret key, and `test2@` login as environment variables. These are set by Lynn in her own terminal session for that run only — never written to any file, never added to `.env.playwright`. `test1@`/`test2@` confirmed by Lynn (2026-10-19) to exist on all three projects.
- Matching cases get added to `docs/testing/QA_Test_Plan.md` in the same change that executes this spec.

## Visual Reference

None — no UI.

## Technical Spec

**Project refs:** dev `rebvizgpchpzjpoohjrd` · staging `vfhowemvqhwoqtwybzjs` · prod `upvtbwienebfxznnagsg`. Never `wysker-watch-restore-scratch` (`fiyaleaxhntubthqmaam`).

**Run order:**

0. **Migration check (AC1), read-only.** Compare `supabase migration list` across the three projects (expect the known, intentional prod-only gaps for `0003`/`0007`/`0027`, per `0006 Technical Standards.md` §11) and run the `pg_policies` query on each. Any other difference → stop, report, separate spec. `migration list` needs a link or DB URL. If linking is used, the CLI is left linked to **dev** at the end, not prod.
1. **Back up (AC8).** `supabase functions download <fn> --project-ref <ref>` for all 14 functions × 3 projects into a dated folder outside the repo.
2. **Add `supabase/config.toml`** with only:
   ```toml
   [functions.resend-webhook]
   verify_jwt = false
   ```
   Confirm on dev that the CLI accepts a config this minimal (it may want `project_id`). If so, add the smallest addition it requires and nothing else. Lands via PR with CI.
3. **Dev:** deploy all 14 with `--project-ref` → AC2/AC3 check → full `delete-account` suite (AC5) → Sentry live-fire (AC7).
4. **Staging:** `git push origin main:staging` (AC4; re-check `git log origin/main..origin/staging` is empty first) → deploy all 14 → AC3 → full suite (AC5) → live-fire (AC7).
5. **⏸ Report to Lynn (AC9). Stop.**
6. **Prod, on Lynn's go:** deploy all 14 → AC3 → guard test only (AC6) → live-fire (AC7) → confirm `test1@` and `test2@` still sign in.
7. **Docs:** update spec 0052's status line (Edge Function live-fire done). Correct CLAUDE.md's claim that Edge Function errors are dropped by `account_type` — `_shared/errorReporting.ts` does not filter (client side does). Add a Results section to this spec.

**Deploy-time facts (2026-10-19, read-only checks):**
- `delete-account` last deployed: dev 07-21 (has guard, no Sentry), staging 07-11 and prod 07-06 (neither has the guard or Sentry). Guard committed 07-24 (`c118600`), Sentry 08-11 (`c40c203`).
- 12 of 14 functions on every project predate the 08-11 Sentry wiring; only `beta-signup` and `early-adopter-signup` have it. (`ask-vet-assistant` was deployed 08-10, one day before.)
- `SENTRY_DSN` and `SENTRY_ENVIRONMENT` secrets exist on all three projects (set 08-11), with a distinct `SENTRY_ENVIRONMENT` per project.

- **Schema:** no changes.
- **Design System compliance:** no UI changes — not applicable, checked.
- **Constraints from CLAUDE.md / locked decisions:** respects "push backend changes to all three projects", "never deploy to restore-scratch", and "frontend prod deploys are Lynn's" (the staging fast-forward is the only frontend effect, and Lynn requested it).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found.
- **Technical debt nearby:** there was no `supabase/config.toml`, so per-function deploy flags lived only in memory and an old spec (0020) — fixed by step 2. The backend Sentry helper doesn't filter test accounts out the way CLAUDE.md says; the doc gets corrected, and whether to add filtering is a separate question.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** `CORS_ALLOWED_ORIGINS` (the list of websites allowed to call the public sign-up/beta/early-adopter functions) is set on dev and staging but not on prod, which falls back to the built-in default (`www.wyskerwatch.com`). Not fixed here; Lynn is confirming the right addresses as a follow-up.
- **Rollback:** Supabase has no one-click "previous version" for functions, so the step-1 backup is the only undo.

## Non-Goals

- Fixing any migration gap the check finds (gets its own spec).
- Setting prod's `CORS_ALLOWED_ORIGINS` (Lynn follow-up).
- Filtering test accounts out of backend Sentry reports.
- Sentry alerting, sourcemaps.
- Promoting the frontend to production (Lynn's, as always).

## Open Questions

- None open. Recommended after setup: rotate the `test1@`/`test2@` passwords (shared in a chat transcript 2026-10-19) and update the matching GitHub secrets.
