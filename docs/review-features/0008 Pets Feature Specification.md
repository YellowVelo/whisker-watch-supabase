
You are Claude Code acting as the Senior Software Engineer for Wysker Watch.
Build the new Pet Screen.

Claude Code Build Prompt

Use this specification together with the Foundation documents as the implementation source of truth.

Before writing code, review:

Product Context
Product Vision
Product Principles
UX Principles
Design System
Technical Standards
Data Model
Navigation & Information Architecture

The supplied Pets screen mockup is the UI source of truth. Implement the screen exactly as designed. Do not redesign the interface or introduce additional UX patterns.

Requirements:

Build the Pets screen as specified.
Use existing reusable components where available.
Follow the project's data architecture and entity client pattern.
Do not access Supabase directly from UI components.
Preserve compatibility with existing Home, Add Pet, Pet Onboarding, Daily Check-In, Wellness Score, and Pet Profile functionality.
Ensure there are no regressions to existing navigation or pet management features.
Match all loading, empty, and error states defined in the specification.
Deliver production-ready JS/React code consistent with the project's coding standards and design system.



Feature Specification
Pets Screen (V1)

Document

01 Features/Pets/Pets.md

Status

Ready for Implementation

Owner

Product

Audience

Claude Code (Engineering)

Purpose

The Pets screen is the owner's permanent overview of every pet in their care.

Unlike Home, which answers "How are my pets today?", the Pets screen answers:

"Tell me about every pet I manage."

It serves as the entry point into each pet's permanent health profile while providing a high-level summary of today's status.

This screen also separates active pets from Rainbow Bridge pets while allowing new pets to be added.

This feature aligns with the Navigation & Information Architecture by making Pets the central destination for long-term pet management.

Functional Requirements
1. Screen Header

Display:

Paw icon
Title: My Pets
Subtitle:

All the pets in your care, in one place.

Top-right action:

Add Pet

Primary button with plus icon.

Selecting Add Pet launches the existing Add Pet workflow.

2. Active Pets Section

Display section header:

ACTIVE PETS

Supporting text:

Pets you monitor every day

Only pets where:

is_memorial = false

are shown.

Display one card per pet.

Cards are ordered by:

Active pets
Created date descending
3. Pet Card

Each pet card contains:

Identity
Photo
Name
Breed
Species
Sex
Age

Age is calculated.

Never stored.

Status Chips

Display all applicable chips.

Possible examples:

Healthy

CKD Stage II

IBD

Behavior

Diabetes

Arthritis

etc.

These come from the pet profile.

Medication Chip

Display:

1 Medication

2 Medications

3 Medications

Hidden if zero medications.

Wellness Score

Display:

Circular score indicator

Examples:

92

74

88

Use latest Wellness Score.

Display accompanying trend label:

Stable

Improving

Monitor

Declining

Display:

Today

beneath status.

Today's Logs

Display summary chips for today's observations.

Current design supports:

Appetite
Water
Energy
Stool
Activity
Other

Each chip displays:

Icon

Category

Current value

Examples:

Appetite
Normal

Water
High

Energy
Lower

Other
None

Only display today's information.

Do not display historical values.

Chevron

Right chevron.

Selecting anywhere on card navigates to Pet Profile.

4. Rainbow Bridge Section

Display only when memorial pets exist.

Header:

RAINBOW BRIDGE

Supporting text:

Pets who will always be with us

Display memorial cards.

Remove:

Wellness Score
Today's Logs

Instead display:

In Memory

with Rainbow Bridge icon.

Selecting memorial pet opens Pet Profile.

5. Add Pet

Selecting Add Pet launches existing Add Pet workflow.

After successful creation:

Return to Pets.

Refresh list.

Scroll to newly created pet.

UI Components

Header

Primary Button

Section Header

Pet Card

Circular Wellness Score

Status Chips

Today's Log Chips

Chevron

Rainbow Bridge Card

Empty State

Loading Skeleton

Error Banner

User Interactions
Tap Pet Card

Navigate:

Pets

↓

Pet Profile
Tap Add Pet

Launch:

Add Pet dialog.

Return from Add Pet

Reload pets.

Highlight newly added pet.

Pull to Refresh

Refresh:

Pets

Today's Wellness Scores

Today's Logs

Navigation

Bottom Navigation

Home

Pets (active)

Menu

Pets is the selected navigation item.

Navigation Flow

