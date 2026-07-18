0008 Navigation & Information Architecture_V4.md
Purpose

This document defines how users navigate Wysker Watch, how information is organized, and how the app supports its primary goal:

Help owners quickly understand how their pets are doing today while preserving a complete health story over time.

This is an as-built document. It describes the navigation and information architecture actually implemented and shipped, not an aspirational or planned state. Where a section names a screen, route, or component, that thing exists in the codebase today. Where something is a known placeholder or a deliberate deviation from an earlier version of this document, that is called out explicitly.

Revision note: originally written for the Navigation Refresh feature (Home/Pets/Menu, three-destination IA). Updated in place (not re-versioned) after a follow-on rebuild added: personalized Home greeting and reordered check-in cards; per-source error handling on Pets; a Trends screen (per-pet metric charts with range selection); a real Timeline (previously a placeholder); a restructured Menu with Account/Notifications/Privacy/Preferences/Support sub-pages and a dedicated Pet Profiles directory; and profile timezone settings. The three-destination bottom nav itself is unchanged.

**Updated in place again (2026-07-18).** The previous revision described a snapshot that was itself already stale by the time it was written/imported (2026-07-15) — most consequentially, the dedicated "Pet Profiles" Menu directory it describes as the primary path to Pet Profile **no longer exists at all** (no route, no component file), the Wellness Score/5-ring Pet Profile header it describes was retired along with Wellness Score V1/Health Score V2 in favor of the Vibe + Symptom Count model (migration 0026, 2026-07-13), `WellnessCard`/`CheckInCard` were replaced by `PetSummaryCard`/`CheckInStatusBanner`, and the Menu item list is missing three items (Pet Sitter, AI, Terms of Service) added after this document's prior revision. Every section below was re-verified against current code as of this pass; sections not flagged as corrected were confirmed still accurate.

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
- One `PetSummaryCard` per active (non-memorial) pet, ordered by most-recently-added pet first (`entities.Pet.list('-created_date')`, not alphabetical and not by check-in status) — **not** `WellnessCard`, which no longer exists. Each card shows identity, condition/medication chips (or a "Healthy" badge), a Vibe icon + label for today's status, and per-attribute direction chips (Health group + Weight) — no numeric score or ring of any kind. Directly beneath each card, a separate one-line `CheckInStatusBanner` row — **not** `CheckInCard`, which no longer exists — shows either a tappable "Start {pet}'s Daily Check-In" prompt or today's completed status.

**Both `PetSummaryCard` and `CheckInStatusBanner` link out to a pet's Trends screen (`/pet/:petId/trends`), not the flat Pet Profile** — this part of the previous revision's finding still holds. Pet Profile is not reachable by tapping anything on Home; see the Pet Profile section below for its real, current entry points (a "Pet Profiles" Menu directory previously documented here no longer exists).

Card actions launch the existing Daily Check-In flow, opened from the status row (not buttons on the card itself): **Great Day / Off Day / Tough Day / Skip** — not "Everything Normal / Something Changed / Skip Today," which was the pre-Vibe-model wording.

Home shows active pets only — memorial (Rainbow Bridge) pets and sitter-shared pets are not shown here, same as before.

Pets

Purpose: "Tell me everything about my pets" — browsing and long-term management, not daily interaction.

Implemented in `src/pages/Pets.jsx`. Shows, in order:

1. Active pets
2. Shared with Me (pets the signed-in user has sitter access to, via `getSharedPetsForUser()` in `src/lib/petsClient.js`)
3. Rainbow Bridge (memorial pets)

Active and Rainbow Bridge pet rows render `ExpandablePetProfileCard`, which embeds the shared `PetProfileContent` component (`context="pets"`) — the same component the standalone Pet Profile page uses. Collapsed, each row shows photo/species icon, name, species, breed, sex, computed age, and condition chips — **no Wellness Score or trend of any kind**; instead, five Wellbeing direction chips (Energy, Mobility, Breathing, Skin/Itching, Behavior) compare today's state to yesterday's. Tapping "Show More" expands the row **in place** to reveal the pet's full profile (action pills + all summary cards) — this is the primary, day-to-day way most owners reach Pet Profile content; see the Pet Profile section below.

