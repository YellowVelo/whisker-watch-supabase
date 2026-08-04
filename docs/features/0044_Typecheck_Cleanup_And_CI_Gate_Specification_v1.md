# 0044_Typecheck_Cleanup_And_CI_Gate_Specification_v1

**Status:** Approved
**Date:** 2026-08-03
**Related files:** `src/components/ui/*.jsx`, `src/lib/AuthContext.jsx`, ~78 app files flagged by `npm run typecheck`, `jsconfig.json`, `.github/workflows/ci.yml`

## Before You Approve This

- This is a bigger job than the punch list description suggested. It's not "primitives are mechanical, app components need review" — sampling found the app-component errors are the *same* false-positive pattern as the primitives, just scattered across 79 files instead of 7. A full read-through of all 79 files happens before fixing, per owner decision, since this doc has drifted from reality before.
- The previously-claimed fix for Button/Input/Dialog is only half-true. It eliminated errors everywhere those components are *used*, but not inside the three components' own files (11 residual errors). Applying "the same pattern already used" to the remaining 7 primitives only gets most of the way there — each will likely need the same small residual fix Button/Input/Dialog never got.
- `jsconfig.json`'s `exclude` list for `ui`/`api`/`lib` is dead weight — it doesn't stop those folders from being type-checked (TypeScript follows imports regardless), so it's misleading anyone reading the config into thinking those folders are opted out. Flagged as a one-line cleanup, not urgent.
- No duplicate functionality, orphaned code, or locked-decision conflicts found. This is a code-quality/CI-hygiene change with no schema, UI, or user-facing behavior change.
- Design System compliance: N/A — no UI or visual change of any kind, purely type annotations and a CI config line.

## Functional Requirements

Wysker Watch has a type-checking tool (`npm run typecheck`) that's supposed to catch a category of bug before it ships — passing the wrong kind of data into a component (e.g. a number where a date was expected). Right now it isn't actually protecting anything: it has 308 known errors sitting in the code that nobody is fixing, and the automated CI checks that run on every code change deliberately skip it, specifically because of those errors. That means if a *new* real bug of this kind gets introduced, nothing will catch it — it's buried in noise, and even if someone ran the check manually, they'd have no way to tell one new real error apart from the 308 known-fake ones.

This work fixes the 308 existing errors and turns the check on in CI, so that from this point forward, a bad type change fails the build automatically instead of silently shipping.

## Acceptance Criteria

1. Given the current codebase, when `npm run typecheck` is run, then it reports zero errors.
2. Given the CI workflow, when a pull request or push to `main` happens, then `npm run typecheck` runs as part of the `frontend` job and blocks the merge if it fails (same as `lint`/`test`/`build` already do).
3. Given any component that was fixed by adding a type annotation or cast, when the app is run in the browser, then its behavior is pixel-identical and functionally identical to before — this is a types-only change, never a runtime/logic change.
4. Given the review pass across all 79 flagged files, if any error turns out to be a real prop-contract mismatch (not inference noise), then it's fixed as an actual bug fix (with its own explanation) rather than silently cast away, and called out explicitly rather than folded in as "just more of the same."

## Test Plan

- AC1 (zero typecheck errors) → not Playwright-observable (static analysis, not app behavior). Verified by running `npm run typecheck` directly and confirming zero errors in output.
- AC2 (CI gate) → not Playwright-observable. Verified by pushing a branch with the CI change and confirming the `frontend` job's new typecheck step runs and passes on GitHub Actions.
- AC3 (no behavior change) → is UI-observable, and matters most given how many files this touches. The existing Playwright suite (`e2e/`, `npm run test:e2e`) is run in full after the fix — if 79 files' worth of type annotations accidentally changed real behavior anywhere, the existing suite's coverage of core flows (login, check-in, catch-up, pets, settings) would likely catch it. Not a complete substitute for reviewing each diff, but the automated backstop. No new Playwright tests needed since no new user-facing behavior is added.
- AC4 (real bugs surfaced, not hidden) → not automatable; a manual-review commitment, reported directly (not silently fixed) if it happens.
- **Seeding/access constraints:** none — this work touches no data, no auth, no server-only state. Full Playwright run uses the existing `test1@wyskerwatch.com` fixture session, same as always.

