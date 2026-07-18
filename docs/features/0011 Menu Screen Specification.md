Feature Specification
Menu

Document: 01 Features/Menu/Menu.md

Status: Ready for Implementation — reflects current implementation as of 2026-07-17

Owner: Product

Audience: Claude Code (Engineering)

Purpose

Provide a single location for owner-level account management and application settings.

The Menu contains account-wide functionality, plus two feature-entry rows (Pet Sitter, AI) that are confirmed to belong here. Each of those two rows will get its own dedicated feature specification; this document covers only their presence, label, and top-level navigation on the Menu screen.

The screen must match the provided design and the current Navigation & Information Architecture.

Functional Requirements
1. Screen Header

Display:

Title: Menu
Subtitle: Manage your account and app settings.
Decorative illustration in the upper-right corner (dog/cat silhouette under a night sky).

The illustration is non-interactive (`aria-hidden`).

2. User Summary Card

Display a summary card at the top of the screen.

Fields:

Generic user icon (there is no avatar/photo field in the profile data model; every user sees the same static icon — see Empty States)
Display name
Email address
Account type badge

Supported account types:

Production
Test
Demo
Owner

The badge value is derived from the authenticated user's `account_type` field. Unrecognized values default to Production.

Selecting the card opens the Account screen (`/account`). No analytics event currently fires on this tap — see Analytics Events.

3. Menu Items

Display the following menu options in this order:

Pet Sitter

Description

Manage pet sitter access

Navigates to:

`/settings/pet-sitter`

AI

Description

AI-powered features

Navigates to:

`/settings/ai`

Notifications

Description

Manage your notification preferences

Navigates to:

`/notifications`

Privacy

Description

Manage your data and privacy

Navigates to:

`/privacy`

Terms of Service

Description

Review the terms you agreed to

Navigates to:

`/terms`

Settings

Description

App preferences and defaults

Navigates to:

`/preferences`

Support

Description

Help center and contact support

Navigates to:

`/support`

Conditionally, when the app can be installed as a PWA:

Install App

Description

Add Wysker Watch to your home screen

Selecting triggers the browser's install prompt.

Conditionally, for internal/QA accounts only (`isInternalAccount(user)`):

Seed Test Data

Opens a scenario picker dialog to seed sample data.

Reset Test/Demo Account

Opens a destructive confirmation dialog that resets the account's data.

Each menu row includes:

Leading icon
Title
Subtitle
Trailing chevron

Entire row is tappable.

Note: Account is not a menu row. It is reached only via the User Summary Card (Section 2).

4. Account Actions Section

Display below the primary menu.

Contains:

Sign Out

Subtitle

Sign out of Wysker Watch

Selecting opens confirmation dialog: "Sign Out? You'll need to sign in again to access your pets."

Delete Account

Subtitle

Permanently delete your account and all data

Selecting opens a two-step confirmation workflow (see User Interactions, Delete Account).

This action must never immediately delete the account.

5. Security Footer

Display:

Lock icon

Text:

Your data is encrypted and securely stored.

We never share your information.

This content is informational only.

6. Bottom Navigation

Bottom navigation remains visible (rendered at the layout level, not within the Menu screen component itself).

Tabs:

Home (`/`)
Pets (`/pets`, also active on `/pet/*`)
Menu (`/settings`)

Menu is the active tab, indicated with `aria-current="page"` and highlighted styling.

Navigation behavior must follow the Navigation & Information Architecture.

UI Components
Header
Title
Subtitle
Decorative illustration
User Card

Displays:

Generic user icon (no avatar image support)
Display name
Email
Account type badge
Chevron
Menu List

Rows:

Icon
Title
Subtitle
Chevron

Reusable list row component (`MenuListRow`).

Action List

Rows:

Sign Out
Delete Account

Delete Account uses destructive styling.

Footer
Lock icon
Informational text
Bottom Navigation

Persistent navigation component, rendered at the app layout level.

User Interactions
User Card

Tap

→ Open Account screen (`/account`).

No analytics event fires on this interaction (open gap — see Analytics Events).

Pet Sitter

Tap

→ Navigate to Pet Sitter menu.

AI

Tap

→ Navigate to AI menu.

Notifications

Tap

→ Navigate to Notifications.

Privacy

Tap

→ Navigate to Privacy.

Terms of Service

Tap

→ Navigate to Terms.

Settings

Tap

→ Navigate to Preferences (`/preferences`).

Support

Tap

→ Navigate to Support.

Sign Out

Tap

→ Display confirmation dialog.

Buttons:

Cancel
Sign Out

Selecting Sign Out:

End authenticated session.
Clear local session state.
Navigate to Login.

On failure: show a toast ("Unable to sign out. Please try again.") and remain on Menu. No full-page error state.

Delete Account

Tap

→ Display Step 1 warning dialog explaining consequences: solely-owned pets are deleted, pets shared with a co-owner transfer to that co-owner, photos/documents are deleted, action cannot be undone.

Buttons:

Cancel
Continue

Selecting Continue → Display Step 2 confirmation dialog:

Requires the user to type the literal word `DELETE` into a text field before the destructive button becomes enabled.

Buttons:

Cancel
Delete Account (disabled until `DELETE` is typed)

Selecting Delete Account:

Calls the account deletion workflow.
On success: best-effort sign-out, then redirect to `/login?deleted=1`.
On failure: show inline error text within the Step 2 dialog ("Unable to delete account. Please try again later."). Remain on Menu.

Navigation

Accessible from:

Bottom Navigation

Home
    ↓
Menu

Routes:

`/settings`

Navigation destinations:

