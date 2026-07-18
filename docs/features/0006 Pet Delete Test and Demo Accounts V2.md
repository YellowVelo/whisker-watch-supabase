You are a Senior Systems Engineer on the Wysker Watch Application.
All of the context you need for the specification below is in the Claude Whisker Watch Project. If you are unsure about a specification, ask.
Prior to writing code, explain what you are going to do in plain English.
Before writing code, call out any issues.
Ensure you are testing your code for issues ahead of time.
Write a test plan so we can test in development before deployment.

# Feature Specification

## Pet Management — Pet Deletion, Test Accounts, Demo Accounts

**Document:** `01 Features/Pet Delete Test and Demo Accounts.md`

**Status:** Implemented

**Owner:** Product

**Audience:** Claude Code (Engineering)

---

# Wysker Watch Build Spec
# Pet Deletion, Test Accounts, Demo Accounts

These are three related but separate capabilities.

---

## 1. Delete Single Pet

### Objective

Allow an authenticated user to permanently delete one pet from their account, or remove their own access to a shared pet, without deleting:

- the user account
- other pets
- user profile
- settings
- subscription
- authentication record

Pet deletion is implemented as a dedicated pet-scoped operation, entirely separate from account deletion.

### Entry Point

Delete Pet lives in the individual pet management area, alongside Edit Pet and Over the Rainbow Bridge. Delete Pet uses destructive styling and is not the primary action.

### Confirmation Flow

Selecting Delete Pet shows a modal/sheet:

> Delete [Pet Name]?
>
> This will permanently delete this pet and all information connected to them, including logs, medications, records, photos, and reports.
>
> This will not delete your Wysker Watch account or any other pets.
>
> This cannot be undone.

Buttons: Cancel, Continue.

Continuing requires typed confirmation:

> Type [Pet Name] to confirm.

Final button: Delete Pet, disabled until the typed name matches.

### Backend

A dedicated Edge Function, `supabase/functions/delete-pet/index.ts`, handles pet deletion. It:

