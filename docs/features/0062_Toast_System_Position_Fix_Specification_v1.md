# 0062_Toast_System_Position_Fix_Specification_v1

**Status:** Draft
**Date:** 2026-08-29
**Related files:** `src/components/ui/toast.jsx`, `src/components/ui/toaster.jsx`, `src/components/ui/use-toast.jsx`, `src/components/VaccinationSection.jsx`, `src/lib/errorMonitoring.js`, `src/lib/zIndex.js`, `e2e/toast-visibility.spec.js`, `e2e/vaccination-scan-review.spec.js`, `docs/features/0033_Toast_Viewport_Click_Blocking_Fix_Specification_v1.md`, `docs/features/0059_ZIndex_Layering_Scale_And_CatchUp_Overlay_Fix_Specification_v1.md`, `docs/features/0061_Invoice_Scan_MultiPet_Vaccination_Review_Specification_v1.md`

---

## Before You Approve This

This is a retroactive record of a fix already implemented, verified live, and deployed to production — written up now to match this repo's convention of a numbered spec for every real change, rather than leaving it as only a commit message and a CLAUDE.md bullet.

- **This bug has been in the app since its very first commit** (`21d17b5`, 2026-06-21) and affected every single toast message the app has ever shown — not just the one that surfaced it (a Vaccinations scan error). A plain-language list of everywhere this was silently broken is in Repo Findings & Risks below.
- **This exact file was looked at twice before, by two other specs, and neither one caught it.** Spec 0033 (2026-08-01) fixed a *different* bug in this same file (an invisible box eating clicks on the Menu tab) and explicitly, deliberately chose *not* to migrate to real Radix primitives as a Non-Goal — meaning the actual structural bug was sitting right there, undisturbed, in a file two people had already worked inside. Spec 0059 (2026-08-28) built the z-index layering scale that toasts already correctly reference — but z-index only decides which of two *positioned* elements paints on top of the other, and these toasts were never positioned (`fixed`) at all, so that work, while correct, could never have caught this either. This isn't a criticism of either spec — it's a genuinely easy bug to miss by reading code, since everything *looks* like a normal, working toast setup unless you inspect a real toast's actual rendered position.
- No conflicts with any locked decision in CLAUDE.md or `docs/foundation/0005 Design System.md` — this is a correctness fix with no visual/design change to how a toast is supposed to look, same posture as spec 0033 took for its own fix in this file.

## Functional Requirements

1. When any part of the app shows a toast notification (a save confirmation, an error message, etc.), that notification must actually appear on screen, pinned to a fixed corner/edge of the visible browser window — not rendered as a normal part of the page that can end up scrolled out of view below other content.
2. This applies to every toast in the app equally: there is one shared notification system, not a per-feature one, so fixing it in one place fixes it everywhere at once.
3. A toast must still auto-dismiss itself after a normal, short amount of time (a few seconds) — not instantly, and not after an unreasonably long delay.
4. Fixing this must not change what any toast actually says, when it's triggered, or which feature is responsible for triggering it — only whether it's visible.

## Acceptance Criteria

- Given any action in the app that triggers a toast (e.g. saving your profile on the Account page), when the toast appears, then it is visibly pinned to the screen and readable, regardless of how much content is on the page above it.
- Given a toast has appeared, when a few seconds pass without the user interacting with it, then it disappears on its own in a normal, short amount of time.
- Given the Vaccinations "Scan Record" flow (spec 0061) hits an error (e.g. the AI rate limit), when the error toast appears, then it is visible on screen — this was the specific case that surfaced this bug during a real production smoke test.
- Given the existing "Scan Record" Playwright suite and the app's other toast-showing features (Account, Home, Settings, Vet Export, Bloodwork), when their existing tests run, then nothing about their pass/fail status changes because of this fix, other than the one adjustment noted below.

## Test Plan

- A toast is pinned to the viewport, not scrolled into the page body → `[Playwright: e2e/toast-visibility.spec.js]` — new, standalone test, deliberately not tied to any one feature since the fix lives in the one shared `Toaster`/`ToastViewport`. It checks two things directly: that the toast text has an ancestor element whose computed CSS position is `fixed`, and that its rendered position actually falls within the visible viewport. **This was verified to be a real regression guard, not just a plausible-looking assertion**: the fix was temporarily reverted locally, the test was re-run and confirmed to fail against the broken version, then the fix was restored and the test re-confirmed passing.
- Scan Record's own AI-failure test still shows its error toast correctly → `[Playwright: e2e/vaccination-scan-review.spec.js]` — already existed from spec 0061; needed one adjustment (see below), otherwise unchanged.
- **Seeding/access constraints:** none — every case here is reachable through a normal signed-in test session (`test1@`), no service-role key or admin-only table involved.

**A note on why an existing test needed a small adjustment, not because it was wrong:** properly wiring up the real `@radix-ui/react-toast` primitives (this fix) means a toast now also emits a proper `aria-live` announcer element for screen readers, alongside the visible toast — a genuine accessibility improvement that didn't exist before (since the fake, hand-rolled toast components had no way to do this). That means a locator matching a toast's text now matches two real DOM elements instead of one, which is why `vaccination-scan-review.spec.js` and the new `toast-visibility.spec.js` both use `.first()` on their toast-text locators. This is expected and correct, not a workaround for a problem.

## Visual Reference

