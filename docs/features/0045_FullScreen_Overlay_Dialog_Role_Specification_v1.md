# 0045_FullScreen_Overlay_Dialog_Role_Specification_v1

**Status:** Draft
**Date:** 2026-08-04
**Related files:** `src/components/catchup/CatchUpFlow.jsx`, `src/components/onboarding/OnboardingShell.jsx`, `src/components/BottomSheet.jsx`, `src/hooks/useFocusTrap.js` (new), `e2e/fixtures.js`, `e2e/ask-wysker-guardrails.spec.js`, `e2e/bottom-nav-menu-tab.spec.js`, `e2e/daily-checkin.spec.js`, `e2e/pet-sitter.spec.js`, `e2e/pwa-install-prompt.spec.js`, `e2e/onboarding.spec.js`, `docs/launch-punch-list.md`

## Before You Approve This

- **This spec grew beyond the original punch-list item, with your OK.** The punch-list entry only named `CatchUpFlow.jsx`. While investigating I found a second component, `OnboardingShell.jsx` (the full-screen shell behind the 6-step pet-onboarding wizard), with the identical gap — no `role="dialog"`, no keyboard focus trap, no Escape-to-close. Its own code comment says it was "modeled directly on `CatchUpFlow.jsx`'s overlay pattern," so it inherited the same miss. You confirmed fixing both in this pass.
- **This also grew past "just add two ARIA attributes," with your OK.** `BottomSheet.jsx` (the app's other modal shell) doesn't just carry `role="dialog"`/`aria-modal="true"` — it also traps Tab/Shift+Tab focus inside itself and closes on Escape. Adding only the two attributes to `CatchUpFlow`/`OnboardingShell` without that behavior would leave them claiming to be a modal to assistive tech while still letting keyboard/screen-reader focus leak to whatever's behind them — you asked for the full behavior, matching `BottomSheet` exactly.
- **A small refactor is included: extracting the shared focus-trap logic into one hook.** Copying `BottomSheet.jsx`'s ~25 lines of focus-trap code twice more (once into each of the other two components) would leave three near-identical copies in the codebase — exactly the kind of duplication CLAUDE.md's Amendment #8 (bottom-sheet consolidation) was written to prevent. Instead, that logic moves into one new file, `src/hooks/useFocusTrap.js`, and all three components (including `BottomSheet` itself) call it. `BottomSheet`'s own behavior does not change — this is a pure extraction, not a rewrite of working code.
- No conflicts with CLAUDE.md's locked Vibe/Symptom Count data model — this spec touches zero check-in logic, only the overlay shell markup around it.
- No Design System conflicts found (see Technical Spec below) — this is an accessibility/interaction fix, not a visual change.
- One test, `home-card-keyboard-nav.spec.js`, already calls `dismissAnyOpenSheet()` and is unaffected either way (see Test Plan) — flagging so you know it was checked, not missed.

## Functional Requirements

1. **The Catch-Up Check-In overlay must identify itself as a modal dialog to assistive technology** (screen readers and other tools that help people navigate without seeing the screen). Right now, a screen reader has no way to tell the owner "you're now inside a pop-up window" when this overlay opens — it just silently reads whatever's on screen next, which is confusing and inconsistent with every other pop-up in the app.
2. **The Catch-Up Check-In overlay must trap keyboard focus while open.** Someone navigating by keyboard (Tab key) instead of a mouse should not be able to tab past the overlay's own buttons into the Home screen content sitting invisibly behind it. Pressing Escape should close the overlay, same as it already does for every bottom-sheet pop-up in the app.
3. **The pet-onboarding wizard's full-screen shell must have the same two behaviors** (modal identification + focus trap/Escape-to-close), for the same reason — it shares the exact overlay pattern and has the same gap.
4. **Neither fix changes what the Catch-Up flow or onboarding wizard actually do** — no change to steps, save behavior, the Vibe/Symptom Count model, or onboarding's question flow. This is purely about how the overlay identifies and behaves itself for accessibility and keyboard use.

## Acceptance Criteria

- Given the Catch-Up Check-In overlay is open (auto-launched from Home, or reached during a test), when inspected by assistive-technology tooling, then it exposes `role="dialog"` and `aria-modal="true"` on its outer container, matching `BottomSheet.jsx`'s existing pattern.
- Given the Catch-Up Check-In overlay is open, when the owner presses Tab repeatedly, then focus cycles only among the overlay's own focusable elements (buttons, inputs) and never reaches Home's content behind it.
- Given the Catch-Up Check-In overlay is open, when the owner presses Escape, then the overlay closes exactly as clicking its own Close (X) button would.
- Given the onboarding wizard's full-screen shell is open, when inspected, tabbed through, or dismissed via Escape, then it behaves identically to the three criteria above (dialog role, focus trap, Escape-to-close).
- Given the existing `e2e/fixtures.js` helper `dismissAnyOpenSheet()` (which finds an open overlay via `getByRole('dialog')` and clicks its "Close" button), when it runs against a fresh test session with an auto-launched Catch-Up overlay, then it successfully finds and dismisses it — unblocking the 5 previously-blocked specs.
- Given the exact same Catch-Up flow (calendar, exceptions, bulk-apply, finish) or onboarding wizard steps as today, when run end-to-end, then all existing behavior and saved data are unchanged — confirming this is a shell-level fix only.

## Test Plan

- Dialog role + `aria-modal` on Catch-Up overlay → covered indirectly: `ask-wysker-guardrails.spec.js`, `bottom-nav-menu-tab.spec.js`, `daily-checkin.spec.js`, `pet-sitter.spec.js`, and `pwa-install-prompt.spec.js` all call `dismissAnyOpenSheet()` as a setup step and currently fail/block when a Catch-Up overlay is the thing auto-launched (since `getByRole('dialog')` can't find it). Once fixed, these 5 specs passing **is** the regression test for this criterion — no new spec needed, since a passing run only happens if the role is present and the overlay is genuinely dismissible.
- Focus trap on Catch-Up overlay (Tab cycling stays inside) → new assertion added to a Catch-Up-specific spec (there isn't a dedicated one today — added inline in whichever of the 5 above first opens Catch-Up, or a small new `catch-up-flow.spec.js` if none currently drive Catch-Up open deliberately; confirmed during implementation which fits better). Asserts that repeated `Tab` presses starting from the last focusable element wrap back to the first, never landing on a Home element.
- Escape closes Catch-Up overlay → same spec as above: press `Escape`, assert the dialog is `detached` (same pattern `dismissAnyOpenSheet()` already uses for the Close-button click).
- Onboarding shell: dialog role + focus trap + Escape → new assertions added to `e2e/onboarding.spec.js`, which already drives the full wizard open. Same three checks as Catch-Up, adapted to that spec's existing flow.
- Unchanged flow behavior (Catch-Up save paths, onboarding wizard steps) → already covered by `e2e/onboarding.spec.js` end-to-end and by the 5 specs above reaching Home/Catch-Up as part of their existing setup; a passing full suite run after this change confirms no regression.
- **Seeding/access constraints:** none — every criterion here is reachable and verifiable through the existing signed-in `test1@` session already used by the whole `e2e/` suite (per `e2e/fixtures.js`); nothing needs data only a service-role key or cron job could create.

## Visual Reference

No screenshots or mockups were provided for this fix — it's a code-only accessibility/interaction change with no visible UI difference. The overlay looks identical before and after; only its accessibility markup and keyboard behavior change.

## Technical Spec

- **New shared hook, `src/hooks/useFocusTrap.js`:** extracts the focus-management logic currently inline in `BottomSheet.jsx` (lines 20–50: find focusable elements, focus the first on mount/`focusKey` change, trap Tab/Shift+Tab within the container, close on Escape). Signature mirrors what `BottomSheet` already needs: takes a ref to the dialog container, an `onClose` callback, and an optional `focusKey` (a value that, when changed, re-runs the "focus the first element" step — `BottomSheet` uses this for its internal wizard-stage changes; `CatchUpFlow` will pass its `step` state, `OnboardingShell` doesn't need it since it's a single-render-per-step component already). Returns nothing — it's a pure side-effect hook, same as the current inline `useEffect`.
- **`src/components/BottomSheet.jsx`:** its inline focus-trap `useEffect` (lines 20–50) is replaced with a call to `useFocusTrap(dialogRef, onClose, focusKey)`. No behavior change — this is a refactor to remove duplication, not a fix (it already had `role="dialog"`/`aria-modal="true"` and a trap).
- **`src/components/catchup/CatchUpFlow.jsx`:** the outer `<div className="fixed inset-0 z-[60] ...">` (line 243) gains `role="dialog"`, `aria-modal="true"`, and a `ref` used with the new `useFocusTrap` hook (passing `step` as `focusKey`, so switching between Catch-Up's internal screens — calendar, exceptions, etc. — re-focuses the first element on the new screen, matching how `BottomSheet` already handles its own internal stage changes). No other change to this file's logic.
- **`src/components/onboarding/OnboardingShell.jsx`:** same treatment — outer `<div className="fixed inset-0 z-[60] ...">` (line 15) gains `role="dialog"`, `aria-modal="true"`, and the same hook wiring. Because this component is a per-step-page render (each onboarding step is its own mount, not an internal state change like `CatchUpFlow`'s `step`), no `focusKey` is needed — the hook's mount-time focus already covers it.
- **Design System compliance:** checked against `docs/foundation/0005 Design System.md` including the 2026-07-30 Amendments — this change touches only ARIA attributes and keyboard-event handling, no color, typography, spacing, or component-choice changes, so nothing in the doc applies. No conflicts found.
- **Constraints from CLAUDE.md:** none affected — no change to `daily_check_ins.status`, symptom counts, or any check-in save path; `checkinClient.js` is untouched.
- **No schema or database changes.**

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** yes — this is the core finding of this spec. `BottomSheet.jsx` already has a complete, working focus-trap implementation; `CatchUpFlow.jsx` and `OnboardingShell.jsx` each independently built a full-screen overlay shell that copied `BottomSheet`'s portal-to-`document.body` trick (with a code comment crediting the precedent) but silently left out the accessibility half of that pattern. This spec both fixes the gap and consolidates the now-three copies of focus-trap logic into one hook, so a fourth full-screen shell built the same way in the future inherits the fix automatically instead of needing its own audit.
- **Technical debt nearby:** the code comment in `BottomSheet.jsx` (lines 60–62) currently says "Same fix already proven in this codebase by `CatchUpFlow.jsx`'s identical portal" — true of the portal-to-body technique, but that comment reads as implying the two components are equivalent in behavior, which (before this spec) they were not. Worth a one-line comment update while this file is already being touched, so a future reader doesn't assume `CatchUpFlow` is a safe accessibility reference the way `BottomSheet` is.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** this spec directly addresses the `launch-punch-list.md` item quoted in the request ("`CatchUpFlow.jsx`'s full-screen overlay has no `role="dialog"`"). Once implemented and its Playwright tests pass, that punch-list item should be checked off and a short note added that the fix also covered `OnboardingShell.jsx`, which wasn't in the original item's text.

## Non-Goals

- No change to what the Catch-Up Check-In flow or onboarding wizard actually ask, save, or display — only the overlay shell's accessibility/keyboard behavior.
- No change to `AskWyskerSheet.jsx` or any other existing `role="dialog"` surface — those already comply and aren't touched.
- No new design pattern or visual treatment — the overlay looks identical before and after.
- Does not address the separate, pre-existing "scrollY≈0 masking" latent bug noted in `BottomSheet.jsx`'s own comments (about `DailyCheckInSheet`/`DailyCheckInModal` possibly having the same portal-position issue at non-zero scroll) — that's flagged there as a known follow-up, unrelated to dialog roles, and out of scope here.

## Open Questions

- Should the new focus-trap Playwright coverage live in a small new `e2e/catch-up-flow.spec.js`, or be added inline to one of the 5 specs that already open Catch-Up as a setup step? Left as an implementation-time call per the Test Plan above — either satisfies the acceptance criteria, and the decision is best made once the exact fixture behavior is confirmed against `wysker-watch-dev`'s live seeded data.
