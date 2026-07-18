Feature Specification
Navigation Refresh
Document: 01 Features/Navigation/Navigation Refresh.md
Status: Reconciled to current implementation as of 2026-07-18 (see Revision Notes)
Owner: Product
Audience: Claude Code (Engineering)
________________________________________
Purpose
Refactor Wysker Watch's navigation and information architecture to support a daily-first experience while preserving comprehensive long-term health management.
The application should have three primary destinations:
•	Home
•	Pets
•	Menu
Each destination should have one clear purpose and minimize unnecessary navigation.
This feature reorganizes the application without changing the underlying health data model or Daily Check-In workflow.
________________________________________
Product Goals
The navigation should:
•	Make today's health immediately understandable.
•	Reduce navigation depth.
•	Keep Home focused on daily engagement.
•	Separate daily interactions from long-term profile management.
•	Support both single-pet and multi-pet households equally well.
•	Scale as future features are introduced.
________________________________________
Design Principles
Navigation should follow the Wysker Watch Product Principles and UX Principles.
Every screen should have one primary purpose.
Daily actions should require the fewest possible taps.
Summaries should appear before details.
Users should never feel overwhelmed by information.
________________________________________
Scope
In Scope
•	New bottom navigation
•	Updated Home screen
•	Updated Pets section
•	Updated Menu
•	Routing updates
•	Pet Profile entry
•	Information hierarchy updates
•	Contextual alerts (never actually built — see Contextual Alerts section)
Out of Scope
•	Daily Check-In workflow
•	Vibe / symptom-count logic (the Wellness Score calculations this originally named were retired; see `docs/features/0012_DailyCheckIn_Vibe_Trends_Specification_v5.md`)
•	AI Insights
•	Medication logic
•	Vaccination logic
•	Timeline functionality
•	Health Record functionality
•	Reminder functionality
These are separate feature specifications.
________________________________________
Bottom Navigation
Replace the current bottom navigation with exactly three destinations.
Home (`/`)

Pets (`/pets`)

Menu (`/settings`)
No additional persistent navigation items should appear.
Future features should be accessed from within these sections rather than becoming additional navigation tabs.
This is implemented and unchanged since the original spec — `src/components/BottomTabBar.jsx` has exactly these three tabs.
________________________________________
Home
Purpose
Answer one question:
"How are my pets today?"
Home is the primary destination users see after opening the application.
It should support completing daily health management with minimal effort.
________________________________________
Home Layout
Display one Daily Health Card for every active pet, each paired with a one-line Daily Check-In status row directly underneath it.
Cards are ordered by most-recently-added pet first (`entities.Pet.list('-created_date')`), not alphabetically.
Each card contains:
•	Pet photo or species icon (no stored `icon_name`/`icon_color` — see Data Requirements)
•	Pet name, species, breed, sex, and age
•	Condition chips (or a "Healthy" badge if the pet has no conditions logged) and an active-medication-count chip
•	A Vibe icon + label showing today's Daily Check-In status: Great Day / Off Day / Tough Day / Skipped / "Check in today" if not yet done — no numeric score of any kind
•	Six Health Attribute direction chips (Appetite, Water, Bathroom, Stool, Vomiting, Nausea) plus a separate Weight direction chip — each shows up/down/steady/unavailable, not a single trend label
The status row underneath each card (separate component, not part of the card) shows either "Start {pet}'s Daily Check-In" (tappable, not yet checked in) or a one-line summary of today's completed status (tappable, links to Trends).
________________________________________
Daily Health Card Actions
The three quick-log actions do not live on the card itself — they live inside the Daily Check-In bottom sheet, opened from the status row described above. Once opened, the choices are:
•	Great Day
•	Off Day
•	Tough Day
•	Skip today (or Skip yesterday, in the catch-up case)
This replaced the original "Everything Normal / Something Changed / Skip Today" wording along with the underlying status model — see `docs/features/0012_DailyCheckIn_Vibe_Trends_Specification_v5.md`.
Navigation Refresh does not define Daily Check-In behavior.
________________________________________
Card Navigation
Selecting the card itself opens that pet's Trends screen (`/pet/:petId/trends`) — not the Pet Profile.
Selecting the status row underneath launches the Daily Check-In workflow when no check-in exists yet for today; once a check-in exists, the row instead links to Trends as well.
Pet Profile is not directly reachable from a Home card tap in the current implementation — see Routing below.
________________________________________
Pets
Purpose
The Pets section contains each pet's permanent health profile.
It answers:
"Tell me everything about Harper."
Unlike Home, this section focuses on historical information and long-term management.
________________________________________
Pets Landing Page
Display all pets.
Each pet's collapsed card shows:
•	Photo or species icon
•	Name, species, breed, and sex (one line)
•	Age
•	Condition chips
•	Five Wellbeing direction chips (Energy, Mobility, Breathing, Skin/Itching, Behavior) — no numeric score and no single "current trend" label; each chip is independently tappable and deep-links to that attribute's Trends chart
Tapping "Show More" on a card expands it in place to reveal the full Pet Profile content (actions row + all summary cards) — this is an inline expansion, not a navigation to a separate page. There is no other tap target on the collapsed card that navigates elsewhere.
________________________________________
Pet Profile
Header
Display:
•	Photo
•	Name
•	Species, breed, sex
•	Age
•	Diagnoses (condition chips)
•	A Vibe icon + label for today's Daily Check-In status, and a separate Weight value with quick-log access — no numeric score, no trend label, and no "Last updated" field (none of these are currently displayed)
________________________________________
Profile Sections
Display as stacked cards.
Order:
•	Baseline
•	Conditions
•	Medications
•	Food
•	Vaccinations
•	Weight
•	Observations
•	Vet Report
•	Timeline
•	Health Records
There is no separate "Profile" card — the header above serves that role. "Vet Report" (added 2026-07-11, after this spec was originally written) sits between Observations and Timeline.
Each section routes to its existing feature.
If a feature is not yet implemented, navigate to a placeholder screen rather than removing the section.
________________________________________
Contextual Alerts
**This section was never implemented.** None of the example alerts below exist anywhere in the current codebase — there is no medication-due, vaccination-due, or weight-change alert of any kind on any screen.
The closest real equivalent to "no check-in completed today" is Home's per-pet status row (`CheckInStatusBanner`, described under Home Layout above), which lives on **Home**, not inside the Pet Profile's Observations section as originally specified.
Original (unbuilt) examples, kept for reference:
Medications
Medication due tomorrow
Vaccinations
Rabies vaccine due
Weight
Weight decreased from baseline
Observations
No Daily Check-In completed today
Do not create a global Alerts page.
Do not clutter the Home screen with historical alerts.
________________________________________
Timeline
The Timeline represents the complete health story, assembled from four real event types (`getTimelineEvents`, `src/lib/checkin/petProfileClient.js`):
•	Daily Check-Ins (`daily_check_ins`)
•	Medication starts (`medications.start_date`) — only the start of a medication is logged as an event today, not later changes
•	Vaccinations administered (`vaccinations.date_given`)
•	Symptom log entries (`symptom_logs`) — this is also where Weight entries surface, as a generic "Symptom log recorded" event, not a distinct "weight" event type
**Not currently included:** Health Records / Bloodwork and laboratory results do not appear on the Timeline at all, despite being a real, separate feature (the Bloodwork tab). AI summaries remain unbuilt, as originally noted.
Timeline remains chronological.
________________________________________
Menu
Purpose:
Everything related to the owner rather than an individual pet.
Menu contains:
•	Account
•	Pet Sitter
•	AI
•	Notifications
•	Privacy
•	Terms of Service
•	Settings
•	Support
•	Sign Out
•	Delete Account
Pet Sitter, AI, and Terms of Service were added after this spec was originally written and are missing from the original version — Pet Sitter/AI on 2026-07-06, Terms of Service on 2026-07-10 (`src/pages/Settings.jsx`).
Pet-specific actions belong within the Pet Profile.
Delete Pet should be available from the individual pet's Profile screen rather than Menu.
________________________________________
Routing
Home
    ↓
