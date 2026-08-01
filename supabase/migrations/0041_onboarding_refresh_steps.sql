-- Spec 0029 (Onboarding Refresh): adds two new current_step values so the
-- existing per-card wizard can grow a Vaccinations card and a Review card
-- ahead of Completion, without changing the column's type or any existing
-- row's meaning. current_step is plain text with a check constraint (not a
-- Postgres enum), so this is a constraint swap, not an ALTER TYPE.
--
-- No 'pet_info' value is added: the new Pet Information step (formerly
-- AddPetDialog) runs before the pet — and therefore this row — exists, so
-- it has nothing to record here.

alter table public.pet_onboarding
  drop constraint pet_onboarding_current_step_check;

alter table public.pet_onboarding
  add constraint pet_onboarding_current_step_check check (current_step in (
    'health', 'conditions', 'medications', 'medication_entry', 'transition',
    'appetite', 'water', 'energy', 'mobility', 'bathroom',
    'vaccinations', 'review', 'completed'
  ));
