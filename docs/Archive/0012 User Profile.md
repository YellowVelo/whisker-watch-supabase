# Feature Specification

## User Profile & Timezone Settings (V1)

**Document:** `01 Features/Settings/User Profile.md`

**Status:** Ready for Implementation

**Owner:** Product

**Audience:** Claude Code (Engineering)

---

# Purpose

Create an owner-level User Profile that stores the owner's identity and timezone.

This enables:

* Personalized greetings and communications
* Reliable day-boundary calculations
* Future scheduled notifications
* Consistent account information across devices

This feature belongs to the owner's account and is accessed from **Menu → Account → Profile**.

---

# Goals

The feature must:

* Allow owners to view and edit their profile information
* Automatically capture the owner's timezone during initial setup
* Support future notification scheduling
* Keep setup effortless
* Avoid requesting unnecessary permissions

---

# Non-Goals

This feature does **not** include:

* User avatar
* Street address
* GPS location
* City, State, Country
* Phone number
* Emergency contacts
* Email editing
* Password editing
* Notification preferences
* Pet-specific information

---

# User Flow

```text
Menu

↓

Account

↓

Profile

↓

View / Edit Profile

↓

Save
```

---

# Functional Requirements

## 1. Owner Identity

Display editable fields:

| Field      | Required |
| ---------- | -------- |
| First Name | No       |
| Last Name  | No       |

Use:

* First name for greetings
* Full name for account communications

Generate:

```text
Full Name =
First Name + Last Name
```

If neither exists, gracefully fall back to email.

---

## 2. Timezone

Store one timezone for each account.

Timezone is stored as an IANA timezone identifier.

Example:

```text
America/New_York
Europe/London
Australia/Sydney
```

---

## 3. Timezone Acquisition

### Automatic Detection

During the first authenticated profile load after signup, Wysker Watch must automatically acquire the timezone from the user's mobile device or browser.

Use:

```javascript
Intl.DateTimeFormat().resolvedOptions().timeZone
```

This reads the timezone configured on the user's operating system.

Examples:

```text
America/New_York
America/Chicago
America/Denver
America/Los_Angeles
Europe/London
```

### Important

This does **not** use:

* GPS
* Device location services
* Browser Geolocation API
* IP address lookup
* Street address
* ZIP code

The application must **not** request location permission.

The owner should never be prompted to allow location access simply to determine timezone.

---

## 4. Initial Timezone Population

If

```text
profiles.timezone IS NULL
```

then:

1. Detect timezone
2. Validate it is a valid IANA timezone
3. Save to profile

This requires no owner interaction.

---

## 5. Manual Timezone Override

The Profile screen includes:

```text
Timezone

America/New_York

Change Timezone
```

Selecting a timezone:

* updates `profiles.timezone`
* sets

```text
timezone_is_manual = true
```

After a manual override, automatic detection must no longer overwrite the stored timezone.

---

## 6. Automatic vs Manual

When

```text
timezone_is_manual = false
```

timezone is populated only if currently empty.

Once populated, it is not silently changed.

When

```text
timezone_is_manual = true
```

the manually selected timezone is always used.

---

## 7. Profile Screen

Fields

First Name

Last Name

Timezone

Buttons

Save

Cancel

Timezone selector

---

# Database Changes

Extend

```sql
public.profiles
```

Add

```sql
last_name text
timezone text
timezone_is_manual boolean default false not null
```

No migration backfill required.

---

# Validation Rules

First Name

* optional
* maximum 100 characters

Last Name

* optional
* maximum 100 characters

Timezone

* valid IANA timezone
* selected from approved list

---

# Business Rules

* Owners may edit only their own profile.
* Timezone is automatically acquired once during initial profile creation.
* Automatic acquisition uses the device/browser timezone.
* No location permission may be requested.
* Once a timezone has been stored, it is not automatically replaced.
* Owners may manually change timezone at any time.
* Manual timezone selection persists across devices and future logins.
* Existing notification code automatically benefits from improved owner identity.

---

# Loading States

Profile loading

```text
Loading profile...
```

Saving

```text
Saving...
```

---

# Empty States

Missing name

Display empty fields.

Missing timezone

Automatically detect and save.

If automatic detection fails

Display:

```text
Unable to determine your timezone.

Please choose your timezone.
```

---

# Error States

Unable to load profile

```text
Unable to load your profile.
Please try again.
```

Unable to save

```text
Unable to save your profile.
Please try again.
```

Invalid timezone

```text
Please choose a valid timezone.
```

---

# Data Requirements

Read

```text
id
email
first_name
last_name
timezone
timezone_is_manual
```

Write

```text
first_name
last_name
timezone
timezone_is_manual
```

Never allow editing of

```text
role
account_type
```

---

# Acceptance Criteria

A new owner signs up.

During first authenticated profile creation:

* timezone is automatically acquired from the device
* no location permission is requested
* timezone is stored as an IANA timezone

An existing owner with no timezone:

* has timezone populated automatically on first profile load

An owner can:

* edit first name
* edit last name
* manually change timezone
* save profile
* reload and see changes persisted
* sign in on another device and see the same profile information

Automatic timezone detection never overwrites an existing stored timezone.

---

# Edge Cases

* Browser/device does not return a timezone
* Invalid timezone returned
* User signed up before this feature existed
* User has no name
* User only has first name
* User changes timezone manually
* Save fails because of network error
* Profile exists but timezone is null

---

# Accessibility

* Every field has an accessible label.
* Touch targets meet platform minimum size requirements.
* Validation messages are descriptive.
* Timezone selector supports keyboard and screen readers.

---

# Analytics Events

Track

```text
profile_opened
profile_saved
timezone_auto_detected
timezone_manual_changed
timezone_detection_failed
```

---

## Implementation Notes for Claude Code

* Preserve the existing visual style, spacing, typography, and component patterns defined in the Design System.
* Route all profile reads and writes through the existing entity layer. Do not access Supabase directly from UI components.
* Capture the timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone` during the first authenticated profile load.
* Store the returned IANA timezone string in `profiles.timezone`.
* Do not request GPS, browser geolocation, or any other location permission.
* Validate timezone values before saving.
* Once a timezone has been stored, do not automatically overwrite it. Only update it when the owner explicitly changes it in Profile Settings.
* Keep this feature focused on owner identity and timezone only. Do not expand scope into authentication, notification preferences, avatars, or physical location.
