You are a Senior Systems Engineer on the Wysker Watch Application. 
All of the context you need for the specification below is in the Claude Whisker Watch Project. If you are unsure about a specification, ask. Prior to writing the code, explain what you are going to do in plain English.
Before writing code, call out any issues.
Ensure you are testing your code for issues ahead of time.
Write a test plan so we can test in development before deployment.
 
# Feature Specification

## Pet Management – Add Pet Expansion (V1)

**Document:** `01 Features/Pet Delete Test and Demo Accounts.md`

**Status:** Ready for Implementation

**Owner:** Product

**Audience:** Claude Code (Engineering)

---

Wysker Watch Build Spec
Pet Deletion, Test Accounts, Demo Accounts
Priority

Build in this order:

Delete Single Pet
Test Accounts
Demo Accounts

These are related but separate capabilities.

1. Delete Single Pet
Objective

Allow an authenticated user to permanently delete one pet from their account without deleting:

the user account
other pets
user profile
settings
subscription
authentication record
Current Problem

Wysker Watch already supports deleting an entire account.

This feature must not reuse account deletion logic.

Deleting a pet must only delete the selected pet_id and dependent pet data.

Entry Point

Add Delete Pet to the individual pet management area.

Recommended menu:

Edit Pet
Over the Rainbow Bridge
Delete Pet

Delete Pet must be destructive styling and not the primary action.

Confirmation Flow

When selected, show modal/sheet:

Delete [Pet Name]?

This will permanently delete this pet and all information connected to them, including logs, medications, records, photos, and reports.

This will not delete your Wysker Watch account or any other pets.

This cannot be undone.

Buttons:

Cancel
Continue

Then require typed confirmation:

Type [Pet Name] to confirm.

Final button:

Delete Pet

Button remains disabled until the name matches.

Backend Requirements

Create a dedicated pet deletion service/function.

Requirements:

require authenticated user
verify pets.owner_id = auth.uid()
delete only selected pet_id
cascade or explicitly delete dependent records
never call account deletion code
never delete from auth.users
never delete unrelated pets
return structured success/error response
Data to Delete

Delete all records connected to selected pet_id, including current and future pet-owned records.

Expected related entities:

pet profile
symptom logs
food logs
medications
vaccinations
bloodwork
weight records
photos
documents
reports
AI summaries
timeline events
sitter access tied to that pet

Claude should inspect the current schema and ensure all pet-owned tables are covered.

Post-Delete Behavior

On success:

[Pet Name] has been deleted.

Navigate to My Pets.

Remove pet from:

pet list
home
daily check-in
navigation state
cached selected pet state
Edge Cases
Only Pet Deleted

Do not delete account.

Show empty state:

You don’t have any pets yet.
Add a pet to start tracking their health story.

CTA:

Add a Pet
Delete Fails
We couldn’t delete this pet. Please try again.
Offline

Disable delete.

You need to be online to delete a pet.
Acceptance Criteria
User can delete one pet.
Account remains active.
Other pets remain unchanged.
Deleted pet disappears from all pet views.
Pet data is removed or safely cascaded.
User must type pet name before deletion.
Pet deletion and account deletion are separate code paths.
RLS prevents deleting another user’s pet.
2. Test Accounts
Objective

Create test accounts for development and QA so functionality can be tested without risking real pet data.

Definition

A Test Account is an internal account type used for experimentation.

It is allowed to be messy, reset, broken, wiped, and reseeded.

Account Type

Add or extend account metadata:

account_type:
- production
- test
- demo

Test account:

account_type = test
Required Behavior

Test accounts must support:

add pet
edit pet
delete pet
pet onboarding
logs
medications
vaccines
documents
AI tests
report generation
reset test data
seed test scenarios
Visual Indicator

Show persistent banner on all screens:

TEST ACCOUNT
Changes made here are for testing only.

Use a visual treatment clearly different from production.

Reset Test Account

Add internal/test-only action:

Reset Test Account

Behavior:

deletes all pets and pet-related data for that test account
does not delete login/account
does not affect production users
does not affect demo accounts
Seed Data

Add seed actions:

Empty Account
Healthy Dog
Healthy Cat
Senior Cat with CKD
Cat with IBD
Dog with Allergies
Multi-Pet Household
Pet With Medications
Pet With Vaccines
Pet With Logs
Notifications / Email

By default, test accounts must not send production communications:

no real reminder emails
no production push notifications
no marketing emails
no vet emails unless explicitly enabled for testing
Analytics

Test usage should be excluded from production analytics or clearly flagged as test.

Access Control

Only authorized admin/developer users can create or mark accounts as test.

Acceptance Criteria
User can log into a test account separate from real account.
TEST ACCOUNT banner is always visible.
Test data does not affect production pet data.
Test account can be reset without deleting login.
Test account can be seeded with useful scenarios.
Test data is flagged or excluded from analytics.
Notifications/emails are disabled by default.
3. Demo Accounts
Objective

