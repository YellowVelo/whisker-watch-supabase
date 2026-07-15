0008 Navigation & Information Architecture_V4.md
Purpose

This document defines how users navigate Wysker Watch, how information is organized, and how the app supports its primary goal:

Help owners quickly understand how their pets are doing today while preserving a complete health story over time.

This is an as-built document. It describes the navigation and information architecture actually implemented and shipped, not an aspirational or planned state. Where a section names a screen, route, or component, that thing exists in the codebase today. Where something is a known placeholder or a deliberate deviation from an earlier version of this document, that is called out explicitly.

Revision note: originally written for the Navigation Refresh feature (Home/Pets/Menu, three-destination IA). Updated in place (not re-versioned) after a follow-on rebuild added: personalized Home greeting and reordered check-in cards; per-source error handling on Pets; a Trends screen (per-pet metric charts with range selection); a real Timeline (previously a placeholder); a restructured Menu with Account/Notifications/Privacy/Preferences/Support sub-pages and a dedicated Pet Profiles directory; and profile timezone settings. The three-destination bottom nav itself is unchanged.

Navigation Philosophy

Every navigation decision supports one or more of these goals:

Make today's health obvious.
Reduce owner effort.
Present summaries before details.
Preserve complete historical context.
Never require owners to think like veterinarians.
Build around observations instead of diagnoses.

Primary Navigation

Bottom Navigation consists of exactly three destinations, implemented in `src/components/BottomTabBar.jsx`:

Home (`/`)
Pets (`/pets`)
Menu (`/settings` — the route path was kept for backward compatibility; only the label changed)

No other persistent navigation item exists. The nav bar is `role="navigation"` with `aria-current="page"` on the active link (not the ARIA tabs pattern). The Pets tab is marked active for both `/pets` and any `/pet/:id...` route.

Home

Purpose: "How are my pets today?"

Implemented in `src/pages/Home.jsx`. Shows:

- A personalized greeting via `buildGreeting(user.first_name, hour)` (`src/lib/greeting.js`) — "Good morning/afternoon/evening, {First Name}" if a first name is on file, otherwise a bare time-of-day greeting — followed by "How are your pets today?"
- A notification bell (`NotificationBell.jsx`, backed by `getUnreadCount()` in `src/lib/notifications/notificationClient.js`)
- One `WellnessCard` per active (non-memorial) pet — the score-ring tile — and, separately, a "Today's Check-Ins" list of `CheckInCard` rows, ordered by `orderCheckInCards()` (`src/lib/checkin/ordering.js`): pets with no check-in yet surface first, then completed ones, each group ordered by pet creation date.

**Both `WellnessCard` and `CheckInCard` link out to a pet's Trends screen (`/pet/:petId/trends`), not the flat Pet Profile.** Confirmed as an intentional product decision, not a discoverability regression: Pets goes directly to Trends too, and Pet Profile is treated as an entirely separate destination, reached only via Menu → Pet Profiles (see below). `CheckInCard` previously pointed at the legacy tab-based trends view (`?tab=trends`) instead of matching `WellnessCard` — that mismatch has since been fixed so both link to the same place.

Card actions (Everything Normal / Something Changed / Skip Today) still launch the existing Daily Check-In flow, unchanged from the original Navigation Refresh.

Home shows active pets only — memorial (Rainbow Bridge) pets and sitter-shared pets are not shown here, same as before.

Pets

Purpose: "Tell me everything about my pets" — browsing and long-term management, not daily interaction.

Implemented in `src/pages/Pets.jsx`. Shows, in order:

1. Active pets
2. Shared with Me (pets the signed-in user has sitter access to, via `getSharedPetsForUser()` in `src/lib/petsClient.js`)
3. Rainbow Bridge (memorial pets)

Each active/shared pet row shows photo/species icon, name, species, breed, computed age, today's Wellness Score, trend, and an active-medication-count badge (via `getActiveMedicationCountsForPets()` in `petsClient.js`).

**Pet rows now link to `/pet/:petId/trends`**, not the flat Pet Profile — same change as Home's `WellnessCard`. This is consistent (Pets doesn't have the WellnessCard/CheckInCard split-destination bug Home has).

Per-source error handling: pets list, shared-pets, wellness scores, check-ins, and medication counts are fetched independently (the latter three via `Promise.allSettled`), so a failure in one (e.g. wellness scores) degrades gracefully (score shows as "—") without hiding the pet list or any other section. A hard failure in the core pets-list fetch is the only one that blocks the page.

An "Add a Pet" entry point (the `+` button, and the empty-state CTA) opens `AddPetDialog`, returning to `/pets` on completion via its `returnTo` prop.

Pet Profile

Purpose: the permanent, detailed record for one pet.

