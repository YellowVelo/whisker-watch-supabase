# 0033_Toast_Viewport_Click_Blocking_Fix_Specification_v1

**Status:** Draft
**Date:** 2026-08-01
**Related files:** `src/components/ui/toast.jsx`, `src/components/ui/toaster.jsx`, `src/components/BottomTabBar.jsx`, `src/App.jsx`, `docs/launch-punch-list.md`

## Before You Approve This

- This is a code-correctness fix, not a design change — no rule in `docs/foundation/0005 Design System.md` or `0008 Navigation & Information Architecture_V4.md` governs toast positioning or z-index, so there's nothing in the foundation docs this fix could conflict with. The one relevant rule (bottom nav needs working 44px tap targets, `0008` line 266) is what this bug *breaks*, and this fix restores it — confirmed by re-reading both docs before drafting this.
- Scope is two related fixes in the same file (`toast.jsx`), per your direction: the invisible click-blocking box, and the duplicated wrapper div that doubles it up. Both are explained below in plain language.
- `sonner.jsx` (the unused second toast component you asked about) is addressed as a separate, tiny finding — see "What is sonner.jsx" below. It is **not** touched by this spec; flagged only.
- No schema changes, no new dependencies, no visible/behavioral change to how toast messages look or work. Nobody using the app will notice this fix happened — that's the point.

## What is sonner.jsx? (answering your question directly)

Short version: it's shelf-ware that was never plugged in. Not a retired feature, not something removed by accident.