Home
        \
         \
          Pet Profile

Pets
      \
       \
        Pet Profile

Pets

↓

Add Pet

↓

Pet Onboarding

↓

Pets
Empty States
No Pets

Display:

Illustration

Headline:

No pets yet

Body:

Add your first pet to begin tracking their health.

Primary CTA:

Add Pet

Hide:

Active Pets section

Rainbow Bridge section

No Rainbow Bridge Pets

Hide section entirely.

Pet Has No Medications

Hide medication chip.

No Logs Today

Display today's categories with:

Unknown

instead of Normal.

Do not imply Normal when no data exists.

This follows Product Principle #6:

Unknown ≠ Normal.

Loading States

Display skeleton cards.

Skeleton includes:

Photo

Name

Score

Log chips

Do not shift layout after loading.

Error States

Unable to load pets

Display inline error.

Primary button:

Retry

Unable to load wellness score

Display placeholder:

--

Hide trend label.

Pet remains selectable.

Unable to load today's logs

Display:

Unavailable

for today's logs.

Pet remains selectable.

Business Rules

Only active pets appear in Active Pets.

Only memorial pets appear in Rainbow Bridge.

Age is calculated.

Life stage is calculated.

Medication count only includes active medications.

Today's Logs summarize today's observations only.

Wellness Score uses latest daily score.

Entire card is tappable.

Pet Profile is the single destination for long-term management.

No editing occurs from Pets.

Delete Pet is not available on this screen.

Validation Rules

Pet must have:

Name

Species

Sex

Birth precision

from Add Pet.

Photo optional.

Breed optional.

Medication chip hidden when count = 0.

Wellness Score displays only if today's score exists.

Data Requirements

Pet

id

photo_url

name

species

breed

sex

birth_date

birth_date_precision

conditions

is_memorial

Medication

active count

Wellness

score

trend

check_in_date

Today's Observation Summary

appetite

water

energy

stool

activity

other

Computed

age

life_stage

No additional database changes required.

Acceptance Criteria

A user can:

✓ View all active pets.

✓ View today's wellness score for each active pet.

✓ View today's observation summary.

✓ View diagnosis chips.

✓ View medication count.

✓ Navigate to Pet Profile.

✓ Add a new pet.

✓ Return to Pets after pet creation.

✓ View Rainbow Bridge pets separately.

✓ Open memorial pet profiles.

✓ Refresh the screen.

✓ Use screen readers to identify each card.

Edge Cases

Pet without photo.

Pet without breed.

Pet without medications.

Pet with multiple diagnoses.

Pet without today's check-in.

Pet without wellness score.

Large number of pets.

Only Rainbow Bridge pets.

Only one pet.

No pets.

Very long names.

Wellness calculation delayed.

Deleted pet while screen open.

Network reconnect after failure.

Implementation Notes for Claude Code
Preserve the existing visual design shown in the approved screen mockup. Do not redesign spacing, hierarchy, colors, typography, or component placement.
Follow the Design System for all cards, buttons, chips, score indicators, spacing, and accessibility requirements.
Route all data access through the project's entity client/data layer. Do not query Supabase directly from UI components. Follow the existing Technical Standards.
Use the existing Wellness Score system and latest daily score for each pet. If no score exists for today, render the empty state for the score without blocking the rest of the card.
Display today's observation summary using the current Daily Check-In data. Unknown observations must remain distinct from normal observations.
Calculate age and life stage dynamically from the stored birth date and birth date precision. Do not persist calculated values.
Medication count should include only active medications.
Make the entire pet card tappable and navigate directly to the Pet Profile screen.
Refresh the list automatically when returning from the Add Pet workflow and scroll the newly created pet into view when possible.
Keep the Rainbow Bridge section read-only. Memorial pets remain fully viewable through Pet Profile, but the Pets screen does not display daily wellness or observation summaries for memorial pets.
Ensure loading, error, and empty states preserve the page layout and avoid unnecessary layout shifts.


Before coding:
1. Inspect current Add Pet, Pet Profile, Daily Check-In, and data layer implementations.
2. Identify existing reusable components.
3. Identify whether baseline fields already exist or require a migration.
4. Propose the smallest clean implementation plan, explain it in plain English before moving forward
5. Then implement.

After coding:
- Run lint/type checks/tests available in the repo.
- Provide a short summary of files changed.
- Note any migrations created.
- Note any follow-up items or assumptions.





