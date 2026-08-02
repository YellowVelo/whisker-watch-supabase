# 0040_Auth_Required_Dead_Branch_Removal_Specification_v1

**Status:** Draft
**Date:** 2026-08-02
**Related files:** `src/App.jsx`, `src/lib/AuthContext.jsx`, `e2e/login.spec.js`

## Before You Approve This

Plain-language flags from the self-review pass:

- **This is not actually the fix the punch list describes — it's a different, smaller fix, because the original bug can't be reproduced.** The punch list entry (`docs/launch-punch-list.md` P4) says visiting a protected page while logged out throws a React console error even though the redirect to `/login` still works, and blames `App.jsx`'s `authError.type === 'auth_required'` branch calling `navigateToLogin()` mid-render. I reproduced the scenario live (dev server, cleared session, visited a protected URL) and got a clean redirect with **zero console errors**. Tracing why: nowhere in the codebase does anything ever set `authError.type` to `'auth_required'` — `AuthContext.jsx`'s `checkUserAuth()` only ever sets `authError` to `{ type: 'unknown', ... }`. That branch is leftover from the old Base44 login system (retired when the app moved to Supabase auth) and has been unreachable ever since — the redirect you actually see today comes entirely from `ProtectedRoute.jsx`'s `<Navigate to="/login" replace />`, a different and already-correct mechanism. You confirmed (see prior turn) you want the dead branch deleted rather than "fixed," since there's nothing live to fix.
- **A close sibling of this dead code was found but is deliberately left alone.** The adjacent `authError.type === 'user_not_registered'` branch (in both `App.jsx` and `ProtectedRoute.jsx`) has the exact same problem — nothing sets that error type either, so it's equally unreachable. It wasn't part of what you approved, so this spec doesn't touch it. Flagging it here so it isn't a surprise if a future audit turns it up again.
- **`navigateToLogin` becomes fully unused once this ships**, not just its one call site. It's only ever referenced in two places in the whole repo: its own definition/export in `AuthContext.jsx`, and the one call in `App.jsx` being deleted. Rather than leave an unused function sitting in the shared auth context's public shape, this spec removes it there too. If you'd rather keep it in reserve for a future use, say so and it'll stay.
- No database, Edge Function, or design-system impact — this is a pure dead-code removal in two frontend files.

## Functional Requirements

In plain terms: clean up a leftover piece of code from the app's old login system (before it switched to Supabase) that can no longer actually run, so it stops sitting in the app pretending to handle a case that never happens.

There is no user-facing behavior to change — what a logged-out person sees when they try to visit a page that requires being signed in (a clean bounce to the Login screen) stays exactly the same. This is about removing unreachable code, not fixing a symptom a user could ever see.

## Acceptance Criteria

- Given a logged-out session, when a protected URL (e.g. `/pets`) is visited directly, then the app lands on `/login` with no errors logged to the browser console.
- Given `src/App.jsx`, when the source is inspected, then no reference to `authError.type === 'auth_required'` or a mid-render call to `navigateToLogin()` remains.
- Given `src/lib/AuthContext.jsx`, when the source is inspected, then the now-fully-unused `navigateToLogin` function and its export from the auth context are removed.
- Given `npm run build` and `npm run lint`, when run after this change, then both complete with no errors.

## Test Plan

- Logged-out visit to a protected URL lands cleanly on `/login` with no console errors → **new Playwright test**, added to `e2e/login.spec.js` alongside its existing logged-out test (which already uses `test.use({ storageState: { cookies: [], origins: [] } })` to start with no session). The new test navigates to a protected route (e.g. `/pets`), asserts the final URL is `/login`, and asserts no `pageerror`/console-`error` events fired during the navigation — this is a genuinely new regression guard, since no existing test currently checks the logged-out-redirect path for console errors.
- No remaining reference to `auth_required` / mid-render `navigateToLogin()` in `App.jsx` → **not Playwright-testable** (this is a source-code shape, not a runtime behavior) — verified by code review at merge time.
- `navigateToLogin` fully removed from `AuthContext.jsx` → same as above, verified by code review, and indirectly by `npm run build` (an orphaned reference anywhere else would fail the build).
- `npm run build` / `npm run lint` clean → covered by CI (`frontend` job) on push, same as every other change.
- **Seeding/access constraints:** None — the new test only needs a logged-out browser context, no account data, no server-only writes.

## Visual Reference

No mockups — this has no visual or UI change of any kind.

## Technical Spec

- **Schema:** None.
- **API / Edge Functions:** None.
- **Components/files touched:**
  - `src/App.jsx` — in `AuthenticatedApp` (~lines 58-77): remove `navigateToLogin` from the `useAuth()` destructure (line 59, now unused), and remove the `else if (authError.type === 'auth_required') { navigateToLogin(); return null; }` branch (lines 73-76), leaving the `user_not_registered` branch's `if` in place unchanged (still dead itself, but out of scope per "Before You Approve This" above).
  - `src/lib/AuthContext.jsx` — remove the `navigateToLogin` function definition (lines 186-188) and its entry in the context value object (line 204). The doc comment at the top of the file (lines 9-18) references `navigateToLogin` as part of the shape kept for "shape-compatibility" with `App.jsx`/`ProtectedRoute.jsx` — update that comment to drop the reference so it doesn't describe a function that no longer exists.
  - `e2e/login.spec.js` — add one new test per the Test Plan above.
- **Design System compliance:** No UI change of any kind — nothing in `docs/foundation/0005 Design System.md` applies to this change.
- **Constraints from CLAUDE.md / locked decisions:** None triggered — no database, Edge Function, or deployment-adjacent change. Consistent with CLAUDE.md's general "delete fully unused code outright rather than leaving compatibility shims" convention already followed elsewhere in this repo.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None — this removes code, it doesn't add or duplicate anything.
- **Technical debt nearby:** The sibling `user_not_registered` dead branch described above (`App.jsx` and `ProtectedRoute.jsx`) — left alone per your decision, noted for a future pass.
- **Orphaned features nearby:** `navigateToLogin` itself is the orphaned piece this spec removes; no other orphaned code found nearby during this investigation.
- **Punch list / known issues in this area:** This directly addresses the P4 item *"Visiting a protected URL while logged out throws a real React error to the console..."* in `docs/launch-punch-list.md` — but resolves it as "the described error doesn't reproduce because the code path is dead; removing the dead code" rather than as "fixed a live bug." The punch-list entry should be updated (not just checked off) to reflect that distinction — a `doc-updater` pass after this ships, not part of this spec itself.

## Non-Goals

- Removing the sibling `user_not_registered` dead branch — explicitly deferred, see flags above.
- Any change to what a logged-out user actually sees or experiences — behavior is unchanged; this is source-level cleanup only.
- Investigating whether the old Base44-era `auth_required` error type should be reintroduced for some future use case — out of scope; if a real need for a distinct "auth required" error type ever arises, that would be new work, not a revival of this dead branch.

## Open Questions

None remaining — the approach (delete the dead branch rather than defensively fixing it) was confirmed with you before drafting.