When this project was first exported from the Base44 app builder (commit `21d17b5`, 2026-06-21 — the very first commit in this repo's history), it came with **two different toast-notification libraries already scaffolded**, side by side:

1. `src/components/ui/toast.jsx` + `toaster.jsx` — a Radix UI-based system. This is the one actually wired up in `src/App.jsx` and the one every toast in the app today (`Account.jsx`, `Home.jsx`, `Settings.jsx`, `VetExport.jsx`) uses.
2. `src/components/ui/sonner.jsx` — a wrapper around a separate npm package called `sonner`, a popular alternative toast library.

This is a common byproduct of AI/template-based app scaffolding tools (shadcn/ui, which both of these come from, ships install commands for either one) — the export included both options, and only one was ever connected to the app. `sonner.jsx` has sat completely unused since day one: nothing imports it, it was never in a feature spec, and it never had working functionality to "lose." It's dead code, not a bug. Leaving it in the repo costs nothing but a small amount of confusion for the next person who greps for "toast" — which is exactly what happened here. Recommend a follow-up cleanup ticket to delete it, separate from this bug fix.

## Functional Requirements

Today, on a desktop-width browser window (roughly 640px wide or more — the point where the app's toast pop-up notifications switch from full-width-on-mobile to a corner box), there is an invisible box sitting in the bottom-right corner of the screen at all times, whether or not a toast notification is actually showing. That invisible box can silently absorb a click meant for the "Menu" tab in the bottom navigation bar, because the box happens to sit in the same corner and is drawn "on top" of the navigation bar from the browser's point of view — even though there's nothing visibly there.

This fix makes that box only intercept clicks when a real, visible toast notification is on screen inside it. At all other times, clicks pass straight through it to whatever is actually visible underneath — in this case, the Menu tab.

Additionally, the toast system currently draws two identical invisible boxes stacked on top of each other in that same corner (one that's supposed to be there for layout purposes, and one duplicate that shouldn't exist). This fix removes the duplicate so there's only the one, correctly-behaving box.

## Acceptance Criteria

- Given a desktop-width browser window (≥640px) with zero toast notifications currently showing, when a user clicks the "Menu" tab in the bottom navigation bar — anywhere within its clickable area, including the corner nearest the screen edge — then the click always navigates to Settings, with no silent misses.
- Given a desktop-width browser window with a toast notification actively showing in the bottom-right corner, when a user clicks on the visible toast itself (its text, its close button, its action button), then the toast still responds exactly as it does today — this fix must not make toasts themselves unclickable.
- Given the same scenario, when a user clicks the Menu tab while a toast happens to be visible, then the click reaches the Menu tab as long as the click isn't physically on top of the visible toast's own drawn area (unavoidable — a real, visible toast still occupies real screen space; the fix removes the *invisible padding* around it, not the toast itself).
- Given the existing Playwright E2E suite, when `e2e/login.spec.js` (or any spec that clicks the Menu tab) runs, then `page.getByRole('link', { name: 'Menu' }).click()` succeeds without retries or interception errors, at both mobile and desktop viewport sizes.
- Given the toast system in general, when any of the four existing `toast()` call sites (`Account.jsx`, `Home.jsx`, `Settings.jsx`, `VetExport.jsx`) fire a toast, then it still appears, displays its title/description/action, and auto-behaves (swipe to dismiss, etc.) exactly as before — no visual or timing change.

## Visual Reference

None provided — this is an invisible-hitbox bug with no visual change to anything that's actually seen. There is nothing to screenshot before/after other than "the Menu tab now always works."

## Technical Spec

- **Schema:** None.
- **Components/files touched:**
  - `src/components/ui/toast.jsx`:
    - `ToastViewport` (lines 15-21): add `pointer-events-none` to its wrapper class, so the box itself never intercepts clicks. Add `pointer-events-auto` to the individual `Toast` component (line 40-48's `toastVariants`) so each actual visible toast message remains fully clickable (buttons, swipe-to-dismiss, etc.) — this is the standard fix shadcn/ui itself ships for this exact class of bug in newer template versions, so it's a known-correct pattern, not a novel workaround.
    - `ToastProvider` (lines 6-13): currently renders a second `<div>` with the exact same `fixed ... sm:bottom-0 sm:right-0 ...` styling as `ToastViewport`, wrapped around it — this is the duplicate flagged in your first answer. In the standard version of this file (what shadcn/ui generates), `ToastProvider` is just a pass-through for Radix's `ToastPrimitives.Provider` — a component that manages toast behavior/context but draws nothing on screen itself. Fix: remove the duplicate styled `<div>` from `ToastProvider` so it stops rendering a second copy of the same invisible box; it should just render `{children}` (or wrap `ToastPrimitives.Provider` if/when this file is upgraded to use real Radix primitives — out of scope here, see Non-Goals).
  - No changes needed to `toaster.jsx`, `use-toast.jsx`, `BottomTabBar.jsx`, or `App.jsx` — the bug is fully contained inside `toast.jsx`'s styling, not in how or where the toast system is mounted.
- **API / edge functions:** None.
- **Constraints from CLAUDE.md / locked decisions:** None conflict. `0008 Navigation & Information Architecture_V4.md`'s 44px-tap-target rule for the bottom nav (line 266) is upheld, not changed, by this fix.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** Yes — `sonner.jsx` is a second, entirely unused toast-notification system that's shipped alongside the one actually in use since the project's first commit. See "What is sonner.jsx" above. Not touched by this spec; flagged for a separate cleanup decision.
- **Technical debt nearby:** Yes — `ToastProvider` in `toast.jsx` renders a duplicate copy of `ToastViewport`'s styled box instead of being the non-visual Radix context wrapper it's supposed to be. This spec fixes it as part of the same change, per your direction, since it's the same file and same root cause area (both divs create the same kind of invisible click-blocking box).
- **Orphaned features nearby:** `sonner.jsx` again — see above. No other orphaned code found in the toast-related files.
- **Punch list / known issues in this area:** Yes — this exact bug is already logged in `docs/launch-punch-list.md` (PWA section, dated 2026-08-01, found while testing spec `0032`). Once this spec is approved and implemented, that punch-list entry should be checked off and a short note added pointing to this spec, the same way `0032`'s items were closed out.

## Non-Goals

- Not migrating `toast.jsx`/`toaster.jsx` to real Radix UI primitives (`@radix-ui/react-toast`) — the current file is a hand-rolled approximation of the Radix API surface (plain `<div>`s instead of Radix's `Root`/`Provider`/`Viewport` components), which is a separate, larger change with its own risk (behavior differences in accessibility, focus management, animation timing). This spec only fixes the click-blocking and duplicate-div bugs within the current hand-rolled structure.
- Not deleting `sonner.jsx` — flagged only, per your answer, pending a separate decision on whether to remove it.
- Not changing where or how toast notifications are visually positioned (still bottom-right on desktop, full-width on mobile) — only whether the invisible padding around them can eat clicks.
- Not adding a new Playwright test in this spec — the existing Menu-tab click reported in the punch list (found while writing `0032`'s tests) already serves as the regression check once un-skipped/fixed; whether a dedicated regression test is added is an implementation detail, not a new requirement.

## Open Questions

None — investigation and your answers resolved the scoping questions. The only follow-up worth a decision later (not blocking this fix) is whether to delete `sonner.jsx` in a separate cleanup pass.
