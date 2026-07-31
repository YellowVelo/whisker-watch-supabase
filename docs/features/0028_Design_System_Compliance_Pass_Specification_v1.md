# 0028_Design_System_Compliance_Pass_Specification_v1

**Status:** Implemented (2026-07-31)
**Date:** 2026-07-31
**Related files:** `src/App.jsx`, `src/pages/{PetOnboarding,VetExport,Timeline,PetSymptoms,Pets,Settings,Home,Account,Privacy,Terms,Notifications,PetTrends}.jsx`, `src/pages/{PetBaseline,PetMedications,PetVaccinations,PetHealthRecords}.jsx` (new), `src/components/{PetProfileContent,AccountTypeBanner,ListRow,IconButton,BottomSheet,PetSummaryCard,AttributeTrendChip,PetSittingSection,InviteSitterDialog,DailyCheckInSheet}.jsx`, `src/components/catchup/{CatchUpFlow,BulkApplySheet}.jsx`, `src/components/onboarding/OnboardingWizard.jsx`, `src/components/trends/{MetricCardShell,InsightSummaryCard,TrendChart}.jsx`, `docs/foundation/{0005 Design System.md,0006 Technical Standards.md}`, `docs/launch-punch-list.md`. `src/pages/PetProfileTabs.jsx` deleted.

## Implementation Notes (2026-07-31)

- **Shipped as planned, all 4 phases**, with two real bugs found and fixed along the way that weren't in the original scope:
  1. **`ListRow.jsx` width-drift bug.** Its outer clickable element (`<Link>`/`<button>`/`<div>`) never set `display` explicitly. Rendered as a `<Link>` (an `<a>` tag), the browser default `display: inline` silently ignores `width: 100%`, so every `to`-based row (Settings' 6 menu rows, all 8 Pets nav cards) was shrink-wrapping to its own content width instead of stretching — the visible symptom was rows drifting/misaligning based on title/subtitle length. Fixed with one `block` class in the shared component; also written up in `0006 Technical Standards.md` §2 as a general lesson (a shared component that renders as different tags needs to set `display` explicitly, not rely on each tag's own default).
  2. **`BottomSheet.jsx` off-viewport bug (launch-punch-list P4).** Daily Check-In's sheet was never wrapped in `createPortal`, so `PageTransition.jsx`'s Framer Motion `transform` on its ancestor made the sheet's `fixed inset-0` anchor to the page's full scrollable height instead of the real viewport — invisible near scrollY≈0, but the footer ("Continue"/"Save") rendered off-screen once the caller had scrolled the page down first. Fixed by portaling to `document.body`, matching the identical fix already proven in `CatchUpFlow.jsx`. Found `BottomSheet.jsx`'s own close button also wasn't using the shared `IconButton` (missed in the original Phase 3 sweep) — fixed in the same pass.
- **Scope corrections made during implementation, vs. the original draft:**
  - `ConditionsCard.jsx` (listed in the original Phase 3 item list) was **not** touched — it's the Pet Onboarding "Known Conditions" step, which falls inside the "don't touch Conditions" boundary set before this spec was written. Listing it was an oversight in the draft.
  - `Notifications.jsx`'s unread-row tint was flagged in the draft as a raw-color violation; on closer inspection it already sourced from the sky accent token's hex (`rgba(111,183,255,0.08)`, the same convention used everywhere else) — no change needed.
  - The 6 decorative Settings menu-row icon colors (Notifications/About/Privacy/Terms/Preferences/Support) were explicitly left alone, by your decision — they carry no status meaning, so forcing them onto the `--tone-*` tokens would misapply semantics that aren't there.
  - "Home.jsx's Pet Sitter card icon" was mislabeled as `PetSitter.jsx` in the draft — corrected during implementation.
  - Pet-sit/sitter-access deletions got a simple one-step "Are you sure?" (`AlertDialog`) rather than the heavier two-step `ConfirmDeleteDialog` named in the draft — by your decision, matching the actual (low) stakes of those deletes rather than over-escalating to the same flow used for Delete Account/Delete Pet.
- **Investigated and ruled out, not a real bug:** dialogs appearing to stay open after "Cancel" (`data-state="closed"` but the DOM node stayed visible) — traced to the automated test browser tab being backgrounded/non-composited, which throttles the CSS animation Radix's `Presence` waits on to unmount. Reproduced identically on a pre-existing, already-shipped dialog (Settings' Sign Out), and you confirmed live in a real browser that Cancel closes dialogs normally. No code change made.
- Build (`npm run build`) and lint (`npm run lint`) both pass clean as of this implementation. Manual click-through verification done live against `wysker-watch-dev` (`test1@wyskerwatch.com`) — see conversation for the specific pages/flows checked.

