-- Wysker Watch — Pet Onboarding ("Complete {PetName}'s Profile")
--
-- Adds a single owner-scoped table holding the wizard's progress and the
-- pet's initial behavioral baseline. One row per pet.
--
-- Health status / medications-yes-no / baseline answers are stored as
-- their own columns (rather than a generic key/value blob) so they can be
-- read and edited directly from the Pet Profile, per the "editable later"
-- requirement in the onboarding spec.
--
-- Diagnoses are NOT duplicated here — Card 2 ("Known Conditions") writes
-- straight to the existing public.pets.conditions text[] column, which the
-- rest of the app (chips on PetCard, PetProfile, PetProfileTabs) already
-- reads. Adding a second diagnoses field would violate "Extend before
-- creating" and create two sources of truth.
--
-- current_step records the last card reached so an interrupted flow can
-- resume exactly where the owner left off (no explicit "skipped" state is
-- needed: a pet with no row, or a row with completed_at still null, is
-- simply "not yet complete" and drives the persistent Home banner).

create table public.pet_onboarding (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null unique references public.pets(id) on delete cascade,

  health_status text check (health_status in ('healthy', 'ongoing_conditions', 'unsure')),
  medications_status text check (medications_status in ('none', 'has_medications')),

  appetite_baseline text check (appetite_baseline in ('always_finishes', 'usually_finishes', 'leaves_some', 'free_feeds')),
  water_baseline text check (water_baseline in ('very_little', 'about_average', 'more_than_most')),
  energy_baseline text check (energy_baseline in ('very_active', 'moderate', 'calm')),
  mobility_baseline text check (mobility_baseline in (
    'jumps_everywhere', 'moves_normally', 'doesnt_jump_much', -- cats
    'loves_walks_running', 'active_but_moderate', 'tires_easily', -- dogs
    'uses_ramps_stairs' -- shared by both species
  )),
  bathroom_baseline text check (bathroom_baseline in (
    'litter_1_2x', 'litter_3_4x', 'litter_5plus', -- cats
    'walks_1_2x', 'walks_3_4x', 'walks_5plus', -- dogs
    'varies' -- shared by both species
  )),

  current_step text not null default 'health' check (current_step in (
    'health', 'conditions', 'medications', 'medication_entry', 'transition',
    'appetite', 'water', 'energy', 'mobility', 'bathroom', 'completed'
  )),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pet_onboarding_pet_id_idx on public.pet_onboarding(pet_id);
create index pet_onboarding_created_by_idx on public.pet_onboarding(created_by);

create trigger set_updated_at before update on public.pet_onboarding
  for each row execute procedure public.set_updated_at();

alter table public.pet_onboarding enable row level security;

-- Matches every other pet-scoped child table since migration 0004: use
-- is_pet_owner() (original owner OR co-owner) rather than a bare
-- created_by = auth.uid() check, so co-owners get the same baseline
-- read/write access they already have to medications, symptom_logs, etc.
create policy "pet_onboarding_select_owner" on public.pet_onboarding for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_onboarding_insert_owner" on public.pet_onboarding for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_onboarding_update_owner" on public.pet_onboarding for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_onboarding_delete_owner" on public.pet_onboarding for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- Card 4 (Medication Entry) needs a reminder toggle per medication; the
-- medications table otherwise already covers name/dose/frequency.
alter table public.medications
  add column reminder_enabled boolean not null default false;
