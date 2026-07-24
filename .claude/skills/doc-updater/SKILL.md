---
name: doc-updater
description: Review recent code changes against existing documentation -- feature docs and the foundation file (CLAUDE.md or equivalent) -- and propose specific updates to keep them accurate. Use when the user says "update docs," "sync documentation," "review docs for this change," or after a feature/fix has been implemented and needs its documentation caught up. Never edits documentation silently -- always proposes changes for review first, the same way spec-writer proposes specs before saving them.
---

# Doc Updater

Reviews what actually changed in the codebase, compares it against the
existing documentation set, and proposes specific updates — file by file,
with plain-language reasoning — rather than silently rewriting docs.

This is the natural companion to spec-writer: spec-writer grounds a plan
*before* code is written; doc-updater keeps the documentation honest
*after* code is written. Same core assumption applies — the user is not a
developer and cannot verify on her own whether a doc update is accurate,
so proposals must be reviewable and plain-language, never auto-applied.

## What counts as "the docs" here

Three categories, all in scope every time this runs:

- **Feature docs** — the individual numbered spec files (the
  `000X_FeatureName_Specification_vN` docs spec-writer produces) living in
  the project's docs/features area. Locate this folder by finding where
  the existing numbered specs actually live — don't assume a path.
- **Foundation docs** — numbered, versioned docs describing the
  underlying architecture rather than a single feature — e.g.
  `docs/foundation/0007_DataModel_V2`. These aren't optional extras; a
  code change that alters the data model, schema shape, or core
  architecture needs a corresponding foundation doc check every time,
  same as a feature change needs a feature doc check. Locate this folder
  the same way — by finding where the existing numbered foundation docs
  live, not by assuming a path.
- **The root convention file** — the project-level file holding locked
  decisions and retired-pattern rules (e.g. CLAUDE.md). Locate it by
  name/convention if the exact filename isn't known yet.

Foundation docs and the root convention file are both higher-stakes than
an individual feature doc — a foundation doc like a data model spec
underpins every feature built on top of it, so a stale foundation doc is a
bigger risk than a stale feature doc. Treat foundation-doc proposals with
the same weight as root-convention-file proposals throughout this skill,
not as a subset of feature docs.

If any of the three locations can't be confidently identified, ask the
user directly instead of picking a path and hoping — a wrong guess here
means proposing edits to the wrong file.

## Workflow

### 1. Establish what actually changed

- Find the last commit that touched each doc surface (foundation file, and
  each individual feature doc under consideration) using git log.
- Diff the codebase from that commit to HEAD to get the real set of
  changes — new files, modified components, schema/migration changes,
  removed code.
- Don't rely on commit messages alone; skim the actual diffs for changes
  that commit messages under-describe (common with quick fixes).

### 2. Map changes to documentation surfaces

For each meaningful change found in step 1:

- **Does it belong in an existing feature doc?** If the change touches an
  area already covered by a numbered feature spec, that spec is now stale
  — note exactly which section is out of date and why.
- **Does it belong in a foundation doc?** If the change alters the data
  model, schema shape, or core architecture, check whether an existing
  numbered foundation doc (e.g. a data model spec) now describes something
  that no longer matches reality. Flag this distinctly and treat it as
  higher-stakes — foundation docs underpin everything built on top of
  them, so a stale one is a bigger risk than a stale feature doc.
- **Does it belong in the root convention file?** If the change introduces
  or changes a locked decision, a retired pattern, or a project-wide
  convention, the root convention file (e.g. CLAUDE.md) needs updating —
  flag this distinctly too, same higher-stakes treatment as foundation
  docs.
- **Does it match neither?** A real change with no corresponding doc
  anywhere is itself a finding — flag it as an undocumented feature/change
  rather than silently skipping it. This is the same "orphaned" instinct
  spec-writer uses on code; apply it to documentation coverage too.
- **Cross-check the punch list.** If a change closes out something logged
  on the punch list, flag that entry for removal or update alongside the
  doc proposal.

### 3. Propose — never apply directly

Present findings as a review list, grouped by file:

```
## Proposed updates

### {feature-doc-filename, foundation-doc-filename, or "Root convention file (CLAUDE.md)"}
**What changed in code:** {plain-language summary}
**Why the doc is now stale:** {specific section/claim affected}
**Proposed update:** {the actual suggested text change}
```

- Plain language throughout — same rule as spec-writer: explain any
  technical term on first use, keep the "why" understandable without
  reading the diff yourself.
- Group the review list into three visually separated blocks — feature
  docs, foundation docs, and the root convention file — with foundation
  docs and the root convention file both flagged as higher-stakes, since
  they affect everything built on top of them, not just one feature.
- If nothing needs updating, say so explicitly per file rather than
  omitting it from the summary — an explicit "no changes needed" is still
  useful confirmation that the check ran.

### 4. Wait for approval, then apply per-file

Only write changes to a file after the user has responded to that file's
proposal. Don't batch-apply everything on a single blanket "yes" unless
the user explicitly says to apply all of it — a foundation doc or root
convention file change and a typo fix in a feature doc are not the same
risk level and shouldn't be approved with the same click.

## Notes

- This skill reads git history and diffs the codebase — it does not need
  the docs to be perfect going in. Its job is to find drift, not assume a
  clean baseline.
- If a proposed update would touch something locked-decision-adjacent, say
  so plainly rather than quietly rewording it — the user needs to know
  when a "documentation fix" is actually a policy change in disguise.
- Assumes it can locate the feature-docs folder and foundation file by
  convention. If this project uses different names/locations than
  expected, ask once and remember for next time rather than re-guessing
  every run.
