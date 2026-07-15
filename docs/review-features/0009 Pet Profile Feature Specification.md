
Requirements:

Feature Specification
Pet Profile

Document: 01 Features/Pet Management/Pet Profile.md

Status: Ready for Implementation

Owner: Product

Audience: Claude Code (Engineering)

Purpose

Provide a single, permanent health profile for an individual pet.

The Pet Profile is the central location for managing a pet's identity, baseline, medical information, observations, trends, and historical records.

This screen presents summarized information and serves as the navigation hub into each health management feature.

It is not a dashboard of today's health. Daily health is surfaced on Home. The Pet Profile focuses on the pet's complete health story.

Functional Requirements
1. Pet Header

Display:

Back navigation
Pet photo
Pet name
Breed
Species
Sex
Computed age
Condition chips
Medication count chip
Share button
Overflow menu

Header data must load immediately when the profile opens.

2. Wellness Summary

Display five score cards:

Wellness
Appetite
Energy
Symptoms
Weight

Each score contains:

Circular progress indicator
Numeric score
Label
Status text

Examples:

Stable
Improving
Lower
Monitor

Display:

Last Updated

using latest wellness update timestamp.

3. Baseline Card

Display:

Title
Description
Current status

Examples:

Set Up
In Progress
Not Started

Selecting the card opens Baseline Management.

4. Conditions Card

Display:

Number of active diagnoses
Summary text

Selecting the card opens Condition Management.

5. Medications Card

Display:

Number of active medications

Selecting the card opens Medication Management.

6. Food Card

Display:

Number of active foods

Selecting the card opens Food Management.

7. Vaccinations Card

Display:

Vaccination completion status

Examples:

Up to Date
4 / 5
Overdue

Selecting opens Vaccination Management.

8. Weight Card

Display:

Current weight

Weight trend

Small sparkline

Examples

9.8 lbs

Down 0.2 lbs

Selecting opens Weight History.

9. Observations Card

Display today's observation summary.

Supported observation chips:

Appetite
Water
Energy
Stool
Activity

Display current state beneath each.

Examples

Lower

Higher

Normal

Selecting opens Observation History.

10. Timeline Card

Display:

Total event count.

Selecting opens Timeline.

Timeline contains the pet's chronological health history.

11. Health Records Card

Display:

Document count.

Selecting opens Health Records.

Includes:

Lab Results
Veterinary Visits
Uploaded Documents
Reports
UI Components
Header

Back Button

Pet Photo

Pet Identity

Condition Chips

Medication Chip

Share Button

Overflow Menu

Wellness Panel

Five circular metric indicators

Timestamp

Navigation Cards

Baseline

Conditions

Medications

Food

Vaccinations

Weight

Observations

Timeline

Health Records

Each card includes:

Icon

Title

Subtitle

Summary value

Chevron

Bottom Navigation

Remain visible.

Tabs:

Home

Pets (active)

Menu

User Interactions

Back

Returns to Pets list.

Share

Launch native share flow.

Overflow Menu

Contains:

Edit Pet

Delete Pet

Move to Rainbow Bridge

Every card opens its corresponding feature.

Weight sparkline is informational.

Navigation

Entry Points

Home

↓

Select Pet

OR

Pets

↓

Select Pet

↓

Pet Profile

Available Destinations

Baseline

Conditions

Medications

Food

Vaccinations

Weight

Observations

Timeline

Health Records

Back always returns to originating screen.

Empty States
Baseline

Display:

Set up your pet's baseline.

CTA:

Set Up

Conditions

No conditions added.

CTA:

Add Condition

Medications

No medications.

CTA:

Add Medication

Food

No food configured.

CTA:

Add Food

Vaccinations

No vaccinations recorded.

CTA:

Add Vaccination

Weight

No weight history.

Display placeholder chart.

CTA:

Record Weight

Observations

No observations yet.

CTA:

Start Daily Check-In

Timeline

No events yet.