---

## Before You Approve This

Plain-language flags from the self-review pass:

- **This reopens a decision you made deliberately in the last design-system spec (0025).** That spec explicitly left the Settings account-type pill and the "TEST ACCOUNT"/"DEMO MODE" banner alone, at your request. I flagged the conflict mid-conversation and you confirmed you now want both recolored — noted here so the reversal is visible in writing, not buried.
- **Item 1 (standalone pages) is the highest-effort, highest-visibility piece.** It touches the first screen a brand-new user sees right after finishing pet onboarding (the "View Profile" button). A mistake here is very visible, very fast. This is why the plan below asks for a check-in after this item specifically, before moving to the smaller items.
- **`PetProfileTabs.jsx` and its route (`/pet/:petId/profile`) become dead once Baseline/Medications/Vaccinations/Health Records move out.** This spec deletes the file and turns the route into a compatibility redirect (same pattern already used for the old `/pet/:petId` route), rather than leaving an empty, unreachable page behind. This also removes a genuinely orphaned tab (`food`, which nothing has linked to since Food got its own page) as a side effect.
- **This spec does not fix the underlying Weight routing/data issue** (Weight card → `/pet/:petId/symptoms`, a legacy page). That's Spec B, already discussed separately, blocked on its own open questions (unit conversion, historical-data backfill, an edge function). Not touched here.
- **This spec does not touch "Conditions."** Per your instruction, that's parked for a future onboarding redesign.
- No conflicts found with `CLAUDE.md` — no database changes, no Edge Function changes (confirmed: the one edge function that touches design-adjacent code, `generate-vet-report`, isn't touched by anything in this spec), no Cloudflare deployment changes.

---

## Functional Requirements

In plain terms: four pet-detail screens, and a handful of smaller spots across the app, still look like they belong to the app's old design instead of matching everywhere else. This spec brings them into line with what the rest of the app already looks like — no new features, no behavior changes beyond navigation cleanup.

1. **Baseline, Medications, Vaccinations, and Health Records become their own separate pages** (each with a simple back button and title, like Food/Timeline/Vet Report/Trends already are), instead of living inside a shared screen that still shows a large pet photo with a dark gradient behind the title — the app's old visual style, not the current one. This includes fixing the "View Profile" button a new user sees right after finishing pet setup, which currently lands directly on this old-style screen.
2. **Account-type coloring (Owner/Test/Demo/Production) uses the app's real color system** — Owner is blue, Test is green, Demo is yellow, Production is red — in both the small pill on the Settings screen and the colored banner at the top of the screen ("TEST ACCOUNT"/"DEMO MODE"), instead of unrelated colors invented separately in two different places.
3. **A collection of smaller inconsistencies get cleaned up in the same pass:** back buttons that are the wrong size or shape in a few places, boxed sections/cards that use a hand-picked transparency instead of the app's standard card look, colored tags/chips that have an outline when they shouldn't, some text that's smaller than the app's minimum readable size, one button using the old solid-blue style instead of the current outlined style, and two account-deletion actions (removing a pet-sitting arrangement or a sitter's access) that currently have no "are you sure?" step at all before deleting.

## Acceptance Criteria

- Given a user taps Baseline, Medications, Vaccinations, or Health Records from a pet's card, when the page opens, then it shows a plain back button and title — no large pet photo or gradient behind the header.
- Given a brand-new user finishes Pet Onboarding and taps "View Profile," when the page loads, then it lands on the Pets screen with that pet's card already expanded, showing all its detail cards — not the old photo-hero screen.
- Given the Settings account-type pill or the top "TEST ACCOUNT"/"DEMO MODE" banner, when viewed for each account type, then Owner shows blue, Test shows green, Demo shows yellow, and Production shows red.
- Given any back button anywhere touched by this spec, when compared to a back button on an already-compliant page (e.g. the Food page), then they look and behave identically.
- Given a card or boxed section touched by this spec, when compared to an already-compliant card elsewhere, then the background and border match.
- Given a colored chip/tag touched by this spec, when viewed, then it has no visible outline/border.
- Given any text touched by this spec, when measured, then nothing renders smaller than the app's minimum readable size.
- Given a user attempts to delete a pet-sitting arrangement or remove a sitter's access, when they tap delete, then a confirmation step appears first — deletion no longer happens on a single tap.
- Given `npm run build`, when run after this spec ships, then it completes with no errors.

## Visual Reference

No new mockups were provided for this round. The target look is the already-approved pattern visible today in the app's compliant reference pages — `src/pages/PetFood.jsx` and `src/pages/PetTrends.jsx` — plus the semantic color tokens in `src/lib/toneColors.js` for item 2's color mapping. This spec's own investigation (this conversation, plus a prior full-app deep-link audit) is the source of truth for what's non-compliant, page by page.

## Technical Spec

**No schema or database changes. No Edge Function changes.** This is markup/routing/styling only.

Sequenced into phases, each meant to be its own commit — **check in with the user after each phase before moving to the next**, rather than attempting the full pass in one uninterrupted session. This is a repeat ask, not a new process: this kind of design-system rollout has hit the context-window limit mid-work before. Smaller, verified phases with a check-in between them are the fix.

### Phase 1 — Standalone pages for Baseline / Medications / Vaccinations / Health Records
- New routes in `App.jsx`, matching the existing `/pet/:petId/food` / `/timeline` / `/export` pattern: `/pet/:petId/baseline`, `/pet/:petId/medications`, `/pet/:petId/vaccinations`, `/pet/:petId/health-records`. Each new page reuses its existing section component (`BaselineSection.jsx`, `MedicationSection.jsx`, `VaccinationSection.jsx`, `BloodworkSection.jsx` — content itself is unchanged) inside a plain header shell: `IconButton` back button + title, `bg-background`, matching `PetFood.jsx`'s structure exactly (including its top-padding, to also close the Timeline header-spacing gap noted in Phase 3).
- `PetProfileContent.jsx`'s four `ListRow` targets (`to={...profile?tab=...}`) repointed to the new routes.
- `PetOnboarding.jsx`'s "View Profile" button repointed from `/pet/:petId/profile` to `/pets` with `state: { expandPetId: petId }` (same mechanism `Pets.jsx` already supports for the retired `/pet/:petId` redirect).
- `PetProfileTabs.jsx` deleted. `/pet/:petId/profile` becomes a `<Navigate>` compatibility redirect to `/pets` (with `expandPetId` if a `petId` is present), matching the existing `/pet/:petId` redirect precedent in `App.jsx`. This removes the orphaned `food` tab as a side effect (dead code — nothing has linked to `?tab=food` since Food got its own page).
- **Check in before Phase 2.**

### Phase 2 — Account-type color mapping
- `Settings.jsx`'s account-type badge object (`production`/`test`/`demo`/`owner`) repointed from raw Tailwind classes to the semantic tone tokens: Owner → sky, Test → good/green, Demo → warn/yellow, Production → bad/red.
- `AccountTypeBanner.jsx`'s two variants (`bg-amber-400`/`bg-violet-600`) repointed the same way.
- Settings' menu-row `iconBg` values (Notifications/About/Privacy/Terms/Preferences/Support, plus Sign Out/Delete Account) and `PetSitter.jsx`'s nav-card icon background repointed from raw `rgba()` to tokens — these aren't account-type colors, just the same "raw color instead of a token" pattern, bundled here since it's the same file/mechanism.
- `ListRow.jsx`'s default `iconBg` fallback (currently raw `rgba(255,255,255,0.06)`) repointed to a neutral token, so any future caller that omits `iconBg` gets a compliant color automatically.
- **Check in before Phase 3.**

### Phase 3 — Back buttons, cards, chips, text size, remaining items
- Back/close buttons converted to the shared `IconButton`: `VetExport.jsx` (currently plain text+small icon — the "renders too small" issue), `CatchUpFlow.jsx` (header back + close), `PetSymptoms.jsx` (add button, log-overlay close).
- `Timeline.jsx`'s header padding aligned with `PetFood.jsx`/`PetSymptoms.jsx`'s pattern (closes the "sits too close to the app header" gap) — folded into Phase 1 if done alongside the standalone-page work, otherwise done here.
- Hand-rolled `rgba(255,255,255,x)` card backgrounds converted to `bg-card`/`border-border`: `DailyCheckInSheet.jsx` (choice buttons, inputs), `CatchUpFlow.jsx`/`BulkApplySheet.jsx` (step cards, choice buttons), `InsightSummaryCard.jsx`, `Account.jsx` (two fields), `Notifications.jsx` (unread-row background).
- Chips/pills with borders or solid-fill repointed to soft-background/no-border/tone-token: `PetSymptoms.jsx`'s `Chip` component, `PetSittingSection.jsx`'s pills, `ConditionsCard.jsx`'s active pill, `PetSummaryCard.jsx`'s condition/medication/Healthy chips, `AttributeTrendChip.jsx`.
- Sub-13px text raised to the 13px floor: `AttributeTrendChip.jsx`, `MetricCardShell.jsx` (propagates to `ObservationCard`/`WeightCard`/`VomitingNauseaCard`), `InsightSummaryCard.jsx`, `TrendChart.jsx`'s `ObservationLegend`.
- `OnboardingWizard.jsx`'s solid-fill "Continue" button (transition step) switched to the shared `Button` component.
- `Privacy.jsx`/`Terms.jsx` hero icon-circle switched from raw `rgba(111,183,255,0.10)` to the `bg-primary/10` token already used correctly on the neighboring About/Preferences/Support pages.
- `PetTrends.jsx`'s inactive-tab text opacity (`0.4`) mapped to the nearest sanctioned tier (tertiary, 45%).
- `PetSittingSection.jsx` and `InviteSitterDialog.jsx`: delete actions (removing a sit period, removing sitter access) routed through the shared `ConfirmDeleteDialog` instead of firing immediately with no confirmation.
- **Check in before Phase 4.**

### Phase 4 — Final verification
- `npm run build` must pass.
- Manual click-through (no automated visual-regression tooling in this repo): Pets → each of the four newly-standalone pages, PetOnboarding completion → View Profile, Settings (all three account types if reachable via test/demo logins), a pet-sitting delete, a sitter-access removal, and a deliberately-stale `/pet/:petId/profile` URL (confirm the redirect).

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** None found beyond what's already being consolidated — this spec routes everything onto the same shared `IconButton`/`ListRow`/`ConfirmDeleteDialog`/`Button` components the prior spec (0025) already built, rather than building anything new.
- **Technical debt nearby:** `PetProfileTabs.jsx`'s dead `food` tab (nothing routes to `?tab=food` since Food got its own standalone page) — removed as a side effect of deleting the file in Phase 1, not a separate task.
- **Orphaned features nearby:** None newly found beyond the dead `food` tab above.
- **Punch list / known issues in this area:** This spec directly resolves launch-punch-list **P3**: *"The pet-detail 'hero' banner (Baseline/Medications/Vaccinations/Vet Export) is visually inconsistent with the new App Shell"* (flagged 2026-07-28, explicitly left as an undecided product question by spec 0025). One correction to that punch-list entry: **Vet Export does not actually have the hero banner** — `VetExport.jsx` is already a plain standalone page (its only issue is the undersized back button, covered in Phase 3). The punch-list wording is stale on that point; the real hero-banner set is Baseline/Medications/Vaccinations/**Health Records** (Health Records isn't named in the punch-list entry at all, but shares the exact same `PetProfileTabs.jsx` shell). The punch list should be updated once this spec ships — a `doc-updater` job, not part of this spec.
  Also directly reverses this specific note from spec 0025: *"This does not touch the Settings 'Owner/Test/Demo/Production' pill or the colored banner... You asked for both to be left alone."* You confirmed this reversal mid-conversation; noted here so it's traceable in writing, not just in chat history.
- **Locked-decision conflicts:** The account-type-color reversal above is the only one, and it's resolved (you confirmed it). No other conflicts with `CLAUDE.md` or `0005 Design System.md`.

## Non-Goals

- Weight card routing/data-source fix (Spec B — separate, not yet written, blocked on its own open questions).
- "Conditions" / Edit Pet redesign — explicitly parked for a future onboarding redesign.
- Anything backend: no database/schema changes, no Edge Function changes (including `generate-vet-report`, which is untouched by this spec).
- New features or behavior changes beyond the navigation/routing cleanup described in Phase 1 (e.g., no new content is added to Baseline/Medications/Vaccinations/Health Records — they're relocated, not redesigned).
- Automated visual-regression testing — doesn't exist in this repo; verification here is manual, same as spec 0025.

## Open Questions

None remaining — the two real ambiguities (account-type color reversal, and where "View Profile"/`/pet/:petId/profile` should redirect) were resolved during this conversation before drafting.