Daily Check-In (via the status row under each card, not the card itself)

Home
    ↓
Trends (tapping the card itself — not Pet Profile)

Pets
    ↓
Pet Profile (inline expansion via "Show More" — not a page navigation)

Pet Profile
    ↓
Baseline
    ↓
Conditions
    ↓
Medications
    ↓
Food
    ↓
Vaccinations
    ↓
Weight
    ↓
Observations
    ↓
Vet Report
    ↓
Timeline
    ↓
Health Records

The standalone `/pet/:petId` Pet Profile page also exists outside this tree, reached only via two specific flows: completing Pet Onboarding's "start check-in" link, and accepting a co-owner invite. It is not part of the everyday Home/Pets navigation loop.
________________________________________
Information Hierarchy
Within every Pet Profile:
1.	Current Status (today's Vibe)
2.	Baseline
3.	Current Observations
4.	Long-term History
5.	Medical Records
Current information should always appear before historical information. (The original list's separate "Wellness Score" tier no longer applies — there is no score, only the Vibe status folded into Current Status.)
________________________________________
Multi-Pet Requirements
Home must support households with one or many pets.
Requirements:
•	Every pet receives its own Daily Health Card and status row.
•	Daily actions remain independent.
•	Cards should scroll vertically.
•	Layout must remain usable with at least ten pets.
________________________________________
Accessibility
Navigation must:
•	Support screen readers.
•	Use large touch targets.
•	Never rely on color alone.
•	Maintain high contrast.
•	Preserve logical keyboard navigation.
________________________________________
Technical Requirements
•	Preserve the existing React + Vite architecture.
•	Continue using JavaScript/JSX — the frontend has no `tsconfig.json` and is overwhelmingly `.js`/`.jsx` (one stray `.ts` utility file exists, `src/utils/index.ts`); Supabase Edge Functions are where TypeScript is actually used throughout.
•	Route all data access through the existing data layer.
•	Do not access Supabase directly from UI components.
•	Preserve existing routing wherever possible.
•	Avoid unnecessary schema changes.
________________________________________
Data Requirements
No significant schema changes were needed.
`pets.icon_name` / `pets.icon_color` were never added — no migration creates either column, and the app falls back to a species icon (Dog/Cat) instead of a stored per-pet icon.
There is no Wellness Score concept to store. Today's Vibe status lives on `daily_check_ins.status` (per pet, per day — `great`/`off`/`tough`/`skipped`) and is never cached or derived elsewhere; Weight comes from `symptom_logs.weight_grams`.
________________________________________
Acceptance Criteria
Home
•	Bottom navigation displays Home, Pets, and Menu only.
•	One Daily Health Card and status row is shown for every active pet.
•	Cards display the pet's identity, condition/medication chips, today's Vibe status, and Health/Weight direction chips.
•	Selecting the card opens that pet's Trends screen.
•	Selecting the status row launches the existing Daily Check-In workflow when today isn't logged yet.
Pets
•	Users can browse all pets.
•	Users can expand an individual pet's card inline to reveal its full Pet Profile.
•	Pet Profiles display all long-term health sections in the defined order.
•	Contextual alerts do not exist in the current build (see Contextual Alerts section).
Menu
•	Contains only owner-level functionality.
•	Pet management actions are not mixed with account settings.
Technical
•	Existing Add Pet functionality continues working.
•	Existing Pet Onboarding continues working.
•	Existing Daily Check-In continues working.
•	Existing routing continues functioning unless intentionally replaced.
•	No direct Supabase access is introduced.
•	One-pet and multi-pet households render correctly.
________________________________________
Implementation Notes for Claude Code
•	Preserve the existing visual language defined by the Design System.
•	Implement this feature as a navigation and information architecture refactor rather than a feature rewrite.
•	Reuse existing screens whenever possible instead of duplicating functionality.
•	Keep Home intentionally lightweight and focused on today's health.
•	Treat Daily Check-In as an existing feature and simply provide navigation into it.
•	Ensure the Pet Profile becomes the central location for long-term health management.
•	Maintain backward compatibility with existing users, pets, onboarding, and routing wherever possible.
•	Keep the architecture extensible so future features such as AI Insights, widgets, and reports can be introduced without requiring another navigation redesign.

________________________________________
Revision Notes (V1 → V2)

This pass corrected the following against the current codebase
(`src/components/BottomTabBar.jsx`, `src/pages/Home.jsx`, `src/components/PetSummaryCard.jsx`,
`src/components/CheckInStatusBanner.jsx`, `src/components/ExpandablePetProfileCard.jsx`,
`src/components/PetProfileContent.jsx`, `src/lib/checkin/petProfileClient.js`,
`src/pages/Settings.jsx`) and Supabase schema/migrations:

1. **Removed all retired-scoring content.** V1 required "Today's Wellness Score" and a "Trend label" on Home cards, the Pets landing page, and the Pet Profile header, plus fictional score examples ("Harper — 97 — Stable", "Tribble — 84 — Monitor"). None of this exists — replaced by a Vibe icon/label plus per-attribute direction chips.
2. **Corrected card ordering.** V1 said Home cards sort alphabetically. They sort by most-recently-added pet (`-created_date`).
3. **Corrected Daily Health Card Actions.** V1's "Everything Normal / Something Changed / Skip Today" buttons on the card itself don't exist. The real choices ("Great Day / Off Day / Tough Day / Skip") live in the Daily Check-In sheet, opened from a separate status row below the card — not from buttons on the card.
4. **Corrected Card Navigation — this is the most significant fix.** V1 said selecting a Home or Pets card opens the Pet Profile. It doesn't: Home cards navigate to **Trends**; Pets cards expand **inline** via "Show More" rather than navigating anywhere. The standalone Pet Profile page is only reached via the post-onboarding check-in link and the accept-co-owner-invite redirect.
5. **Corrected the Routing tree** to match (4): "Home → Pet Profile" and "Pets → Pet Profile" replaced with the actual Trends/inline-expansion behavior.
6. **Corrected Profile Sections order** — added the missing "Vet Report" card (shipped 2026-07-11) and removed the standalone "Profile" entry, which is the header, not a card.
7. **Flagged Contextual Alerts as never implemented.** None of the four example alerts (medication due, vaccination due, weight decreased, no check-in) exist anywhere in the codebase. Noted the closest real analog (Home's per-pet status row) and its actual location.
8. **Corrected Timeline's event list.** Health Records/Bloodwork and lab results are not on the Timeline despite being a real feature; "Medication changes" is really only medication-start events; Weight entries aren't a distinct event type, they surface as generic symptom-log entries.
9. **Added the missing Menu items** — Pet Sitter, AI, and Terms of Service, all added after V1 was written.
10. **Corrected Data Requirements.** `pets.icon_name`/`icon_color` were never added (confirmed via migration search); replaced the "do not store derived Wellness Scores" note with where Vibe/Weight actually live.
11. **Corrected a factual error about the stack.** V1 said "Continue using TypeScript" under Technical Requirements — the frontend has no `tsconfig.json` and is almost entirely `.js`/`.jsx` (one stray `.ts` file exists); Supabase Edge Functions are where TypeScript is actually used throughout.