"Shared with Me" rows use a separate, deliberately lighter `SharedPetRow` component — a bare identity link with no chip UI at all — and link to `/pet/:petId/trends`, not Pet Profile. (`docs/launch-punch-list.md` tracks the resulting inconsistency — sitter-shared pets show no Wellbeing information at all, unlike owned/co-owned pets — as an open item.)

Per-source error handling: pets list, shared-pets, wellness scores, check-ins, and medication counts are fetched independently (the latter three via `Promise.allSettled`), so a failure in one (e.g. wellness scores) degrades gracefully (score shows as "—") without hiding the pet list or any other section. A hard failure in the core pets-list fetch is the only one that blocks the page.

An "Add a Pet" entry point (the `+` button, and the empty-state CTA) opens `AddPetDialog`, returning to `/pets` on completion via its `returnTo` prop.

Pet Profile

Purpose: the permanent, detailed record for one pet.

Implemented as the shared `PetProfileContent` component (`src/components/PetProfileContent.jsx`), rendered two ways: inline inside the Pets tab (`context="pets"`, see above — this is the primary way most owners encounter it), and as its own page at `/pet/:petId` (`context="profile"`, `src/pages/PetProfile.jsx`).

**The "Pet Profiles" Menu directory described in the previous revision of this document no longer exists** — no route, no component file. The standalone `/pet/:petId` page's only real entry points today are: completing Pet Onboarding (its "start check-in" link, `?startCheckin=1`), and accepting a co-owner invite (`AcceptInvite.jsx`'s post-accept redirect). Its back button always returns to `/pets` (not "wherever the user came from"). It is not linked from CareMenu, Home, or any Menu row.

