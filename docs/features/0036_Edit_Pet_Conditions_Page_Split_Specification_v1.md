# 0036_Edit_Pet_Conditions_Page_Split_Specification_v1

**Status:** Draft
**Date:** 2026-08-02
**Related files:** `src/components/EditPetSheet.jsx`, `src/components/PetProfileContent.jsx`, `src/components/ExpandablePetProfileCard.jsx`, `src/pages/PetOnboarding.jsx`, `src/components/onboarding/PetInfoCard.jsx`, `src/components/onboarding/ConditionsCard.jsx`, `src/lib/speciesConfig.js`, `src/lib/breedConfig.js`, `src/App.jsx`, `docs/features/0009 Pet Profile Feature V4.md`, `docs/features/0029_Onboarding_Refresh_Profile_Enhancements_Specification_v1.md`, `supabase/migrations/0001_init_schema.sql`, `supabase/migrations/0008_add_pet_identity_fields.sql`, `supabase/migrations/0042_pets_color_markings.sql`

## Before You Approve This

- **This fixes a real, user-visible bug, not just a tidiness issue.** Today, tapping "Edit Pet" and tapping the "Conditions" card on the Pet Profile open the *exact same* sliding panel (`EditPetSheet.jsx`) — there's no way to jump straight to editing conditions without seeing the whole pet-identity form too. Splitting them was the original ask; the investigation below found the split also needs to fix what's *inside* Edit Pet, not just how it's opened.
- **Several pet fields exist in the database and were collected when the pet was created, but can never be edited again afterward — until now.** Sex, spayed/neutered status, color/markings, gotcha day, microchip number, and AKC registration info (name/number/breeder) are all real columns on the pet record, all filled in once during onboarding's "Pet Information" step, and none of them appear anywhere in today's Edit Pet form. Per your decision, the new Edit Pet page closes this gap — these become editable for the first time since the pet was created.
- **One field is being quietly removed, not just moved.** Edit Pet currently has a free-text "Medications" box that saves to a column literally commented in the database as "distinct from the medications table." Nothing in the app — not the Pet Profile, not Trends, not the Vet Report — ever displays what's typed there. Per your decision, this field is dropped from the new Edit Pet page. The database column itself is left alone (no migration) in case old data in it matters later; it just becomes write-only-in-the-past, unreachable from the UI going forward.
- **Species stays locked, per your decision.** Species drives which conditions/vaccines/breed suggestions apply to a pet; changing it after the fact could silently orphan already-selected conditions or vaccination records. Not part of this spec — flagged as a possible future spec if ever wanted.
- **This reuses onboarding's field UI instead of writing a second copy of it.** Onboarding's `PetInfoCard` and `ConditionsCard` already have richer, more complete versions of "edit a pet's identity fields" and "pick conditions" than `EditPetSheet` does today (see Repo Findings below). Rather than hand-building new form UI for the two new pages, this spec extracts the actual field-rendering logic out of those onboarding components into shared pieces that both onboarding (creating a pet) and these new pages (editing an existing pet) render. That means onboarding's UI doesn't change at all — it's the same wizard, same steps, same autosave — it's just no longer the *only* place that UI lives.

## Functional Requirements

