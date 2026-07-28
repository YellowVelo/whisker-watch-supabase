# 0023 App Shell & Navigation/IA Refactor — Specification v1

**Status:** Implemented 2026-07-28 — all 12 steps of the staged plan complete. See "Implementation Summary" at the end for final state, what shipped vs. what was deliberately deferred, and links to the punch-list items opened along the way.
**Date:** 2026-07-27
**Related files:** `src/App.jsx`, `src/components/BottomTabBar.jsx`, `src/components/CareMenu.jsx`, `src/pages/{Home,Pets,PetProfile,PetProfileTabs,PetTrends,Timeline,Settings,PetSitterMenu,AIMenu}.jsx`, `src/components/{PetProfileContent,ExpandablePetProfileCard,PetSittingSection,PetAIChat,PetAIInsights}.jsx`, `src/api/aiClient.js`, `supabase/functions/ask-vet-assistant`, `docs/foundation/0008 Navigation & Information Architecture_V4.md`, `docs/launch-punch-list.md`

This spec reconciles the prior Navigation & Page Audit (last session) against
the current, more up-to-date `0008 Navigation & Information Architecture_V4.md`
(revised 2026-07-18) and live code, then lays out the App Shell / IA
refactor the stakeholder requested. **This is an organization refactor —
routing, navigation, and how existing screens are composed together. It is
not a visual redesign, not a rewrite of any feature's logic, and not a
database change.**

---

## Before You Approve This

Plain-language flags from investigating the repo, before you sign off:

