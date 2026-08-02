# 0039_Home_TapTarget_Audit_And_LoadData_Race_Guard_Specification_v1

**Status:** Draft
**Date:** 2026-08-02
**Related files:** `src/pages/Home.jsx`, `src/components/PetSummaryCard.jsx`, `src/components/AttributeTrendChip.jsx`, `src/components/CheckInStatusBanner.jsx`, `e2e/daily-checkin.spec.js`

## Before You Approve This

Plain-language flags from the self-review pass:

- **This touches an existing, passing automated test.** `e2e/daily-checkin.spec.js` currently finds a pet's card by its link role and reads its `href` attribute to figure out which pet was checked in (so the test can clean up after itself). If the card stops being a real link (see the "card structure" fix below), that `href` read breaks. This spec updates that test alongside the component change so it keeps passing — called out explicitly so it isn't a surprise regression.
- **The two problems in this item are unrelated to each other** — one is about button sizing/nesting (visual/structural), the other is about data-loading timing (invisible to the eye). They're bundled here only because the punch list bundled them into one line item; nothing about fixing one requires fixing the other.
- **The `loadData()` race is real but has never been reported as a visible bug** — it requires a specific timing coincidence (explained below) to actually show stale data to a user. This spec fixes it because it's a correctness gap, not because anyone has hit it yet.
- No conflicts found with `CLAUDE.md`'s locked decisions, no database or Edge Function changes, and no new violation of `docs/foundation/0005 Design System.md` — this spec closes existing gaps, it doesn't introduce new ones.

## Functional Requirements

In plain terms, this closes out one long-standing, explicitly non-blocking punch-list item that actually bundles two separate concerns about the Home screen (the "How are your pets today?" page):

1. **Every tappable thing on Home should be easy to hit and structurally sound.** An audit found Home is *mostly* fine already, but turned up two real, concrete problems:
   - The "Catch up yesterday" / "Catch up now" links that appear under a pet's card when a day was missed are too small to comfortably tap (no minimum size set at all, unlike everything else on the screen).
   - Each pet's card is built as "one big tappable thing" containing several smaller tappable things (six health chips and a weight chip) — that's a "button inside a link" structure, which browsers don't consider valid, and which can confuse screen-reader users even though it visually still works for a normal tap.
2. **Home's data-loading should never let old data silently overwrite newer data.** Home reloads its data automatically in a few different situations (first load, when your timezone gets confirmed shortly after login, pulling down to refresh, tapping "Retry" after an error). Today, none of these coordinate with each other — if an earlier reload happens to finish after a later one, its answers win, even though they're the stale ones. This adds a simple safeguard so only the most recently started reload is allowed to actually update what you see.

## Acceptance Criteria

- Given the "Catch up yesterday" banner under a pet's card, when its tappable area is measured, then it is at least 44 pixels tall (matching every other tappable element on Home).
- Given the "Catch up now" (multi-day) banner under a pet's card, when its tappable area is measured, then it is at least 44 pixels tall.
- Given a pet's card on Home, when the underlying markup is inspected, then no button is nested inside a link (or any other clickable element inside another clickable element).
- Given a pet's card on Home, when a user taps anywhere on the card except one of its six health chips or the weight chip, then it still navigates to that pet's Trends page, exactly as it does today.
- Given a pet's card on Home, when a user taps one of the six health chips or the weight chip, then it still navigates to that specific metric's trend view, exactly as it does today, and the tap does **not** also trigger the card's own navigation.
- Given a pet's card on Home, when a keyboard-only user tabs to the card and presses Enter or Space, then it navigates to that pet's Trends page (keyboard access must not regress from today's link-based behavior).
- Given Home is loading data, when a second reload is triggered before the first one finishes (e.g. the automatic timezone-confirmation reload overlapping the initial page load, or a pull-to-refresh overlapping either), then only the results from whichever reload started most recently are ever applied to what's shown on screen.
- Given `npm run build` and `npm run lint`, when run after this change, then both complete with no errors.

## Test Plan

- Catch Up banners ≥44px tall → **not covered by an automated test.** Same limitation noted in spec 0035 (this repo has no visual-regression/pixel-measurement tooling) — verified by manual measurement in-browser.
- No nested button-in-link markup on the pet card → covered by a new assertion in `e2e/daily-checkin.spec.js` (or a small new test) that inspects the card's DOM structure, plus manual verification with a screen reader is out of scope (no screen-reader testing tooling exists in this repo's suite) — flagged as a manual spot-check only, not an automated one.
- Card still navigates to Trends on a normal tap, chips still navigate to their own metric and don't trigger the card navigation → **already covered**, `e2e/daily-checkin.spec.js` already exercises the card's link behavior; it needs one update (see Before You Approve This) rather than a new test, since it currently reads the card's `href` attribute directly. That line will be changed to read a `data-pet-id` attribute added to the card instead, which survives the card no longer being a real `<a>` tag.
- Keyboard Enter/Space triggers navigation → new, small Playwright test: focus the card via keyboard, press Enter, assert the URL changed to `/pet/:id/trends`.
- `loadData()` race guard (stale reload never overwins a newer one) → **not practically coverable by Playwright** — reproducing the exact timing race (a slow-resolving first request finishing after a fast-resolving second one) requires controlling network response timing at a level this suite doesn't currently support. Verified instead with a small unit-level test around the request-id guard logic itself (using mocked, artificially-delayed responses to force the race), plus manual verification in-browser using devtools network throttling to force a real overlap.
- **Seeding/access constraints:** None — everything in this spec is reachable via a normal signed-in session (`test1@wyskerwatch.com`), no server-only or admin-only data involved.