1. Tapping the **"Edit Pet"** action on a pet's profile opens a dedicated **Edit Pet page** — not the shared sliding panel used today — showing only fields that describe the pet itself: photo, name, breed, color/markings, sex, spayed/neutered status, birth date, gotcha day, microchip number, AKC registration (dogs only), nicknames, favorite activities, notes, and the "Invite Co-Owner" action. Conditions do not appear on this page.
2. Tapping the **"Conditions"** card on a pet's profile opens a separate, dedicated **Conditions page** — not the Edit Pet page, not the shared sliding panel — showing only the pet's condition picker. Selecting or removing a condition here does not touch any other pet field.
3. Both pages are reached by navigating to a URL (like Medications, Food, and Vaccinations already do today), not by opening an overlay panel. Each has its own back button that returns to the Pet Profile.
4. The Conditions page's picker matches the improved version already used when setting up a new pet during onboarding: conditions are grouped under category headings (Digestive, Kidney & Urinary, Heart, etc.) and searchable by typing, instead of today's single flat list of ~40 unsorted options.
5. The Edit Pet page adds editing for fields that exist on the pet record but, until now, could only ever be set once — at the moment the pet was created — and never changed again: sex, spayed/neutered status, color/markings, gotcha day, microchip number, and AKC registration (registered yes/no, registered name, registration number, breeder). Birth date and gotcha day support the same "exact date / month & year / year only / I don't know" precision choice already offered when the pet was first added.
6. The free-text "Medications" box present in today's Edit Pet form is removed. It was never shown anywhere else in the app.
7. Species is not editable on the Edit Pet page (unchanged from today — it's fixed at creation).
8. Saving on either page updates only the fields on that page and returns to the Pet Profile, which reflects the change immediately.

## Acceptance Criteria

- Given a user is viewing an expanded Pet Profile, when they tap the "Edit Pet" action pill, then they land on a dedicated Edit Pet page (its own URL) showing pet-identity fields but no condition picker.
- Given a user is viewing an expanded Pet Profile, when they tap the "Conditions" card, then they land on a dedicated Conditions page (its own URL, different from Edit Pet's) showing only the condition picker, grouped by category with a search box.
- Given a user is on the Conditions page, when they select or deselect a condition and save, then only `pet.conditions` changes — name, breed, birth date, etc. are untouched.
- Given a user is on the Edit Pet page for a dog, when they scroll down, then they can view and edit sex, spayed/neutered status, color/markings, gotcha day, microchip number, and AKC registration fields — all pre-filled with whatever was entered during onboarding, if anything.
- Given a user is on the Edit Pet page for a cat, when they scroll down, then the AKC registration section (dog-only) does not appear, matching how it already works during onboarding.
- Given a user opens the Edit Pet page for a pet that has never had any of the newer fields set (e.g. an older pet created before these columns existed, or one that skipped onboarding), then those fields simply appear blank/unset, not as an error.
- Given a user is on the Edit Pet page, when they look for a "Medications" text field, then it is not present.
- Given a user taps "Back" on either the Edit Pet or Conditions page without saving, then no changes are written and the Pet Profile shows the pet's prior values.
- Given a co-owner (not the primary owner) opens Edit Pet or Conditions for a shared pet, then they can edit and save exactly as the primary owner can today (permissions unchanged from the current sheet's behavior).

## Test Plan

- "Edit Pet" opens a dedicated page with no condition picker → Playwright test: navigate to Pets, expand a seeded pet, tap "Edit Pet," assert URL changes to `/pet/:petId/edit` and the Conditions picker/search box is not present on the page.
- "Conditions" card opens a separate dedicated page → Playwright test: from the same expanded profile, tap the "Conditions" card, assert URL is `/pet/:petId/conditions` (distinct from `/edit`), assert category headings and a search input are visible.
- Selecting a condition and saving updates only conditions → Playwright test: on the Conditions page, toggle one condition on, save, return to Pet Profile, assert the Conditions card's count increased by one and the pet's name/breed shown in the header are unchanged.
- New identity fields are editable and persist → Playwright test: on the Edit Pet page for a dog fixture, set sex, spayed/neutered status, and a microchip number, save, reopen the page, assert the same values are pre-filled.
- AKC section is dog-only → Playwright test: open Edit Pet for a cat fixture, assert no AKC-related fields render; open it for a dog fixture, assert they do.
- Free-text Medications field is gone → Playwright test: on the Edit Pet page, assert no field labeled "Medications" exists.
- Back without saving discards changes → Playwright test: change the Name field, tap Back without saving, reopen Edit Pet, assert the original name is still shown.
- **Seeding/access constraints:** none — every scenario above uses a normal signed-in test-account session and the existing `entities.Pet.update()` path (same one `EditPetSheet` already uses today), which a normal user session can already write to under the current `pets_update_own` / co-owner RLS policies. No server-only or admin-only data is involved. The co-owner permission scenario is **not** included as a new automated test — this spec doesn't change who can write, only where the UI for writing lives, so it's covered by existing co-owner test coverage (if any) rather than duplicated here; flagged as a gap if no such coverage currently exists, but out of scope to add in this spec.

## Visual Reference

No mockups or screenshots were provided for this change (the screenshot shared earlier in conversation is today's *existing* Edit Profile sheet, used here only to identify the bug, not as a design target). Layout for both new pages should follow the existing page pattern already used by `PetMedications.jsx`/`PetFood.jsx`/`PetVaccinations.jsx` (sticky header with back button + title, `PageTransition` wrapper, `max-w-2xl` centered content) — see Technical Spec below. No new visual design is being introduced; this reuses two existing patterns (the page shell, and onboarding's form-field styling) rather than inventing a third.

## Technical Spec

- **Schema:** No changes. Every field involved (`sex`, `altered_status`, `color_markings`, `gotcha_date`, `gotcha_date_precision`, `microchip_number`, `akc_registered`, `akc_registered_name`, `akc_registration_number`, `breeder`, `birth_date_precision`, `conditions`) already exists on `public.pets` (migrations `0001`, `0008`, `0042`). `medications` (the free-text column) is untouched in the database — only removed from the UI.

- **Components/files touched:**
  - **New shared field components** (extracted from onboarding so both onboarding and the new pages render the same UI instead of two copies):
    - `src/components/onboarding/fields/PetIdentityFields.jsx` (new) — the portion of `PetInfoCard.jsx`'s form (name, breed with autocomplete, color/markings, sex, altered status, birth date + precision picker, gotcha day + precision picker, microchip number, AKC block, notes) minus the species-selection step and the create-a-pet submit handling, which don't apply to editing. Takes `species` as a fixed prop (for the dog-only AKC section and breed suggestions) rather than letting it be chosen.
    - `src/components/onboarding/fields/DateInfoFields.jsx` (new) — `PetInfoCard.jsx`'s existing inline `DateInfoFields` function (precision pill-picker + matching date/month/year input), extracted so `PetIdentityFields` and `PetInfoCard` both use it instead of `PetInfoCard` keeping a private copy.
    - `src/components/onboarding/fields/ConditionsPicker.jsx` (new) — `ConditionsCard.jsx`'s search box + category-grouped chip grid, extracted with its "Continue" button and step-specific eyebrow copy left behind in `ConditionsCard` (which keeps using it as a step) so the picker itself is copy-agnostic and reusable by the new Conditions page.
  - `src/components/onboarding/PetInfoCard.jsx` — refactored to render the new `PetIdentityFields`/`DateInfoFields` instead of its current inline field markup. No behavior change for onboarding itself.
  - `src/components/onboarding/ConditionsCard.jsx` — refactored to render the new `ConditionsPicker` instead of its current inline markup. No behavior change for onboarding itself.
  - `src/pages/PetEdit.jsx` (new) — routed page at `/pet/:petId/edit`, modeled on `PetMedications.jsx`'s shell (sticky header, back button, `PageTransition`). Loads the pet, renders `PetIdentityFields` plus Photo/Nicknames/Favorite Activities/Notes/Invite-Co-Owner (carried over from today's `EditPetSheet.jsx`, unchanged), single "Save Changes" button calling `entities.Pet.update()`, navigates back to `/pets` (matching where the profile lives) on success.
  - `src/pages/PetConditions.jsx` (new) — routed page at `/pet/:petId/conditions`, same page shell, renders `ConditionsPicker` bound to `pet.conditions`, single "Save Changes" button calling `entities.Pet.update(pet.id, { conditions })`.
  - `src/App.jsx` — add the two new routes (`/pet/:petId/edit`, `/pet/:petId/conditions`) alongside the existing `/pet/:petId/medications` etc.
  - `src/components/PetProfileContent.jsx` — the "Edit Pet" `ActionPill`'s `onClick` changes from `setEditOpen(true)` to `navigate('/pet/${petId}/edit')`; the Conditions `ListRow`'s `onClick` changes from `setEditOpen(true)` to `navigate('/pet/${petId}/conditions')`. The `editOpen` state, `<EditPetSheet ... />` render, and its now-unused import are removed.
  - `src/components/EditPetSheet.jsx` — **deleted.** Nothing else references it once `PetProfileContent.jsx` is updated (confirmed via repo-wide search — its only consumer is `PetProfileContent.jsx`).
  - `src/components/InviteCoOwnerDialog.jsx` — unchanged; now opened from `PetEdit.jsx` instead of `EditPetSheet.jsx`.

- **API / edge functions:** None. Both pages use the existing `entities.Pet.update()` client-side call — the same one `EditPetSheet.jsx` already uses today. No new edge function, no new RPC.

- **Design System compliance:** Checked against `docs/foundation/0005 Design System.md` including the 2026-07-30 Amendments. No conflicts found:
  - Both new pages reuse the existing routed-page shell pattern (`PageTransition`, sticky header, `IconButton` back button) already used by `PetMedications.jsx` and siblings — not a new pattern.
  - The condition picker's chip styling (category-grouped, `min-h-[44px]` touch targets) already exists in `ConditionsCard.jsx` and is being reused, not redesigned.
  - `PillToggle` (the canonical shared component, per Amendment #8) continues to be used for the date-precision pickers, exactly as `PetInfoCard.jsx` already does.
  - No raw hex colors, no serif fonts, no emoji-as-icon, no sub-13px text, and no new hand-rolled duplicate of `BottomSheet`/`ListRow`/`IconButton`/`ConfirmDeleteDialog` are introduced — both new pages are plain routed pages, not sheets.

- **Constraints from CLAUDE.md / locked decisions:** Respected. All data access continues through `entities.js` (`entities.Pet.update()`), never a direct Supabase call from these components. The retired-scoring rule (no 0–100/0–10 score, no Stable/Declining/Monitor labels) is not implicated — no scoring logic exists on either new page. `0009 Pet Profile Feature V4.md`'s statement that "conditions are edited via the Edit Pet sheet, not a dedicated Condition Management screen" is being deliberately superseded by this spec — see doc update note below.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** This is the central finding driving this spec. `EditPetSheet.jsx`'s condition picker (a flat, ungrouped, unsearchable list) and onboarding's `ConditionsCard.jsx` (grouped into 9 categories, searchable) already read from the exact same underlying data (`getConditions()`/`getConditionCategories()` in `src/lib/speciesConfig.js`) but render two different UIs for it. Similarly, `EditPetSheet.jsx`'s identity form (name/breed/birth date/photo/nicknames/activities/notes) is a subset of onboarding's `PetInfoCard.jsx`, which also collects sex, altered status, color/markings, gotcha day, microchip, and AKC info — fields that, once set at creation, become permanently un-editable because no other UI in the app touches them. This spec resolves both overlaps by extracting the better/fuller version into shared components rather than maintaining two divergent copies.
- **Technical debt nearby:** `pets.medications` is a free-text column whose own migration comment calls it out as legacy ("distinct from the `medications` table"). It's currently the only reason `EditPetSheet.jsx` still has an unexplained field with no visible effect anywhere else in the app. This spec removes it from the UI per your decision; the column itself is left alone.
- **Orphaned features nearby:** None newly introduced by this spec. (Note: `pet_baselines`, migration `0014`, remains unused elsewhere in the app per spec `0029` — unrelated to this change, not touched here.)
- **Punch list / known issues in this area:** `docs/launch-punch-list.md` has one closed item referencing `EditPetSheet.jsx` (a rendering bug fixed in spec `0025`, verified 2026-07-31) — no open punch-list items reference Edit Pet or Conditions. No conflict.
- **Documentation impact:** `docs/features/0009 Pet Profile Feature V4.md` currently states (Summary Cards table and Business Rules) that "conditions are edited via the Edit Pet sheet — there is no separate Condition Management screen." Once this spec ships, that statement becomes false — a `doc-updater` pass should follow implementation to correct `0009`'s Conditions row, Navigation section, and Revision Notes.

## Non-Goals

- Species is not made editable (per your decision) — stays fixed at pet creation.
- No changes to onboarding's own flow, steps, autosave behavior, or wizard UI — only its field-rendering internals are extracted for reuse; the onboarding experience itself is untouched.
- No changes to Medications, Food, Vaccinations, Weight, Observations, Timeline, Health Records, or any other Pet Profile card — this spec only touches the Edit Pet and Conditions destinations.
- No migration or change to the `pets.medications` legacy column itself — it's removed from the UI only, not dropped from the database.
- No new co-owner/sitter permission logic — access control is unchanged from today's `EditPetSheet.jsx` behavior.
- `AddPetDialog.jsx` is not part of this spec — per spec `0029`, pet creation already lives entirely in onboarding.

## Open Questions

None outstanding — all decisions from the "Before You Approve This" flags and the field-scope/routing/reuse questions were resolved directly with you before drafting.
