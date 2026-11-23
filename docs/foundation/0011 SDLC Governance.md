# 0011 — SDLC and Governance

**Status:** Approved (Lynn, 2026-11-23: "go with recommendation" — risk-tiered merges, PROTECTED work always stops for Lynn's OK).
**Adapted from:** the "Wysker SDLC pack" drafted in Claude Chat (2026-11-23), changed to fit the hard rules in `CLAUDE.md`. Where this doc and `CLAUDE.md` disagree, `CLAUDE.md` wins; flag it and fix one of them.

How a feature moves from idea to release, using Claude Code subagents, with Lynn as the approval authority.

## The loop

| # | Stage | Who does it | Output | Gate |
|---|-------|-------------|--------|------|
| 1 | Discovery | Lynn (Claude can cluster feedback / punch list) | Prioritized items in the Launch Plan xlsx | Lynn decides |
| 2 | Spec | `spec-writer` skill | Spec in `/docs/features`, pushed early so its number is taken | **Lynn approves the spec and any user-facing copy** |
| 3 | Plan | `planner` agent | Task list, each task NORMAL or PROTECTED | Lynn answers open questions |
| 4 | Build | `builder` agent | One or more commits per task, on the session's branch | None |
| 5 | Adversarial review | `code-reviewer` agent | PASS/FAIL with ranked findings | **No merge without PASS on the final commit** |
| 6 | QA | `qa-tester` agent, then Lynn | Tests, `QA_Test_Plan.md` cases, manual checklist | Lynn tests the real PWA when the checklist asks |
| 7 | Docs + PR | `doc-updater` skill, then the orchestrator | Doc changes in the same PR | Lynn approves doc changes (per the skill) |
| 8 | Merge | Claude (NORMAL) or Lynn's OK first (PROTECTED) | Merged PR, branch deleted | See "Merging" |
| 9 | Release | Claude pushes backend to all 3 projects; Lynn promotes the frontend in Cloudflare | Live change | Lynn's Cloudflare promotion |
| 10 | Operate and learn | Lynn, Claude | New checklist items from escaped bugs | None |

Stages 3–8 run with `/ship-feature <spec path>`. The main Claude Code session is the **orchestrator**: subagents can't start other subagents, so it calls each one itself.

## Roles and separation of duties

- **Agents propose, Lynn approves** — at minimum the spec, user-facing copy, open questions, and every PROTECTED merge.
- **The builder never reviews its own work.** The reviewer never edits code. QA only adds or changes tests and `docs/testing/QA_Test_Plan.md`, never app code.
- **Reviewer independence.** The reviewer gets only the spec, the diff, and the repo — never the builder's summary or reasoning.
- **The orchestrator never reviews in place of the reviewer** and never skips it.

## PROTECTED areas

A task is PROTECTED if it touches any of these. They are where the PA-01 to PA-07 holes were.

- Auth, sign-up, sign-in, password reset, OAuth, session handling, `redirectTo` addresses
- RLS policies and any query whose result depends on them
- Co-owner sharing (`pet_co_owners`, invite claim functions)
- Sitter access (`pet_sit_is_open()` and everything that calls it)
- File storage rules and the `uploads` bucket
- Database function permissions (`grant execute`, migration 0059's "locked by default" rule)
- Account deletion, pet deletion, ownership transfer
- Secrets, keys, Edge Function environment settings
- Any database migration
- Edge Functions that use the service role

PROTECTED work always gets:
- The strict review sections of `code-reviewer` (all of them, none skipped).
- **Lynn's OK before merge, even on PASS.** The orchestrator gives her a plain-English access summary ("after this, sitters can see X but not Y"), not code.
- A test in `supabase/tests/` that proves a stranger, a logged-out user, and the wrong role are refused — not just that the right person is allowed.
- For new tables: an RLS policy for each of SELECT, INSERT, UPDATE and DELETE (or a written reason one is deliberately absent).
- For migrations: an **undo plan** written in the spec or PR (Supabase migrations only run forward, so "rollback" here means the follow-up migration that would reverse it), plus a safe order against the frontend deploy (see migration `0055`'s deploy-marker pattern).

## Merging (risk-tiered)

- **NORMAL PR:** Claude merges once CI is green **and** `code-reviewer` returned PASS on the final commit. Lynn doesn't need to look; she still controls the frontend going live through the Cloudflare promotion.
- **PROTECTED PR (any PROTECTED task in it):** Claude stops after the PASS, sends Lynn the access summary, and merges only after her OK. Backend changes don't wait for a Cloudflare promotion, so this is the real last checkpoint.
- **Any new commit after a PASS needs a new review.**
- **Only Lynn can override a FAIL**, and the reason goes in the PR description.
- After merge: delete the branch (local + remote) and worktree in the same turn (per `CLAUDE.md`).

## Review loop

1. Reviewer returns PASS or FAIL.
2. On FAIL, a fresh `builder` run fixes the findings; then a fresh `code-reviewer` run reviews from scratch.
3. Maximum two fix rounds. If the same finding survives, stop and ask Lynn.

## Databases and environments

- Agents test against **`wysker-watch-dev`** only (the same place CI's Deno and e2e tests run). Before pushing a migration there, check `supabase migration list` for another session's unmerged migration.
- **Never** use `wysker-watch-restore-scratch` — the restore drill wipes it.
- No subagent pushes to staging or prod or reads prod data. Pushing backend changes to all three projects after merge is the orchestrator's shipping step, done per `0006 Technical Standards.md` §11 (including the function permission check query and `scripts/check-functions-start.sh`).
- No agent pushes to `main`. In cloud sessions, all work goes on the session's assigned branch.

## Branches and scope

- One branch per session, as `CLAUDE.md` says; a branch may hold several specs or fixes. Each planned task is one or more commits on it, so the reviewer reviews that task's commit range.
- Small tasks, each traced to a spec acceptance criterion.
- Agents stop and ask when: the spec is ambiguous, the work needs a decision the spec doesn't make, a PROTECTED change might not be safe, or a finding survives two fix rounds.

## Source of truth

1. The approved spec, the canonical specs (`/docs/foundation`, and `docs/features/0012…v5` for anything Vibe/check-in), and `CLAUDE.md`.
2. Agent judgment, which loses to all of the above. If they conflict, flag it and ask.

## Definition of done

- Every acceptance criterion in the spec is met and covered by a test (or a `[Manual]` case in `QA_Test_Plan.md` with a reason).
- `code-reviewer` PASS on the final commit; CI green.
- QA PASS; Lynn's manual checklist done where it has items.
- `design-system-check` run on every changed `.jsx` file, findings fixed or reported.
- New test cases added to `docs/testing/QA_Test_Plan.md` in the same PR.
- `doc-updater` run before the PR, its approved changes in the same PR. (Superseded docs are updated or deleted, never moved to an archive folder — `/docs/archive` was removed on purpose.)
- The PR links the spec and states each task's review verdict and rounds.
- The spec's Status line says what shipped and where.

## Continuous improvement

When a bug escapes to alpha or beta testers, trace it back: which stage and which checklist item should have caught it? Add that item to `code-reviewer` or `qa-tester`. The checklists grow from real misses.

## Known gaps (future)

- **No adversarial check on specs or plans yet.** A `spec-challenger` agent could hunt for ambiguity and untestable criteria before planning.
- **Nothing in GitHub enforces the reviewer PASS.** Today the orchestrator enforces it and Lynn spot-checks PRs. A required check could come later.
- **CI doesn't run `deno check` on Edge Functions** (22 known errors, PA-65). The reviewer runs it on changed functions and compares against that baseline.