Display:

Events will appear as your pet's health history grows.

Health Records

No records uploaded.

CTA:

Upload Record

Loading States

Display skeleton placeholders for:

Header

Wellness summary

Navigation cards

Do not display partially loaded values.

Error States

Unable to load profile.

Provide:

Retry

Back

Individual cards may display unavailable state without preventing remainder of profile from loading.

Business Rules

Computed age derives from birth date.

Life stage is derived and not editable.

Condition count equals active diagnoses.

Medication count equals active medications.

Food count equals active foods.

Vaccination status derives from active vaccination records.

Weight summary uses latest recorded weight.

Observation summary reflects latest Daily Check-In.

Timeline contains all historical health events.

Health Records contain uploaded veterinary documentation.

Deleting a pet is initiated from the overflow menu.

Sharing exports a profile summary.

Validation Rules

Profile data displayed must belong to current authenticated owner or authorized co-owner.

Summary counts must never become negative.

Only active medications contribute to medication count.

Only active foods contribute to food count.

Weight trend requires at least two recorded weights.

Wellness metrics require available scoring data.

Data Requirements

Pet

Photo

Species

Breed

Sex

Birth Date

Age

Life Stage (derived)

Conditions

Medications

Food

Vaccinations

Weight History

Observation Summary

Wellness Scores

Timeline Events

Health Records

Last Updated

Share Metadata

All data retrieval must use the existing entity layer and current relational model. Do not query Supabase directly from UI components.

Acceptance Criteria

The user can:

Open a Pet Profile from Home.
Open a Pet Profile from Pets.
View complete pet identity.
View Wellness Summary.
Navigate to Baseline.
Navigate to Conditions.
Navigate to Medications.
Navigate to Food.
Navigate to Vaccinations.
Navigate to Weight History.
Navigate to Observations.
Navigate to Timeline.
Navigate to Health Records.
Share the pet profile.
Edit the pet.
Delete the pet.
Move the pet to Rainbow Bridge.
Return to the previous screen.
Edge Cases

Pet has no photo.

Display species avatar.

Pet has no conditions.

Display empty Conditions state.

Pet has never completed onboarding.

Display Baseline setup prompt.

Pet has no medications.

Display zero state.

Pet has no observations.

Prompt Daily Check-In.

Pet has only one weight entry.

Display current weight without trend.

Pet has no health records.

Display upload prompt.

Shared pet.

Respect permission model.

Memorial pet.

Profile remains viewable.

Editing remains available according to permissions.

Implementation Notes for Claude Code
Preserve the screen layout, spacing, typography, colors, iconography, and interaction patterns shown in the approved screen design. The screen design is the source of truth for the UI.
Implement this screen as a composition of summary cards that route into existing feature modules rather than duplicating management functionality.
Route all data access through the existing entity client layer in accordance with the Technical Standards. Do not query Supabase directly from UI components.
Use the existing data model and relationships for pet identity, onboarding, medications, observations, wellness scores, and health records. Avoid introducing duplicate data structures.
Derive computed values such as age, life stage, counts, trends, and wellness summaries from existing data rather than persisting redundant values.
Load independent sections separately so a failure in one section (for example, Health Records) does not prevent the remainder of the profile from rendering.
Follow the existing Navigation & Information Architecture. Pet Profile is the permanent health record reached from both Home and Pets and serves as the entry point into Baseline, Conditions, Medications, Food, Vaccinations, Weight, Observations, Timeline, and Health Records.

Before coding:
1. Inspect current Add Pet, Pet Profile, Daily Check-In, and data layer implementations.
2. Identify existing reusable components.
3. Identify whether baseline fields already exist or require a migration.
4. Propose the smallest clean implementation plan and explain it in plain english before moving forward
5. Then implement.
After coding:
- Run lint/type checks/tests available in the repo.
- Provide a short summary of files changed.
- Note any migrations created.
- Note any follow-up items or assumptions.


