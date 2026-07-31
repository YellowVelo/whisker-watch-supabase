# 0025 Design System Code Rollout — Specification v1

**Status:** Implemented (2026-07-31)
**Date:** 2026-07-30
**Related files:** `src/components/ui/button.jsx`, `src/index.css`, `src/lib/PageNotFound.jsx`, `src/pages/{PetProfileTabs,Home,Pets,Settings,About,Notifications,Timeline,Privacy,Terms,Account,Preferences,Support,VetExport,Login,Register,ForgotPassword,ResetPassword,AcceptInvite,VerifyEmail,PetSymptoms,PetFood,PetSitter,PetTrends}.jsx`, `src/components/{AuthLayout,MedicationSection,FoodSection,VaccinationSection,BloodworkSection,MemorialDialog,OfflineBanner,IosInstallBanner,EditPetSheet,DailyCheckInSheet,PetProfileContent,MenuListRow,PetSummaryCard,CheckInStatusBanner,ExpandablePetProfileCard,AppHeader,BottomTabBar,AddPetDialog}.jsx`, `src/components/catchup/{CatchUpFlow,BulkApplySheet}.jsx`, `src/components/ui/{card,dialog,sheet}.jsx`, `docs/foundation/0005 Design System.md`, `docs/launch-punch-list.md`

This spec rolls the decisions already locked in `0005 Design System.md` (and confirmed against real Figma components) into the actual app code. It replaces the paused six-page draft — a follow-up full-coverage audit found the real footprint is closer to 40+ files, so this version is scoped and sequenced against that full picture instead.

---

## Before You Approve This

Plain-language flags before you sign off — these aren't reasons not to proceed, but things worth knowing going in:

- **The single highest-leverage step (retheming the shared Button) touches roughly 20 files at once**, including Login, Register, and every other sign-in/sign-up screen — the most-visited, most business-critical pages in the entire app. A mistake there could make it hard for a real user to sign in. This is exactly why the plan below does that step early, alone, verified by hand across every affected page, before anything else builds on top of it.
- **The "Edit Pet" screen's bug has never been fully root-caused.** The existing notes on it say the cause isn't understood yet ("likely deeper in how the animation utility classes resolve"), only that it's broken. Fixing it as part of this pass means real debugging, not just recoloring — it could take longer than the rest of the visual work combined, and there's a chance the fix isn't as clean as swapping a color.
- **Six sign-in-flow pages get restructured to share one layout component that today has zero users.** This is good for consistency, but it means those six pages — which is how every real person gets into the app — all change shape at once. Each one needs to be manually clicked through afterward, not just visually spot-checked.
- **This does not touch the Settings "Owner/Test/Demo/Production" pill or the colored banner at the top that says "TEST ACCOUNT"/"DEMO MODE."** You asked for both to be left alone, and they are — noted here so it's not mistaken for something missed.
- **The design doc itself got extended, not just the app code.** The persistent header and bottom nav bar, and multi-series charts, were built after this design system was first written and the doc never actually said how they should be handled. Per your direction, they're not getting a special exception — `0005 Design System.md` now explicitly covers both (Amendments #9–#11), and the app code in this spec follows that.
- **No conflicts found** with anything locked in `CLAUDE.md` — no database changes, no backend/Edge Function changes, and this doesn't touch Cloudflare deployment (which stays a manual step for you, same as always).

---

## Functional Requirements

In plain terms, this makes the app look and feel like one consistent product everywhere, instead of consistent in the 6 places someone happened to look first:

1. Every button that starts an action (Sign In, Add Pet, Save, Delete, Continue, etc.) looks the same way everywhere: a dark background with a light-blue outline and white text — never a solid light-blue block.
2. Every page title and heading uses the app's one plain, modern typeface — no more italic/fancy titles on some screens and plain bold titles on others.
3. "Secondary" or faded-looking text uses exactly one of three brightness levels everywhere, not a wide, inconsistent range.
4. Every card or boxed section on every screen shares the same background and border treatment.
5. Any colored status chip or tag (a diagnosis, a medication type, a vaccination due-date warning) uses only the app's small set of "good / caution / concern / neutral" colors — never a color invented on the spot.
6. The chips described above look correct regardless of whether the visitor's phone or browser is set to light or dark mode — today, four of them quietly break in light mode.
7. The "Page you're looking for doesn't exist" screen looks like it belongs to Wysker Watch, instead of a completely different, generic-looking page.
8. The six screens involved in signing up, signing in, and password recovery share one identical layout instead of six separately hand-built near-copies.
9. The "Edit Pet" screen — currently broken and unusable (it opens off-screen) — is fixed and restyled at the same time.
10. Every round "back" button and every pill-shaped toggle button behaves and looks the same everywhere in the app, instead of each screen having built its own slightly different version.
11. A handful of clearly-wrong one-off colors (an unrelated purple button, an off-brand gray banner, some hardcoded chart colors) get corrected to use the app's real color system.
12. The persistent header and bottom navigation bar (visible on almost every screen) follow the same rules as everything else — no separate "it's navigation, it's exempt" treatment.
13. Charts with more data series than the app currently has colors for (like the bloodwork chart) get more official colors added to the system, instead of falling back to one-off values.

## Acceptance Criteria

- Given any non-disabled action button anywhere in the app, when it renders, then it shows a dark background, a light-blue border, and white text.
- Given any page or dialog title anywhere in the app, when it renders, then it uses the same plain sans-serif typeface as the rest of the app's text — no italic/serif titles remain anywhere.
- Given any two screens with "secondary"/muted text, when compared side by side, then both use one of the same three brightness levels.
- Given any card or boxed section on any two different screens, when compared, then their background and border match.
- Given the device or browser is set to light mode, when viewing Medications, Food, Vaccinations, or a pet's Conditions, then the color chips still look correct and match how they look in dark mode.
- Given a URL that doesn't match any real page, when it loads, then "Page Not Found" visually matches the rest of the app (dark background, same fonts and buttons) instead of a separate light-colored page.
- Given any of the six auth-related pages, when compared to each other, then they share the same layout structure (header, card, footer position).
- Given the "Edit Pet" screen is opened, when it opens, then it visibly slides into view and can actually be used.
- Given a round back button or a pill-shaped toggle on any two different screens, when compared, then they look and behave identically.
- Given the Settings account-type pill and the top "TEST ACCOUNT"/"DEMO MODE" banner, when this work ships, then neither has changed at all.
- Given the persistent header and bottom navigation bar, when inspected, then their background/border color traces back to a real design-system token, not a one-off hardcoded value.
- Given the Bloodwork chart's lab-value colors, when compared to the app's official chart colors, then every color used is one of the named tokens, with new ones added if there weren't originally enough.
- Given a back button anywhere in the app and an action button in the persistent header, when compared, then they're the same component with the same styling — no separate "header-only" button style exists.

## Visual Reference

No new screenshots or mockups were provided for this round — the target look is defined by the approved Figma components (Button, Card, Chip, List Row, Bottom Sheet) built in the earlier design-system pass, plus the two written audits (`docs/Audit_Findings.md` and the full-coverage follow-up in this conversation) that catalog exactly what's wrong today, page by page. A live before/after check in the running app is called out explicitly in Technical Spec's verification phase, since this spec's own investigation was done by reading code, not by clicking through the app.

## Technical Spec

Sequenced into phases — each phase is meant to be its own commit/PR, not one giant sweeping change, so a problem in one phase doesn't block or hide problems in another. Phases 1–2 are the foundation everything else depends on; do them first and verify carefully before moving on.

### Phase 1 — Foundation tokens + the one isolated, low-risk fix
- **New CSS variables** in `src/index.css`: `--text-primary` (white 100%), `--text-secondary` (white 70%), `--text-tertiary` (white 45%). These don't exist in the codebase yet — this is new work, not a rename of something already there.
- **`src/lib/PageNotFound.jsx`**: rewrite from its current `bg-slate-50`/`text-slate-*`/light theme to `bg-background`/`text-foreground`/`bg-card`/`border-border`, matching the rest of the app. Fully self-contained, no dependency on anything else in this spec — safe to ship alone, first.