- requires an authenticated user (validated via the caller's JWT)
- resolves the caller's relationship to the requested `pet_id` (primary owner vs. co-owner vs. no access) and returns 403 if the caller has no relationship to the pet
- acts only on the single `pet_id` in the request
- never calls account-deletion code and never touches `auth.users`
- never affects any pet other than the one requested
- returns a structured `{ success, mode, pet_name }` response, or `{ error }` on failure

Because a pet can have more than one owner (`pet_co_owners`), the function has three possible outcomes depending on the caller's relationship to the pet:

| Caller is... | Result | `mode` |
|---|---|---|
| Sole owner (no linked co-owners) | Pet and all dependent data permanently deleted | `deleted` |
| Primary owner, pet has a linked co-owner | Ownership transfers to the oldest linked co-owner; the pet is not destroyed; the new owner receives an in-app notification | `transferred` |
| A co-owner (not primary) | Only the caller's own `pet_co_owners` row is removed; the pet and all its data are untouched; the primary owner receives an in-app notification | `left` |

### Data Deleted

All records connected to the deleted `pet_id` are removed:

- pet profile
- symptom logs
- food logs
- medications
- vaccinations
- weight records
- photos and documents
- timeline events
- daily check-ins
- reports and AI summaries

Most pet-owned tables cascade automatically on `pet_id` via `ON DELETE CASCADE` at the schema level. Two relationships are handled explicitly in code rather than by cascade:

- **Pet photo in Storage**: removed via an explicit Storage delete call before the database row is removed. This is non-fatal — if Storage removal fails, the pet delete proceeds anyway (an orphaned file is preferable to a blocked delete).
- **Pet-sitting records (`pet_sits`)**: `pet_sits.pet_ids` is a `uuid[]` column with no foreign key, so Postgres cannot cascade an individual array element. Before deleting the pet, the function removes the pet's id from any `pet_sits` record it belongs to (or deletes the whole `pet_sits` row if it becomes empty). If this cleanup fails, the entire delete is aborted so a pet is never removed while a dangling reference to it remains.

### Post-Delete Behavior

On success, the pet is removed from the pet list, home, daily check-in, navigation state, and cached selected-pet state, and the user is navigated to My Pets with a confirmation message.

### Edge Cases

- **Only pet deleted:** the account is not deleted; the user sees an empty state ("You don't have any pets yet. Add a pet to start tracking their health story.") with an Add a Pet CTA.
- **Delete fails:** "We couldn't delete this pet. Please try again."
- **Offline:** Delete Pet is disabled with messaging that the user needs to be online.

### Acceptance Criteria

- User can delete one pet.
- Account remains active.
- Other pets remain unchanged.
- Deleted pet disappears from all pet views.
- Pet data is removed or safely cascaded.
- User must type the pet name before deletion.
- Pet deletion and account deletion are separate code paths.
- Server-side ownership checks prevent deleting another user's pet.

---

## 2. Test Accounts

### Objective

Support internal accounts for development and QA that can be freely reset, seeded, and broken without risking real pet data.

### Account Type

`profiles.account_type` holds one of four values: `production`, `test`, `demo`, `owner`. All new signups default to `production`.

Test and demo status is assigned by email allowlist at signup time, not by a self-service toggle or an in-app admin action. `public.classify_account_type(email)` (in `supabase/migrations/0010_account_type.sql`) checks the new user's email against a short, hardcoded allowlist (e.g. `test1@wyskerwatch.com`, `test2@wyskerwatch.com`, `demo1@wyskerwatch.com`) and assigns `test`/`demo` accordingly via the `handle_new_user()` signup trigger. To provision a new internal test or demo account, an engineer adds its email to the allowlist in a new migration and creates the corresponding user directly in Supabase Auth (e.g. via the dashboard).

The fourth value, `owner`, represents a real personal-use account (e.g. an internal team member's own pets) — excluded from real-user analytics the same way test/demo accounts are, but deliberately ineligible for the reset tool described below, so it can never be wiped.

### Required Behavior

Test accounts support the full range of normal app functionality — add/edit/delete pet, onboarding, logs, medications, vaccines, documents, AI features, and report generation — plus two internal-only tools:

**Reset Test Account** — `supabase/functions/reset-sandbox-account/index.ts`. Wipes all pets and pet-related data belonging to the calling user (owned pets, their cascaded data, pet photos in Storage, and any co-owner links), without touching the login/auth record. The function is server-guarded: it checks the caller's `account_type` and refuses (403) unless it is `test` or `demo` — production and owner accounts can never be reset this way.

**Seed Data** — `src/lib/seedTestData.js`, exposed in Settings. Each scenario creates realistic sample data through the normal entity API, so seeded data goes through the same validation and RLS paths a real user's data would. Shipped scenarios:

- **Empty Account** — clears existing sample data, seeds nothing.
- **Healthy Dog** — one healthy adult dog with a vaccination, a food log, and a few days of normal symptom logs.
- **Multi-Pet Household** — a dog, an adult cat, and a kitten, each with a same-day symptom log.
- **Insights Trends (Harper / Tribble / Auggie)** — three pets seeded with 30 days of Daily Check-In history each, engineered to produce stable, declining, and improving wellness trends respectively, for exercising Insights charts.

The Seed Data picker in Settings filters which scenarios are shown by account type (test-flavored scenarios aren't offered to the demo account and vice versa).

### Access Control

Reset Test Account and Seed Data are gated behind `isInternalAccount(user)` (`src/lib/accountType.js`): every `test` account qualifies automatically; a `demo` account only qualifies if it is also flagged `role = 'admin'` on its profile.

### Visual Indicator

`src/components/AccountTypeBanner.jsx` renders a persistent, non-dismissable banner on every screen for test accounts:

> **TEST ACCOUNT** — Changes made here are for testing only.

Styled in amber, visually distinct from the app's normal teal palette so it can't be mistaken for a regular notice. The banner publishes its own rendered height as a `--account-banner-height` CSS variable so other sticky/fixed top-of-screen elements can offset around it.

### Notifications / Email

No reminder, marketing, or vet-email sending exists in the app today. The one real outbound email path, co-owner invitations (`supabase/functions/invite-co-owner/index.ts`, sent via `supabase/functions/_shared/email/sendEmail.ts` using Resend), checks the inviting account's `account_type` and skips the real send for `test`/`demo` accounts.

No push notification infrastructure (FCM, APNs, web push) exists in the app; the only notification mechanism is the in-app `notifications` table, which is unaffected by account type.

### Analytics

Every analytics event recorded in `analytics_events` (`src/lib/analytics.js`) is tagged with the account's `account_type`, so test and demo activity remains identifiable and can be filtered out of production analytics views without being discarded at write time.

### Acceptance Criteria

- User can log into a test account separate from their real account.
- TEST ACCOUNT banner is always visible.
- Test data does not affect production pet data.
- Test account can be reset without deleting the login.
- Test account can be seeded with useful scenarios.
- Test analytics events are tagged with `account_type = test` and can be filtered out of production views.
- Co-owner invite emails are suppressed for test accounts.

---

## 3. Demo Accounts

### Objective

Provide a polished, always-resettable environment for showing Wysker Watch to other people, distinct from the messier Test Accounts used for QA.

### Account Type

`account_type = demo`, assigned via the same signup-time email allowlist described in §2.

### Demo User Behavior

A demo account can be used to view pets, profiles, timelines, logs, trends, reports, and AI summaries just like a production account. There is no separate read-only UI mode for demo viewers — the experience is governed by the same ownership and RLS rules every account uses. The internal tools that would let someone reset or reseed the demo data (§2's Reset Test Account and Seed Data) are gated behind `isInternalAccount(user)`, which for a demo account additionally requires `role = 'admin'` on the profile — so a demo login without that admin flag has no access to destructive or reseeding actions.

### Demo Admin Behavior

An admin is a user whose profile has `role = 'admin'`. On the demo account, an admin can use the same Reset Test Account and Seed Data tools described in §2 to wipe the demo account's data and reseed it with the demo showcase scenario below.

### Visual Indicator

`AccountTypeBanner.jsx` renders a persistent, non-dismissable banner for demo accounts:

> **DEMO MODE** — Explore Wysker Watch with sample pets and health history.

Styled in violet/purple, distinct from both the app's normal palette and the Test Account banner's amber.

### Demo Household

The demo account is seeded via the `demo_showcase` scenario in `src/lib/seedTestData.js`:

- **Maple** — senior cat with CKD, seeded with 30 days of declining wellness trend history, a medication record (Benazepril), and a fixed photo.
- **Cooper** — healthy adult Golden Retriever, seeded with 30 days of stable wellness trend history, a vaccination record, a food log, and a fixed photo.

Both pets' photos are stored under a shared Storage path (`uploads/shared/...`) outside any individual user's own folder, so the per-user storage cleanup in Reset Test Account never deletes them — every reseed of the demo account points back at the same two images.

Resetting and reseeding the demo account (via the same tools as §2) restores it to this same Maple/Cooper baseline every time.

### Notifications / Email

Demo accounts never trigger real reminder, marketing, or vet emails (none exist in the app), and there is no push notification infrastructure to trigger. Co-owner invite emails, the app's one live email path, are suppressed for demo accounts the same way they are for test accounts (§2).

### Analytics

Demo account usage is tagged with `account_type = demo` in `analytics_events`, the same mechanism used for test accounts, so it can be identified and filtered out of production analytics views.

### Privacy

The demo household (Maple, Cooper) is entirely fictional sample data — no real user's pets, logs, photos, or documents are used.

### Acceptance Criteria

- Demo account is separate from production and test accounts.
- DEMO MODE banner is always visible.
- Demo contains polished sample data (Maple, Cooper).
- Resetting/reseeding the demo account requires `role = 'admin'` on top of `account_type = demo`.
- Demo account cannot send real co-owner invite emails.
- Demo data cannot affect production or test accounts.

---

## 4. Shared Technical Requirements

### Account Type

Four values are supported: `production`, `test`, `demo`, `owner`. All existing and newly-signed-up users default to `production`. Behavior branches by account type via helpers in `src/lib/accountType.js`:

- `isProductionAccount(user)`
- `isTestAccount(user)`
- `isDemoAccount(user)`
- `isOwnerAccount(user)`
- `isDemoAdmin(user)` — checks `role = 'admin'` only, independent of `account_type`
- `isInternalAccount(user)` — the combined gate for reset/seed tooling: true for any `test` account, or a `demo` account that is also `isDemoAdmin`

### Data Safety

Production, test, demo, and owner data remain isolated. No operation from one account type affects another:

- `reset-sandbox-account` is server-guarded to only run for `test`/`demo` accounts, so `production` and `owner` accounts can never be wiped through it.
- Pet deletion is scoped by `pet_id` and the caller's ownership/co-ownership, verified server-side against `auth.uid()`, regardless of account type.

### Banners

Persistent banners, rendered by `AccountTypeBanner.jsx`:

- **TEST ACCOUNT** — Changes made here are for testing only. (amber)
- **DEMO MODE** — Explore Wysker Watch with sample pets and health history. (violet)

No banner is shown for `production` or `owner` accounts.

### Delete Safety

Pet deletion is scoped by `pet_id`, ownership (`created_by` / `pet_co_owners`), and `auth.uid()`, verified inside a dedicated Edge Function. It never calls account-deletion logic.

---

## Test Plan

1. **Delete Single Pet**
   - Sole owner deletes a pet → pet and all dependent records removed; account and other pets unaffected; empty state shown if it was the only pet.
   - Primary owner with a linked co-owner deletes the pet → ownership transfers to the co-owner; pet remains visible to the new owner; new owner receives a notification.
   - Co-owner (non-primary) deletes/leaves the pet → only their access is removed; pet and its data are untouched; primary owner receives a notification.
   - User with no relationship to a pet attempts delete via API → 403.
   - Pet that is part of an active `pet_sits` record is deleted → pet id removed from the `pet_sits` record (or the record removed if it becomes empty); no dangling reference remains.
   - Delete fails mid-operation (simulate a DB error) → structured error returned, pet not left in a partially-deleted state.
2. **Test Accounts**
   - Sign up with an allowlisted test email → `account_type = test` assigned automatically; TEST ACCOUNT banner visible.
   - Run Reset Test Account on a test account → all pets/data wiped, login still works.
   - Attempt to call `reset-sandbox-account` as a production account → 403.
   - Run each seed scenario and confirm the resulting pets/data match the scenario description.
   - Send a co-owner invite from a test account → invite created, real email confirmed not sent.
   - Trigger an analytics event as a test account → event recorded with `account_type = test`.
3. **Demo Accounts**
   - Sign up with the allowlisted demo email → `account_type = demo` assigned; DEMO MODE banner visible.
   - Attempt to run Reset Test Account / Seed Data as a demo account without `role = 'admin'` → tools not shown/accessible.
   - Run Reset + `demo_showcase` seed as a demo admin → Maple and Cooper restored with their expected data.
   - Confirm Maple/Cooper photos survive a reset (shared storage path untouched by the per-user cleanup).
   - Send a co-owner invite from a demo account → real email confirmed not sent.
4. **Cross-cutting**
   - Confirm `owner` accounts cannot be reset via `reset-sandbox-account` (403).
   - Confirm no banner renders for `production` or `owner` accounts.
   - Confirm production account data is never touched by any test/demo/owner-account operation.