Implemented in `src/pages/PetProfile.jsx` (route `/pet/:petId`). **This is no longer the primary link target from Home or Pets** (see above) — its only remaining direct entry points are the Menu's "Pet Profiles" directory (below) and deep links (e.g. onboarding completion, CareMenu's non-Trends items). It still exists in full and is not deprecated.

Header
Photo, name, species, breed, computed age, conditions ("diagnoses"), today's Wellness Score, trend, "last updated." Share, Edit, and Delete Pet are always available, including for memorial pets. "Move to Rainbow Bridge" is the one action gated by `!isMemorial` (a memorial pet obviously can't be moved to memorial again). Delete is disabled while offline.

Wellness Summary
Five score rings — Wellness, Appetite, Energy, Symptoms, Weight — via `getWellnessRingScores()` and `getWeightSummary()` (`src/lib/checkin/petProfileClient.js`). Appetite/Energy/Symptoms now read from `daily_check_ins`/`observations` (not `symptom_logs` — see Data Model_V2.md §7); Weight still reads/writes `symptom_logs.weight_grams` via a quick-log sheet, the one remaining write path into that table.

Stacked sections, in this order, all using a shared `NavCard` component (icon, title, subtitle, value, link-or-button, and a built-in "Unable to load" error state):
1. Baseline
2. Conditions
3. Medications
4. Food
5. Vaccinations
6. Weight
7. Observations — links to `/pet/:petId/symptoms` (the full log), not to Trends
8. Timeline — links to `/pet/:petId/timeline`
9. Health Records — bloodwork count (`getHealthRecordsCount()`) plus Documents/Export links

The old inline 30-day recharts trend charts and their Appetite/Energy/Symptoms/Weight quick-log bubbles (present in the original Navigation Refresh build) have been removed from this screen — that history now lives on the Trends screen instead.

Trends (new)

Purpose: a per-pet, range-selectable trend view — the "how has this been going" complement to Home's "how is this today."

Implemented in `src/pages/PetTrends.jsx` (route `/pet/:petId/trends`), backed by `src/lib/checkin/trendsClient.js`, inspired by `01 Features/0010 Trends Feature Specification.txt`. Reachable from: Home's `WellnessCard` and `CheckInCard` (both now consistent), every pet row on Pets, and CareMenu's "Trends" item — not from Pet Profile directly, which has no card linking here (see below).

Header (photo, name, breed, sex, an export/calendar button, an overflow menu reusing `CareMenu`) and a second-level sub-tab row: **Overview** (default), **Trends**, **Patterns**, **Compare**.

