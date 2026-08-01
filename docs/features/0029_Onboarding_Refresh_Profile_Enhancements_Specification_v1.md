# 0029_Onboarding_Refresh_Profile_Enhancements_Specification_v1

**Status:** Draft
**Date:** 2026-08-01
**Related files:** `src/pages/PetOnboarding.jsx`, `src/components/onboarding/OnboardingWizard.jsx`, `src/components/onboarding/ChoiceCard.jsx`, `src/components/onboarding/ConditionsCard.jsx`, `src/components/onboarding/MedicationEntryCard.jsx`, `src/lib/onboardingConfig.js`, `src/lib/onboardingClient.js`, `src/components/AddPetDialog.jsx`, `src/components/catchup/CatchUpFlow.jsx`, `src/components/VaccinationSection.jsx`, `src/lib/speciesConfig.js`, `src/pages/Home.jsx`, `src/components/BaselineSection.jsx`, `supabase/migrations/0012_pet_onboarding.sql`, `supabase/migrations/0013_pet_onboarding_skipped_at.sql`, `supabase/functions/ask-vet-assistant/index.ts`

## Before You Approve This

- **CLAUDE.md's description of current onboarding is wrong, and this spec corrects it.** CLAUDE.md doesn't describe onboarding at all (only the Vibe/check-in model); the *original* feature request that prompted this work assumed onboarding was a "side drawer." It isn't — it's already a full-screen, multi-step, auto-saving wizard (`OnboardingWizard.jsx`) with a resumable `current_step` pointer and its own progress UI. That means a chunk of the requested work (FR-001, FR-003, FR-004, FR-005) is a restyle of something that already works, not new construction — lower risk than the original ask implied, but it means "replace the side drawer" in the source material should be read as "restyle and reorganize the existing wizard."
- **This spec intentionally reverses a prior documented decision.** The original onboarding spec (`0002 Pet Onboarding.md`) explicitly listed "AI document import" and "AI extraction of diagnoses or medications" as out of scope for V1. Adding medication/vaccination scanning here is a deliberate reversal of that, confirmed with you directly — flagging it so it's a visible decision, not a silent one.
- **Retiring `AddPetDialog` leaves no orphaned code.** Folding pet creation into onboarding's Step 1 means `AddPetDialog.jsx` (currently only used from `Pets.jsx`) should be deleted, not left in place unused. Called out explicitly so it doesn't become dead code nobody remembers to remove.
- **The 5 existing baseline questions (appetite/water/energy/mobility/bathroom) don't map cleanly onto the spec's 6 named steps.** Per your decision, they're folded into Step 2 ("Health Conditions") as trailing sub-cards, and — per your decision — the Review screen gets an added "Baseline" summary card beyond what the screenshots show, so all data collected in onboarding (not just Pet Info/Conditions/Medications/Vaccinations) is reviewable in one place.
- **One nearby table, `pet_baselines` (migration 0014), is fully unused today** (no UI reads or writes it) — this spec's baseline questions continue writing to `pet_onboarding`'s existing fixed columns, exactly as today. Nothing here wires into `pet_baselines`; flagging so it's clear that table isn't secretly getting activated as a side effect.
- **Onboarding access is scoped to owner + co-owner, not sitters, per your decision.** Conveniently, this requires no new access-control code: `pet_onboarding`'s existing RLS policies (migration 0012) already use `is_pet_owner()`, which covers the pet's creator and any `pet_co_owners` row — and explicitly does *not* cover sitter access (sitters get a separate, narrower mechanism via `pet_sits`/`pets_select_sitter`, migrations 0028–0031). `Home.jsx`'s banner logic needs a quick check to confirm it's scoped the same way, but no new database rule is needed.

## Functional Requirements

**Onboarding flow**