## Visual Reference

Not applicable — no UI or visual change.

## Technical Spec

**Phase 1 — Shared primitives (`src/components/ui/`), ~7 files:** Apply the existing, working cast-to-any pattern (with the same explanatory comment style already used in `button.jsx`/`input.jsx`) to the components that never got it: `select.jsx`, `alert-dialog.jsx`, `drawer.jsx`, `radio-group.jsx`, `switch.jsx`, `textarea.jsx`, `label.jsx`. Expected to resolve the majority of the ~268 app-component errors, since those errors are almost all consumers of these exact components.

**Phase 2 — Residual primitive-internal errors:** `button.jsx`, `input.jsx`, `dialog.jsx` (11 errors) plus whatever residual is left in the Phase 1 files after casting — errors inside the primitive's own definition, which the outer cast doesn't reach. Needs an actual typed parameter (e.g. a JSDoc `@param` on the destructured argument) rather than another cast, since the cast only helps at the call site.

**Phase 3 — App components, full read-through of all 79 flagged files:** Every file gets read before applying a fix, specifically to catch any case that isn't the same inference-noise pattern. Expected fix for false-positive cases: same cast-to-any (or an equivalent JSDoc type) applied locally to each affected component definition. Includes one confirmed one-off: `src/lib/AuthContext.jsx:7`, `createContext()` called with no argument — trivial fix (`createContext(undefined)` or similarly typed default), unrelated to the forwardRef pattern.

**Phase 4 — `jsconfig.json` cleanup:** Remove the non-functional `"src/components/ui", "src/api", "src/lib"` exclude entries (they don't do anything, and leaving them in is actively misleading about what's checked).

**Phase 5 — CI gate:** In `.github/workflows/ci.yml`, replace the comment block at lines 27–30 with `- run: npm run typecheck`, inserted before `npm run test` (matching the position `lint` already has, so a type error fails fast before the slower test/build steps run).

**Components/files touched:** `src/components/ui/{select,alert-dialog,drawer,radio-group,switch,textarea,label,button,input,dialog}.jsx`, `src/lib/AuthContext.jsx`, up to ~78 remaining app files currently in the 308-error list (exact list re-pulled from `npm run typecheck` at implementation start, since the count has moved 3 times already), `jsconfig.json`, `.github/workflows/ci.yml`.

**Design System compliance:** No conflicts — makes no visual or component-behavior changes, only type annotations.

**Constraints from CLAUDE.md / locked decisions:** None conflict. Directly addresses the P5 punch-list item and corrects CLAUDE.md's implicit assumption (via the punch list) that Button/Input/Dialog's fix was complete.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found — this is a code-quality fix, not a feature.
- **Technical debt nearby:** the punch list's own description of this item is itself slightly stale (framed as "primitives are mechanical, 5 named app components need review" when in fact the same root cause spans effectively all 79 files) — worth correcting in the punch list once this ships.
- **Orphaned features nearby:** none found. (`MenuListRow.jsx`, named in the original punch-list item, still exists and currently has zero typecheck errors of its own — not orphaned, just already clean.)
- **Punch list / known issues in this area:** this spec is the P5 item ("`npm run typecheck` has 279 pre-existing errors..."). Converts from open to resolved once this ships; the CI workflow's inline comment (lines 27–30) is replaced rather than just deleted, so the history of why it was off is preserved in git blame rather than lost.

## Non-Goals

- No behavior, UI, or data-model changes of any kind.
- No conversion of `.jsx` files to `.tsx` or introduction of "real" TypeScript — stays within the existing `jsconfig.json` + `checkJs` setup.
- No changes to `edge-functions` CI job or Deno-side typing (Supabase functions use their own separate Deno type-checking, out of scope here).
- Not a ratchet/ignore-list approach.

## Open Questions

- None outstanding. Because the error count has moved at every re-check (274→279→308) and this is a multi-session effort, the exact file list at Phase 3's start is re-pulled fresh from `npm run typecheck` rather than trusting this spec's snapshot.
