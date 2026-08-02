# {Number}_{FeatureName}_Specification_v{N}

**Status:** Draft
**Date:** {date}
**Related files:** {real file paths found during repo investigation}

## Before You Approve This

Plain-language flags from the self-review pass. If nothing was found, say
so explicitly rather than omitting this section.

- {flag, or "No conflicts, duplicates, or debt concerns found."}

## Functional Requirements

Plain-language description of the need. No schema, component, or table
names — what a user/stakeholder would say, not a developer.

## Acceptance Criteria

Testable, still non-technical. Given/when/then works well.

## Test Plan

Maps to Acceptance Criteria above, one line each:

- {Acceptance criterion} → {Playwright test that covers it, or an
  explicit reason it won't get one — "not UI-observable," "requires
  infrastructure outside a normal user session," etc. Not "skipped."}
- **Seeding/access constraints:** {if any criterion needs test data a
  normal signed-in session can't create — server-only writes, cron-only
  functions, admin-only tables — say how the test will get it (e.g. the
  Supabase-CLI-against-linked-project pattern already used in this repo's
  suite), or "none — everything is reachable via a normal user session."}

## Visual Reference

- {Image description} → illustrates requirement(s) {X}
- States not shown in provided images (flag as Open Question if unresolved)

## Technical Spec

- **Schema:** {new/changed tables, columns, migration file}
- **Components/files touched:** {real paths from repo investigation}
- **API / edge functions:** {relevant changes}
- **Design System compliance:** {checked against
  `docs/foundation/0005 Design System.md` including its Amendments —
  conflicts found and how the draft resolves them, systemic
  component-level issues flagged separately from one-off fixes, or "no
  conflicts found"}
- **Constraints from CLAUDE.md / locked decisions:** {respected or flagged
  exception}

## Repo Findings & Risks

Plain-language translation of what the investigation turned up near this
area of the codebase, even if not directly caused by this change:

- **Duplicate/overlapping functionality:** {found, or "none found"}
- **Technical debt nearby:** {found, or "none found"}
- **Orphaned features nearby:** {found, or "none found"}
- **Punch list / known issues in this area:** {found on the punch list, or
  "none found"}

## Non-Goals

What this spec explicitly does not cover.

## Open Questions

Anything not resolved through investigation or the clarifying questions.