1. Adding a new pet opens a full-screen, guided, step-by-step setup experience — not the current pop-up dialog followed by a separate page.
2. The steps are: **Pet Information → Health Conditions → Medications → Vaccinations → Review → Complete.** Behind the scenes, "Health Conditions" also asks the existing baseline questions (appetite, water, energy, mobility, bathroom-habit norms) that onboarding already collects today — nothing currently asked is removed.
3. Every screen shows which step you're on ("Step 2 of 6") and a progress bar. No back button on the very first screen; the Review screen has Back and Finish instead of Back and Continue.
4. Progress is saved automatically after each step. If you close the app or get interrupted, reopening onboarding picks up exactly where you left off, with everything you already entered intact.
5. "Skip for now" remains available at any point once the pet exists, exactly like today — you're never forced to finish onboarding in one sitting.
6. The Review screen shows everything entered so far — Pet Information, Health Conditions, the baseline habit questions, Medications, and Vaccinations — and lets you jump directly back into any section to change something before finishing.
7. A dedicated Completion screen confirms setup is done and offers a "Go to Home" button.

**Profile enhancements**

8. The list of health conditions you can select from is significantly expanded (from ~7-8 options to a full categorized list of about 40), still tailored to whether the pet is a cat or dog. Conditions work exactly as they do today everywhere they already appear (Pet Profile, shared/exported summaries, AI chat context) — no new condition-specific behavior is introduced.
9. Breed entry gets autocomplete suggestions as you type, based on species, but you can still type any custom breed or "Mixed" — nothing is locked to a fixed list.
10. Adding a medication during onboarding offers a choice: **scan a photo of the medication label** to pre-fill the form, or **enter it manually** as today. Scanned values are never saved automatically — you always review and confirm before saving.
11. Adding a vaccination during onboarding offers the same choice: **scan a photo of the vaccination record**, or **enter it manually**. Same confirm-before-save rule applies.

## Acceptance Criteria

- Given a user taps "Add Pet," when the dialog is dismissed, then a full-screen guided flow opens starting at "Step 1 of 6" with no back button visible.
- Given a user is on any step 2–6, when they look at the top of the screen, then they see the correct "Step X of 6" label and a filled progress bar matching their position.
- Given a user completes a step, when they background the app or close the tab, then reopening onboarding for that pet resumes on the same step with all previously entered values intact.
- Given a user is on the Review screen, when they tap a section (e.g. "Medications"), then they're taken directly to that step to edit it, and returning lands back on Review.
- Given a user taps "Skip for now" on any step after Pet Information, then onboarding closes, the pet record persists with whatever was entered so far, and the Home banner still offers "Complete {Pet}'s Profile."
- Given a user selects "Cat" as species on the Health Conditions step, when they open the condition picker, then only cat-relevant conditions (including cat-only ones like FLUTD) are shown, grouped by category.
- Given a user types a partial breed name, when suggestions matching that species appear, then selecting one fills the field, and typing a value not in the list still saves as entered.
- Given a user taps "Scan Medication Label" and uploads a photo, when the scan completes, then the medication form is pre-filled but not saved, and the user must tap a save/confirm action for the data to persist.
- Given a medication or vaccination scan fails or returns unreadable data, when the user is shown the result, then "Add Manually" remains fully available with no data loss.
- Given onboarding fails to save a step (e.g. network error), when the save fails, then the message "We couldn't save your progress. Please try again." is shown, a retry is possible, and previously entered data is not lost.

## Visual Reference

