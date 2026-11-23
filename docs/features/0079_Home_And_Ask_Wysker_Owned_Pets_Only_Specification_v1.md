# 0079_Home_And_Ask_Wysker_Owned_Pets_Only_Specification_v1

*Also covers: shared tinted colors (Design System Amendment 6), added by Lynn 2026-11-23.*

**Status:** Approved (Lynn, 2026-11-23: sitter card wording "See the pets you're sitting"; Part B full color fix; Settings rainbow colors → option (b), a separate punch-list item).
**Date:** 2026-11-23
**Branch:** `claude/wysker-watch-sdlc-agents-wfmint`
**Migration:** none
**Punch list:** PA-61 (found in spec 0076), plus the shared tinted colors fix (Part B, added by Lynn 2026-11-23, no PA number yet; `doc-updater` adds one). Pre-Alpha Audit tab, `docs/planning/Wysker_Watch_Launch_Plan.xlsx`.
**Process:** first trial run of `/ship-feature` (`docs/foundation/0011 SDLC Governance.md`). Expected type: **NORMAL** (frontend-only, no change to who the database lets see or do anything).
**Related files (Part A):** `src/pages/Home.jsx`, `src/components/AskWyskerSheet.jsx`, `src/components/GeneralAskWyskerChat.jsx` (unchanged, receives the list), `src/lib/petsClient.js` (unchanged, `listOwnedPets()` reused), `src/lib/petsClient.test.js`, `e2e/pet-sitter.spec.js`, `docs/testing/QA_Test_Plan.md` §5.7.
**Related files (Part B):** `src/index.css`, `src/lib/toneColors.js`, new `src/lib/toneColors.test.js`, and the 18 files that hand-type a palette tint: `PetProfileContent`, `ExpandablePetProfileCard`, `PetAIInsights`, `MedicationSection`, `ScanReviewSheet`, `PetSummaryCard`, `AIErrorNotice`, `VaccinationSection`, `FoodSection`, `catchup/CatchUpFlow`, `ListRow`, `CheckInStatusBanner`, `AIEmergencyNotice`, `AttributeTrendChip`, `UserNotRegisteredError` (all `src/components/`), and `src/pages/PetSymptoms.jsx`, `Settings.jsx`, `Home.jsx`.
**Build order:** Part A (PA-61) is task 1; Part B (colors) is task 2. Each is reviewed separately.

## Lynn — what I need from you

1. **Review this spec and say "approved" (or tell me what to change).** This blocks the build. The one new line of wording, "See the pets you're sitting", is already approved (2026-11-23).
2. **Later:** promote the frontend build in Cloudflare when I ask (branch `main`, commit message starting "Spec 0079"). No backend deploy needed.

## Before You Approve This

1. **This takes things off a sitter's Home, on purpose.** A sitter with no pets of their own will now see "Welcome to Wysker Watch — Let's add your first pet" instead of the pets they sit, **plus a Pet Sitter card ("See the pets you're sitting") that takes them to `/pet-sitter`**, the page accepting a sitter invite already lands them on. Today that card is hidden on the welcome screen, so without this a sitter would have no way back from Home. Nothing they could actually *do* is lost: the database already refuses a sitter's check-in save, so today those Home buttons fail when tapped.
2. **If the "which pets do I only sit for?" lookup fails** (say, a network blip), Home and Ask Wysker fall back to today's behavior and show every pet, rather than showing an error. That matches how Edit Pet and Vet Report already handle the same failure (spec 0076). It's safe because the database, not this screen, decides what can be saved. The failure is reported to Sentry, so we'd see it.
3. **Ask Wysker opened from a specific pet's page is unchanged.** A sitter on a sat pet's Trends page can still ask about that one pet. Only the general "ask about my pets" chat changes. Say so if you want that blocked too; I'd treat it as a separate item.
4. **Part B touches about 18 screens' code but should change nothing you can see.** Every faint background keeps its exact color; only where the number is written changes (one shared place instead of 65 hand-typed copies). I'll take before-and-after screenshots of a handful of screens to show they match. A new automatic test fails if anyone hand-types one of these colors again.
5. **Not in Part B:** Settings' menu rows each use their own rainbow color (purple, orange, green, etc.) that isn't in the design system, and Support and Timeline use two more. Amendment 6 says those should use the shared colors too, but switching them **would visibly change** how Settings looks, so that's your call — see Open Questions. The see-through white layers on dark surfaces are a different kind of color and are also left alone.
6. Self-review found no duplicates, no locked-rule conflicts, and no new technical debt. Part A reuses the "pets I own" list spec 0076 built for Scan Record.