- **The audit this spec was built from had gone stale in a few places**, because a more current internal document (`0008 Navigation & Information Architecture_V4.md`, updated 9 days ago) already corrected them. Specifically: the "Pet Profile" duplicate-page concern is by design, not an accident (two screens intentionally show the same underlying pet-info component); and a redirect the audit called "dead code" is actually a working compatibility link for old bookmarks. This spec is grounded in the current, verified state — see "What the prior audit got right vs. stale" below.
- **CareMenu's removal was already decided as a product direction on 2026-07-18** (documented in the Navigation & IA doc and the launch punch list) but never implemented. This spec is the vehicle that finally executes that decision — it's not a new idea, just finishing one already agreed to.
- **Two in-progress screens (the "AI" and "Pet Sitter" tabs inside `PetProfileTabs.jsx`) lose their only entry points once this refactor lands**, because their gateway pages (`AIMenu.jsx`, `PetSitterMenu.jsx`) and CareMenu are all being retired. Confirmed with you: both tabs retire outright — there is no replacement tab, their content moves into the global AI sheet and the household Pet Sitter page respectively (see Decisions #1).
- **"Ask Wysker" from Home with no pet selected requires a small, genuinely new piece of prompt-building logic** (a "talk about my whole household, not one pet" system prompt), because today's AI chat code only knows how to talk about a single hardcoded pet. You already approved including this — flagging again here because it's the one place this spec adds new logic rather than just reorganizing existing logic.
- **Merging "History" into Timeline needs a data-completeness check at implementation time**, not just a redirect. Timeline and History pull from overlapping but not identical sources — see Technical Spec for detail. Flagged as implementation-time work, not a blind route swap.
- No other duplicate functionality, undocumented tech debt, or locked-decision conflicts were found beyond what's already called out above.

---

## What the prior audit got right vs. stale (reconciliation)

| Audit claim | Still true? | Correction |
|---|---|---|
| Bottom nav = exactly Home/Pets/Menu, live and correct | ✅ True | No change needed — non-negotiable requirement already met |
| Insurance/Documents are orphaned placeholders | ✅ True | Confirmed still true in current code |
| CareMenu is a secondary per-pet hamburger with a mismatched item list vs. PetProfileContent's cards | ✅ True | Also now confirmed as **already-decided to be removed** per product direction (2026-07-18), not just an audit observation |
| PetProfile.jsx / PetProfileTabs.jsx / ExpandablePetProfileCard are "three duplicate UIs" | ⚠️ Partially stale | `PetProfile.jsx` (`/pet/:petId`) and `ExpandablePetProfileCard` (Pets tab) both wrap the *same* shared component (`PetProfileContent`) **by design** — that's not a duplication bug. `PetProfileTabs.jsx` (`/pet/:petId/profile`) is a genuinely separate implementation (tabbed data-entry: Medications/Baseline/Food/Bloodwork/Vaccines, plus the retiring AI/Sitter/History/Trends tabs) |
| PetProfileTabs' "trends" tab redirect is dead/orphaned code | ❌ Stale | It's a working, intentional compatibility redirect to `/pet/:petId/trends?section=trends` for old bookmarks — not dead code, and should be preserved as-is |
| Menu → Pet Profiles directory is the main path to Pet Profile | ❌ Stale | That directory **does not exist in current code at all** — it was already removed. The real (nearly unreachable) entry points today are onboarding's "Start Check-in" and the accept-co-owner-invite redirect |
| New-pet-creation spinner bug — fix applied in dev, unverified on prod/staging | Unconfirmed | Out of scope for this spec (not a navigation concern); still worth a separate check |

---

## Functional Requirements

In plain terms: right now, features live in places that don't make sense —
Pet Sitter and AI are buried in the account-settings Menu even though
they're not account settings; a per-pet hamburger menu (CareMenu) offers a
different, incomplete list of the same pet's screens that Pets tab already
offers; and there's no single consistent frame (header + bottom nav) wrapping
every screen. Owners have to learn multiple, inconsistent ways to get to the
same thing.

This refactor:

1. Wraps every authenticated, customer-facing screen in one consistent
   frame: a persistent header (brand, Ask Wysker button, notifications bell)
   on top, the current screen's content in the middle, and the existing
   three-tab bottom navigation (Home/Pets/Menu) at the bottom — unchanged in
   appearance and behavior.
2. Moves Pet Sitter out of Menu and makes it a prominent, first-class
   feature launched from Home, since it's a household-wide tool, not an
   account setting.
3. Makes "Ask Wysker" (the AI assistant) available from one consistent
   button in the header everywhere in the app, instead of being buried
   inside Menu or a specific pet's tab list.
4. Makes Pets the clear, complete entry point for everything about a
   specific pet — Overview, Trends, Timeline, Health Records, Medications,
   Weight, Vaccinations, Vet Export — using the screens that already exist
   today, reorganized rather than rebuilt.
5. Simplifies Menu back down to what it says on the label: account,
   notifications, settings, support, legal, sign out, delete account.
6. Retires the per-pet CareMenu hamburger (already-agreed direction),
   folding its two currently-homeless destinations (History, and the
   about-to-be-orphaned AI/Sitter tabs) into their new proper homes, and
   dropping the two features (Insurance, Documents) that were never really
   live.

## Acceptance Criteria

**App Shell**
- Given an authenticated user on any customer-facing screen, when they look
  at the screen, then they see the same persistent header and bottom nav
  wrapping it, with only the middle content area changing between screens.
- Given a user navigates from one screen to another, when the new screen
  loads, then only that screen's code/data is loaded — the app does not
  keep every screen mounted in the background.

**Bottom Navigation** (unchanged, verified)
- Given the bottom nav, when inspected, then it shows exactly three
  destinations: Home, Pets, Menu — same icons, same labels, same visual
  design as today.
- Given a user is on any pet-specific screen (Trends, Timeline, Vet Export,
  etc.), when they look at the bottom nav, then "Pets" is shown as active.
- Given a user opens Pet Sitter from Home, when they look at the bottom
  nav, then "Home" is shown as active (not a fourth tab, not Menu).

**Pets**
- Given a user is on Pets, when they tap "Show More" on a pet's card, then
  it expands in place (not a new page) to reveal that pet's Overview,
  Trends link, Timeline link, Health Records, Medications, Weight,
  Vaccinations, and Vet Export — preserving the existing collapse/expand
  behavior so the Pets screen doesn't become one long unbroken scroll of
  every pet fully expanded.
- Given a user wants to see a pet's Trends, when they tap the pet's
  Wellbeing chips (today's existing behavior) or (new) a Trends link inside
  the expanded card, then they land on that pet's existing Trends screen —
  same screen, same range selector, same Overview/Trends/Patterns/Compare
  sub-tabs as today.

**Pet Sitter**
- Given a user is on Home, when they scroll past the pet health summary
  cards, then they see a prominent Pet Sitter entry point below them.
- Given a user opens Pet Sitter, when the screen loads, then it shows the
  same multi-pet sitting-session management the app already has today
  (create a sit for one or more pets, sitter logs, invite a sitter) — no
  new sitter logic is built.

**Ask Wysker AI**
- Given a user is on any authenticated screen with a header, when they tap
  Ask Wysker, then a sheet/drawer opens without navigating away from the
  current screen.
- Given the user closes the AI sheet, when it closes, then they're back
  exactly where they were — same screen, same scroll position.
- Given the user opened AI from a specific pet's Trends/Weight/etc. screen,
  when the AI sheet opens, then it already knows which pet and which kind
  of screen they were on (no need to re-explain).
- Given the user opened AI from Home with no specific pet in view, when the
  AI sheet opens, then they can either pick a pet or ask a general
  household question.
- Given any AI response, when read, then it never diagnoses, prescribes, or
  claims more certainty than the underlying data supports — same safety
  behavior as today's AI, unchanged.

**Menu**
- Given a user opens Menu, when they view the list, then Pet Sitter and Ask
  Wysker AI are no longer primary rows there (may remain as a small,
  clearly-secondary link only if a real usability reason exists — see Open
  Questions).

## Visual Reference

Three reference screenshots were provided after the initial draft (2026-07-27) — treated as general directional reference, not literal specs to redesign to, per the stakeholder's explicit confirmation.

- **App Shell diagram** (logo/notification-bell header, dynamic content area, Home/Pets/Menu bottom nav) → confirms the target `AppShell`/`AppHeader`/`RouteOutlet`/`BottomTabBar` structure in Phase 3 as drawn, including that the header carries brand + notifications as persistent elements.
- **"AI Assistant" full-screen mockup** (Insights / Ask a Question toggle, "AI Health Insights," suggested-topics list) → confirms `AskWyskerSheet`'s pet-scoped content is correctly scoped to reuse the *existing* `PetAIInsights`/`PetAIChat` components as-is (the mockup's Insights/Ask-a-Question toggle is a visual pass on the same toggle already implemented in `PetProfileTabs.jsx`'s `ai` tab today) — not a new screen to build from scratch.
- **"Pet Sitter" full-screen mockup** (Upcoming/Active/Past sitting periods, "New Pet Sit" action) → confirms the target `/pet-sitter` page's content matches `PetSittingSection.jsx`'s existing structure closely enough that no new sitter UI is implied — validates the "reuse `PetSittingSection` unchanged, just mounted without a `petId`" plan in Phase 3.
- **Stakeholder clarification on all three:** `AskWyskerSheet` remains a non-navigating overlay (not a routed page, despite the mockups showing a bottom nav in the screenshot itself — that's the mockup tool's frame, not a navigation directive). The header keeps its Ask Wysker icon alongside brand/notifications, per the original written requirement. Home stays the active bottom tab while either AI or Pet Sitter is open, per the original written requirement — the "Menu" highlight visible in the AI/Pet Sitter screenshots was explicitly called out as not intentional and does not govern.
- No visual states remain undefined as a result — this spec still deliberately does not touch visual/style design; the screenshots were used only to confirm structural/navigation assumptions above.

---

## Phase 1 — Current-State Inventory

### 1A. Current Route Inventory

| Route | Component | Current entry point(s) | Parent area | Actively used? | Orphaned? | Duplicates? |
|---|---|---|---|---|---|---|
| `/` | `Home.jsx` | BottomTabBar | Household | Yes | No | — |
| `/notifications` | `Notifications.jsx` | Menu row, NotificationBell (Home) | Account | Yes | No | — |
| `/pets` | `Pets.jsx` | BottomTabBar | Pet-specific (browse) | Yes | No | — |
| `/pet/:petId` | `PetProfile.jsx` | Onboarding "Start Check-in", accept-invite redirect | Pet-specific | Rarely (2 edge-case flows only) | Effectively yes | Same underlying component as Pets' inline expand, by design |
| `/pet/:petId/trends` | `PetTrends.jsx` | Home cards, Pets Wellbeing chips, CareMenu | Pet-specific | Yes | No | — |
| `/pet/:petId/timeline` | `Timeline.jsx` | PetProfileContent "Timeline" card | Pet-specific | Yes | No | Partial overlap with History (`?tab=history`) |
| `/pet/:petId/profile` | `PetProfileTabs.jsx` | CareMenu, AIMenu, PetSitterMenu, PetProfileContent cards (via `?tab=`) | Pet-specific | Yes (as a tab container) | No | — |
| `/pet/:petId/onboarding` | `PetOnboarding.jsx` | AddPetDialog, BaselineSection | Pet-specific | Yes | No | — |
| `/pet/:petId/symptoms` | `PetSymptoms.jsx` | PetProfileContent "Weight" card | Pet-specific | Yes | No | — |
| `/pet/:petId/food` | `PetFood.jsx` | PetProfileContent "Food" card | Pet-specific | Yes | No | — |
| `/pet/:petId/insurance` | `Insurance.jsx` | CareMenu only | Pet-specific | No (empty placeholder) | Yes | — |
| `/pet/:petId/documents` | `Documents.jsx` | CareMenu only | Pet-specific | No (empty placeholder) | Yes | — |
| `/pet/:petId/export` | `VetExport.jsx` | PetProfileContent "Vet Report" card | Pet-specific | Yes | No | — |
| `/about` | `About.jsx` | CareMenu only | Global | Rarely | Effectively yes | — |
| `/settings` | `Settings.jsx` | BottomTabBar ("Menu") | Account | Yes | No | — |
| `/settings/pet-sitter` | `PetSitterMenu.jsx` | Menu row | Household (misfiled under Account) | Yes | No | Overlaps with `petsit` tab in PetProfileTabs |
| `/settings/ai` | `AIMenu.jsx` | Menu row | Household (misfiled under Account) | Yes | No | Overlaps with `ai` tab in PetProfileTabs |
| `/account` | `Account.jsx` | Menu user-summary card | Account | Yes | No | — |
| `/privacy`, `/privacy/:sectionId` | `Privacy.jsx`, `PrivacyPolicySection.jsx` | Menu row | Global/legal | Yes | No | — |
| `/terms`, `/terms/:sectionId` | `Terms.jsx`, `TermsOfServiceSection.jsx` | Menu row | Global/legal | Yes | No | — |
| `/preferences` | `Preferences.jsx` | Menu row | Account | Yes (stub) | No | — |
| `/support` | `Support.jsx` | Menu row | Global | Yes (stub) | No | — |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/verify-email` | — | Public auth flow | Auth | Yes | No | — |

Confirms the prior audit: no unmounted/dead files exist. The problem is
entirely about routes with no (or a weak) live entry point — Insurance,
Documents, and to a lesser extent PetProfile.jsx and About.

### 1B. Current Navigation Inventory

- **Bottom nav** (`BottomTabBar.jsx`): 3 links — `/` (Home), `/pets` (Pets, active for `/pets` or any `/pet/*`), `/settings` (Menu). Active-state logic: `isActive(pathname)` per tab, string/prefix match, `aria-current="page"`.
- **Header nav actions:** none exist today — there is no persistent header component anywhere in the app.
- **Menu links** (`Settings.jsx` `MENU_ITEMS`): Pet Sitter, AI, Notifications, Privacy, Terms of Service, Settings (labeled, routes to Preferences), Support — plus a separate user-summary card linking to Account, and Sign Out / Delete Account as destructive actions.
- **Pet-level nav components:**
  - `CareMenu.jsx` — slide-out panel, mounted in `PetProfileTabs.jsx`, `VetExport.jsx`, `Documents.jsx`, `Insurance.jsx`. Links: History/Trends/Meds/Baseline/Food/Labs/Vaccines/Sitter/AI (all into `PetProfileTabs` tabs or `/pet/:id/trends`) + Menu + About.
  - `PetProfileContent.jsx`'s `NavCard` list (expanded state) — Baseline, Conditions (via Edit), Medications, Food, Vaccinations, Weight, Vet Report, Observations, Timeline, Health Records. **No Trends card** — Trends is reached only via the collapsed-state Wellbeing chips, not the expanded nav-card list.
- **Card-embedded links:** `PetSummaryCard`/`CheckInStatusBanner` (Home) → Trends. `SitterPetRow` (Pets, sitter-only pets) → Trends. `ExpandablePetProfileCard`'s collapsed Wellbeing chips (Pets) → Trends.
- **Hard-coded navigation calls:** `navigate(-1)` used for back buttons on `PetSitterMenu`, `AIMenu`, `PetProfileTabs` (hero header back button), `PetTrends`. `PetProfile.jsx` always returns to `/pets` regardless of origin. `window.location.href` (full reload, not client routing) used for Sign Out / Delete Account / Reset Sandbox Account success paths in `Settings.jsx` — intentional, not a bug.
- **Active-tab logic:** entirely inside `BottomTabBar.jsx`'s `tabs` array — no other component computes it.
- **Back-navigation assumptions:** mostly `navigate(-1)` (browser-history-relative); `PetProfile.jsx` is the one exception with a hard-coded destination. No component currently assumes anything about a persistent header, since none exists.

### 1C. Current Component Inventory

| Component | Disposition |
|---|---|
| `BottomTabBar.jsx` | **Reuse unchanged** — moves inside the new `AppShell`, no code changes |
| `PetProfileContent.jsx` | **Reuse with composition changes** — add a Trends `NavCard` for discoverability (currently reachable only via chips); otherwise unchanged |
| `ExpandablePetProfileCard.jsx` | **Reuse unchanged** — collapse/expand behavior preserved per your instruction |
| `PetProfile.jsx` (`/pet/:petId` page) | **Deprecate** — becomes a redirect to `/pets` (see Phase 2) rather than a rendered page |
| `PetProfileTabs.jsx` | **Reuse with composition changes** — drop the `history`, `ai`, and `petsit` `TabsContent` blocks (see Open Questions); keep `medications`/`baseline`/`food`/`bloodwork`/`vaccines`; keep the existing `trends` redirect stub as-is |
| `CareMenu.jsx` | **Remove after migration** — only after every destination it links to (History→Timeline, Trends, Meds, Baseline, Food, Labs, Vaccines) has a working replacement path, per your CareMenu-removal decision |
| `AIMenu.jsx` | **Remove after migration** — replaced by the global Ask Wysker header action |
| `PetSitterMenu.jsx` | **Remove after migration** — replaced by the new `/pet-sitter` household page |
| `Insurance.jsx`, `Documents.jsx` | **Remove** — routes and files deleted per your decision (may return later as a fresh spec, not preserved as dead code) |
| `LogHistory.jsx` | **Move** — its data folds into `Timeline.jsx` (see Technical Spec); component itself likely retires once merged |
| `PetSittingSection.jsx` | **Reuse unchanged** — already supports an optional `petId` prop; mount it with no `petId` on the new household `/pet-sitter` page, exactly as it already works today when embedded per-pet |
| `PetAIChat.jsx`, `PetAIInsights.jsx` | **Move** — relocate from being embedded in `PetProfileTabs`' `ai` tab to being the rendered content of the new global `AskWyskerSheet`, reused as-is when pet context is available |
| `Settings.jsx` (`MENU_ITEMS`) | **Reuse with composition changes** — remove Pet Sitter/AI rows (or demote to secondary, see Open Questions) |
| `About.jsx` | **Reuse unchanged** — needs a new entry point once CareMenu is gone (see Phase 2) |
| `NotificationBell.jsx` | **Move** — relocates from being Home-page-only into the new persistent header, reused as-is |
| `AccountTypeBanner.jsx`, `OfflineBanner.jsx`, `IosInstallBanner.jsx` | **Reuse unchanged** — these already render above/outside the route content in `App.jsx`; they become siblings of the new header inside `AppShell`, not touched otherwise |

---

## Phase 2 — Proposed Route Map

| Current Route | Current Entry Point | Target Route | Target Entry Point | Active Bottom Tab | Action | Backward Compat? | Notes |
|---|---|---|---|---|---|---|---|
| `/` | BottomTabBar | `/` (unchanged) | BottomTabBar | Home | Keep, add Pet Sitter section below pet cards | — | |
| `/pets` | BottomTabBar | `/pets` (unchanged) | BottomTabBar | Pets | Keep, "Show More" behavior unchanged | — | |
| `/pet/:petId` (Pet Profile page) | Onboarding "Start Check-in", accept-invite redirect | *(retired as a rendered page)* | — | Pets | Both callers repointed to `/pets`, scrolled to the target pet's card via the existing `cardRef`/`highlighted` props — card stays **collapsed**, same as any normal visit to Pets | **Yes** — `/pet/:petId` kept alive as a redirect to `/pets` so no old link 404s | Per your decision |
| `/pet/:petId/trends` | Home, Pets chips, CareMenu | `/pet/:petId/trends` (unchanged) | Pets (expanded card / chips), Home | Pets (or Home if launched from there) | Keep exactly as-is | — | Same screen, same sub-tabs |
| `/pet/:petId/timeline` | PetProfileContent card | `/pet/:petId/timeline` (unchanged, extended) | Pets (expanded card) | Pets | Extend `getTimelineEvents()` to fully cover what History showed; `?tab=history` retires | **Yes** — `?tab=history` redirects to Timeline | See Technical Spec |
| `/pet/:petId/profile?tab=medications` etc. | CareMenu, PetProfileContent cards | Same, reached from Pets' expanded card | Pets | Pets | Keep as-is | — | This *is* how "Health Records/Medications/Vaccinations from Pets" is satisfied — no rebuild needed |
| `/pet/:petId/export` | PetProfileContent card | Unchanged | Pets (expanded card) | Pets | Keep as-is | — | |
| `/pet/:petId/symptoms` | PetProfileContent "Weight" card | Unchanged | Pets (expanded card) | Pets | Keep as-is | — | |
| `/pet/:petId/food` | PetProfileContent card | Unchanged | Pets (expanded card) | Pets | Keep as-is | — | |
| `/pet/:petId/insurance` | CareMenu only | *(deleted)* | — | — | Remove route + file | No — orphaned placeholder, per your decision | |
| `/pet/:petId/documents` | CareMenu only | *(deleted)* | — | — | Remove route + file | No — orphaned placeholder, per your decision | |
| `/pet/:petId/profile?tab=petsit` | CareMenu, PetSitterMenu | *(retired)* | Folded into `/pet-sitter` | Home | Household sitter page already supports per-pet sits | **Yes** — redirects to `/pet-sitter` | See Open Questions |
| `/pet/:petId/profile?tab=ai` | CareMenu, AIMenu | *(retired)* | Global Ask Wysker header action, pre-scoped to this pet | Wherever opened from | Content moves into `AskWyskerSheet` | **Yes** — redirects into the global AI sheet, pet-scoped | See Open Questions |
| `/pet/:petId/profile?tab=history` | CareMenu | *(retired)* | `/pet/:petId/timeline` | Pets | Merge | **Yes** — redirects to Timeline | |
| `/pet/:petId/profile?tab=trends` | (legacy bookmarks only) | Unchanged | — | Pets | Keep existing redirect to `/pet/:petId/trends?section=trends` | **Yes**, already implemented | Not dead code — confirmed working |
| *(new)* | — | `/pet-sitter` | Home "Pet Sitter" section | Home | New thin page wrapping `PetSittingSection` with no `petId` | — | Zero new sitter logic — same component, same data |
| `/about` | CareMenu only | Menu row (new) | Menu | Menu | Add a real Menu entry point since CareMenu goes away | — | |
| `/settings` | BottomTabBar | `/settings` (unchanged) | BottomTabBar | Menu | Simplify `MENU_ITEMS` | — | |
| `/settings/pet-sitter` | Menu row | *(deleted or demoted, see Open Questions)* | — | Menu | Remove as primary; `/pet-sitter` is now primary | **Yes** if kept as redirect | |
| `/settings/ai` | Menu row | *(deleted)* | — | — | Remove — no menu-based AI destination needed once header action exists | No | |
| `/account` | Menu | Unchanged | Menu | Menu | Keep | — | |
| `/notifications` | Menu, NotificationBell | Unchanged | Menu, header bell | Menu | Keep; bell relocates to header (still also in Menu) | — | |
| `/preferences` | Menu | Unchanged | Menu | Menu | Keep (still a stub) | — | |
| `/support` | Menu | Unchanged | Menu | Menu | Keep (still a stub) | — | |
| `/privacy`(`/:sectionId`) | Menu | Unchanged | Menu | Menu | Keep | — | |
| `/terms`(`/:sectionId`) | Menu | Unchanged | Menu | Menu | Keep | — | |
| `/pet/:petId/onboarding` | AddPetDialog, BaselineSection | Unchanged | — (outside shell) | — | Keep, stays outside App Shell | — | |
| Auth routes | — | Unchanged | — (outside shell) | — | Keep, stay outside App Shell | — | |

---

## Phase 3 — Component Plan

```
AppShell                                  (new — src/components/AppShell.jsx)
├── AppHeader                             (new — src/components/AppHeader.jsx)
│   ├── Brand                             (new, static — Wysker Watch identity)
│   ├── AskWyskerAction                   (new — opens AskWyskerSheet)
│   └── NotificationAction                (moved — reuses NotificationBell.jsx as-is)
├── AccountTypeBanner / OfflineBanner / IosInstallBanner   (unchanged, unmoved logically — remain siblings, same as today)
├── RouteOutlet                           (existing <Routes>/<Route> tree — unchanged route elements, just relocated under AppShell)
└── BottomTabBar                          (unchanged component, unchanged position — still last/fixed-bottom)

AskWyskerSheet                            (new — src/components/AskWyskerSheet.jsx)
├── pet-scoped mode: reuses PetAIChat.jsx + PetAIInsights.jsx unchanged, given a petId
└── general mode (new): a small new SYSTEM_CONTEXT variant in aiClient.js / a sibling
    "general" prompt builder, used only when no pet is in scope — same invokeAI() call,
    same ask-vet-assistant Edge Function, no parallel integration
```

**Where selected-pet context lives:** nowhere new. There is no global "current
pet" state today (confirmed by investigation — every page independently
fetches its own pet via the `:petId` URL param), and this refactor doesn't
introduce one. Pet-specific screens keep reading `petId` from the URL, same
as today. The only new thing is that `AskWyskerSheet` needs to know "what
pet, if any, is the user currently looking at" — it gets this the same way
every other screen does, by reading the current route's `:petId` param (via
`useParams()` at the point the sheet is opened), not from a new shared
store.

**How pet context survives navigation:** it doesn't need to "survive"
navigation in a new way — it's re-derived from the URL on every screen,
exactly as today. Moving between `/pet/:id/trends` and
`/pet/:id/timeline`, for example, already works today because both screens
independently read `:id`.

**How the active bottom tab is calculated:** unchanged — `BottomTabBar.jsx`'s
existing `isActive(pathname)` per-tab logic. `/pet-sitter` needs one addition:
its `isActive` check should mark **Home** active (not Pets, not a 4th tab) —
a one-line addition to the `Home` tab's `isActive` function (`p === '/' || p === '/pet-sitter'`).

**How AI context is passed:** `AskWyskerAction` (in the header) reads the
current route via `useLocation()`/`useParams()` when tapped, and passes a
`{ petId, screen }` context object into `AskWyskerSheet`. `petId` is
`undefined` when not on a pet-specific screen (e.g. Home, Menu) — that's the
signal `AskWyskerSheet` uses to render general mode vs. pet-scoped mode.

**How modal/sheet state works:** `AskWyskerSheet`'s open/closed state lives
in `AppShell` (or `AppHeader`), the same pattern `PetProfileTabs.jsx`
already uses for its own `careOpen`/`sheetOpen` local state today — no new
state-management pattern introduced. Opening it does not navigate (no route
change), so closing it requires no navigation either — the underlying route
never changed, so "return to the exact screen" is automatic, not something
that needs to be engineered.

**Browser/mobile back behavior:** unaffected for real navigations (back
button behavior is unchanged, since routes and their nesting are largely
unchanged — see Risk Assessment for the one case that needs explicit
handling: pressing hardware/mobile back while the AI sheet is open should
close the sheet, not navigate the underlying page, matching the same pattern
`DailyCheckInSheet`/`CatchUpFlow` already use).

**Route lazy-loading:** current app has no route-level code-splitting
(all pages are eagerly imported in `App.jsx`). Introducing `React.lazy()` +
`Suspense` per route is a reasonable, additive improvement to make during
this refactor (it's touching every route declaration anyway), but is not
required by anything the stakeholder asked for — flagged as an optional,
low-risk addition in the Staged Implementation Plan rather than a
requirement.

**Scroll position:** `BottomTabBar.jsx` already resets scroll to top on
re-tapping an already-active tab (existing `handleTabPress` behavior,
unchanged). For the AI sheet returning the user to their exact scroll
position, no explicit handling is needed — since opening the sheet doesn't
navigate away, the underlying page's scroll position is never touched by
opening/closing it.

---

## Phase 4 — Risk Assessment

| Risk | Mitigation |
|---|---|
| Broken deep links to retired routes (`?tab=history`, `?tab=ai`, `?tab=petsit`, `/pet/:petId`, `/settings/ai`, `/settings/pet-sitter`) | Every retired route becomes a redirect to its replacement (see Phase 2 "Backward Compat?" column) instead of a dead route, per the "don't delete routes before replacements are tested" rule. Redirects only get removed in the final staged step, after testing. |
| Incorrect active bottom tab on `/pet-sitter` | Explicit one-line addition to `BottomTabBar`'s `isActive` logic (see Phase 3); covered by a manual test pass in the staged plan (step 11) before this ships. |
| Loss of selected pet context | Not applicable — no global pet-context state is being introduced, so there's nothing new to lose. Existing URL-param-based fetching is unchanged. |
| Unnecessary data refetching | `AppShell` wrapping the routes doesn't change route-level data fetching — each page's existing `useEffect`/query logic is untouched. `AskWyskerSheet` opening/closing doesn't trigger a route change, so it can't trigger a refetch of the underlying page. |
| Back button returning to the wrong place | The one new case — hardware/mobile back while `AskWyskerSheet` is open — needs explicit handling so it closes the sheet rather than navigating the underlying page away. Mitigation: reuse the same `history.pushState`-free local-open-state pattern `DailyCheckInSheet` already uses (a plain boolean, not a route), so back-button behavior for the underlying page is completely unaffected by the sheet ever having been open. |
| Pet Sitter permission regressions | None expected — `PetSittingSection.jsx` and its RLS-backed data calls are completely unchanged; only its mounting location changes (household page instead of a pet tab). Mitigation: staged plan tests the existing multi-pet sit creation/sitter-invite flow at the new location before removing the old one. |
| AI losing route/pet context | Context is read at the moment `AskWyskerAction` is tapped (see Phase 3), not stored ahead of time — nothing to lose. Mitigation: cross-screen manual test pass (open AI from Trends, Weight, Home, Menu) in staged step 11. |
| Duplicate navigation paths | This refactor's entire point is removing the current duplicates (CareMenu vs. PetProfileContent cards; Menu vs. household-level Pet Sitter/AI). Mitigation: the "remove obsolete navigation only after replacements pass testing" ordering (staged step 12) prevents a window where a duplicate is removed before its replacement is proven. |
| Inaccessible header controls | New `AppHeader` buttons (Ask Wysker, Notifications) need the same accessibility baseline the rest of the app already has (44px min tap targets, real focusable elements, `aria-label`s) — matches existing `BottomTabBar`/`NotificationBell` conventions already in the codebase, not a new pattern. |
| Onboarding accidentally entering the shell | Onboarding (`/pet/:petId/onboarding`) is not wrapped in `AppShell` — it stays exactly where it is today, structurally outside the shell, same as auth routes. No code path currently routes into onboarding from inside `AppShell`'s route tree in a way that would change; explicit test in staged step 11 confirms this. |
| Hidden or orphaned screens | This spec explicitly resolves every currently-orphaned screen this pass touches (History→Timeline, Insurance/Documents deleted, PetProfile.jsx→redirect, About→Menu row) rather than leaving new orphans. `PetProfileTabs`' `ai`/`petsit` tabs are the one remaining case flagged in Open Questions rather than silently resolved. |

---

## Phase 5 — Staged Implementation Plan

Each step is independently testable and independently shippable; nothing
later in the list assumes an earlier step has been "cleaned up" yet.

1. **Introduce `AppShell`** wrapping the existing `<Routes>` tree in
   `App.jsx`, with no visual or behavioral change yet — this step only
   proves the wrapper doesn't break anything.
2. **Move `BottomTabBar` inside `AppShell`** (structural only — it already
   renders in the same visual position; this step just changes where in the
   component tree it lives).
3. **Add `AppHeader`** (Brand + `NotificationAction` only, reusing
   `NotificationBell.jsx` — no AI button yet) so the persistent-header piece
   can be verified in isolation first.
4. **Preserve all current routes** — no route is deleted or changed yet at
   this step; this is a checkpoint to confirm nothing regressed from steps
   1–3 alone.
5. **Add `AskWyskerAction` + `AskWyskerSheet`**, pet-scoped mode only
   (reusing `PetAIChat`/`PetAIInsights` unchanged), wired up from pet-specific
   screens first. General mode (new prompt variant) added in this same step
   since you approved building it now, but tested separately from pet-scoped
   mode.
6. **Add `/pet-sitter`** (new thin page wrapping `PetSittingSection` with no
   `petId`), linked from a new Home section — `/settings/pet-sitter` and the
   `petsit` tab remain live in parallel at this point, not yet redirected.
7. **Add the Trends `NavCard` to `PetProfileContent`'s expanded state**
   (currently reachable only via Wellbeing chips) — improves Pets' Trends
   discoverability without touching Trends itself.
8. **Confirm Trends stays reachable from Pets** — verification step, no
   code change (already true today; step 7 makes it more discoverable, this
   step is the test pass confirming both paths work).
9. **Simplify Menu** — remove Pet Sitter/AI rows (or demote per Open
   Questions resolution), add an About row. `/settings/ai` and
   `/settings/pet-sitter` still resolve at this point, just no longer
   linked from Menu directly.
10. **Add redirects/compatibility routes** for every retired path
    identified in Phase 2 (`/pet/:petId` → `/pets`, `?tab=history` →
    Timeline, `?tab=ai`/`?tab=petsit` → their new homes, `/settings/ai` →
    header AI, `/settings/pet-sitter` → `/pet-sitter`).
11. **Test all entry and back-navigation paths** — the full manual pass:
    every route in Phase 2's table, AI opened from every listed screen with
    context verified, Pet Sitter's active-tab behavior, browser back at each
    redirect, onboarding/auth confirmed still outside the shell.
12. **Remove obsolete navigation** — only now: delete `CareMenu.jsx`,
    `AIMenu.jsx`, `PetSitterMenu.jsx`, `Insurance.jsx`, `Documents.jsx`,
    and the retired `TabsContent` blocks in `PetProfileTabs.jsx`, since every
    replacement has been tested in step 11.

### Estimated lift by phase

*(Rough sizing for planning purposes only — not a committed schedule.)*

| Phase | Lift | Why |
|---|---|---|
| 1–4 (Shell scaffold + header, no route changes) | Small | Mostly structural wrapping of existing, unchanged components |
| 5 (Ask Wysker global action) | Medium | New sheet component + the one genuinely new piece of logic (general-mode prompt) |
| 6 (Pet Sitter → Home) | Small | Zero new sitter logic — new thin page + one Home section + one `BottomTabBar` line |
| 7–8 (Pets discoverability) | Small | One new NavCard, no new screens |
| 9 (Menu simplification) | Small | Row list edits only |
| 10–11 (Redirects + full test pass) | Medium–Large | Breadth, not depth — many small redirects, but a genuinely thorough manual test matrix (every route × every entry point) |
| 12 (Cleanup/removal) | Small | Deletion only, after 11 has already proven safety |
| *(Open-question-dependent: History→Timeline merge, `ai`/`petsit` tab retirement)* | Medium | Depends on how much Timeline's existing query needs to be extended, and on your answer to the tab-retirement question below |

---

## Technical Spec

- **Schema:** No schema changes. No migration needed anywhere in this spec.
- **Components/files touched:**
  - New: `src/components/AppShell.jsx`, `src/components/AppHeader.jsx`, `src/components/AskWyskerSheet.jsx`, `src/pages/PetSitter.jsx` (thin wrapper around `PetSittingSection`)
  - Modified: `src/App.jsx` (wrap routes in `AppShell`, add `/pet-sitter` route, add redirect routes), `src/components/BottomTabBar.jsx` (one-line `isActive` addition for `/pet-sitter`), `src/components/PetProfileContent.jsx` (add Trends NavCard), `src/pages/PetProfileTabs.jsx` (drop `history`/`ai`/`petsit` `TabsContent` blocks per Open Questions resolution, keep `trends` redirect stub), `src/pages/Settings.jsx` (`MENU_ITEMS` edits), `src/pages/Timeline.jsx` / `src/lib/checkin/petProfileClient.js`'s `getTimelineEvents()` (extend to cover History's data — see below), `src/pages/PetOnboarding.jsx` + `src/pages/AcceptInvite.jsx` (repoint their post-completion navigation target from `/pet/:petId` to `/pets`)
  - Removed (step 12 only, after testing): `src/components/CareMenu.jsx`, `src/pages/AIMenu.jsx`, `src/pages/PetSitterMenu.jsx`, `src/pages/Insurance.jsx`, `src/pages/Documents.jsx`, `src/pages/PetProfile.jsx` (if retirement is confirmed — kept as a thin redirect component in the interim, not deleted immediately), `src/components/LogHistory.jsx` (if fully superseded by the Timeline merge)
  - `src/api/aiClient.js`: additive only — a new general-context prompt-building helper, alongside the existing `invokeAI()`, not replacing it
- **API / edge functions:** No changes to `supabase/functions/ask-vet-assistant` — it already accepts an arbitrary `prompt` string; the general-mode system prompt is built client-side, same as today's pet-scoped prompt in `PetAIChat.jsx`.
- **History → Timeline merge detail:** `Timeline.jsx`'s `getTimelineEvents()` currently assembles from `daily_check_ins`, `medications` (start date only), `vaccinations`, and `symptom_logs`. `LogHistory.jsx` (the current `history` tab) shows a different, more granular chronological list of raw symptom logs. These overlap but aren't identical — at implementation time, someone needs to diff exactly what `LogHistory.jsx` shows that `getTimelineEvents()` doesn't yet surface, and extend the query rather than assume a 1:1 replacement. This is real, if modest, implementation work — not a blind redirect. Flagged here so it isn't underestimated.
- **Constraints from CLAUDE.md / locked decisions respected:** No 0–100/0–10/Stable-Declining-Monitor scoring language is introduced anywhere in this spec (none of this work touches scoring). No direct Supabase calls are introduced in any new component — `PetSittingSection`, `PetAIChat`, and all reused data-fetching go through the existing `entities`/`aiClient` data layer, unchanged. Frontend deploy remains manual (Lynn), unaffected by this spec. Backend surface area is unchanged (no new migrations, no new Edge Functions), so the "push to all three Supabase projects" concern from CLAUDE.md doesn't apply to this work.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** CareMenu vs. PetProfileContent's nav-card list (already documented above, being resolved by this spec). `/settings/pet-sitter` vs. the `petsit` tab (being resolved). `/settings/ai` vs. the `ai` tab (being resolved).
- **Technical debt nearby:** `PetProfileTabs.jsx`'s hero header still has its own local `careOpen` state wiring CareMenu — retired along with CareMenu itself in step 12. `WeightQuickLogSheet`'s timezone bug (punch list P4) is nearby but unrelated to navigation — not touched by this spec.
- **Orphaned features nearby:** Insurance and Documents (resolved — deleted per your decision). The standalone `/pet/:petId` page (resolved — redirected per your decision). `About.jsx` (resolved — gains a Menu row).
- **Punch list / known issues in this area:** Punch list P3 item "CareMenu is intended to be deprecated... but is still live in code" — this spec is the resolution. Punch list P4 item "The standalone Pet Profile route is unreachable through normal in-app navigation" — this spec is the resolution. Punch list P4 item "Pets-tab's Wellbeing chips don't launch Daily Check-In — they navigate to Trends" — unaffected by this spec (that behavior is preserved as one of the two paths to Trends from Pets).

## Non-Goals

- No visual redesign of any screen, card, or component.
- No rewrite of Daily Check-In, Catch-Up, Vibe/symptom-count scoring, Trends calculations, Vet Export generation, medication/vaccination logic, sitter access rules/RLS, or AI response generation.
- No database schema or migration changes.
- No changes to the onboarding wizard's internal card flow or save/resume mechanism — only its two post-completion navigation *targets* change.
- No business-portal (`/admin`) build — this spec only confirms the new `AppShell` structure doesn't block one being added later, outside the Home/Pets/Menu tree.
- No Capacitor/native-app work (unrelated, tracked separately on the punch list).

## Decisions (resolved 2026-07-27)

1. **`PetProfileTabs`'s `ai` and `petsit` tabs — retired, confirmed.** There is no replacement tab — the concept of a per-pet "AI tab" or "Sitter tab" page goes away entirely. `PetAIChat`/`PetAIInsights` become the content rendered inside the global `AskWyskerSheet` (opened from the header, pre-scoped to whichever pet you were viewing). Pet Sitter management, for any single pet or combination of pets, happens only through the new household `/pet-sitter` page reached from Home — there is no pet-scoped sitter screen anymore.
2. **Menu's Pet Sitter row — dropped entirely.** No secondary link. Pet Sitter's only entry point is Home. `/settings/pet-sitter` becomes a redirect to `/pet-sitter` (kept alive for old links, not linked from Menu itself). Same for AI — no Menu row of any kind; `/settings/ai` becomes a redirect into the global Ask Wysker sheet.
3. **`/pet/:petId` retirement — lands on Pets with the card collapsed, not expanded.** Both callers (onboarding "Start Check-in," accept-invite redirect) now land on `/pets` with the target pet scrolled into view but in its normal collapsed state — same as arriving at Pets any other way, just scrolled to the right pet. This is actually simpler to build than the auto-expand version: `ExpandablePetProfileCard` needs its existing `cardRef`/`highlighted` props (for scroll-into-view + a brief visual highlight) but not `defaultExpanded` — no need to evaluate whether auto-expand-on-load behaves correctly, since expansion stays a manual "Show More" tap either way.
4. **Timeline/History merge — confirmed, one destination.** `LogHistory.jsx`'s content folds fully into `Timeline.jsx`; `LogHistory.jsx` retires once the merge is verified complete (Technical Spec's data-completeness check governs when that verification is done). No "History" destination survives anywhere in the app — Timeline is the single chronological record.

---

Spec approved with the above resolved. Phase 5's staged plan is the
execution order — nothing in Phases 1–4 requires further approval, since
they're inventory/analysis, not proposed changes.

## Implementation Summary (2026-07-28)

All 12 steps of the staged plan shipped. What's actually true of the app now:

**New, permanent structure:**
- `AppShell.jsx` / `AppHeader.jsx` — persistent header (brand + Ask Wysker + notifications) and route-driven content area, composed inside `ProtectedRoute.jsx` (a new `shell` prop, default `true`) rather than wrapping the whole route tree — so it only ever renders for authenticated, in-shell routes. Onboarding (`shell={false}`) and all public auth routes correctly render with no header/bottom nav, verified live.
- `AskWyskerSheet.jsx` / `AskWyskerContext.jsx` / `AskWyskerAction.jsx` / `AskWyskerRedirect.jsx` — the global AI overlay. Pet-scoped mode reuses `PetAIChat`/`PetAIInsights` completely unchanged; general mode (no pet in context) uses a new, additive `GeneralAskWyskerChat.jsx` with a household-wide system prompt. Context (`petId`/`screen`) is derived from the URL via `src/lib/petScreenContext.js`, not `useParams()` (documented technical deviation from the original plan — functionally equivalent, `AppHeader` isn't a descendant of the matched pet route).
- `/pet-sitter` (`PetSitter.jsx`) — household-level page, thin wrapper around the existing `PetSittingSection` with no `petId`. Zero new sitter logic. `BottomTabBar` marks Home active while it's open.
- Trends is now reachable from Pets two ways: the pre-existing Wellbeing chips, and a new `NavCard` in `PetProfileContent`'s expanded state.
- Menu simplified to Notifications/About/Privacy/Terms/Settings/Support — Pet Sitter and AI rows removed entirely, no secondary links.
- `BottomTabBar`'s Menu tab now correctly stays active across all of Menu's own subpages (Account, Notifications, Privacy, Terms, Preferences, Support, About) — this was actually broken before this pass (found while writing tests, not something this refactor introduced) and is now fixed and unit-tested.

**Retired, with compatibility redirects (nothing deleted before its replacement was tested):**
- `/pet/:petId` → `/pets` (pet scrolled into view, collapsed)
- `?tab=history` → `/pet/:petId/timeline` (its data — symptom-log detail — now shows directly in Timeline's event rows instead of a separate screen; the pre-existing check-in mislabeling bug, `status === 'normal'` against a retired enum value, was fixed in the same pass since it was the exact line being touched)
- `?tab=petsit` → `/pet-sitter`
- `?tab=ai` → global Ask Wysker sheet, pet-scoped
- `/settings/pet-sitter` → `/pet-sitter`
- `/settings/ai` → global Ask Wysker sheet, general mode

**Deleted outright (no redirect needed — confirmed dead, zero real entry points):**
- `CareMenu.jsx` and its mount points (hamburger icon + state) in `PetProfileTabs.jsx` and `VetExport.jsx`
- `AIMenu.jsx`, `PetSitterMenu.jsx` (superseded by the redirects above)
- `Insurance.jsx`, `Documents.jsx`, and their routes (`/pet/:petId/insurance`, `/pet/:petId/documents`) — these now correctly 404, which is the intended outcome for placeholders that had zero links anywhere in the app to begin with
- `LogHistory.jsx` (superseded by the Timeline merge)

**Verification:** Automated — full lint pass, `npm test` (94/94 passing, including two new unit-test files covering the active-tab logic and the Ask Wysker URL-context parser), and a production build, all clean after every step. Live — extensive manual testing with real credentials against `wysker-watch-dev`, covering every redirect, the App Shell's presence/absence on every route type, Pet Sitter creation, and Ask Wysker in both modes.

**Bugs found and fixed during this work (not part of the original plan, discovered while testing it):**
- Ask Wysker not actually opening from `/settings/ai` and `?tab=ai` — root cause was `App.jsx`'s pre-existing `<Routes key={location.pathname}>` fully remounting the App Shell (including `AskWyskerContext`'s state) on every route change, which raced against `AskWyskerRedirect`'s "open the sheet, then navigate" sequence. Fixed by carrying the open-sheet intent through React Router navigation state, which survives the remount.
- `BottomTabBar`'s Menu tab not staying active on Menu's own subpages (see above).

**Bugs found, logged on the punch list, deliberately not fixed here (owner's call — separate session):**
- `EditPetSheet.jsx`'s slide-in panel renders permanently off-screen (severe, pre-existing, isolated to that one file)
- Pets screen showing every pet duplicated on the shared test account (pre-existing, not yet confirmed as data vs. rendering)
- `navigateToLogin()` console error on protected routes while logged out (pre-existing)
- Ask Wysker's sheet shows which screen it opened from but doesn't feed that into the AI prompt, only which pet (deliberate scope boundary, not a bug)
- Persistent header font and the pet-detail hero-banner treatment — real visual-consistency concerns raised during testing, explicitly out of this spec's non-goals (not a visual redesign); needs its own decision/spec before any work starts

See `docs/launch-punch-list.md` for the authoritative, up-to-date status of every item above.
