-- Whisker Watch — initial Supabase schema
-- Migrated from Base44 entities (Cat, CatFood, FoodLog, Medication, Vaccination,
-- Bloodwork, SymptomLog, PetSit, PetSitLog, PetSitterAccess, User)
--
-- Naming changes from Base44:
--   Cat              -> pets
--   CatFood          -> pet_foods
--   FoodLog          -> food_logs
--   Medication       -> medications
--   Vaccination      -> vaccinations
--   Bloodwork        -> bloodwork
--   SymptomLog       -> symptom_logs
--   PetSit           -> pet_sits
--   PetSitLog        -> pet_sit_logs
--   PetSitterAccess  -> pet_sitter_access
--   User.role        -> profiles.role  (Supabase Auth owns auth.users)
--
-- All "cat_id" / "cat_ids" columns are renamed to "pet_id" / "pet_ids".
-- Base44's `created_by: {{user.email}}` RLS pattern becomes Postgres RLS
-- keyed on auth.uid(), with a created_by column kept (storing the user id)
-- for compatibility / display purposes.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ============================================================
-- profiles  (extends auth.users with app-specific fields)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- pets  (was: Cat)
-- ============================================================
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  species text not null default 'Cat' check (species in ('Cat', 'Dog')),
  name text not null,
  photo_url text,
  breed text,
  birth_date date,
  conditions text[] default '{}',
  nicknames text[] default '{}',
  favorite_activities text[] default '{}',
  medications text, -- free-text field, distinct from the `medications` table
  notes text,
  is_memorial boolean not null default false,
  memorial_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pets_created_by_idx on public.pets(created_by);

-- ============================================================
-- pet_foods  (was: CatFood)
-- ============================================================
create table public.pet_foods (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  name text not null,
  brand text,
  food_type text check (food_type in ('Wet food', 'Dry food', 'Raw', 'Freeze-dried', 'Treat', 'Supplement', 'Other')),
  prescription boolean not null default false,
  start_date date,
  end_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pet_foods_pet_id_idx on public.pet_foods(pet_id);
create index pet_foods_created_by_idx on public.pet_foods(created_by);

-- ============================================================
-- food_logs  (was: FoodLog)
-- ============================================================
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  date date not null,
  food_name text not null,
  brand text,
  food_type text check (food_type in ('Wet food', 'Dry food', 'Raw', 'Freeze-dried', 'Treat', 'Supplement', 'Other')),
  amount_eaten text check (amount_eaten in ('All', 'Most', 'Half', 'Very little', 'None')),
  reaction text check (reaction in ('Good', 'Neutral', 'Vomited after', 'Refused after', 'Diarrhea after')),
  notes text,
  created_at timestamptz not null default now()
);

create index food_logs_pet_id_idx on public.food_logs(pet_id);
create index food_logs_created_by_idx on public.food_logs(created_by);

-- ============================================================
-- medications  (was: Medication)
-- ============================================================
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  name text not null,
  med_type text not null default 'General' check (med_type in ('General', 'Flea & Tick', 'Heartworm')),
  prescribed boolean not null default false,
  dosage text,
  frequency text check (frequency in ('Once daily', 'Twice daily', 'Every other day', 'Weekly', 'Monthly', 'Every 3 months', 'As needed', 'Other')),
  timing_instructions text,
  route text check (route in ('Oral', 'Subcutaneous injection', 'Transdermal', 'Topical', 'Eye drops', 'Ear drops', 'Other')),
  start_date date,
  next_due_date date,
  end_date date,
  prescribing_vet text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index medications_pet_id_idx on public.medications(pet_id);
create index medications_created_by_idx on public.medications(created_by);
create index medications_next_due_date_idx on public.medications(next_due_date) where active = true;

-- ============================================================
-- vaccinations  (was: Vaccination)
-- ============================================================
create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  vaccine_name text not null,
  date_given date,
  next_due_date date,
  administered_by text,
  lot_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vaccinations_pet_id_idx on public.vaccinations(pet_id);
create index vaccinations_created_by_idx on public.vaccinations(created_by);
create index vaccinations_next_due_date_idx on public.vaccinations(next_due_date);

-- ============================================================
-- bloodwork  (was: Bloodwork)
-- ============================================================
create table public.bloodwork (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  date date not null,
  lab_name text,
  vet_name text,
  bun numeric,
  creatinine numeric,
  sdma numeric,
  phosphorus numeric,
  potassium numeric,
  sodium numeric,
  calcium numeric,
  hematocrit numeric,
  hemoglobin numeric,
  total_protein numeric,
  albumin numeric,
  alt numeric,
  ast numeric,
  alkaline_phosphatase numeric,
  total_bilirubin numeric,
  glucose numeric,
  t4 numeric,
  urine_specific_gravity text,
  urine_protein text check (urine_protein in ('Negative', 'Trace', '1+', '2+', '3+', '4+')),
  notes text,
  created_at timestamptz not null default now()
);