### Phase 2 — The Button retheme (highest leverage, highest care)
- **`src/components/ui/button.jsx`**: change the `default` variant from solid `bg-primary text-primary-foreground` to charcoal background / sky-blue outline / white text, per the locked decision. This is the shared component behind Login, Register, ForgotPassword, ResetPassword, AcceptInvite, VerifyEmail, PetOnboarding, Account, VetExport, AddPetDialog, EditPetSheet, InviteCoOwnerDialog, InviteSitterDialog, and every dialog inside MedicationSection/FoodSection/VaccinationSection/BloodworkSection — all of them inherit the new look automatically from this one change.
- **Hand-rolled buttons that don't use the shared component** get updated individually to match: the "Add Pet" CTAs in `Home.jsx`/`Pets.jsx`, Settings' dialog confirm buttons, `DailyCheckInSheet.jsx`'s Continue/Save buttons, `CatchUpFlow.jsx`/`BulkApplySheet.jsx`'s equivalents.
- **`MemorialDialog.jsx`**'s confirm button (`bg-purple-600`, matching neither the old nor new style) gets corrected to the same standard.
- **Verification for this phase specifically**: after the shared component changes, manually click through Login, Register, Forgot Password, and one Add Pet flow before moving to Phase 3 — this is the one phase most likely to have a wide, hard-to-miss visual regression if something's wrong.

### Phase 3 — Typography (Inter everywhere)
- Remove `font-serif` from every remaining page/dialog title: `Home.jsx`, `Pets.jsx`, `Settings.jsx`, `PetProfileTabs.jsx`'s pet-name header, `AppHeader.jsx`'s wordmark, `About.jsx`, `Notifications.jsx`, `Timeline.jsx`, `Privacy.jsx`, `Terms.jsx`, `Account.jsx`, `Preferences.jsx`, `Support.jsx`, `VetExport.jsx`, `AskWyskerSheet.jsx`, `AddPetDialog.jsx`, `InviteCoOwnerDialog.jsx`, `InviteSitterDialog.jsx`, `MemorialDialog.jsx` (the six auth pages are handled in Phase 6 via `AuthLayout`, not individually here).
- Standardize page-H1 sizing/weight to one pattern (28px, semibold) — currently split across four different treatments (bold, serif, semibold-non-serif, and serif-2xl) depending on which page you're on.

### Phase 4 — Text opacity (collapse to 3 tiers)
- Sweep every `text-white/NN` and `rgba(255,255,255,0.NN)` text-color usage across all audited files and remap each to `var(--text-primary)`, `var(--text-secondary)`, or `var(--text-tertiary)` (added in Phase 1), using the nearest-tier mapping already written into the design doc's amendment. This is the widest-reaching phase by file count but the lowest-risk per file — recommend doing it page-by-page rather than in one pass, so a mistake is easy to isolate.