No mockup applies — this is a positioning/correctness bug with no intended visual redesign. The "before" state, for the record: a real, correctly-styled, fully-legible error toast rendering at `position: relative`, hundreds of pixels below the visible screen (confirmed directly via a live reproduction: `top: 1057px` on an ~450px-tall viewport). The "after" state is the same toast, visually unchanged, now actually reaching the screen.

## Technical Spec

- **Schema:** None.
- **Components/files touched:**
  - `src/components/ui/toast.jsx` — `ToastProvider`, `ToastViewport`, `Toast`, `ToastAction`, `ToastClose`, `ToastTitle`, `ToastDescription` were previously hand-rolled stand-ins (`ToastProvider` was a bare React Fragment; the rest were plain `<div>`/`<button>` elements that merely borrowed Radix's expected CSS classes without any of Radix's actual behavior). All are now the real `@radix-ui/react-toast` primitives (`ToastPrimitives.Provider`/`.Viewport`/`.Root`/`.Action`/`.Close`/`.Title`/`.Description`) — a dependency that was already installed in `package.json` since day one but never actually imported anywhere. The root cause: Radix's `Toast.Root` is designed to portal its rendered content into whichever `Toast.Viewport` is registered via `Toast.Provider`'s context, regardless of their sibling order in the component tree — that portaling behavior is what makes `Toaster.jsx`'s existing "map the toast list, then render `<ToastViewport/>`" structure (unchanged by this fix) actually work correctly. Without the real primitives, there was no portal, so each toast just rendered wherever it fell in the normal page layout.
  - `src/components/ui/use-toast.jsx` — `TOAST_REMOVE_DELAY` changed from `1000000` (~16.6 minutes — a copy-paste artifact from the shadcn/ui template this file was scaffolded from) to `5000` (5 seconds). This only controls how long a *closed* toast lingers in memory before being purged from the array; Radix's own ~5-second auto-close animation timer is separate and was unaffected either way.
  - `src/components/VaccinationSection.jsx` — the two `catch` blocks in the Scan Record / review-confirm flow (added in spec 0061) now also call `Sentry.captureException()` (via the existing `src/lib/errorMonitoring.js` export) in addition to showing a toast. Previously, a scan/save failure had no record anywhere except a toast — meaning even with this exact bug fixed, a future failure would still only be visible in the moment, not discoverable afterward via error monitoring (spec 0052). This was the only AI-calling `catch` block audited for this gap as part of this fix; see Repo Findings & Risks for the scope of that finding.
- **API / edge functions:** None.
- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including its Amendments. No conflicts — Amendment #12 (spec 0059)'s rule that every fixed/sticky surface reference the named `src/lib/zIndex.js` scale is unaffected; the toast already correctly used `Z.toast` before this fix and still does. This fix is purely about *whether* the toast reaches `position: fixed` at all, not which z-index value it uses once it does.
- **Constraints from CLAUDE.md / locked decisions:** None conflict. CLAUDE.md's "Key architecture" list has been updated with a bullet describing this fix (see that file directly).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found beyond the already-known, already-documented `sonner.jsx` (an entirely separate, unused toast library shipped alongside this one since day one, per spec 0033) — not touched by this fix.
- **Technical debt nearby, now resolved:** The core finding of this spec. Every one of the app's toast call sites was affected, not just the one that surfaced it:
  - `Account.jsx` — the "Profile saved." confirmation shown after every profile edit.
  - `Home.jsx` — a "Saved, but unable to refresh this card" notice (two call sites) plus one other status message.
  - `Settings.jsx` — the "Unable to sign out. Please try again." failure message.
  - `VetExport.jsx` — the vet-report-generation failure message.
  - `BloodworkSection.jsx` — the AI bloodwork-scan failure message (same pattern as Vaccinations).
  - `VaccinationSection.jsx` — the Scan Record / review-confirm failures this was discovered through.
  
  The fix lives entirely in the one shared `toast.jsx` component all of these call into, so no changes were needed in any of these six files for the *positioning* fix itself to take effect.
- **Orphaned features nearby:** `sonner.jsx`, per spec 0033's existing flag — unchanged, still pending a separate cleanup decision.
- **Punch list / known issues in this area:** None found referencing this specific bug. Spec 0033 came close — it worked inside this exact file a month earlier, for a different symptom (an invisible click-blocking hitbox), and its own Non-Goals section explicitly named "not migrating to real Radix UI primitives" as out of scope for that fix, without realizing that gap was hiding this separate, more serious bug.
- **A related gap surfaced but only partially addressed here:** no client-side `catch` block anywhere else in the app (besides the two now fixed in `VaccinationSection.jsx`) reports to Sentry — every other AI-calling or save-failure `catch` block only ever shows a toast. This fix does not audit or change any of those other call sites; it only closes the gap for the two block directly involved in spec 0061's investigation. Whether to do a broader pass is a separate decision.

## Non-Goals

- Not deleting `sonner.jsx` — unchanged from spec 0033's existing decision to leave that as a separate cleanup question.
- Not adding Sentry reporting to every other AI-calling/save-failure `catch` block in the app — only the two in `VaccinationSection.jsx` that this investigation was already inside. See Repo Findings & Risks above.
- Not changing where toasts are visually positioned (still bottom-right on desktop, full-width on mobile) or how they look — only whether they actually reach that position.
- Not adding toast-visibility regression coverage for individual feature call sites beyond the one standalone test — `toast-visibility.spec.js` protects the shared component all six call sites depend on; it does not mean each of the six now has its own dedicated toast test.

## Open Questions

None — this was investigated, fixed, verified live (including a deliberate revert-and-confirm-failure check on the new test), and approved in chat before this write-up.
