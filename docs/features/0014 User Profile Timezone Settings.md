# User Profile & Timezone Settings (V1)

**Status:** Shipped (2026-07-06)
**Location:** Menu → Account → Profile (`src/pages/Account.jsx`)

This consolidates two prior specs (`0012 User Profile.md` and
`NEW User Profile.txt`) — both described the same feature before it was built;
this doc supersedes them with what actually shipped.

---

## Purpose

An owner-level User Profile that stores the owner's identity and timezone.

This enables:

* Personalized greetings and communications
* Reliable day-boundary calculations (Health Score's "today"/"yesterday" logic)
* A durable, user-controlled timezone for future scheduled notifications
* Consistent account information across devices

Before this feature, `profiles` had only `first_name` (added in migration
`0015_profile_first_name.sql`, silently populated from signup metadata, never
user-editable). There was no `last_name`, no stored timezone, and no settings
UI where an owner could view or edit any of it. This caused two concrete gaps:

* Notification/email templates fell back to raw email when `first_name` was
  unset (anyone who signed up before `0015`, or via a flow that skipped it).
* Day-boundary logic (Health Score) had no durable, user-controlled timezone
  to read outside of an active browser session — a future server-side job
  (scheduled notification, day-rollover) would have nothing to read.

## Goals

* Allow owners to view and edit their profile information
* Automatically capture the owner's timezone during initial setup
* Support future notification scheduling
* Keep setup effortless
* Avoid requesting unnecessary permissions

## Non-Goals

* User avatar / photo
* Street address, city/state/country, GPS location
* Phone number, emergency contacts
* Email editing, password editing (Supabase Auth's own concern —
  `ResetPassword.jsx` / `ForgotPassword.jsx` already cover this)
* Notification preferences
* Pet-specific information
* Any server-side scheduled job that actually *consumes* `profiles.timezone`
  (e.g. "send check-in reminder at 8 AM their time") — this feature is the
  groundwork for that, not the job itself

## User Flow

```text
Menu → Account → Profile → View / Edit Profile → Save
```

---

## Functional Requirements

### 1. Owner Identity

Editable fields:

| Field | Required |
|---|---|
| First Name | No |
| Last Name | No |

* First name is used for greetings (e.g. Home screen "Good morning, {First Name}").
* Full name (`[first_name, last_name].filter(Boolean).join(' ')`) is used where
  a fuller identity is wanted, e.g. the vet report's owner name.
* If neither name is set, callers fall back to email.

### 2. Timezone

One IANA timezone identifier per account (e.g. `America/New_York`,
`Europe/London`, `Australia/Sydney`), stored as plain text.

### 3. Timezone Acquisition

On the first authenticated profile load, the app automatically acquires the
timezone from the device/browser via:

```javascript
Intl.DateTimeFormat().resolvedOptions().timeZone
```

This reads the OS/browser-configured timezone directly. It does **not** use
GPS, device location services, the Geolocation API, IP address lookup, street
address, or ZIP code — the app never requests location permission to
determine timezone.

### 4. Initial Timezone Population

If `profiles.timezone IS NULL`, the app detects the timezone, validates it,
and saves it — with no owner interaction required. This also covers existing
owners who signed up before this feature existed: their timezone populates
automatically on their next login.

### 5. Manual Timezone Override

The Profile screen shows the current timezone with a selector to change it.
Selecting a different zone:

* updates `profiles.timezone`
* sets `timezone_is_manual = true`

Once set manually, automatic detection never overwrites the stored value
again. A "Return to automatic detection" control lets the owner opt back into
auto-detection (re-running `detectTimezone()` and clearing the manual flag).

### 6. Automatic vs. Manual

* `timezone_is_manual = false` → timezone is populated only while empty; once
  populated it is not silently changed.
* `timezone_is_manual = true` → the manually selected value is always used;
  auto-detection is skipped entirely.

### 7. Profile Screen

Fields: First Name, Last Name, Email (read-only), Timezone (selector).
Buttons: Save, Cancel.

---

## Database Changes

`supabase/migrations/0017_profile_timezone_settings.sql` extends
`public.profiles`:

```sql
alter table public.profiles
  add column last_name text check (char_length(last_name) <= 100),
  add column timezone text,
  add column timezone_is_manual boolean not null default false;
```

* No migration backfill — existing rows keep `timezone IS NULL` until first
  login after deploy; unset name fields stay a valid, handled state (falls
  back to email).
* No RLS change needed — `profiles_update_own` (migration `0001`) already
  covers self-editable, non-privileged columns, same reasoning `0015` used for
  `first_name`.
* A `before insert or update` trigger (`validate_profile_timezone`) rejects any
  `timezone` value not present in Postgres's own `pg_timezone_names` catalog.
  This is enforced in the database, not just the client's `isValidIanaTimezone`
  check, because RLS only restricts *who* can write a `profiles` row, not
  *what* value — a client hitting the REST API directly could otherwise store
  an arbitrary string.

## Validation Rules

* First Name — optional, max 100 characters
* Last Name — optional, max 100 characters
* Timezone — must be a valid IANA timezone, chosen from the list returned by
  `listAvailableTimezones()` (`Intl.supportedValuesOf('timeZone')`, with a
  static fallback list for engines that lack it, e.g. older Safari)

## Business Rules

* Owners may edit only their own profile.
* Timezone is automatically acquired once during initial profile load.
* Automatic acquisition uses only the device/browser timezone — no location
  permission is ever requested.
* Once a timezone has been stored, it is not automatically replaced.
* Owners may manually change timezone at any time; manual selection persists
  across devices and future logins.
* Existing notification/invite-email code automatically benefits from more
  owners having a real name, with no further changes needed there.
* `role` and `account_type` are never editable through this feature.

## Loading / Empty / Error States

| State | Message |
|---|---|
| Profile loading | "Loading profile..." |
| Saving | "Saving..." |
| Missing name | Empty fields displayed |
| Missing timezone | Detected and saved automatically |
| Detection fails | "Unable to determine your timezone. Please choose your timezone." |
| Unable to load profile | "Unable to load your profile. Please try again." |
| Unable to save | "Unable to save your profile. Please try again." |
| Invalid timezone | "Please choose a valid timezone." |

## Acceptance Criteria

* A new owner signs up: timezone is automatically acquired from the device
  during first authenticated profile load, no location permission is
  requested, and it's stored as an IANA identifier.
* An existing owner with no timezone gets it populated automatically on next
  profile load.
* An owner can edit first name, edit last name, manually change timezone,
  save, reload and see changes persisted, and sign in on another device and
  see the same profile information.
* Automatic timezone detection never overwrites an existing stored timezone.

## Edge Cases Handled

* Browser/device does not return a timezone → detection-failed message shown,
  owner prompted to choose manually.
* Invalid timezone value → rejected client-side (`isValidIanaTimezone`) and
  server-side (the validation trigger).
* Owner signed up before this feature existed → timezone backfills on next
  login; name fields remain editable and default to whatever `0015` captured.
* Owner has no name / only a first name → full name derivation and greeting
  logic both handle partial/absent names, falling back to email.
* Owner changes timezone manually → `timezone_is_manual` flips to true and
  sticks.
* Save fails due to network error → save error message shown; the form
  retains the owner's unsaved edits rather than reverting.
* Profile exists but timezone is null → covered by initial population (#4).

## Analytics Events

`profile_opened`, `profile_saved`, `timezone_auto_detected`,
`timezone_manual_changed`, `timezone_detection_failed` — all implemented in
`Account.jsx` / `AuthContext.jsx`.

---

## Implementation

### Auto-detection (`src/lib/AuthContext.jsx`)

`doLoadUserWithProfile` — the same choke point that calls
`claim_pending_co_owner_invites()` — on every authenticated profile load:

1. Checks `shouldAutoPopulateTimezone(profile)` (`src/lib/timezone.js`): true
   only when `timezone` is null **and** `timezone_is_manual` is false.
2. If true, reads the device timezone via `detectTimezone()`.
3. Writes `{ timezone: detected, timezone_is_manual: false }` and updates the
   in-memory profile so the rest of the app sees it immediately.
4. Fires `timezone_auto_detected` on success, `timezone_detection_failed` if
   `Intl` returns nothing or the write fails.

Concurrent-call safety: `loadUserWithProfile` de-dupes in-flight calls per
user id (`loadInFlightRef`), since `onAuthStateChange` fires immediately for
an existing session in addition to the mount-time check — without de-duping,
two overlapping loads could both observe `timezone IS NULL` and double-write.

### Manual override (`src/pages/Account.jsx`)

* `handleTimezoneChange` sets `timezoneIsManual = true` whenever the owner
  picks a zone from the selector.
* `handleResetToAutomatic` clears `timezoneIsManual` and re-runs
  `detectTimezone()`.
* Save validates with `isValidIanaTimezone` before writing, via
  `entities.Profile.update` — reads/writes never touch Supabase directly from
  the component.
* `isManualTimezoneChange` (`timezone.js`) decides whether to fire
  `timezone_manual_changed` — true if the value changed, or if the owner
  re-saved the same zone but flipped it from auto to manual.

### Consumers of name/timezone

* `first_name` (with email fallback) is used in `delete-pet`, `delete-account`,
  and `invite-co-owner` edge functions, and the invite-email template.
* `generate-vet-report` uses `[first_name, last_name].filter(Boolean).join(' ')`
  (falls back to `'Owner'`) for the vet report's owner name.
* `timezone` feeds Health Score V2's day-boundary helpers
  (`todayInTimezone`/`yesterdayInTimezone` in `src/lib/timezone.js`), which
  fall back to UTC when no valid timezone is available.