### Phase 5 — Card system + chip/badge colors
- Replace the hand-rolled `rgba(255,255,255,0.04–0.08)` card backgrounds with the `bg-card`/`border-border` tokens across `Home.jsx`, `Pets.jsx`, `Settings.jsx`, `PetSummaryCard.jsx`, `CheckInStatusBanner.jsx`, `ExpandablePetProfileCard.jsx`, `PetProfileContent.jsx` (its `NavCard`), `MenuListRow.jsx`, `Privacy.jsx`, `Terms.jsx`, `Timeline.jsx`, `PetSymptoms.jsx`, `Notifications.jsx`, and the Trends cards (`MetricCardShell.jsx`).
- **The 4-file light-mode-color fix, treated as one grouped change** (all four share the exact same anti-pattern and sit in the same tab set): `PetProfileTabs.jsx` (delete the dead `conditionColors` map entirely — confirmed unreferenced — and its light-mode Rainbow Bridge card colors), `MedicationSection.jsx` (`MED_TYPE_BADGE`), `FoodSection.jsx` (`typeColors`), `VaccinationSection.jsx` (`getReminderStatus`) — all four get their light-mode Tailwind classes replaced with the semantic `--tone-good/warn/bad/neutral` tokens, which work correctly regardless of device theme.
- Reconcile Home's borderless condition chip vs. Pet Profile's bordered condition chip into one no-border treatment, per the doc's "no outlines" rule.
- One-off color fixes bundled here since they're small and independent: `OfflineBanner.jsx` (`bg-slate-800` → a neutral-tone token), `IosInstallBanner.jsx` (raw `#0D0F12`/`#6FB7FF` hex → the actual CSS variables they're supposed to be).
- **`BloodworkSection.jsx`'s 16 lab-value chart colors**: per Design System Amendment #10 (added alongside this spec — see Technical Spec note below), the token system gets *extended* to cover this rather than leaving these as raw hex. Add `--chart-6` through `--chart-16` to `src/index.css` following the same pattern as the existing five, then point every `FIELDS` entry in `BloodworkSection.jsx` at a token instead of a hardcoded hex value.
- **`AppHeader.jsx` and `BottomTabBar.jsx`'s chrome background**: per Amendment #9, their hardcoded `rgba(10,12,22,0.92)` background and `rgba(255,255,255,0.08)` border get replaced with real tokens (`--background`/`--border`, kept semi-transparent via the token's own value plus opacity, not a hand-picked color). The blur effect itself is untouched — only the color source underneath it changes.

### Phase 6 — Component de-duplication
- **New shared `PillToggle` component** (sky-accent style, the winning family per your decision), replacing the 5–6 separately-built copies in `DailyCheckInSheet.jsx` (both the category picker and the enum-answer buttons), `BulkApplySheet.jsx`, `CatchUpFlow.jsx`'s long-gap prompt, `AddPetDialog.jsx`'s date-precision picker, `EditPetSheet.jsx`'s condition toggles, and `PetTrends.jsx`'s range/group selectors.
- **New shared `IconButton`/back-button component**, replacing the 4+ separately-built circular back-button styles across `Notifications.jsx`, `About.jsx`, `Timeline.jsx`, `PetSitter.jsx`, `PetTrends.jsx`, `PetSymptoms.jsx`, `PetFood.jsx`, `Privacy.jsx`, `Terms.jsx`, `Account.jsx`, `Preferences.jsx`, `Support.jsx`, `VetExport.jsx`. Per Amendment #11, `AppHeader.jsx`'s Ask Wysker and Notifications buttons (`AskWyskerAction.jsx`, `NotificationBell.jsx`) move onto this same shared component too — there is no separate "header action" style.
- **New shared `ListRow` component**, replacing `PetProfileContent.jsx`'s `NavCard` and `MenuListRow.jsx` (same icon+title+subtitle+chevron pattern, built twice).
- **New shared `BottomSheet` component**, replacing three independently hand-built bottom-sheet shells: `DailyCheckInSheet.jsx`, `PetProfileContent.jsx`'s `WeightQuickLogSheet`, and `BulkApplySheet.jsx` (all three use the identical fixed-backdrop/rounded-top/drag-handle markup, copy-pasted).
- **New shared `ConfirmDeleteDialog` component**, replacing the two-step warn→type-to-confirm flow duplicated between `Settings.jsx` (Delete Account) and `PetProfileContent.jsx` (Delete Pet).

