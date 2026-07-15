Feature Specification
Navigation Refresh
Document: 01 Features/Navigation/Navigation Refresh.md
Status: Ready for Implementation
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
•	Contextual alerts
Out of Scope
•	Daily Check-In workflow
•	Wellness Score calculations
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
Home

Pets

Menu
No additional persistent navigation items should appear.
Future features should be accessed from within these sections rather than becoming additional navigation tabs.
________________________________________
Home
Purpose
Answer one question:
"How are my pets today?"
Home is the primary destination users see after opening the application.
It should support completing daily health management with minimal effort.
________________________________________
Home Layout
Display one Daily Health Card for every active pet.
Cards should appear in a vertically stacked list.
Cards should be ordered alphabetically by default.
Future versions may allow custom ordering.
Each card contains:
•	Pet photo or selected icon
•	Pet name
•	Today's Wellness Score
•	Trend label
•	Daily Check-In status
•	Short observation summary
Examples
Harper

97

Stable

✓ Checked in today

No changes reported
Tribble

84

Monitor

Today's Check-In

Appetite changed today
________________________________________
Daily Health Card Actions
Each card supports:
Primary
•	Everything Normal
Secondary
•	Something Changed
Tertiary
•	Skip Today
These actions launch the existing Daily Check-In feature.
Navigation Refresh does not define Daily Check-In behavior.
________________________________________
Card Navigation
Selecting the card header opens the Pet Profile.
Selecting the action buttons launches the Daily Check-In workflow.
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
Each pet card shows:
•	Photo or icon
•	Name
•	Species
•	Age
•	Breed
•	Today's Wellness Score
•	Current trend
Selecting a pet opens its profile.
________________________________________
Pet Profile
Header
Display:
•	Photo
•	Name
•	Species
•	Breed
•	Age
•	Diagnoses
•	Today's Wellness Score
•	Current trend
•	Last updated
________________________________________
Profile Sections
Display as stacked cards.
Order:
•	Profile
•	Baseline
•	Conditions
•	Medications
•	Food
•	Vaccinations
•	Weight
•	Observations
•	Timeline
•	Health Records
Each section routes to its existing feature.
If a feature is not yet implemented, navigate to a placeholder screen rather than removing the section.
________________________________________
Contextual Alerts
Alerts should appear only within the section to which they belong.
Examples
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
The Timeline represents the complete health story.
Include:
•	Daily Check-Ins
•	Observations
•	Medication changes
•	Weight entries
•	Vaccinations
•	Health Records
•	Laboratory results
•	AI summaries (future)
Timeline remains chronological.
________________________________________
Menu
Purpose:
Everything related to the owner rather than an individual pet.
Menu contains:
•	Account
•	Notifications
•	Privacy
•	Settings
•	Support
•	Sign Out
•	Delete Account
Pet-specific actions belong within the Pet Profile.
Delete Pet should be available from the individual pet's Profile screen rather than Menu.
________________________________________
Routing
Home
    ↓
Daily Check-In

Home
    ↓
Pet Profile

Pets
    ↓
Pet Profile

Pet Profile
    ↓
Profile
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
Timeline
    ↓
Health Records
________________________________________
Information Hierarchy
Within every Pet Profile:
1.	Current Status
2.	Wellness Score
3.	Baseline
4.	Current Observations
5.	Long-term History
6.	Medical Records
Current information should always appear before historical information.
________________________________________
Multi-Pet Requirements
Home must support households with one or many pets.
Requirements:
•	Every pet receives its own Daily Health Card.
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
•	Continue using TypeScript.
•	Route all data access through the existing data layer.
•	Do not access Supabase directly from UI components.
•	Preserve existing routing wherever possible.
•	Avoid unnecessary schema changes.
________________________________________
Data Requirements
No significant schema changes are expected.
Optional additions if not already implemented:
pets.icon_name

pets.icon_color
Do not store derived Wellness Scores within the Pet entity.
Scores remain calculated values.
________________________________________
Acceptance Criteria
Home
•	Bottom navigation displays Home, Pets, and Menu only.
•	One Daily Health Card is shown for every active pet.
•	Cards display the pet's current Wellness Score, trend, and Daily Check-In status.
•	Selecting the card opens the Pet Profile.
•	Daily action buttons launch the existing Daily Check-In workflow.
Pets
•	Users can browse all pets.
•	Users can open an individual Pet Profile.
•	Pet Profiles display all long-term health sections in the defined order.
•	Contextual alerts appear only within their associated sections.
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