- Screens 1–6 (Welcome, Pet Information, Health Conditions, Medications, Vaccinations, Review & Complete) → illustrate FR-001–FR-007's step order, progress indicator style, and per-step layout (single focused section, no long scrolling forms).
- "Expanded Health Conditions" panel → illustrates FR-008's categorized ~40-condition list (Kidney & Urinary, Digestive, Heart, Endocrine, Neurological, Orthopedic & Mobility, Respiratory, Cancer, Vision & Hearing, Other).
- "Medication Scan Concept" / "Vaccination Scan Concept" screens → illustrate FR-010/FR-011's scan-vs-manual choice and the confirm-before-save review screen (fields shown pre-filled but still editable, with an explicit "Save Medication"/"Save Vaccination" action).
- "From This (Current) → To This (New Experience)" comparison panel → illustrates the shift from the current pop-up "Add Pet" dialog to the full-screen guided flow (FR-001), and marks "Auto-save progress" and "Review before finish" as checklist items, supporting FR-005/FR-006.
- **Not shown in the screenshots, and not assumed:** breed autocomplete UI (FR-009) has no visual reference — implementation should follow the existing Design System's input/combobox conventions rather than inventing a new pattern. Also not shown: what the Review screen displays for the folded-in baseline questions (see Before You Approve This) — treated as an open question below.

## Technical Spec

- **Schema (minimal changes only):**
  - `pet_onboarding.current_step` (migration 0012) is a plain `text` column with a `check` constraint listing valid values (`health, conditions, medications, medication_entry, transition, appetite, water, energy, mobility, bathroom, completed`) — **not** a Postgres enum type, so extending it is a simple constraint swap, not a riskier `ALTER TYPE ... ADD VALUE`. New migration `0041_onboarding_refresh_steps.sql` (next sequential number — latest existing is `0040_auth_confirmation_lookup.sql`) drops and re-adds the check constraint to include `pet_info`, `vaccinations`, `vaccination_entry`, `review` alongside the existing values.
  - No changes to `pets`, `medications`, `vaccinations`, or `pet_onboarding`'s other columns. Health conditions (FR-008) and breed autocomplete (FR-009) are pure client-side configuration changes — no schema impact, per the "minimize schema changes" instruction.
  - `pet_baselines` (migration 0014) is untouched and unread, as today.