Header
Photo, name, species, breed, sex, computed age, conditions ("diagnoses"). **No Wellness Score, trend, or "last updated" field** — none of these are currently displayed. Share, Edit, and Delete Pet are always-visible action pills (not a menu) shown once the profile is expanded; "Move to Rainbow Bridge" is the one action gated by `!isMemorial`. Delete is a two-step, co-owner-aware confirmation flow (warning, then type-the-pet's-name), disabled while offline.

Today's Vibe / Weight
Below the identity block (standalone page, `context="profile"` only): a Vibe icon + label for today's Daily Check-In status (Great Day/Off Day/Tough Day/Skipped/"Check in today") and a separate Weight value with quick-log access — replacing the previously-documented five score rings and `getWellnessRingScores()`, which no longer exists. The two never combine into a score. (The inline Pets-tab card instead shows the five Wellbeing chips described above.)

Stacked sections, in this order, all using a shared `NavCard` component (icon, title, subtitle, value, link-or-button, and a built-in "Unable to load" error state):
1. Baseline
2. Conditions
3. Medications
4. Food
5. Vaccinations
6. Weight
7. Vet Report — links to `/pet/:petId/export` (added after the previous revision of this document)
8. Observations — only tappable (opens Daily Check-In) when today has no check-in yet; once logged, a static display of today's five observation chips with no link at all — **not** a link to `/pet/:petId/symptoms` as previously documented. Weight, separately, links to `/pet/:petId/symptoms`.
9. Timeline — links to `/pet/:petId/timeline`
10. Health Records — bloodwork count (`getHealthRecordsCount()`), links to the Bloodwork tab directly (not a separate Documents/Export screen)

The old inline 30-day recharts trend charts and their Appetite/Energy/Symptoms/Weight quick-log bubbles (present in the original Navigation Refresh build) have been removed from this screen — that history now lives on the Trends screen instead.

Trends (new)

Purpose: a per-pet, range-selectable trend view — the "how has this been going" complement to Home's "how is this today."

Implemented in `src/pages/PetTrends.jsx` (route `/pet/:petId/trends`), backed by `src/lib/checkin/trendsClient.js`. Reachable from: Home's `PetSummaryCard`/`CheckInStatusBanner`, every owned/co-owned pet row on Pets (sitter-shared rows link here too, per above), and CareMenu's "Trends" item — not from Pet Profile directly, which has no card linking here.

Header: back button, photo, name, species/breed/sex. **No export/calendar button and no overflow menu** — both were previously documented here but don't exist; `CareMenu` is not reused on this screen. Below the header, a second-level sub-tab row: **Overview** (default), **Trends**, **Patterns**, **Compare**.

- **Overview** — the range selector (24H/7D/30D/90D/1Y) plus a fixed set of cards: Appetite, Water Intake, Energy, Weight, and Insight Summary (described below). No Wellness Score card — that was retired along with the rest of the scoring model.
- **Trends** — every attribute in the selected Health/Wellness group gets its own card, reading from `observations`/`daily_check_ins` (not `symptom_logs`) — real current data, not a legacy chart set. (The previous revision of this document described this sub-tab as the retained-for-compatibility *legacy* `symptom_logs`-based chart set; that's no longer accurate — a code comment in `PetTrends.jsx` documents that this sub-tab used to be stuck showing "need at least 2 logs" for any pet tracked purely through Daily Check-In, and was fixed by rendering the same real, observations-backed cards Overview uses, rather than keeping a second disconnected data path.) Vomiting and Nausea render as one combined card, not two.
- **Patterns**, **Compare** — both unbuilt "coming soon" placeholders. (The previous revision described only these two as placeholders, which is still correct — the correction above is about what "Trends" actually shows, not about placeholder status.)

`PetProfileTabs.jsx`'s own former "Trends" tab now redirects to `/pet/:petId/trends?section=trends` (landing directly on this sub-tab) instead of duplicating the chart.

Entry point: Trends is reached directly from Home/Pets/CareMenu, bypassing Pet Profile entirely (confirmed intentional), and the back button uses `navigate(-1)`.

Range selector: 24H, 7D, 30D, 90D, 1Y (`RANGE_OPTIONS`/`RANGE_DAYS` in `trendsClient.js`). `daily_check_ins` is one row per calendar day, so "24H" is treated as a short trailing window for chart context rather than a literal last-24-hours; the headline number always compares today vs. yesterday regardless of range.

Cards (Overview sub-tab):
- Appetite, Water Intake, Energy — one shared `ObservationCard` pattern (`getObservationTrend`), each day's bar reflecting a symptom-count-based state (Normal/1 Symptom/2+ Symptoms/Not Observed/Skipped/No Check-In) — **not** the four-state `missing`/`skipped`/`normal`/`observed` model or the 5-point severity scale previously documented here, both of which belonged to the retired scoring model.
- Weight — from `symptom_logs.weight_grams` (`getWeightTrend`); delta compares the two most recent entries, since no true baseline exists yet (same documented limitation as Pet Profile's Weight card)
- Insight Summary — one AI-generated paragraph (`getInsightSummary()`), reusing the same `invokeAI` client used by `PetAIInsights.jsx`. Its inputs are narrower than "the other cards' data" might suggest: only Appetite, Water Intake, Energy, and Weight reach the prompt — never the Vibe status, the symptom count, or any other attribute. Requires at least 2 non-skipped check-ins in the last 10 days; below that threshold the card **simply doesn't render** — there is no "Complete more check-ins to unlock AI insights" message shown, contrary to what this document previously said. Not persisted — regenerated each time, same as `PetAIInsights`.

There is no Wellness Score card on this screen — one was previously documented here; it doesn't exist.

None of this required `pet_baselines` to be populated — it remains unused (Data Model_V2.md §6).

Analytics: `trends_viewed` (`{ pet_id }`, once per successful pet load), `trends_range_changed` (`{ pet_id, range }`, on user-initiated range taps only — not the initial default), and `trends_section_changed` (`{ pet_id, section }`, same rule) — added specifically to answer two open questions: whether 1Y range ever gets used, and whether the "Trends" sub-tab or the Patterns/Compare placeholders get any engagement at all.

Timeline

Purpose: "the pet's complete chronological health story" — no longer a placeholder.

Implemented in `src/pages/Timeline.jsx` (route `/pet/:petId/timeline`), backed by `getTimelineEvents()` (`src/lib/checkin/petProfileClient.js`), which assembles a single, most-recent-first list from four tables: `daily_check_ins` (check-in events), `medications` (start date only, not later changes), `vaccinations` (administered), `symptom_logs` (this is also where weight entries surface, generically, not as a distinct "weight" event type). The same function/count backs both this page and the Timeline count referenced from Pet Profile's Timeline card. **Not included:** Health Records/Bloodwork and lab results never appear on the Timeline, despite being a real, separate feature. **Known bug:** the check-in event's title logic checks `status === 'normal'`, a value retired by migration 0026 — every non-skipped check-in currently mislabels itself as "changes logged," even Great Days.

Menu

Purpose: owner/account-level functionality only. No pet-specific action lives here directly — pet management lives on Pet Profile, reached inline from Pets (see above; there is no separate Menu-based pet directory).

Implemented in `src/pages/Settings.jsx` (route `/settings`, labeled "Menu"). Restructured since the original Navigation Refresh:

- A clickable user-summary card at the top (photo/initial, display name via `getDisplayName()`, email, an account-type badge — **Production/Test/Demo/Owner**, not just the three previously documented here) linking to Account.
- Seven `MenuListRow` entries (`MENU_ITEMS` in `Settings.jsx`), not five: **Pet Sitter** (`/settings/pet-sitter`), **AI** (`/settings/ai`), **Notifications** (`/notifications`), **Privacy** (`/privacy`), **Terms of Service** (`/terms`), **Settings** — labeled "Settings" in the UI but routes to `/preferences`, **Support** (`/support`). Pet Sitter, AI, and Terms of Service were all added after the previous revision of this document and were missing from it; there is no "Pet Profiles" row — that screen doesn't exist (see Pet Profile section above).
- Test Tools (Seed Test Data, Reset Test Account) — unchanged, only visible to internal accounts (`isInternalAccount()`: every test account, or a demo account explicitly flagged admin).
- Account actions: Sign Out, Delete Account & All Data — unchanged two-step-confirm flows, unified under one `activeDialog` state so two confirmation dialogs can never stack.
- A static "your data is encrypted" security footer.

Account (new)

Purpose: owner identity — name and timezone.

Implemented in `src/pages/Account.jsx` (route `/account`, reached from Menu's user-summary card). A real, functional form, not a placeholder:
- First Name / Last Name (editable, 100 char max each) and Email (read-only)
- Timezone: a dropdown of all IANA timezones (`listAvailableTimezones()`, `src/lib/timezone.js`), auto-detected on first load via `Intl.DateTimeFormat` (`detectTimezone()`) and never silently overwritten again once set (`shouldAutoPopulateTimezone()`); a "return to automatic detection" link appears once a timezone has been manually chosen. Fires a `timezone_manual_changed` analytics event on manual override.
- Save/Cancel, both disabled unless the form is dirty.

Notifications (new)

Purpose: an in-app notification list — not a push-notification settings screen.

Implemented in `src/pages/Notifications.jsx` (route `/notifications`), backed by `entities.Notification` (the `notifications` table, see Data Model_V2.md §3.21) via `src/lib/notifications/notificationClient.js`. Unread rows are visually distinct (blue tint); tapping a row marks it read. Currently the only notification type generated is `ownership_transfer` (fired by the `delete-account` Edge Function when a co-owned pet's primary owner deletes their account).

Privacy, Terms of Service (real screens — no longer placeholders)

`src/pages/Privacy.jsx` (route `/privacy`, with per-section detail at `/privacy/:sectionId` via `PrivacyPolicySection.jsx`, content from `privacyPolicyContent.js`) and `src/pages/Terms.jsx` (route `/terms`, same list-then-detail pattern, `termsOfServiceContent.js`) are both real, fully built screens, not stubs — built 2026-07-10. The previous revision of this document listed Privacy as a "coming soon" placeholder; that stopped being true once these were built.

Preferences, Support (still placeholders)

`src/pages/Preferences.jsx` (`/preferences`) and `src/pages/Support.jsx` (`/support`) remain explicit stubs — each renders a static "coming soon" screen with a back button, so Menu's row list doesn't dead-end (the same precedent Timeline used before it became real).

CareMenu (in-context quick nav) — **intended to be deprecated, still live in code**

**Product direction (2026-07-18): CareMenu — the hamburger-menu icon on `PetProfileTabs.jsx`, `Documents.jsx`, and `Insurance.jsx` — should not be used. All navigation is meant to go through the bottom nav (Home/Pets/Menu) and back, not a per-page hamburger menu.** This has not yet been implemented in code — `src/components/CareMenu.jsx` is still actively rendered and functional in all three of those pages as of this revision. Removing it as-is would orphan three destinations that currently have no other entry point anywhere in the app: **History** (`LogHistory.jsx`, via `PetProfileTabs.jsx?tab=history`), **Documents** (`src/pages/Documents.jsx`), and **Insurance** (`src/pages/Insurance.jsx`). Everything else CareMenu links to already has an independent path: Vet Report/Baseline/Medications/Food/Vaccinations/Health Records via the current Pet Profile's nav cards (see above), and AI/Pet Sitter via `Menu → AI` / `Menu → Pet Sitter` pet-picker directories (`AIMenu.jsx`/`PetSitterMenu.jsx`) that don't touch CareMenu at all. See `docs/launch-punch-list.md` P4 for the tracked decision on the three orphaned destinations.

Until that decision lands, here's what CareMenu currently does: `src/components/CareMenu.jsx` — slide-out panel from Pet Profile and PetProfileTabs. Its "Trends" item points to `/pet/:petId/trends` (defaulting to the Overview sub-tab). Still includes History/Meds/Baseline/Food/Labs/Vaccines/Sitter/AI (`PetProfileTabs` tabs) plus a global Menu/About link. `PetProfileTabs`' own former "Trends" tab now redirects to the Trends screen's "Trends" sub-tab rather than rendering its own copy (see the Trends section above).

Routing (as implemented in `src/App.jsx`)

Public: `/login`, `/register`, `/forgot-password`, `/reset-password`

Protected:
```
/                              Home
/notifications                 Notifications
/pets                           Pets
/pet/:petId                     Pet Profile (standalone page; only reached via onboarding's start-check-in link or an accepted co-owner invite — not from any pet-card tap)
/pet/:petId/trends              Trends
/pet/:petId/timeline             Timeline
/pet/:petId/profile             PetProfileTabs (?tab=..., includes a legacy "trends" tab that redirects to /pet/:petId/trends)
/pet/:petId/onboarding           Pet Onboarding wizard
/pet/:petId/symptoms             Full symptom log history
/pet/:petId/food                 Food history
/pet/:petId/insurance            Insurance
/pet/:petId/documents            Documents
/pet/:petId/export               Vet export
/about                          About
/settings                       Menu
/settings/pet-sitter            Pet Sitter
/settings/ai                    AI
/account                        Account
/privacy                        Privacy (real screen, not a placeholder)
/terms                          Terms of Service (real screen)
/preferences                    Preferences (placeholder)
/support                        Support (placeholder)
```

Routing diagram:
```
Home (PetSummaryCard + CheckInStatusBanner) ──────────────┐
                                                            ├──► Trends
Pets (owned/co-owned + Rainbow Bridge card tap) ───────────┘

Pets ──► "Show More" ──► Pet Profile content, expanded INLINE (no navigation) ──┬──► Baseline / Conditions (Edit Pet) / Medications / Food / Vaccinations / Weight
                                                                                  ├──► Observations (tappable only before today's check-in)
                                                                                  ├──► Vet Report ──► /pet/:id/export
                                                                                  ├──► Timeline ──► /pet/:id/timeline
                                                                                  └──► Health Records ──► Bloodwork tab

Pet Onboarding (start-check-in link) ──► standalone /pet/:id (Pet Profile page)
Accept co-owner invite ──► standalone /pet/:id (Pet Profile page)

Menu ──► Account (name, timezone)
Menu ──► Pet Sitter
Menu ──► AI
Menu ──► Notifications
Menu ──► Privacy / Terms of Service (real) / Preferences / Support (still placeholders)

CareMenu (from Pet Profile / PetProfileTabs) ──► Trends, and every PetProfileTabs tab
```

Information Hierarchy

Within Pet Profile, current information precedes historical information: identity header and today's Vibe/Weight (or Wellbeing chips, inline in Pets), then Baseline/Conditions (identity and current state), then day-to-day management sections (Medications/Food/Vaccinations), then trend/history sections (Weight/Observations/Vet Report/Timeline/Health Records). Trends itself follows the same principle at the metric level: current value/status before the historical chart.

Multi-Pet Support

Home renders one `PetSummaryCard` + one `CheckInStatusBanner` per active pet; Pets renders every pet (active, shared, memorial) in one scrollable list, each data source failing independently. Neither has a hardcoded pet-count limit.

Accessibility

Bottom nav uses real `<a>`-equivalent `Link` elements (not custom tab widgets), `aria-current="page"` for the active destination, and 44px-minimum tap targets. Trend/status is always paired with a text label, never color alone — Trends' Normal/1 Symptom/2+ Symptoms/Not Observed/Skipped/No Check-In states are distinguished by more than color for the same reason.

Known deviations and as-built anomalies

- V2 (pre-Navigation-Refresh) described a 4-destination nav (Home / Insights / Pets / Menu). The shipped architecture has exactly three destinations; there is still no bottom-nav tab for Trends/Insights — it's reached from within Home/Pets/CareMenu, per the original decision.
- Pet Profile is not directly reachable from Home or Pets via a card tap — Home and Pets pet-card taps both go to Trends. Confirmed intentional: Trends and Pet Profile are treated as two genuinely separate destinations. As of this revision, the primary way most owners encounter Pet Profile content is Pets' inline "Show More" expansion (no navigation at all — it renders in place); the standalone `/pet/:petId` page exists separately and is reached only via Pet Onboarding's start-check-in link or an accepted co-owner invite. A previous revision of this document described a dedicated "Pet Profiles" Menu directory as the primary path to the standalone page — that directory no longer exists in any form; this correction supersedes that description.
- The `01 Features/` folder was flattened and renumbered since this document's original version. As of 2026-07-18, feature docs were reorganized again into `docs/foundation/`, `docs/features/` (confirmed current), and `docs/Archive/` (deprecated) — the flat `01 Features/000N Name.md` numbering this document previously referenced no longer reflects the actual folder structure; see `CLAUDE.md` for the current layout.

Summary

Wysker Watch's shipped navigation still has three destinations — Home for daily engagement, Pets for browsing, Menu for the owner's account — but the center of gravity for "see how a pet is doing over time" has shifted from the flat Pet Profile to a dedicated Trends screen. Pet Profile itself is no longer reached through a dedicated Menu directory (that screen doesn't exist) — it's reached primarily inline, by expanding a pet's card in Pets, with the standalone page surviving only as the landing target for two specific flows (finishing onboarding, accepting a co-owner invite). Home and Pets pet-card taps go to Trends, not Pet Profile, in both cases.