## Functional Requirements

1. Home's "How are your pets today?" list shows only pets the person owns or co-owns. A pet they only pet-sit doesn't appear there. That covers its card, its check-in buttons, its "catch up on missed days" prompt and its "Complete profile" prompt.
2. A pet the person owns or co-owns always appears, even if they're also listed as a sitter for it.
3. Someone with no owned or co-owned pets sees Home's existing welcome screen ("Let's add your first pet"). If they're sitting for anyone's pets, the welcome screen also shows the existing Pet Sitter card, linking to `/pet-sitter`, with the subtitle **"See the pets you're sitting"** (approved by Lynn, 2026-11-23). A brand-new owner who sits for nobody sees the welcome screen exactly as today, with no card. People who have pets keep today's Pet Sitter card and wording ("Manage sitting periods and sitter access") unchanged.
4. Ask Wysker's general chat (opened when no specific pet is in view) only tells the AI about pets the person owns or co-owns, so it never describes a sat pet (name, breed, conditions) as part of "your household".
5. If the sitter lookup fails, both screens show every pet, as today, and the failure is reported to Sentry.

**Part B — shared tinted colors**

6. Each of the five design-system colors (teal, amber, red, gray, sky blue) is defined once, in a form that lets any screen use it at any strength (a faint 15% background, a 50% glow, etc.). No screen hand-types the number for one of these colors any more.
7. Nothing looks different afterwards: every background, glow and border keeps exactly the color and strength it has today.
8. If someone later hand-types one of these five colors in app code, an automatic test fails and names the file.

## Acceptance Criteria

- **AC1.** Given test4@ is the sitter on a sit for one of test1@'s pets, when test4@ opens Home, then that pet's name doesn't appear in the pet list.
- **AC2.** Given the same setup, when test4@ opens Home and owns no pets, then the "Welcome to Wysker Watch" screen shows, with a Pet Sitter card reading "See the pets you're sitting" that opens `/pet-sitter`.
- **AC2b.** Given someone with no pets who sits for nobody, when they open Home, then the welcome screen shows with no Pet Sitter card.
- **AC3.** Given the same setup, when test4@ opens Ask Wysker's general chat and sends a message, then the request sent to the AI doesn't contain the sat pet's name.
- **AC4.** Given test1@ (the owner), when they open Home, then their pet still shows (no regression for owners).
- **AC5.** Given a pet the user owns and also sits for, then it's kept, and given a pet they only sit for, it's dropped. (Already covered by `listOwnedPets` unit tests from spec 0076; this spec adds a Home-level check that Home actually uses it.)
- **AC6.** Given the sitter lookup throws, when Home loads, then every pet from the full list still shows and the error is reported (`reportClientError`, feature `home`). The same applies to Ask Wysker (feature `ask_wysker`).
- **AC7.** Given the app code in `src/` (excluding `index.css`), when searched, then no hand-typed `rgba(...)`/hex form of the five palette colors remains.
- **AC8.** Given a file containing a hand-typed palette tint, when the unit tests run, then the guard test fails and names that file.
- **AC9.** Given a set of screens with tinted backgrounds (Home with a pet, Settings, a pet profile, Medications, the AI Insights panel), when compared before and after Part B, then the tinted elements' computed colors are identical.

## Test Plan

