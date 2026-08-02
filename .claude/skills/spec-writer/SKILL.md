---
name: spec-writer
description: Write a feature, fix, or change spec grounded in a deep investigation of the actual repo (schema, existing/duplicate features, technical debt, orphaned code, open issues) and in any screenshots/mockups the user provides. Use whenever the user says "spec this out," "write requirements for X," "new feature spec," "document this change," wants to fix an issue or plug a hole and needs a written spec first, or shares a screenshot/mockup alongside an idea. The user is not a developer and cannot personally verify code-level risk, so this skill must investigate thoroughly, ask real clarifying questions, and self-review its own draft before presenting it -- never draft silently in one pass.
---

# Spec Writer

Turns a feature idea, bug fix, or change request into a complete written
spec — grounded in real repo investigation, real questions, and a
mandatory self-check before the draft is ever shown to the user.

**Core assumption: the user is not a developer.** They cannot read code to
catch a bad assumption, a duplicated feature, or a quietly introduced piece
of technical debt. That means this skill has to do the catching. Silence is
not safe here — surface everything, even things that seem minor.

## Plain-language requirement

The user has a technical background but is not a developer and is still
learning this part of the stack — treat explanations like you're talking
to a smart high schooler who's new to the subject, not a junior engineer.
This applies everywhere in the spec, not just the Findings section:

- When a technical term first appears (migration, edge function, orphaned
  code, race condition, whatever), define it briefly in plain words the
  first time — a short parenthetical is enough, don't turn it into a
  lecture.
- Don't drop jargon-only sentences into Findings, Risks, or the
  "Before You Approve This" list — those sections exist specifically so a
  non-developer can catch a problem, so they have to be readable standing
  alone.
- The Technical Spec section can and should use real terms (real file
  paths, real column names) — that part is for implementation — but even
  there, a one-line plain-language summary of *why* a technical choice
  matters is more useful than assuming it's self-evident.
- If unsure whether a term needs explaining, explain it briefly. Erring
  toward over-explaining costs little; erring toward assuming knowledge is
  exactly the failure mode this skill exists to prevent.

## Workflow

### 1. Investigate the repo — adversarially, before asking anything

Don't just read the files relevant to the obvious ask. Actively hunt for
reasons this request might be more complicated than it looks:

- **Duplicate or overlapping functionality.** Grep/search for existing
  components, functions, or docs that already do something similar to what's
  being requested. This is the single most important check — it's the
  "wait, we did that" case. If something close already exists, surface it
  before drafting anything, not after.
- **Technical debt near the area being touched.** Look for TODO/FIXME/HACK
  comments, commented-out code blocks, deprecated-but-still-present
  functions, inconsistent patterns vs. the rest of the codebase, or
  anything the codebase's own comments flag as temporary or incomplete.
- **Orphaned features.** Look for components, functions, routes, or DB
  columns that are defined but no longer referenced anywhere (search for
  usages, not just definitions). Flag these even if unrelated to the
  immediate ask — an orphaned feature near the area being changed is a risk
  the user needs to know about.
- **Open/known issues.** Check the punch list (an ongoing to-do/issues doc
  in the repo — locate it if the exact filename isn't known yet, e.g.
  `PUNCH_LIST.md` or similar) for anything already logged near this area,
  plus any other TODO list or comments describing known bugs. If the
  request relates to something already on the punch list, say so and ask
  whether this spec should supersede that entry, or whether the entry
  should be updated once this spec is approved.
