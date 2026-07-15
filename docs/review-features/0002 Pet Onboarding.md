# Feature Specification

## Pet Management – Complete Pet Profile (Pet Onboarding) V1

**Document:** `02 Features/Pet Management/Complete Pet Profile (Pet Onboarding)

**Status:** Ready for Implementation

**Owner:** Product

**Audience:** Claude Code (Engineering)

---

# Purpose

Following **Add Pet**, guide the owner through a short, conversational experience that teaches Wysker Watch what is normal for their pet.

This experience establishes the pet's initial health baseline so future Daily Check-Ins can focus only on changes.

This is **not** a medical intake form.

It is the beginning of the pet's health story.

---

# Product Goals

This feature should:

* Teach Wysker Watch the pet's normal behaviors
* Establish an initial baseline
* Keep owner effort low
* Create investment in the product
* Lead immediately into the first Daily Check-In

The experience should feel conversational rather than administrative.

---

# Design Principles

The onboarding flow should follow a **card-based experience**, inspired by Calm's onboarding.

Each screen should:

* Ask only one question
* Have one primary action
* Require minimal typing
* Feel personal
* Explain why information matters when appropriate

Avoid long forms.

---

# Entry Point

Immediately after Add Pet.

Success screen:

---

🐾

## Harper has been added!

Let's spend a few minutes teaching Wysker Watch about Harper.

This helps us recognize meaningful changes over time.

About 3 minutes.

Primary CTA

**Complete Harper's Profile**

Secondary CTA

Skip for now

---

If skipped:

The owner is taken to Home.

A persistent banner appears until completed.

> Complete Harper's Profile
>
> Help Wysker Watch learn Harper's normal.

---

# Progress Indicator

Display progress throughout onboarding.

Example

Step 2 of 8

or

● ● ● ○ ○ ○ ○ ○

The owner should always know they are making progress.

---

# Card 1

## Tell us about Harper's health

Question

How would you describe Harper's overall health?

Options

○ Harper is generally healthy

○ Harper has one or more ongoing health conditions

○ I'm not sure

Continue

---

## Behavior

Healthy

→ Skip to Medications

Conditions

→ Card 2

Not Sure

→ Skip to Medications

---

# Card 2

## Known Conditions

Displayed only when owner selects ongoing conditions.

Question

Which conditions has Harper been diagnosed with?

Requirements

Species-specific condition list

Searchable

Multiple selection

Not required

Continue

Examples

CKD

IBD

Hyperthyroidism

Arthritis

Diabetes

Heart Disease

Behavior

Selected diagnoses become part of the pet profile and personalize future experiences.

---

# Card 3

## Medications

Question

Is Harper currently taking any medications?

Options

○ No

○ Yes

Continue

If No

Skip medication entry.

---

# Card 4

## Medication Entry

Repeatable card.

Fields

Medication

Dose

Frequency

Reminder toggle

Buttons

Add Another Medication

Continue

Skip

---

# Transition Card

No input.

---

🐾

## Every pet has their own normal.

The next few questions help Wysker Watch understand what "normal" looks like for Harper.

Later, daily check-ins will only ask what's changed.

Continue

---

# Card 5

## Normally Harper...

### ...finishes meals.

Options

○ Always finishes meals

○ Usually finishes meals

○ Leaves some food

○ Free feeds

---

# Card 6

## Normally Harper...

### ...drinks water.

Options

○ Very little

○ About average

○ More than most pets

---

# Card 7

## Normally Harper...

### ...has energy.

Options

○ Very active

○ Moderate

○ Calm

---

# Card 8

## Normally Harper...

### ...moves around.

Species Specific

### Cats

○ Jumps everywhere

○ Moves normally

○ Doesn't jump very much

○ Uses ramps or stairs

### Dogs

○ Loves walks and running

○ Active but moderate

○ Tires easily

○ Uses ramps or stairs

---

# Card 9

## Normally Harper...

### ...uses the bathroom.

Species Specific

Cats

Litter box frequency

Dogs

Typical number of walks / bowel movements

Keep intentionally simple.

No medical questions.

---

# Completion

🎉

## Harper's profile is complete!

Wysker Watch now understands Harper's normal.

Daily check-ins will usually take less than a minute.

Primary CTA

**Start Today's Check-In**

Secondary CTA

View Harper's Profile

---

# Functional Requirements

## Dynamic Flow

Cards should only appear when relevant.

Examples

Healthy pet

Health

Medications

Baseline

Done

Pet with conditions

Health

Conditions

Medications

Baseline

Done

---

## Save Progress

Progress should automatically save after every card.

If onboarding is interrupted:

Resume where the owner left off.

Never require restarting.

---

## Editable

All onboarding responses become editable within the Pet Profile.

Completing onboarding is creating the pet's initial baseline.

It is not permanent.

---

## Personalization

Use the pet's name throughout every card.

Example

Normally Tribble...

Normally Harper...

Never use generic wording.

---

## Accessibility

Large touch targets

High contrast

Minimal scrolling

Single primary action

Support screen readers

---

# Out of Scope (Future Enhancements)

The following are intentionally excluded from Version 1:

* Veterinarian information
* Emergency clinic
* Emergency contacts
* Pet pharmacy
* Personality traits
* Favorite foods or treats
* Favorite toys
* Stress triggers
* Free-text notes
* AI document import (existing platform capability, not onboarding)
* Adoption paperwork import
* Co-owner invitations
* Pet sitter setup
* Upload previous records
* AI extraction of diagnoses or medications

These capabilities belong in **Profile Management** or future profile enhancements rather than the initial onboarding experience.

---

# Acceptance Criteria

### Entry

* User is prompted to complete the profile immediately after successfully adding a pet.
* User may skip onboarding and complete it later.

### User Experience

* The experience is presented as a sequence of focused cards, not a multi-section form.
* Each card asks only one primary question.
* Progress is visible throughout the experience.
* The pet's name is used dynamically in all applicable cards.

### Health Information

* Users can indicate whether the pet is healthy, has ongoing conditions, or they are unsure.
* Users with ongoing conditions can select multiple diagnoses from a species-specific list.
* Users can enter zero or more medications.

### Baseline

* Owners establish the pet's initial behavioral baseline through the "Normally {Pet Name}..." cards.
* All baseline questions use observable behaviors rather than medical terminology.
* Responses are stored as the pet's initial baseline and can be edited later.

### Resilience

* Progress is automatically saved after every card.
* Interrupted onboarding resumes at the last completed card.

### Completion

* Completing the flow returns the owner directly to their first Daily Check-In.
* If onboarding is skipped, the owner can access it later from the Pet Profile or a persistent "Complete Profile" prompt.

---

## Implementation Notes for Claude Code

* Preserve the existing visual language, spacing, typography, and component patterns defined in the Design System.
* Implement onboarding as a reusable **card-based wizard** rather than a static multi-page form, allowing future cards to be inserted or reordered without architectural changes.
* Route all data access through the existing data layer in accordance with the Technical Standards. Do not access Supabase directly from UI components.
* Treat onboarding responses as the pet's **initial baseline**, not immutable profile data. All values must remain editable through the Pet Profile after completion.
* Persist progress after every completed card so the flow can resume seamlessly if interrupted.
* Use conditional navigation so only relevant cards are shown (for example, skip the Conditions card for healthy pets and the Medication Entry card when no medications are indicated).
* Design the baseline cards as reusable components that can support future condition-specific baseline questions without changing the overall onboarding framework.
* Keep the experience focused on observable behaviors and baseline creation, reinforcing Wysker Watch's behavior-first philosophy rather than collecting comprehensive medical records.
