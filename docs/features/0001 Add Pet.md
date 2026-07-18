# Feature Specification

## Pet Management – Add Pet Expansion (V1)

**Document:** `01 Features/Pet Management/Add Pet.md`

**Status:** Ready for Implementation

**Owner:** Product

**Audience:** Claude Code (Engineering)

---

# Purpose

Expand the existing Add Pet workflow to collect the minimum information necessary to create a complete pet identity while intentionally separating profile creation from health setup.

This feature supports both cats and dogs while keeping the workflow under one minute for most users.

The goal is to create a pet—not configure its healthcare.

This aligns with the Product Context, Product Principles, and UX Principles by reducing owner effort, encouraging early success, and using progressive disclosure.   

---

# Goals

The Add Pet workflow must:

* Create a complete pet identity
* Support both rescue and breeder pets
* Support both known and unknown birth dates
* Require minimal typing
* Be completed in under one minute
* End with a successful pet creation
* Transition into Pet Onboarding (future feature)

---

# Non-Goals

The Add Pet workflow does **not** include:

* Diagnoses
* Observable behaviors
* Medications
* Food
* Baselines
* Veterinarian information
* Pharmacy information
* Emergency contacts
* Vaccinations
* Health records
* AI setup
* Daily check-in configuration

Those belong in **Pet Onboarding**.

---

# User Flow

```text
My Pets

↓

Settings

↓

Add Pet

↓

Choose Species

↓

Complete Add Pet Form

↓

Create Pet

↓

Success Screen

↓

Continue to Pet Onboarding (future)

OR

Done
```

---

# Functional Requirements

## 1. Species Selection

The user must select exactly one species.

Options

* Cat
* Dog

Species determines:

* available icon
* species-specific fields
* future onboarding flow

Species cannot be blank.

---

## 2. Pet Photo

Optional

User may:

* upload photo
* take photo
* skip

If skipped:

Display default species avatar.

---

## 3. Basic Identity

Required

Pet Name

Validation

* Required
* Maximum 100 characters

---

Breed

Optional

Free text.

(V2 may introduce breed autocomplete.)

---

Sex

Required

Options

* Female
* Male
* Unknown

---

Spayed / Neutered

Required

Options

* Yes
* No
* Unknown

---

## 4. Birth Information

Replace the single Birthday field.

### Birth Date

Required to have a **known status**, but not an exact date.

Options

### Exact

Stores full date.

Example

```
2021-05-12
```

---

### Approximate Month & Year

Stores

Month

Year

Example

```
May 2021
```

---

### Approximate Year

Stores

Year only

Example

```
2020
```

---

### Unknown

No date stored.

---

## 5. Gotcha Day

Optional

Uses identical options as Birth Date.

* Exact
* Approximate Month & Year
* Approximate Year
* Unknown

---

## 6. Life Stage

Never entered by the user.

Automatically calculated.

Examples

Cats

* Kitten
* Adult
* Senior

Dogs

* Puppy
* Adult
* Senior

The calculation must update automatically as the pet ages.

---

## 7. Microchip

Optional

Field

Microchip Number

Validation

Maximum 50 characters

No formatting restrictions.

---

## 8. Dog Registration

Displayed only when

Species = Dog

---

Question

Registered with AKC?

Options

Yes

No

---

If Yes

Display

Registered Name

AKC Registration Number

Breeder

All optional.

---

If No

Hide all AKC fields.

---

## 9. Notes

Optional

Maximum 500 characters.

Used only for general identity notes.

Not medical notes.

---

# Buttons

Bottom of screen

Secondary

Cancel

Primary

Create Pet

Primary button disabled until required fields are completed.

---

# Success Screen

Display

---

🐾

Harper has been added!

---

Primary Button

Continue Setup

Secondary Button

Done

---

Continue Setup launches Pet Onboarding.

Done returns to My Pets.

---

# Required Fields

| Field             | Required    |
| ----------------- | ----------- |
| Species           | Yes         |
| Name              | Yes         |
| Sex               | Yes         |
| Spayed/Neutered   | Yes         |
| Birth Date Status | Yes         |
| Photo             | No          |
| Breed             | No          |
| Gotcha Day        | No          |
| Microchip         | No          |
| AKC Information   | Conditional |
| Notes             | No          |

---

# Validation Rules

Name

* cannot be blank

Birth Date

* future dates prohibited

Gotcha Day

* cannot be before birth date when both are exact

AKC Fields

Only visible when

Species = Dog

AND

Registered with AKC = Yes

---

# Data Model Changes

Extend Pet entity.

Add fields

```
photo_url

sex

altered_status

birth_date

birth_date_precision

gotcha_date

gotcha_date_precision

life_stage

microchip_number

akc_registered

akc_registered_name

akc_registration_number

breeder

notes
```

### Date Precision

Supported values

```
EXACT

MONTH_YEAR

YEAR

UNKNOWN
```

Life Stage should **not** be persisted as user-entered data if it can be derived from age. Prefer calculating it from the available birth date information (using the stored precision) at runtime or through a server-side derived value to avoid stale data.

---

# Navigation

Existing

```
My Pets

↓

Settings

↓

Add Pet
```

Updated

```
My Pets

↓

Settings

↓

Add Pet

↓

Success

↓

Continue Setup
```

---

# Error Handling

If creation fails

Display

"Unable to create pet.
Please try again."

Do not lose entered data.

---

# Accessibility

* Every field has an accessible label.
* Touch targets meet minimum platform guidelines.
* Date controls support keyboard and screen readers.
* Required fields are announced.
* Validation messages are descriptive.

---

# Analytics Events

Track

```
add_pet_started

species_selected

photo_added

birth_date_precision_selected

akc_toggle_enabled

pet_created

continue_to_onboarding

add_pet_cancelled
```

---

# Acceptance Criteria

### A user can

* Create a cat.
* Create a dog.
* Skip the photo.
* Use an exact birthday.
* Use an approximate birthday.
* Leave the birthday unknown.
* Enter a gotcha day.
* Skip the gotcha day.
* Enter a microchip number.
* Create a dog without AKC information.
* Create an AKC-registered dog with registration details.
* Complete the flow in under one minute using only required fields.
* Successfully return to the My Pets screen.
* Choose to continue into Pet Onboarding after the pet is created.

---

# Out of Scope

The following are intentionally deferred to Pet Onboarding:

* Medical conditions
* Observable behavior baseline
* Medications
* Food and nutrition
* Veterinarian contacts
* Emergency contacts
* Pharmacy information
* Vaccinations
* Health records
* AI-generated setup
* Daily check-in preferences
* Reminder configuration

---

## Implementation Notes for Claude Code

* Preserve the existing visual style, spacing, and component patterns defined by the Design System. 
* Follow the project's architecture by routing all data access through the existing data layer rather than directly from UI components, and implement any required schema changes through migrations consistent with the Technical Standards. 
* Implement this feature as an extension of the current Add Pet workflow rather than creating a parallel flow, ensuring existing users and pets continue to function without regression.
