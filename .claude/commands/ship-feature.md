---
description: Run an approved Wysker Watch spec through plan, build, adversarial review, QA, docs, PR and merge, with Lynn's gates
argument-hint: <path to approved spec, e.g. docs/features/0079_Example_Specification_v1.md>
---

Run the governed SDLC loop for the spec at: $ARGUMENTS

Follow `docs/foundation/0011 SDLC Governance.md` and `CLAUDE.md`. You are the orchestrator: subagents can't start other subagents, so you call each one yourself. Never review code yourself in place of `code-reviewer`, and never skip it.

1. **Check the spec.** It exists, its Status line says Approved, its acceptance criteria are testable, and any user-facing copy is marked approved by Lynn. Make sure the spec file is already pushed on this branch (so its number is visibly taken). If anything is missing, stop and tell Lynn what, in plain language.

2. **Plan.** Call `planner` with the spec path. Show Lynn a short version of the task list. If there are open questions, stop and wait for her answers. (PROTECTED tasks don't stop here — they stop before merge, step 8.)

3. **For each task, in order:**
   a. Note the current commit as the task's base (`git rev-parse HEAD`).
   b. Call `builder` with only that task, the spec path, and the base commit.
   c. If the task changed any `.jsx` file, run the `design-system-check` skill on those files. Treat its findings like reviewer findings for step 3e.
   d. Call a fresh `code-reviewer` with only: the spec path, the commit range `<base>..HEAD`, and NORMAL/PROTECTED. Do **not** pass the builder's summary or reasoning.
   e. On FAIL, call a fresh `builder` with only the findings and the spec, then a fresh `code-reviewer` from scratch on the task's full range. At most two fix rounds; if the same finding survives, stop and ask Lynn.
   f. Keep each PROTECTED task's Access summary for step 8.

4. **QA.** Call `qa-tester` with the spec, the full branch range, and every reviewer Unverified list. If it reports a bug, go back to step 3 for the affected task.

5. **Final review.** QA and fixes added commits, so call a fresh `code-reviewer` on the whole branch range against the spec. The merge needs this PASS on the final commit.

6. **Docs.** Run the `doc-updater` skill (it proposes; Lynn approves) and commit the approved changes, including the spec's Status line. Any commit here that touches more than docs needs another review.

7. **PR.** Push the branch and open the PR. Its description links the spec and lists, per task: NORMAL/PROTECTED, reviewer verdict and rounds, QA result, open Unverified items. Wait for CI.

8. **Merge.**
   - **All tasks NORMAL:** once CI is green and step 5 passed, merge, then delete the branch (local + remote) and worktree.
   - **Any PROTECTED task:** stop. Send Lynn the plain-English access summaries and the PR link, and merge only after her OK.

9. **Ship.** Push backend changes to dev, staging and prod per `0006 Technical Standards.md` §11 (function permission check query, `scripts/check-functions-start.sh <project-url>` after any function deploy). Ask Lynn to promote the frontend, naming the row by **commit message and branch `main`**, never by SHA.

10. **Report to Lynn:** per task, the verdict and rounds, QA result, what's live where, and her manual test checklist. End with **"Lynn — what I need from you"** (numbered, one action per line, where to do it, and whether it blocks anything), or "Nothing needed from you right now."

Never touch production data or read secret values. Never push to `main`.