Menu
 ├── Account (via User Card)
 ├── Pet Sitter
 ├── AI
 ├── Notifications
 ├── Privacy
 ├── Terms of Service
 ├── Settings (routes to Preferences)
 ├── Support
 ├── Install App (conditional)
 ├── Seed Test Data (internal accounts only)
 ├── Reset Test/Demo Account (internal accounts only)
 ├── Sign Out
 └── Delete Account

Pet Sitter and AI are confirmed to remain on Menu. Each requires a separate, dedicated feature specification covering its own screen behavior — out of scope for this document.

Empty States
Missing User Photo

Not applicable. There is no avatar/photo field in the profile data model; the User Card always shows a static generic user icon. If avatar support is added in the future, this section should specify default-avatar fallback behavior.

Missing Display Name

Display email address as the primary identifier.

Missing Email

Display:

"Email unavailable"

Missing Account Type

Default to:

Production

Loading States

On initial load:

Display a single combined skeleton for the whole screen (header, user card, and menu rows share one loading state — not split into separate skeletons per the original spec).
Disable interaction until profile loads.
Error States
Unable to Load Profile

Display:

Unable to load your account information.

Primary action:

Retry (re-attempts auth check)

Sign Out Failed

Display toast:

Unable to sign out.

Please try again.

Remain on Menu.

Delete Account Failed

Display inline error text within the Step 2 delete-confirmation dialog:

Unable to delete account.

Please try again later.

Remain on Menu.

Business Rules
Menu contains owner-level functionality plus two confirmed feature-entry rows, Pet Sitter and AI, each defined by its own dedicated spec.
Delete Pet is available only from the Pet Profile.
Add Pet is available only from the Pets screen.
Account type badge is read-only, supports Production/Test/Demo/Owner.
Decorative illustration has no interaction.
Entire menu row is the tap target.
Menu order is fixed as listed in Section 3.
Destructive actions require confirmation. Delete Account additionally requires typing `DELETE` to enable the destructive button.
Signing out clears the authenticated session before navigation.
Internal/QA-only tooling (Seed Test Data, Reset Test/Demo Account) is gated behind `isInternalAccount(user)` and must never be visible to production end users.
Validation Rules

No editable fields exist on this screen.

Validation requirements:

Authenticated user must exist.
Display name and email gracefully handle null values (name → email → "Email unavailable"; email missing → "Email unavailable").
Account type must be one of: Production, Test, Demo, Owner.

Unknown values default to Production.

Data Requirements

Profile entity (fields actually used by this screen):

User ID
Display name
Email
Account type

No avatar/photo field currently exists on the profile entity.

No additional persistence is required.

The screen is read-only except for Sign Out and Delete Account actions.

Analytics Events

Implementation note: events are tracked via a first-party `track()` helper that writes to a Supabase `analytics_events` table (fire-and-forget; failures are logged to console, not surfaced to the user). This is not a third-party analytics SDK.

Track:

menu_opened

menu_pet_sitter_selected

menu_ai_selected

menu_notifications_selected

menu_privacy_selected

menu_terms_selected

menu_settings_selected

menu_support_selected

install_app_selected

install_app_prompt_result

sign_out_selected

sign_out_confirmed

delete_account_selected

delete_account_confirmed

sandbox_account_reset (internal accounts only)

sandbox_account_seeded (internal accounts only, includes `scenario` property)

Gap: menu_account_selected does not exist. Tapping the User Card to open Account fires no analytics event. Recommend adding this event if account-card engagement needs to be measurable.

Acceptance Criteria

The implementation is complete when:

Menu matches the provided design.
User summary card displays authenticated user information.
Account type badge displays correctly (Production/Test/Demo/Owner).
All menu rows navigate to their destinations.
Entire row is tappable.
Menu remains scrollable if content exceeds viewport.
Bottom navigation remains visible.
Menu tab is highlighted.
Sign Out requires confirmation.
Delete Account requires confirmation and typing `DELETE` to proceed.
Sign Out ends the authenticated session.
Delete Account launches the existing deletion workflow.
Missing display name falls back to email.
Missing email falls back to "Email unavailable".
Loading and error states behave as specified.
Internal-only tooling never appears for non-internal accounts.
Edge Cases
User has no display name.
User profile partially loads.
Authentication session expires while Menu is open.
Sign Out requested while offline.
Delete Account requested while offline.
User rapidly taps multiple menu items.
User returns to Menu after profile update.
Test account displays Test badge.
Demo account displays Demo badge.
Owner account displays Owner badge.
Production account displays Production badge.
Unrecognized account type defaults to Production badge.
User attempts to enable Delete Account button without typing `DELETE` exactly.
Implementation Notes for Claude Code
Preserve the screen layout, spacing, typography, colors, iconography, and interaction patterns shown in the approved screen design. The supplied design is the source of truth for the UI.
The Menu is implemented as the existing `/settings` route, labeled Menu (`src/pages/Settings.jsx`), preserving routing compatibility defined in the Navigation & Information Architecture.
Retrieve profile information through the existing entity/data layer. Do not query Supabase directly from UI components. Follow the Technical Standards for data access, authentication, and error handling.
Menu rows are built as a reusable list component (`MenuListRow`) supporting icon, title, subtitle, trailing chevron, and full-row tap behavior.
Reuse the existing authentication and account deletion flows (`useAuth().logout()`, `src/lib/accountClient.js` `deleteAccount()`). Do not create parallel implementations.
Destructive actions require explicit confirmation before execution; Delete Account additionally requires typed confirmation (`DELETE`).
Continue honoring account types (Production, Test, Demo, Owner) already defined in the data model and profile entity.
Internal/QA-only rows (Seed Test Data, Reset Test/Demo Account) must remain gated behind `isInternalAccount(user)` and excluded from production end-user builds/accounts.
Pet Sitter and AI rows link out to their own dedicated screens/specs; do not build their internal behavior against this document.