create index bloodwork_pet_id_idx on public.bloodwork(pet_id);
create index bloodwork_created_by_idx on public.bloodwork(created_by);

-- ============================================================
-- symptom_logs  (was: SymptomLog)
-- ============================================================
create table public.symptom_logs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  date date not null,
  appetite text check (appetite in ('Ate all', 'Ate most', 'Ate some', 'Ate very little', 'Refused')),
  vomiting integer check (vomiting >= 0),
  stool_quality text check (stool_quality in ('Normal', 'Soft', 'Loose', 'Watery', 'Bloody', 'Constipated', 'None')),
  energy_level text check (energy_level in ('Normal', 'Playful', 'Calm', 'Lethargic', 'Hiding')),
  water_intake text check (water_intake in ('Normal', 'Increased', 'Decreased', 'Not observed')),
  weight_grams numeric,
  urination text check (urination in ('None', 'Reduced', 'Normal', 'Frequent', 'Excessive')),
  nausea_symptoms text[] default '{}', -- values: Lip licking, Burping, Drooling, Ate non-food items, Hunched posture
  pain_signs boolean default false,
  medication_given boolean default false,
  notes text,
  created_at timestamptz not null default now()
);

create index symptom_logs_pet_id_idx on public.symptom_logs(pet_id);
create index symptom_logs_created_by_idx on public.symptom_logs(created_by);