### Phase 7 — EditPetSheet fix + AuthLayout wiring (highest-effort, highest-care phase, done last so it builds on an already-verified foundation)
- **`src/components/ui/sheet.jsx` / `EditPetSheet.jsx`**: diagnose and fix the animation bug that currently leaves this screen permanently off-screen (launch-punch-list P4), then apply the new Card/Button/text-tier tokens to its contents. This is a real debugging task, not a styling task — budget for it separately.
- **`src/components/AuthLayout.jsx`**: wire it up to `Login.jsx`, `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `AcceptInvite.jsx`, `VerifyEmail.jsx`, replacing each page's own hand-rolled wrapper. Each page's unique content (the resend-confirmation banner on Login, the Google sign-in button, etc.) needs to be checked against `AuthLayout`'s children slot to confirm nothing breaks.

### Phase 8 — Final verification
- `npm run build` must pass with no errors, standard for this repo.
- Manual click-through required (no automated visual-regression tooling exists in this repo to catch this kind of change automatically): sign up, sign in, forgot password, accept an invite, add a pet, edit a pet, delete a pet, a full Daily Check-In (Great/Off/Tough), the multi-day Catch-Up flow, Settings' delete-account flow, and a deliberately broken URL (404 check).
- **Constraints from CLAUDE.md**: no database/migration changes (none needed — this is styling/markup only), no Edge Function changes, and Cloudflare deployment stays a manual step you run yourself once this is merged — this spec doesn't touch or automate that.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** confirmed and being consolidated by this spec — `NavCard`/`MenuListRow`, three copies of the bottom-sheet shell (not two — `BulkApplySheet.jsx` turned out to be a third, identical copy, found while writing this spec), 5–6 toggle-pill copies, and 4+ back-button copies.
- **Technical debt nearby:** `EditPetSheet.jsx`'s animation bug has never been root-caused — this spec is the first attempt to actually fix it, not just restyle around it. Separately, `npm run typecheck` has 279 pre-existing errors across the shared `ui/*` files (including `button.jsx` and `sheet.jsx`, both touched here) — not gated in CI, and this spec doesn't need to fix them, just shouldn't be blamed for pre-existing ones if they're noticed while working in these files.
- **Orphaned features nearby:** `ui/badge.jsx`, `ui/toggle.jsx`, and `ui/toggle-group.jsx` all remain unused after this spec ships — `Badge` because you asked to leave both account-type displays alone, and `toggle`/`toggle-group` because the new `PillToggle` is being built as its own lightweight component rather than adopting Radix's toggle-group primitive (lower behavior risk, per your decision on the toggle-pill question). Worth knowing these three files stay dead code, not by oversight.
- **Punch list / known issues in this area:** `EditPetSheet.jsx`'s bug is launch-punch-list item P4 — this spec resolves it, and the punch list should be updated once it ships (a `doc-updater` job, not part of this spec). `WeightQuickLogSheet`'s separate, unrelated timezone bug (also P4) is **not** touched by this spec — it's a logic bug, not a styling one. `PetProfileTabs.jsx`'s hero-header inconsistency with the new App Shell (P3, flagged 2026-07-28) is **not** resolved here either — it needs its own product decision on whether to fold into a later visual pass, separate from the light-mode-color fix this spec does make to the same file.
- **Locked-decision conflicts:** none found. This spec doesn't touch the database, any Edge Function, or deployment — all consistent with `CLAUDE.md`.

## Non-Goals

- The Settings account-type pill ("Owner"/"Test"/"Demo"/"Production") and the top "TEST ACCOUNT"/"DEMO MODE" banner — both explicitly left exactly as they are.
- `PetProfileTabs.jsx`'s hero-header/photo-banner redesign relative to the new App Shell (punch-list P3) — a separate, undecided product question, not part of this spec.
- `WeightQuickLogSheet`'s timezone bug (punch-list P4) — a logic fix, out of scope for a styling spec.
- Giving `ui/badge.jsx`, `ui/toggle.jsx`, or `ui/toggle-group.jsx` an actual consumer — none of the three gain one in this pass.
- Any database, schema, or Edge Function change.
- Building automated visual-regression testing — doesn't exist today; this spec relies on manual verification instead.

## Open Questions

None remaining. The three items originally listed here (persistent nav chrome, multi-series chart colors, header action buttons) were resolved by extending `0005 Design System.md` itself (Amendments #9–#11, added alongside this spec) rather than leaving them as app-code judgment calls — the design system was written before the App Shell existed, so it needed to explicitly cover navigation chrome and multi-series charts, not carve out exceptions for them. See Technical Spec Phases 5–6 for where each amendment lands in the code.