- **Overview** — the range selector (24H/7D/30D/90D/1Y) plus the five metric cards (Wellness Score, Appetite, Water Intake, Energy, Weight, Insight Summary) described below.
- **Trends** — not a placeholder: this is the *legacy* per-metric `symptom_logs` chart set (the `SymptomTrends` component, previously `PetProfileTabs`' own "Trends" tab), kept alive here rather than deleted, since Overview's cards read from `observations`/`wellness_scores`, not `symptom_logs` (Data Model_V2.md §7) — the two chart sets show different underlying data. Fetched lazily, only when this sub-tab is first opened.
- **Patterns**, **Compare** — "coming soon" placeholders, per `0010`.

`PetProfileTabs.jsx`'s own former "Trends" tab now redirects to `/pet/:petId/trends?section=trends` (landing directly on this sub-tab) instead of duplicating the chart.

**Entry point differs from `0010`'s own Navigation section**, which states entry is "Pet Profile → Trends tab" with "Back returns to Pet Profile." As shipped — and confirmed as intentional — Trends is reached directly from Home/Pets/CareMenu, bypassing Pet Profile entirely, and the back button uses `navigate(-1)` (returns to wherever the user actually came from). Pet Profile is treated as a genuinely separate destination from Trends, not a required waypoint.

Range selector: 24H, 7D, 30D, 90D, 1Y (`RANGE_OPTIONS`/`RANGE_DAYS` in `trendsClient.js`). `daily_check_ins`/`wellness_scores` are one row per calendar day, so "24H" is treated as a short trailing window for chart context rather than a literal last-24-hours; the headline number always compares today vs. yesterday regardless of range.

Cards:
- Wellness Score — chart + current score + status label + delta vs. yesterday (`getWellnessScoreTrend`)
- Appetite, Water Intake, Energy — one shared `ObservationCard` pattern (`getObservationTrend`), each point in one of four states: `missing` (no check-in that day — a real gap, not a flat value), `skipped` (the day was explicitly skipped — visually distinct from missing), `normal` (a scorable check-in with no observation logged for this metric), or `observed` (an actual logged deviation, bucketed on a 5-point Much Less/Less/Normal/More/Much More scale with green/gray/amber/red semantic coloring)
- Weight — from `symptom_logs.weight_grams` (`getWeightTrend`); delta compares the two most recent entries, since no true baseline exists yet (same documented limitation as Pet Profile's Weight card)
- Insight Summary — one AI-generated paragraph (`getInsightSummary()`), built from the other four cards' already-fetched data (no extra queries), reusing the same `invokeAI` client used by `PetAIInsights.jsx`. Requires at least 2 non-skipped check-ins in the last 10 days, or shows "Complete more check-ins to unlock AI insights" instead of calling the AI. Not persisted — regenerated each time, same as `PetAIInsights`.

None of this required `pet_baselines` to be populated — it remains unused (Data Model_V2.md §6).

Analytics: `trends_viewed` (`{ pet_id }`, once per successful pet load), `trends_range_changed` (`{ pet_id, range }`, on user-initiated range taps only — not the initial default), and `trends_section_changed` (`{ pet_id, section }`, same rule) — added specifically to answer two open questions: whether 1Y range ever gets used, and whether the legacy "Trends" sub-tab or the Patterns/Compare placeholders get any engagement at all.

Timeline

Purpose: "the pet's complete chronological health story" — no longer a placeholder.

Implemented in `src/pages/Timeline.jsx` (route `/pet/:petId/timeline`), backed by `getTimelineEvents()` (`src/lib/checkin/petProfileClient.js`), which assembles a single, most-recent-first list from four tables: `daily_check_ins` (check-in events), `medications` (medication started/changed), `vaccinations` (administered), `symptom_logs` (legacy symptom entries). The same function/count backs both this page and the Timeline count referenced from Pet Profile's Timeline card.

Menu

Purpose: owner/account-level functionality only. No pet-specific action lives here directly (pet management lives on Pet Profile; browsing pets lives on the new Pet Profiles directory below, reached from Menu).

Implemented in `src/pages/Settings.jsx` (route `/settings`, labeled "Menu"). Restructured since the original Navigation Refresh:

- A clickable user-summary card at the top (photo/initial, display name via `getDisplayName()`, email, an account-type badge — Production/Test/Demo) linking to Account.
- Five `MenuListRow` entries: **Pet Profiles** (`/settings/pet-profiles`), **Notifications** (`/notifications`), **Privacy** (`/privacy`), **Settings** — labeled "Settings" in the UI but routes to `/preferences` (`/preferences`), **Support** (`/support`).
- Test Tools (Seed Test Data, Reset Test Account) — unchanged, only visible to `account_type = 'test'`.
- Account actions: Sign Out, Delete Account & All Data — unchanged two-step-confirm flows, now unified under one `activeDialog` state so two confirmation dialogs can never stack.
- A static "your data is encrypted" security footer.

Pet Profiles (new)

Purpose: browse every pet you can access, then open its full Pet Profile — **this is now the primary/exclusive path to the flat `/pet/:petId` screen**, since Home and Pets both route to Trends instead.

Implemented in `src/pages/PetProfilesMenu.jsx` (route `/settings/pet-profiles`, reached from Menu). Lists owned pets plus sitter-shared pets (both via `getSharedPetsForUser()`/`entities.Pet.list`), each row showing photo/icon, name, breed-or-species, and a "· Shared with you" suffix for shared pets. Tapping a row goes to `/pet/:petId`.

Account (new)

Purpose: owner identity — name and timezone.

Implemented in `src/pages/Account.jsx` (route `/account`, reached from Menu's user-summary card). A real, functional form, not a placeholder:
- First Name / Last Name (editable, 100 char max each) and Email (read-only)
- Timezone: a dropdown of all IANA timezones (`listAvailableTimezones()`, `src/lib/timezone.js`), auto-detected on first load via `Intl.DateTimeFormat` (`detectTimezone()`) and never silently overwritten again once set (`shouldAutoPopulateTimezone()`); a "return to automatic detection" link appears once a timezone has been manually chosen. Fires a `timezone_manual_changed` analytics event on manual override.
- Save/Cancel, both disabled unless the form is dirty.

Notifications (new)

Purpose: an in-app notification list — not a push-notification settings screen.

Implemented in `src/pages/Notifications.jsx` (route `/notifications`), backed by `entities.Notification` (the `notifications` table, see Data Model_V2.md §3.21) via `src/lib/notifications/notificationClient.js`. Unread rows are visually distinct (blue tint); tapping a row marks it read. Currently the only notification type generated is `ownership_transfer` (fired by the `delete-account` Edge Function when a co-owned pet's primary owner deletes their account).

Privacy, Preferences, Support (new — placeholders)

`src/pages/Privacy.jsx`, `src/pages/Preferences.jsx`, `src/pages/Support.jsx` (routes `/privacy`, `/preferences`, `/support`) are explicit stubs — each has a code comment stating its subject "isn't specced yet" and renders a static "coming soon" screen with a back button. These exist so Menu's row list doesn't dead-end, per Navigation Refresh's "navigate to a placeholder screen rather than removing the section" precedent for Timeline — now itself superseded since Timeline became real.

CareMenu (in-context quick nav)

`src/components/CareMenu.jsx` — slide-out panel from Pet Profile and PetProfileTabs. Its "Trends" item points to `/pet/:petId/trends` (defaulting to the Overview sub-tab). Still includes History/Meds/Baseline/Food/Labs/Vaccines/Sitter/AI (`PetProfileTabs` tabs) plus a global Menu/About link. `PetProfileTabs`' own former "Trends" tab now redirects to the Trends screen's "Trends" sub-tab rather than rendering its own copy (see the Trends section above).

Routing (as implemented in `src/App.jsx`)

Public: `/login`, `/register`, `/forgot-password`, `/reset-password`

Protected:
```
/                              Home
/notifications                 Notifications
/pets                           Pets
/pet/:petId                     Pet Profile
/pet/:petId/trends              Trends
/pet/:petId/timeline             Timeline
/pet/:petId/profile             PetProfileTabs (?tab=..., includes a legacy "trends" tab)
/pet/:petId/onboarding           Pet Onboarding wizard
/pet/:petId/symptoms             Full symptom log history
/pet/:petId/food                 Food history
/pet/:petId/insurance            Insurance
/pet/:petId/documents            Documents
/pet/:petId/export               Vet export
/about                          About
/settings                       Menu
/settings/pet-profiles          Pet Profiles directory
/account                        Account
/privacy                        Privacy (placeholder)
/preferences                    Preferences (placeholder)
/support                        Support (placeholder)
```

Routing diagram:
```
Home ──────────────┐
                    ├──► Trends (WellnessCard) / PetProfileTabs?tab=trends (CheckInCard — inconsistent, see above)
Pets ───────────────┘

Menu ──► Pet Profiles ──► Pet Profile ──┬──► Baseline / Conditions / Medications / Food / Vaccinations / Weight
                                          ├──► Observations ──► /pet/:id/symptoms
                                          ├──► Timeline ──► /pet/:id/timeline
                                          └──► Health Records ──► Documents / Export

Menu ──► Account (name, timezone)
Menu ──► Pet Sitter
Menu ──► AI
Menu ──► Notifications
Menu ──► Privacy / Preferences / Support (placeholders)

CareMenu (from Pet Profile / PetProfileTabs) ──► Trends, and every PetProfileTabs tab
```

Information Hierarchy

Within Pet Profile, current information precedes historical information: header status/score and the Wellness Summary rings, then Baseline/Conditions (identity and current state), then day-to-day management sections (Medications/Food/Vaccinations), then trend/history sections (Weight/Observations/Timeline/Health Records). Trends itself follows the same principle at the metric level: current value/status before the historical chart.

Multi-Pet Support

Home renders one Wellness Card + one Check-In Card per active pet; Pets renders every pet (active, shared, memorial) in one scrollable list, each data source failing independently. Neither has a hardcoded pet-count limit.

Accessibility

Bottom nav uses real `<a>`-equivalent `Link` elements (not custom tab widgets), `aria-current="page"` for the active destination, and 44px-minimum tap targets. Trend/status is always paired with a text label, never color alone — Trends' gap/skipped/normal/observed states are distinguished by more than color for the same reason.

Known deviations and as-built anomalies

- V2 (pre-Navigation-Refresh) described a 4-destination nav (Home / Insights / Pets / Menu). The shipped architecture has exactly three destinations; there is still no bottom-nav tab for Trends/Insights — it's reached from within Home/Pets/CareMenu, per the original decision.
- Pet Profile is no longer directly reachable from Home or Pets — only from Menu → Pet Profiles, or deep links. Confirmed intentional: Home/Pets → Trends and Pets → Pet Profile are treated as two genuinely separate paths, not a discoverability regression. This does mean neither this document's original routing diagram nor `0010 Trends Feature Specification.txt`'s own Navigation section ("Home → Pets → Pet Profile → Trends. Back returns to Pet Profile.") describes the shipped entry path — both are superseded by this confirmed decision.
- The `01 Features/` folder was flattened and renumbered since this document's original version (no more `Navigation/`, `Pet Management/`, `Wellness Score/`, `Insights/` subfolders — everything is now `01 Features/000N Name.md`, up to `0012 User Profile.md`). Cross-references elsewhere in this document to feature spec files use the current flat paths.

Summary

Wysker Watch's shipped navigation still has three destinations — Home for daily engagement, Pets for browsing, Menu for the owner's account — but the center of gravity for "see how a pet is doing over time" has shifted from the flat Pet Profile to a dedicated Trends screen, while Pet Profile itself became the home for identity/management and is now reached primarily through Menu's Pet Profiles directory rather than directly from Home or Pets.