Create polished demo accounts for showing Wysker Watch to other people without exposing real personal data or using messy test accounts.

Definition

A Demo Account is a curated presentation environment.

It is not for QA.

It should show Wysker Watch at its best.

Account Type
account_type = demo
Demo User Behavior

General demo users can:

view pets
open profiles
view timelines
view logs
view trends
view reports
view AI summaries
explore the app

General demo users cannot permanently:

add pets
delete pets
edit pets
add logs
delete logs
upload documents
send emails
trigger notifications
change permanent demo data

Blocked action message:

Demo Mode is read-only. Create your own account to start tracking your pets.
Demo Admin Behavior

Demo must be editable by authorized admins.

Admins can:

add demo pets
edit demo pets
add logs
add medications
add vaccines
add weights
add reports
add timeline history
add AI summaries
publish demo data
Demo Admin Mode

Add admin-only capability:

Edit Demo Data
Publish Demo Snapshot
Reset Demo to Published Snapshot
Demo Data Model

Recommended implementation:

demo baseline/template dataset
public demo users see published snapshot
non-admin changes are blocked or temporary
admin changes can be published to the demo baseline
Visual Indicator

Show persistent banner:

DEMO MODE
Explore Wysker Watch with sample pets and health history.
Demo Household

Seed polished sample household:

Tribble

Senior cat with CKD + IBD.

Demonstrates:

chronic condition tracking
appetite trends
GI logs
weight history
medication history
vet report
AI summary
Harper

Healthy young dog.

Demonstrates:

preventive care
vaccines
baseline tracking
normal check-ins
Auggie

Border Collie with allergies/behavior notes.

Demonstrates:

symptom tracking
behavior observations
medication tracking
recurring patterns
Goose

New cat/newly added pet.

Demonstrates:

onboarding
early profile setup
new pet experience
Demo Data Should Include
pet profiles
photos
diagnoses/conditions
daily check-ins
symptom logs
appetite logs
weight history
medications
vaccinations
vet reports
timeline events
AI summaries/insights
Notifications / Email

Demo accounts must never send real:

emails
vet reports
reminders
push notifications
marketing messages
Privacy

Demo data must not expose real private user data.

All logs, reports, dates, notes, and documents should be fictionalized or intentionally approved.

Analytics

Demo account usage should be excluded from production analytics or flagged as demo usage.

Acceptance Criteria
Demo account is separate from production and test accounts.
DEMO MODE banner is always visible.
Demo contains polished sample data.
General demo users cannot permanently modify demo data.
Admins can edit and publish demo data.
Demo account cannot send real notifications or emails.
Demo data cannot affect production or test accounts.
Shared Technical Requirements
Account Type

Implement:

production
test
demo

Behavior should branch by account type.

Suggested Helper
isProductionAccount()
isTestAccount()
isDemoAccount()
isDemoAdmin()
Data Safety

Production, test, and demo data must remain isolated.

No operation from one account type should affect another.

Banners

Persistent banners:

TEST ACCOUNT
Changes made here are for testing only.
DEMO MODE
Explore Wysker Watch with sample pets and health history.
Delete Safety

Pet deletion must be scoped by:

pet_id
owner_id
auth.uid()

Never use account deletion logic.

Build Order
Phase 1

Build Delete Single Pet.

Phase 2

Add account_type.

Build Test Account banner, reset, and seed data.

Phase 3

Build Demo Account mode, demo banner, read-only viewer behavior, and admin edit/publish flow.


## Implementation Notes for Claude Code
Implementation Notes for Claude Code
Preserve the existing visual style, spacing, and component patterns defined by the Design System.
Follow the project architecture by routing all data access through the existing data layer rather than directly from UI components.
Implement any schema changes through migrations consistent with the Technical Standards.
Treat Delete Pet, Test Accounts, and Demo Accounts as three related but separate capabilities.
Do not reuse or modify the existing Delete Account logic for pet deletion.
Implement pet deletion as a dedicated pet-scoped operation using pet_id, owner_id, and auth.uid().
Ensure deleting a pet never deletes the user account, profile, authentication record, settings, subscription data, or other pets.
Verify all pet-owned records are removed through safe cascades or explicit cleanup, based on the current schema.
Add account_type in a way that supports production, test, and demo without disrupting existing production users.
Default all existing users to production.
Keep Test Account data fully isolated from real pet data.
Keep Demo Account data fully isolated from both production and test data.
Add persistent visual banners for Test and Demo modes so users always know which environment they are in.
Disable real emails, push notifications, vet reports, and production analytics for Test and Demo accounts unless explicitly enabled for internal testing.
Implement Test Account reset and seed data as admin/internal-only tools.
Implement Demo Accounts as read-only for general demo viewers, but editable by authorized admins through Demo Admin Mode.
Demo Admin changes should update a curated demo dataset or published snapshot, not random viewer session data.
Protect all destructive actions with authentication, ownership checks, RLS, clear confirmation copy, and structured error handling.
Preserve existing pets, logs, onboarding, and account behavior without regression.