- AC1 → `[Playwright: pet-sitter.spec.js]`. New test using that file's existing test4@ sitter setup: open Home and assert the sat pet's name isn't in the list.
- AC2 → `[Playwright: pet-sitter.spec.js]`, conditional on test4@ having no pets of its own on dev. The builder checks this first. Asserts the welcome text, the card's "See the pets you're sitting" text, and that tapping it lands on `/pet-sitter`. If test4@ owns pets, the empty-state card is covered by a component-level `[Vitest]` render test of Home's empty state instead, and the spec's Build Notes say so.
- AC2b → `[Vitest]`. Render test of Home's empty state with zero sitter-only pets: no card. (No test account is pet-less and sitter-less on dev, and creating one would need a new allowlist migration, which isn't worth it here.)
- AC3 → `[Playwright: pet-sitter.spec.js]`. Intercept the `ask-vet-assistant` request with `page.route`, assert its body doesn't contain the sat pet's name, and answer with a canned reply, so no real AI call is made and the 20-per-10-minutes limit isn't touched.
- AC4 → already covered: every test1@ spec that opens Home (e.g. `daily-checkin.spec.js`) would break.
- AC5 → `[Vitest: petsClient.test.js]` (existing). Home and Ask Wysker using `listOwnedPets` is checked by AC1/AC3.
- AC6 → `[Vitest]`. New unit test: with `getSitterOnlyPetIds` rejecting, the fallback returns the full list and calls `reportClientError`. The fallback lives in a small helper in `petsClient.js` so it can be unit-tested without rendering Home.
- AC7 + AC8 → `[Vitest: toneColors.test.js]`. A new guard test that scans `src/` for the five palette colors in hand-typed form (same idea as the existing `console.error` guard) and lists offending files. AC8 is shown by the test failing before the sweep and passing after.
- AC9 → `[Manual]`, plus builder/QA evidence. Before-and-after Playwright screenshots of the listed screens (reading the computed `background-color` of a few tinted elements, not just eyeballing), attached to the PR. Not kept as a permanent pixel test: screenshot tests are flaky on shared dev data, and the guard test (AC8) is what protects this going forward.
- **Seeding/access constraints:** none new. `pet-sitter.spec.js` already creates the sit as test1@ and signs in as test4@ (America/New_York; no dated data is saved here, so the time zone rule doesn't apply). Tests must not depend on order: each reads only, and the AC3 test answers the AI request itself.

## Visual Reference

No mockup. Home's existing welcome screen, with the existing Pet Sitter card below it (same icon, title and arrow; subtitle "See the pets you're sitting").

## Technical Spec

- **Schema:** none. No migration, no RLS change. Sitters already can't write `daily_check_ins` (`daily_check_ins_insert_owner`, migration 0014).
- **Components/files touched:**
  - `src/lib/petsClient.js`: add `loadOwnedPets(order, feature)`, returning `{ pets, sitterOnlyCount }`. It fetches `entities.Pet.list(order)` and `getSitterOnlyPetIds()` together, drops sitter-only pets, and counts them. If the sitter lookup fails, it reports via `reportClientError(err, { feature })` and returns the full list with `sitterOnlyCount: 0`. (If `Pet.list` itself fails, that error passes up as today, so Home still shows "Unable to load your pets.") `listOwnedPets()` is left as is for its existing callers.
  - `src/pages/Home.jsx` `loadData`: `entities.Pet.list('-created_date')` → `loadOwnedPets('-created_date', 'home')`, storing `sitterOnlyCount` in state. Everything downstream (check-ins, catch-up, onboarding, weight, medication counts) already derives from the pet list, so it all follows. The empty-state branch renders the existing Pet Sitter card when `sitterOnlyCount > 0`, with the subtitle "See the pets you're sitting". Pull the card into a small local component taking a `subtitle` prop, so the two placements share one copy of the markup.
  - `src/components/AskWyskerSheet.jsx`: the no-`petId` branch uses `loadOwnedPets('-created_date', 'ask_wysker')` and its `pets`. The `petId` branch is unchanged.
  - Tests: `src/lib/petsClient.test.js` and `e2e/pet-sitter.spec.js` as in the Test Plan. `docs/testing/QA_Test_Plan.md` §5.7 gets the new cases.
- **API / edge functions:** none.
- **Performance:** `listOwnedPets` adds the sitter lookup (one query, plus a few more only if the person has sitter invites). It runs alongside the pet list, not after it, so Home's load time is roughly unchanged.
- **Design System compliance:** Part A shows one existing element (the Pet Sitter card) in one more place with a different subtitle. No new elements or styles. The card's hand-typed tint is fixed by Part B. Part B brings 65 palette tints in line with Amendment 6. `design-system-check` runs on every touched `.jsx` file.

**Part B — technical**

- `src/index.css`: next to each existing color variable, add its color as channels, e.g. `--tone-good-rgb: 76 199 176;` for `--tone-good`, `--tone-warn-rgb`, `--tone-bad-rgb`, `--tone-neutral-rgb`, `--accent-sky-rgb`. (Why channels: CSS can then make any strength from one definition, `rgb(var(--tone-good-rgb) / 0.15)`. This works on every browser the app supports, including older iPhones, unlike the newer `color-mix()`.) Keep the hex variables, or have them read from the channels; either way, one definition per color.
- `src/lib/toneColors.js`: add `tint(name, alpha)` returning `rgb(var(--…-rgb) / alpha)`, e.g. `tint('teal', 0.15)`, plus named constants for the common 15% strength (`PALETTE_SOFT.teal`, etc.). Replace each of the 65 hand-typed palette tints with these, **keeping each one's current strength** (0.15, 0.12, 0.35, 0.3, 0.5, 0.25, 0.16, 0.14, 0.08). Don't round them to a common value.
- `src/lib/toneColors.test.js`: the guard test. It matches `rgba(` or `rgb(` followed by any of the five RGB triples (`76,199,176`, `244,199,107`, `229,115,115`, `169,174,181`, `111,183,255`, with or without spaces) and the five hex values (any case), across `src/**/*.{js,jsx}`. `src/index.css` is excluded.
- **Constraints from CLAUDE.md / locked decisions:** follows the `petsClient.js` rule ("owner-only flows use `listOwnedPets()`") and closes the "Home and Ask Wysker still use the unfiltered list (PA-61)" note there, which `doc-updater` will update. Uses `reportClientError`, never `console.error`. No Vibe/scoring logic touched.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none new. `listOwnedPets()` (spec 0076) already does the filtering; this spec reuses it. Pets.jsx, Edit Pet and Vet Report each have their own "if the lookup fails, show everything" fallback written inline. The new helper could replace those later. Not done here, to keep the trial small.
- **Technical debt nearby:** Home's `loadData` is long (about 130 lines), but this change is one line in it. Ask Wysker's general chat prompt calls the person "a pet owner whose household includes…", which is why sat pets there were misleading.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** PA-61 is this item; mark it Complete when shipped. PA-60 (sitter permissions, and the Pet Sitter page's own pet picker) stays separate.

## Non-Goals

- The Pet Sitter page's pet picker (PA-60).
- Ask Wysker opened from a specific pet's page.
- Changing the Pet Sitter card or its wording for people who have pets.
- Part B: Settings' rainbow menu-row colors (`Settings.jsx` lines 38–43), Support's and Timeline's two non-palette tints, and the see-through white layers. See Open Questions.
- Part B: any visible color change.
- Replacing the inline fallbacks in Pets.jsx / Edit Pet / Vet Report with the new helper.

## Open Questions

1. **Resolved (Lynn, 2026-11-23): option (b).** Settings' rainbow colors become a separate punch-list item, added at wrap-up. Original question: **Settings' rainbow menu rows.** Six Settings rows each use their own color (purple, orange, green, fuchsia, amber, light blue) that isn't in the design system. Amendment 6 says list-row icon backgrounds should use the shared colors, but switching would visibly change Settings. Options: (a) leave as is and record it as an accepted exception in the Design System doc; (b) a separate small item to map them onto the five shared colors. Recommendation: (b), as its own punch-list item, since it's a look change you'd want to see first.

Part A: Lynn chose (2026-11-23) the existing welcome screen plus the Pet Sitter card for sitters with no pets, and approved the subtitle "See the pets you're sitting".