- **Locked decisions / retired patterns.** Read CLAUDE.md and any docs
  conventions for rules that must not be silently violated (e.g. "X is
  never derived from Y" style constraints). If the request looks like it
  would conflict, this is a required flag, not optional.
- **Design System compliance.** Read `docs/foundation/0005 Design System.md`
  in full, including the numbered Amendments block at the top — it's the
  locked, current ruleset, and it changes over time, so don't work from
  memory of it. For any UI described in the request (and for any
  mockup/screenshot the user provides), check it against that doc before
  drafting. Two failure modes, handled differently:
  - **A new one-off violation** the feature would introduce (raw hex,
    sub-13px text, an emoji-as-icon, a hand-rolled card/sheet/toggle
    instead of the canonical shared component, etc.) — fix it in the
    draft itself. Don't carry a violation forward from a mockup just
    because the mockup drew it that way; if a provided mockup conflicts
    with the locked doc, say so explicitly and specify the compliant
    alternative instead.
  - **An existing systemic violation the feature would extend** (a
    shared component like `Button` or `IconButton` already has a
    non-compliant default baked in, and every consumer — including this
    new feature — inherits it silently). Don't just fix your own call
    sites. Flag it as a component-level issue, note how many other
    places already depend on the same non-compliant default (a real grep
    count, not a guess), and recommend the fix land once at the
    component level rather than being patched per-instance across
    specs — this is the "6+ violations found in one pass" failure mode
    spec 0028 already flagged; the goal is to stop rediscovering the same
    systemic issue feature by feature.
- **Existing spec convention.** Glob for the numbered spec docs, read the
  most recent 1-2 for numbering/format/voice, and determine the next
  number.
- **Schema.** Locate and read the relevant schema/migration files for the
  area being touched.
- **E2E test conventions and constraints.** Skim `e2e/` for how this
  repo's Playwright suite works before assuming a feature can be tested
  the way you'd expect. It signs in via a saved fixture session and has
  **no privileged access** — no service-role key, and RLS on several
  tables blocks even the signed-in test user from writing what a spec
  might assume is writable (e.g. system-generated rows only a cron job
  or Edge Function can create). If this feature's data can't be
  seeded/verified by a normal user session, note that now — it's a real
  constraint on the test plan, not a detail to discover mid-implementation.

Compile everything found into a running list of **Findings** before moving
to step 2. Findings are not optional color — they directly shape the
questions asked next.

### 2. Ask real questions — one at a time

The user wants to be questioned, not handed a one-pass draft. Ask
clarifying questions before drafting, informed by what step 1 turned up:

- One question at a time, multiple-choice where possible.
- Lead with anything step 1 found that changes the shape of the request —
  e.g. "I found an existing `MedReminder` component that does something
  close to this. Is this meant to replace it, extend it, or is it
  genuinely separate?" — before asking generic scoping questions.
- Cover: functional intent, scope boundaries (what's explicitly out), how
  this relates to anything found in step 1, and any edge case the repo
  investigation surfaced that isn't obviously covered.
- Keep it tight — enough questions to remove real ambiguity and surface
  real risk, not an exhaustive interrogation. If the user's original
  request already answers a question, don't ask it again.

### 3. Draft the spec

Use `references/spec-template.md`. Order: Functional Requirements →
Acceptance Criteria → **Test Plan** (maps to Acceptance Criteria, see
below) → Visual Reference (tie any provided image explicitly to the
requirement it illustrates) → Technical Spec (real file paths, schema
changes, Design System compliance, from step 1) → **Repo Findings & Risks**
(tech debt, orphaned code, duplicate functionality, locked-decision
conflicts — in plain language, not developer jargon) → Non-Goals → Open
Questions.

The **Repo Findings & Risks** section is not optional and is not just a
restatement of step 1 — it's the plain-language translation the user needs
since she can't read the code herself. If step 1 found nothing concerning,
say that explicitly ("No existing duplicate functionality or orphaned code
found near this area") rather than omitting the section.

The **Test Plan** section is not optional either. For each Acceptance
Criterion, state whether it will get a Playwright test, and if not, say
why — "not UI-observable," "requires infrastructure outside a normal user
session," etc. "Skipped it" is not an acceptable reason on its own; an
explicit one is. Where a criterion needs test data outside what a normal
signed-in session can create (server-only writes, cron-only functions,
admin-only tables — see the E2E investigation step above), say how the
test will get that data, reusing whatever pattern this repo has already
settled on (e.g. shelling out to the Supabase CLI against the linked
project, never a service-role key added to `.env.playwright`) rather than
re-deciding it fresh next time.

The **Technical Spec** section's Design System compliance line is not
optional either, even when the answer is "no UI changes" or "checked, no
conflicts found" — say so explicitly rather than omitting it.

### 4. Self-review before presenting — mandatory, every time

Before showing the draft to the user, re-read it adversarially as if
checking someone else's work. This is the safeguard against the exact
failure mode the user described — the AI doing something quietly wrong
that a non-developer would never catch. Check:

- Does anything in the draft duplicate or conflict with something found in
  step 1?
- Does anything contradict a locked decision in CLAUDE.md?
- Does anything in the draft (or a mockup it's based on) conflict with a
  locked rule in `docs/foundation/0005 Design System.md`? Did a systemic,
  component-level violation get flagged as such, rather than quietly
  patched in just this feature's call sites?
- Is every acceptance criterion actually testable, or does one just sound
  testable?
- Does the Test Plan's tests actually work if run in a different order,
  or does one test's action (marking something read, consuming a
  single seeded row, etc.) silently change the state a later test
  assumes is still there? Shared fixture data mutated by an earlier
  test breaking a later one is a real bug this has caused before, not a
  hypothetical.
- Does the technical spec introduce new debt (a quick hack, a special
  case, an inconsistent pattern) without saying so plainly?
- Is there a claim in the technical spec that isn't actually backed by
  something found in the repo (an invented file path, an assumed table
  that was never confirmed)?

Present the results of this pass as a short **"Before You Approve This"**
list at the top of the spec — plain-language flags only, not a restatement
of the whole document. If the self-review finds nothing, say so explicitly
rather than skipping the section — an empty check is still a check, and
the user should be able to see that it ran.

### 5. Save using the existing numbering convention

Only after the user has seen and responded to the draft (including the
"Before You Approve This" flags) — write to the same docs location, next
sequential number, matching filename pattern from step 1.

## Notes

- Never skip straight to a draft. Investigation and questions come first,
  every time, even if the request seems simple — simple requests are where
  a duplicate-feature or orphaned-code risk is easiest to miss.
- If repo access isn't available in the current context, say so plainly
  and ask the user to paste relevant code/schema instead of guessing.
- This skill is a safeguard, not a substitute for the user's own review.
  Its job is to make risks visible in language she can act on — not to
  make the decision for her.
- Once implementation happens (whether in this session or a later one),
  running the Test Plan's Playwright tests is required before considering
  the work done — treat it the same as running lint, not as an optional
  extra. A manual browser check passing once proves the feature works
  today; the automated test is what proves it still works the next time
  something nearby changes.