-- ============================================================
-- pet_sits  (was: PetSit)
-- ============================================================
create table public.pet_sits (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_ids uuid[] not null default '{}', -- array of pet ids covered by this sit
  sitter_name text,
  start_date date not null,
  end_date date not null,
  additional_instructions text,
  emergency_contact text,
  vet_contact text,
  custom_tasks text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pet_sits_created_by_idx on public.pet_sits(created_by);

-- ============================================================
-- pet_sit_logs  (was: PetSitLog)
-- ============================================================
create table public.pet_sit_logs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_sit_id uuid not null references public.pet_sits(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  date date not null,
  am_food_given boolean default false,
  pm_food_given boolean default false,
  am_meds_given boolean default false,
  pm_meds_given boolean default false,
  completed_tasks text[] default '{}',
  vomiting integer check (vomiting >= 0),
  appetite text check (appetite in ('Ate all', 'Ate most', 'Ate some', 'Ate very little', 'Refused')),
  energy_level text check (energy_level in ('Normal', 'Playful', 'Calm', 'Lethargic', 'Hiding')),
  stool_quality text check (stool_quality in ('Normal', 'Soft', 'Loose', 'Watery', 'Bloody', 'Constipated', 'None')),
  notes text,
  created_at timestamptz not null default now()
);

create index pet_sit_logs_pet_sit_id_idx on public.pet_sit_logs(pet_sit_id);
create index pet_sit_logs_pet_id_idx on public.pet_sit_logs(pet_id);
create index pet_sit_logs_created_by_idx on public.pet_sit_logs(created_by);

-- ============================================================
-- pet_sitter_access  (was: PetSitterAccess)
-- ============================================================
-- Grants a sitter (identified by email, later linked to their own user id
-- once they sign up/log in) access to a specific pet_sit's logs.
create table public.pet_sitter_access (
  id uuid primary key default gen_random_uuid(),
  pet_sit_id uuid not null references public.pet_sits(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sitter_email text not null,
  sitter_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index pet_sitter_access_pet_sit_id_idx on public.pet_sitter_access(pet_sit_id);
create index pet_sitter_access_sitter_email_idx on public.pet_sitter_access(sitter_email);
create index pet_sitter_access_sitter_user_id_idx on public.pet_sitter_access(sitter_user_id);

-- ============================================================
-- updated_at triggers (keep updated_at fresh on row updates)
-- ============================================================
create function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.pets
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.pet_foods
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.medications
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.vaccinations
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.pet_sits
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.pet_foods enable row level security;
alter table public.food_logs enable row level security;
alter table public.medications enable row level security;
alter table public.vaccinations enable row level security;
alter table public.bloodwork enable row level security;
alter table public.symptom_logs enable row level security;
alter table public.pet_sits enable row level security;
alter table public.pet_sit_logs enable row level security;
alter table public.pet_sitter_access enable row level security;

-- profiles: users can read/update only their own profile
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- pets: owner-only CRUD (mirrors Base44's created_by RLS)
create policy "pets_select_own" on public.pets
  for select using (auth.uid() = created_by);
create policy "pets_insert_own" on public.pets
  for insert with check (auth.uid() = created_by);
create policy "pets_update_own" on public.pets
  for update using (auth.uid() = created_by);
create policy "pets_delete_own" on public.pets
  for delete using (auth.uid() = created_by);

-- Generic owner-only policy pattern, repeated per child table
create policy "pet_foods_select_own" on public.pet_foods for select using (auth.uid() = created_by);
create policy "pet_foods_insert_own" on public.pet_foods for insert with check (auth.uid() = created_by);
create policy "pet_foods_update_own" on public.pet_foods for update using (auth.uid() = created_by);
create policy "pet_foods_delete_own" on public.pet_foods for delete using (auth.uid() = created_by);

create policy "food_logs_select_own" on public.food_logs for select using (auth.uid() = created_by);
create policy "food_logs_insert_own" on public.food_logs for insert with check (auth.uid() = created_by);
create policy "food_logs_update_own" on public.food_logs for update using (auth.uid() = created_by);
create policy "food_logs_delete_own" on public.food_logs for delete using (auth.uid() = created_by);

create policy "medications_select_own" on public.medications for select using (auth.uid() = created_by);
create policy "medications_insert_own" on public.medications for insert with check (auth.uid() = created_by);
create policy "medications_update_own" on public.medications for update using (auth.uid() = created_by);
create policy "medications_delete_own" on public.medications for delete using (auth.uid() = created_by);

create policy "vaccinations_select_own" on public.vaccinations for select using (auth.uid() = created_by);
create policy "vaccinations_insert_own" on public.vaccinations for insert with check (auth.uid() = created_by);
create policy "vaccinations_update_own" on public.vaccinations for update using (auth.uid() = created_by);
create policy "vaccinations_delete_own" on public.vaccinations for delete using (auth.uid() = created_by);

create policy "bloodwork_select_own" on public.bloodwork for select using (auth.uid() = created_by);
create policy "bloodwork_insert_own" on public.bloodwork for insert with check (auth.uid() = created_by);
create policy "bloodwork_update_own" on public.bloodwork for update using (auth.uid() = created_by);
create policy "bloodwork_delete_own" on public.bloodwork for delete using (auth.uid() = created_by);

create policy "symptom_logs_select_own" on public.symptom_logs for select using (auth.uid() = created_by);
create policy "symptom_logs_insert_own" on public.symptom_logs for insert with check (auth.uid() = created_by);
create policy "symptom_logs_update_own" on public.symptom_logs for update using (auth.uid() = created_by);
create policy "symptom_logs_delete_own" on public.symptom_logs for delete using (auth.uid() = created_by);

create policy "pet_sits_select_own" on public.pet_sits for select using (auth.uid() = created_by);
create policy "pet_sits_insert_own" on public.pet_sits for insert with check (auth.uid() = created_by);
create policy "pet_sits_update_own" on public.pet_sits for update using (auth.uid() = created_by);
create policy "pet_sits_delete_own" on public.pet_sits for delete using (auth.uid() = created_by);

-- pet_sit_logs: owner can do everything; an assigned sitter (matched via
-- pet_sitter_access.sitter_user_id) can read and insert logs for that pet_sit
create policy "pet_sit_logs_select_own_or_sitter" on public.pet_sit_logs
  for select using (
    auth.uid() = created_by
    or exists (
      select 1 from public.pet_sitter_access psa
      where psa.pet_sit_id = pet_sit_logs.pet_sit_id
        and psa.sitter_user_id = auth.uid()
    )
  );
create policy "pet_sit_logs_insert_own_or_sitter" on public.pet_sit_logs
  for insert with check (
    auth.uid() = created_by
    or exists (
      select 1 from public.pet_sitter_access psa
      where psa.pet_sit_id = pet_sit_logs.pet_sit_id
        and psa.sitter_user_id = auth.uid()
    )
  );
create policy "pet_sit_logs_update_own" on public.pet_sit_logs
  for update using (auth.uid() = created_by);
create policy "pet_sit_logs_delete_own" on public.pet_sit_logs
  for delete using (auth.uid() = created_by);

-- pet_sitter_access: owner manages grants; a sitter can see grants
-- addressed to their own email/user id (so the app can show them
-- "you've been invited to sit for X")
create policy "pet_sitter_access_select_owner_or_sitter" on public.pet_sitter_access
  for select using (
    auth.uid() = owner_id
    or auth.uid() = sitter_user_id
    or sitter_email = (select email from public.profiles where id = auth.uid())
  );
create policy "pet_sitter_access_insert_owner" on public.pet_sitter_access
  for insert with check (auth.uid() = owner_id);
create policy "pet_sitter_access_update_owner" on public.pet_sitter_access
  for update using (auth.uid() = owner_id);
create policy "pet_sitter_access_delete_owner" on public.pet_sitter_access
  for delete using (auth.uid() = owner_id);
