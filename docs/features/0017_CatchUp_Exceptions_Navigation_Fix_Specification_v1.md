# 0017_CatchUp_Exceptions_Navigation_Fix_Specification_v1

**Status:** Draft
**Date:** 2026-07-25
**Related files:** `src/components/catchup/CatchUpFlow.jsx`, `src/components/catchup/BulkApplySheet.jsx` (unaffected, referenced only), `docs/features/0015_MultiDay_CatchUp_CheckIn_Specification_v1.md`, `docs/features/0016_Atomic_CheckIn_Writes_Specification_v1.md`

## Before You Approve This

- **Correction to something I said earlier this session:** I initially told you there was *no way back* from the Exceptions ("N need details") screen to the Calendar screen — that was wrong. A small back-arrow button does exist next to the "Exceptions" title. The real problem is narrower but still real: nothing *automatically* returns you to Calendar once the last flagged day is resolved, so you land on a screen that just says "No days need details right now" with no obvious next step — easy to read as "done" and close out of, which is almost certainly what happened with Pepper's test.
- No conflicts with locked decisions found — this is a navigation/interaction fix only, no change to what gets saved or the Vibe/Symptom Count model.
- No duplicate/overlapping functionality found — no other multi-select or bulk-apply pattern elsewhere in the repo to reuse or conflict with.
- One thing worth knowing before approving: this only fixes the flow *going forward*. Pepper's already-interrupted Catch Up session doesn't need a special repair step — re-opening Catch Up for Pepper will naturally re-detect every still-missing day (missed-day detection is computed live every time, not saved as a stuck session), so simply doing Catch Up again for Pepper will work once this ships.

## Functional Requirements

1. **Automatic return to Calendar.** After an owner resolves the last day that needed details — whether by applying one shared answer to several days at once ("bulk apply") or by filling in a single day's full details — the app automatically takes them back to the Calendar screen. They are never left on an empty "nothing left to do" screen with no clear next step.
2. **Clearer day-selection on the details-needed list.** On the screen listing days that still need details, tapping a day is the one, obvious action for selecting it to apply a shared answer to multiple days at once (the common case: "these 3 days all had the same thing going on"). A separate, smaller, clearly distinct control opens that one day's full check-in form instead, for the less common case of reviewing or answering a single day on its own.
3. Neither change alters what gets saved, the Vibe (Great/Off/Tough Day) or Symptom Count rules, or the atomic, safe-writing behavior shipped in spec 0016 — this is purely about making the screens easier to navigate and understand.

## Acceptance Criteria

- Given an owner has exactly one day left needing details and resolves it (either by bulk-applying an answer that includes it, or by filling in its individual details), when the save completes, then they are shown the Calendar screen automatically — never the empty "No days need details right now" screen.
- Given an owner is viewing the list of days needing details, when they tap anywhere on a day's row (not the small details-only control), then that day becomes selected/deselected for bulk-apply, shown with a clear visual "selected" state on the whole row.
- Given an owner wants to review or answer just one specific day without selecting it for bulk-apply, when they tap the small, separate details control on that row, then that day's full check-in form opens directly, without affecting its selection state.
- Given an owner reaches the Calendar screen with zero days left needing details, when they look at the bottom of the screen, then "Finish Catch Up" is shown and tappable — unchanged from today, confirming this fix doesn't regress the one part of the flow that already worked.
- Given the exact same day/answers as today, when saved through either path (bulk-apply or individual), then the resulting saved records are identical in content to before this fix — confirming nothing about *what* gets saved changed, only the navigation around it.

## Visual Reference

The screenshot you shared shows the Calendar screen itself (July 2026, day circles, "18 days missed / 9 need details" footer) — that screen's own behavior is correct today and isn't being changed by this spec. It's included here mainly to confirm the existing footer pattern ("N need details" / "Finish Catch Up") that both fixes must continue to feed into correctly. The two problem screens (the dead-end "No days need details right now" state, and the confusing double-tap-target day list) weren't screenshotted, but were traced directly in code this session.

## Technical Spec

- **Automatic return to Calendar** (`src/components/catchup/CatchUpFlow.jsx`): both `handleBulkApplySaved` (~line 142) and `handleDetailSaved` (~line 118) currently update `checkInsByDate` but never call `setStep(...)`. Each will be changed to check, right after the newly-saved day(s) are folded into `checkInsByDate`, whether any flagged days still remain unresolved — if none do, call `setStep('calendar')`. This needs to use the just-fetched rows directly (not wait for a stale render of state) so the check is accurate the moment the save completes, not one render behind.
- **Flipped tap targets on the details-needed list** (`ExceptionsStep` function, same file, ~line 497): today, a small checkbox toggles multi-select and the rest of the row opens that day's details directly. This flips: tapping anywhere on the row (except the new small control) toggles that day's selection for bulk-apply, shown via a clear selected/highlighted state on the whole row (not just a small checkbox) — matching how selection lists commonly work elsewhere (tap the row to select, distinct icon to drill in). A new, small, clearly separate control (an icon-only button, not spanning the row) opens that single day's detail form. The "Apply to N days" bar still only appears once 2+ days are selected, unchanged.
- **No schema or database changes** — this is UI/interaction-only, entirely within `CatchUpFlow.jsx`. `BulkApplySheet.jsx`, `checkinClient.js`, and the atomic-writes RPC from spec 0016 are untouched.
- **Constraints from CLAUDE.md:** none affected — this doesn't touch the Vibe/Symptom Count model or any locked decision.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found — no other bulk-select or multi-tap-target pattern exists elsewhere to reuse or conflict with.
- **Technical debt nearby:** none newly introduced. The pre-existing, already-documented `fixed inset-0`/portal quirk (`docs/launch-punch-list.md` P4) is unrelated and untouched by this fix.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** none found already tracking this specific issue — this is a new finding from this session's live smoke test (confirmed via a direct database query showing zero "Great Day" catch-up rows for the test pet), not something previously logged.

## Non-Goals

- Does not change what data gets saved, the Vibe/Symptom Count model, or the atomic-writes behavior from spec 0016.
- Does not change the Calendar screen's own tap-a-day interaction (flagging/unflagging a day, or reviewing an already-resolved one) — only the separate Exceptions (details-needed list) screen's row interaction changes.
- Does not add any special data-repair or "resume a stuck session" logic — re-entering Catch Up for an affected pet naturally re-surfaces every still-missing day, since missed-day detection is computed fresh each time, not stored as session progress.
- Does not address the separate, already-tracked "standalone Pet Profile route unreachable" punch-list item.

## Open Questions

None. (Resolved: selecting exactly 1 day does not trigger bulk-apply — the 2+ threshold stays exactly as it is today. The row's "selected" visual treatment will use the app's existing color tokens, same as the rest of this component — an implementation detail, not a decision requiring further input.)