## Visual Reference

No mockups provided — this is a structural/compliance fix, not a new visual design. The Catch Up banners' visual appearance (text, color, position) is unchanged; only their tappable height increases. The pet card's visual appearance is unchanged; only its underlying element type changes.

## Technical Spec

- **Schema:** None.
- **API / Edge Functions:** None.
- **Components/files touched:**
  - `src/pages/Home.jsx` — `CatchUpBanner` (~line 484) and `MultiDayCatchUpBanner` (~line 502): add `min-h-[44px]` and matching padding/flex-centering to the `<button>` elements so the whole 44px area is tappable, not just the text glyphs.
  - `src/components/PetSummaryCard.jsx` — both the memorial-pet card (~line 76) and the active-pet card (~line 109) currently render as `<Link to={...}>`. Both change to a `<div>` with `role="link"`, `tabIndex={0}`, `onClick` calling `navigate(...)` (via the `useNavigate` hook already imported), and an `onKeyDown` handler that triggers the same navigation on Enter/Space — the standard accessible pattern for "a non-anchor element that behaves like a link." A `data-pet-id={pet.id}` attribute is added to both so tests (and any future code) can identify which pet a card belongs to without depending on an `href`. The six `AttributeTrendChip` chips and the weight chip stay exactly as they are today (real `<button>` elements, unchanged) — they're no longer nested inside a real `<a>`, so the existing `preventDefault`/`stopPropagation` workaround in `AttributeTrendChip.jsx` becomes unnecessary for this card, but is left in place since `AttributeTrendChip` is shared with `WellbeingChipGrid.jsx`/Pets screen and other call sites may still rely on it.
  - `src/pages/Home.jsx` — `loadData` (line 88): add a `loadRequestIdRef` (a `useRef(0)`), incremented at the top of every `loadData()` call to a locally-captured `requestId`. Before each block of `setState` calls that commits fetched data (today's/yesterday's check-ins, medication counts, attribute directions, weight states, missed-days-by-pet, incomplete-onboarding IDs, and the final `setLoadError`/`setStale`/`setLoading` calls), check `if (loadRequestIdRef.current !== requestId) return;` and bail without committing if a newer call has since started. This means a slow, stale call simply stops updating state partway through once it detects it's no longer the latest one — it doesn't need to be cancelled or aborted, just ignored.
  - `e2e/daily-checkin.spec.js` (~line 41-44) — updated to read the pet ID from the card's new `data-pet-id` attribute instead of parsing it out of the `href` on a `getByRole('link', ...)` query (which no longer exists once the card is a `<div>`).
- **Design System compliance:** `docs/foundation/0005 Design System.md` §8 ("Large touch targets, 44px minimum") directly covers the Catch Up banner fix — no new interpretation needed. The button-inside-link nesting issue isn't addressed by name anywhere in that doc (it's a general HTML/accessibility correctness issue, not a Wysker-specific design rule), but it's consistent with the reasoning spec 0037 already used when it deliberately kept the sitter's Wellbeing chips non-interactive specifically to avoid "a clickable chip nested inside [a card link, which] would be invalid markup" — this spec applies the same principle to the owner's own card instead of leaving the two inconsistent. No systemic component-level issue found beyond this one card (grep of the codebase for other `<Link>`/`<a>` wrappers containing nested `<button>`s turned up only `PetSummaryCard.jsx`).
- **Constraints from CLAUDE.md / locked decisions:** None triggered — no database, no Edge Function, no deployment-adjacent change.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None — this modifies the single existing `PetSummaryCard` component rather than introducing a new one.
- **Technical debt nearby:** `AttributeTrendChip.jsx`'s `preventDefault`/`stopPropagation` workaround (added specifically to survive being nested inside a real link) becomes dead weight for `PetSummaryCard`'s use of it once the card is no longer a real `<a>`, but it's left in place rather than removed, since the same component is reused elsewhere (`WellbeingChipGrid.jsx`) where it may still matter. Worth a future look if `AttributeTrendChip` is ever audited on its own.
- **Orphaned features nearby:** None found.
- **Punch list / known issues in this area:** This spec directly resolves the punch-list item *"Home screen has no tap-target audit confirmation on its full-card-is-tappable assumption, and `loadData()` has no request-race guard."* Should be checked off once shipped (a `doc-updater` pass, not part of this spec itself).
- **A related, explicitly out-of-scope finding:** `refreshPetCard` (Home.jsx ~line 203), used after a single check-in completes, has a narrower version of the same "no coordination between concurrent calls" shape — e.g. two check-ins for the same pet completing in quick succession. It's lower-risk (scoped to one pet, triggered by a deliberate user action rather than an automatic effect) and wasn't named in the punch-list item, so it's left out of this spec's scope rather than folded in silently.

## Non-Goals

- `refreshPetCard`'s narrower race-shape (see above) — not part of this spec.
- Any other page's tap-target sizing or card structure (e.g. Pets screen's `SitterPetRow`/`PetSummaryCard` reuse) — this audit was scoped to Home per the punch-list item; `SitterPetRow` was already addressed separately in spec 0037.
- Any visual redesign of the Catch Up banners or the pet card — sizing/structure only, no look-and-feel change.
- Automated screen-reader testing — no tooling for this exists in the repo; verification here is a manual spot-check, same limitation precedent as spec 0035.

## Open Questions

None remaining — the card-structure approach (Option A: outer card becomes a non-anchor tappable element, inner chips stay real buttons) was confirmed with you before drafting.