- **Components/files touched:**
  - `src/components/onboarding/OnboardingWizard.jsx` — rebuild the shell using `CatchUpFlow.jsx`'s full-screen `createPortal`-to-`document.body` overlay pattern (fixed inset-0, header with conditional back button + close button) in place of the current full-page layout. The existing card-by-card state machine and `savingRef` autosave guard are preserved, not rewritten.
  - `src/lib/onboardingConfig.js` — add an outer 6-step grouping (`pet_info`, `health_conditions`, `medications`, `vaccinations`, `review`, `completed`) that maps onto the existing granular `current_step` values, driving the "Step X of 6" label without changing the underlying per-card flow. Extend `getNextStep()`/`getVisibleSteps()` for the new steps.
  - `src/components/onboarding/PetInfoCard.jsx` (new) — the merged pet-creation form (name, species, breed with autocomplete, birthday, sex, weight, color/markings, microchip toggle), replacing `AddPetDialog`'s form step. On submit, creates the pet (`entities.Pet.create`) then calls the existing `getOrCreatePetOnboarding`.
  - `src/components/AddPetDialog.jsx` — **deleted.** `src/pages/Pets.jsx`'s "Add Pet" entry point instead opens the onboarding overlay directly at the Welcome step.
  - `src/components/onboarding/ConditionsCard.jsx` — extended to render the expanded, category-grouped condition list.
  - `src/lib/speciesConfig.js` — `CAT_CONDITIONS`/`DOG_CONDITIONS` expanded into the ~40-condition, 9-category lists from FR-008, still species-filtered.
  - `src/lib/breedConfig.js` (new) — static per-species breed list for client-side autocomplete only; no schema/API involved.
  - `src/components/onboarding/MedicationEntryCard.jsx` — add a "Scan Medication Label / Add Manually" choice ahead of the existing entry form; scan path reuses the `invokeAI` + `file_urls` + `response_json_schema` pattern already proven in `VaccinationSection.jsx`, with a new medication-specific prompt/schema (name, strength, form, dosage, frequency, prescribing vet, notes). No new edge function.
  - `src/components/onboarding/VaccinationEntryCard.jsx` (new) — new onboarding card, modeled directly on `VaccinationSection.jsx`'s fields and its existing `handleScan` pattern (this is the one direction where scanning is not new, just relocated into onboarding).
  - `src/components/onboarding/ReviewCard.jsx` (new) — summary screen with per-section "edit" links that jump back into the wizard at that step and return to Review afterward.
  - `src/components/onboarding/CompletionScreen.jsx` — copy updated to match FR-007.
  - `src/pages/PetOnboarding.jsx` — kept as the routed entry point (`/pet/:petId/onboarding`) so existing deep links (Home banner, `BaselineSection`'s "Continue it" link) keep working, but it now mounts the full-screen overlay component rather than a plain page layout.
  - `src/pages/Home.jsx` (`CompleteProfileBanner`) and `src/components/BaselineSection.jsx` — unchanged in logic, only need to confirm they still link correctly once `PetOnboarding.jsx`'s rendering changes.

- **API / edge functions:** `supabase/functions/ask-vet-assistant/index.ts` is unchanged — it already accepts an arbitrary prompt + `response_json_schema`, so the medication-scan card is a new client-side prompt/schema, not a new function.

- **Constraints from CLAUDE.md / locked decisions:** Design System Amendment rules (Inter-only type, `bg-card`/`border-border` tokens, semantic tone chips, 44px touch targets, canonical `BottomSheet`/`PillToggle`/`IconButton`/`ListRow` components) apply throughout — new cards (`PetInfoCard`, `VaccinationEntryCard`, `ReviewCard`) must use these existing primitives rather than new one-off styling. `entities.js`/`entityClient.js` remains the only data-access path (matching Technical Standards §on data access), except where `checkinClient.js`-style direct RPC is already established — not applicable here since onboarding writes are simple row inserts/updates, not multi-statement atomic writes.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** `AddPetDialog.jsx` and the onboarding wizard will fully overlap once Pet Info moves into onboarding — resolved by deleting `AddPetDialog.jsx` (see Before You Approve This), not leaving it as dead code.
- **Technical debt nearby:** None found beyond the above. The existing wizard's autosave/re-entrancy-guard pattern is sound and is being extended, not replaced.
- **Orphaned features nearby:** `pet_baselines` (migration 0014) remains unpopulated and unread by any UI — not activated by this work, flagged so it isn't mistaken for wired-up.
- **Punch list / known issues in this area:** No punch-list item references onboarding, breed, conditions, or scanning directly. One tangential item (P4: shared/co-owned pets show degraded UI) raises the open question above about whether onboarding should ever surface for a sitter/co-owner rather than only the original pet creator.

## Non-Goals

- Allergy tracking of any kind (food, environmental, medication), provider directory, a canonical medication/vaccination database, OCR import of full medical records, or an AI onboarding assistant/chat — all explicitly out of scope per the source spec.
- No changes to Daily Check-In, Pet Profile, Timeline, or Pet Sitter functionality beyond the two small link touch-ups noted above (Home banner, "Continue it" link).
- No native camera capture — scanning uses the existing file-upload input (image/PDF), consistent with `VaccinationSection.jsx`'s current pattern; a true camera capture would depend on the not-yet-started Capacitor wrapping work (punch list P1).
- No wiring into `pet_baselines` — baseline questions keep writing to `pet_onboarding`'s existing fixed columns.

## Open Questions

None outstanding — all three prior open questions (Review screen content, co-owner/sitter access, breed data source) were resolved directly with the stakeholder:
- Review screen includes a Baseline summary card in addition to Pet Info/Conditions/Medications/Vaccinations.
- Onboarding access: owner + co-owner, not sitters (matches existing `is_pet_owner()` RLS scope — no new access-control logic required).
- Breed autocomplete: small curated common-breeds list (~30-50 per species), not a large bundled dataset.
