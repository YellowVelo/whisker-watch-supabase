-- Wysker Watch — Daily Check-In, Observations, Baselines, Wellness Score V1
--
-- Adds the generalized, behavior-first observation model described in
-- "Daily Check-In, Observation Data Model, and Wellness Score V1". This is
-- additive: it does NOT touch or replace the existing symptom_logs table.
-- symptom_logs remains as-is (legacy per-pet-profile symptom form); this
-- migration builds the new Home-screen Daily Check-In system alongside it,
-- per "Extend before creating" — a full symptom_logs migration/retirement
-- is a separate, larger follow-up.
--
-- created_by is used (rather than a literal `owner_id` column) to match
-- every other pet-scoped table in this schema and entityClient.js's
-- auto-populated `created_by` on create(). RLS is is_pet_owner()-based so
-- co-owners get identical read/write access, matching migration 0004.

-- ============================================================
-- daily_check_ins — one status per pet per day
-- ============================================================
create table public.daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  check_in_date date not null,
  status text not null check (status in ('normal', 'changed', 'skipped')),
  completed_at timestamptz,
  source text not null default 'app' check (source in ('app', 'notification', 'widget', 'sitter')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pet_id, check_in_date)
);

create index daily_check_ins_pet_id_idx on public.daily_check_ins(pet_id);
create index daily_check_ins_created_by_idx on public.daily_check_ins(created_by);
create index daily_check_ins_pet_date_idx on public.daily_check_ins(pet_id, check_in_date desc);

create trigger set_updated_at before update on public.daily_check_ins
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- observation_types — reusable, reference data (not owner-scoped)
-- ============================================================
create table public.observation_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  category text not null,
  species_applicability text not null default 'both' check (species_applicability in ('cat', 'dog', 'both')),
  answer_type text not null check (answer_type in ('enum', 'number', 'text', 'boolean')),
  baseline_supported boolean not null default true,
  score_supported boolean not null default true,
  default_logging_interval text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- observation_options — answer choices per type
-- ============================================================
create table public.observation_options (
  id uuid primary key default gen_random_uuid(),
  observation_type_id uuid not null references public.observation_types(id) on delete cascade,
  value text not null,
  label text not null,
  severity_score integer not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  unique (observation_type_id, value)
);

create index observation_options_type_id_idx on public.observation_options(observation_type_id);

-- ============================================================
-- observations — the actual owner-reported observations (primary truth)
-- ============================================================
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  daily_check_in_id uuid references public.daily_check_ins(id) on delete cascade,
  observation_type_id uuid not null references public.observation_types(id),
  value text,
  numeric_value numeric,
  severity_score integer,
  notes text,
  photo_url text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index observations_pet_id_idx on public.observations(pet_id);
create index observations_created_by_idx on public.observations(created_by);
create index observations_daily_check_in_id_idx on public.observations(daily_check_in_id);
create index observations_type_id_idx on public.observations(observation_type_id);

create trigger set_updated_at before update on public.observations
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- pet_baselines — each pet's "normal", one row per observation_type,
-- history preserved via effective_from/effective_to instead of overwrite
-- ============================================================
create table public.pet_baselines (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  observation_type_id uuid not null references public.observation_types(id),
  baseline_value text,
  baseline_numeric_value numeric,
  baseline_notes text,
  confidence_level text not null default 'medium' check (confidence_level in ('low', 'medium', 'high')),
  source text not null default 'manual_edit' check (source in ('onboarding', 'manual_edit', 'system_suggested')),
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pet_baselines_pet_id_idx on public.pet_baselines(pet_id);
create index pet_baselines_created_by_idx on public.pet_baselines(created_by);
create index pet_baselines_type_id_idx on public.pet_baselines(observation_type_id);
-- Only one *currently active* baseline per pet/observation_type
create unique index pet_baselines_active_unique_idx on public.pet_baselines(pet_id, observation_type_id) where effective_to is null;

create trigger set_updated_at before update on public.pet_baselines
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- wellness_scores — calculated score snapshots, one per pet per day
-- ============================================================
create table public.wellness_scores (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  check_in_date date not null,
  daily_check_in_id uuid references public.daily_check_ins(id) on delete cascade,
  score integer not null check (score >= 0 and score <= 100),
  trend text not null default 'unknown' check (trend in ('stable', 'improving', 'monitor', 'declining', 'unknown')),
  score_reason_summary text,
  created_at timestamptz not null default now(),
  unique (pet_id, check_in_date)
);

create index wellness_scores_pet_id_idx on public.wellness_scores(pet_id);
create index wellness_scores_pet_date_idx on public.wellness_scores(pet_id, check_in_date desc);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.daily_check_ins enable row level security;
alter table public.observation_types enable row level security;
alter table public.observation_options enable row level security;
alter table public.observations enable row level security;
alter table public.pet_baselines enable row level security;
alter table public.wellness_scores enable row level security;

create policy "daily_check_ins_select_owner" on public.daily_check_ins for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "daily_check_ins_insert_owner" on public.daily_check_ins for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "daily_check_ins_update_owner" on public.daily_check_ins for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "daily_check_ins_delete_owner" on public.daily_check_ins for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- Reference tables: readable by any authenticated user, writable only via
-- migrations/service role (no insert/update/delete policy is intentional).
create policy "observation_types_select_authenticated" on public.observation_types for select using (auth.role() = 'authenticated');
create policy "observation_options_select_authenticated" on public.observation_options for select using (auth.role() = 'authenticated');

create policy "observations_select_owner" on public.observations for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "observations_insert_owner" on public.observations for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "observations_update_owner" on public.observations for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "observations_delete_owner" on public.observations for delete using (public.is_pet_owner(pet_id, auth.uid()));

create policy "pet_baselines_select_owner" on public.pet_baselines for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_baselines_insert_owner" on public.pet_baselines for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_baselines_update_owner" on public.pet_baselines for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "pet_baselines_delete_owner" on public.pet_baselines for delete using (public.is_pet_owner(pet_id, auth.uid()));

create policy "wellness_scores_select_owner" on public.wellness_scores for select using (public.is_pet_owner(pet_id, auth.uid()));
create policy "wellness_scores_insert_owner" on public.wellness_scores for insert with check (public.is_pet_owner(pet_id, auth.uid()));
create policy "wellness_scores_update_owner" on public.wellness_scores for update using (public.is_pet_owner(pet_id, auth.uid()));
create policy "wellness_scores_delete_owner" on public.wellness_scores for delete using (public.is_pet_owner(pet_id, auth.uid()));

-- ============================================================
-- Seed data: V1 observation types + answer options
--
-- Severity scores follow the mild/moderate/significant tiers in the spec's
-- example weight table. Where the spec gave exact values (appetite) they
-- are used verbatim; all other per-answer values are this implementation's
-- reasonable interpretation of the tier table and should be reviewed by
-- product/vet input before they drive anything higher-stakes than a
-- friendly wellness score.
-- ============================================================
insert into public.observation_types (code, label, category, species_applicability, answer_type, sort_order) values
  ('appetite', 'Appetite', 'appetite', 'both', 'enum', 1),
  ('water_intake', 'Water', 'water', 'both', 'enum', 2),
  ('bathroom', 'Bathroom', 'bathroom', 'both', 'enum', 3),
  ('stool', 'Stool', 'stool', 'both', 'enum', 4),
  ('vomiting', 'Vomiting', 'vomiting', 'both', 'enum', 5),
  ('energy', 'Energy', 'energy', 'both', 'enum', 6),
  ('mobility', 'Mobility', 'mobility', 'both', 'enum', 7),
  ('breathing', 'Breathing', 'breathing', 'both', 'enum', 8),
  ('itching', 'Skin / Itching', 'itching', 'both', 'enum', 9),
  ('behavior', 'Mood / Behavior', 'behavior', 'both', 'enum', 10),
  ('medication_exception', 'Medication', 'medication', 'both', 'enum', 11),
  ('weight', 'Weight', 'weight', 'both', 'number', 12),
  ('other', 'Other', 'other', 'both', 'text', 13);

insert into public.observation_options (observation_type_id, value, label, severity_score, sort_order)
select id, v.value, v.label, v.severity_score, v.sort_order
from public.observation_types t
join (values
  -- appetite (values given directly by the spec)
  ('appetite', 'normal', 'Normal', 0, 1),
  ('appetite', 'ate_little_less', 'Ate a little less', -5, 2),
  ('appetite', 'ate_much_less', 'Ate much less', -15, 3),
  ('appetite', 'did_not_eat', 'Did not eat', -30, 4),
  ('appetite', 'ate_more', 'Ate more than usual', -2, 5),

  -- water
  ('water_intake', 'normal', 'Normal', 0, 1),
  ('water_intake', 'less_than_usual', 'Less than usual', -5, 2),
  ('water_intake', 'more_than_usual', 'More than usual', -5, 3),
  ('water_intake', 'much_more_than_usual', 'Much more than usual', -15, 4),

  -- bathroom (cat + dog options share one type; UI filters by species)
  ('bathroom', 'normal', 'Normal', 0, 1),
  ('bathroom', 'more_frequent', 'More frequent', -8, 2),
  ('bathroom', 'less_frequent', 'Less frequent', -8, 3),
  ('bathroom', 'straining', 'Straining', -25, 4),
  ('bathroom', 'outside_litter_box', 'Outside the litter box', -15, 5),
  ('bathroom', 'blood_noticed', 'Blood noticed', -25, 6),
  ('bathroom', 'asked_to_go_out_more', 'Asked to go out more', -8, 7),
  ('bathroom', 'accident_indoors', 'Accident indoors', -15, 8),

  -- stool
  ('stool', 'normal', 'Normal', 0, 1),
  ('stool', 'softer_than_usual', 'Softer than usual', -5, 2),
  ('stool', 'diarrhea', 'Diarrhea', -20, 3),
  ('stool', 'constipated', 'Constipated / no stool', -15, 4),
  ('stool', 'blood_noticed', 'Blood noticed', -25, 5),

  -- vomiting
  ('vomiting', 'none', 'No', 0, 1),
  ('vomiting', 'once', 'Once', -8, 2),
  ('vomiting', 'more_than_once', 'More than once', -20, 3),
  ('vomiting', 'hairball_only', 'Hairball only', -3, 4),

  -- energy
  ('energy', 'normal', 'Normal', 0, 1),
  ('energy', 'slightly_lower', 'Slightly lower', -5, 2),
  ('energy', 'much_lower', 'Much lower', -18, 3),
  ('energy', 'higher_than_usual', 'Higher than usual', -3, 4),

  -- mobility (cat + dog options share one type; UI filters by species)
  ('mobility', 'normal', 'Normal', 0, 1),
  ('mobility', 'hesitated_before_jumping', 'Hesitated before jumping', -8, 2),
  ('mobility', 'jumped_less', 'Jumped less than usual', -12, 3),
  ('mobility', 'stairs_ramps_different', 'Used stairs/ramps differently', -8, 4),
  ('mobility', 'seemed_stiff', 'Seemed stiff', -12, 5),
  ('mobility', 'could_not_reach_places', 'Could not reach usual places', -20, 6),
  ('mobility', 'walked_less', 'Walked less', -10, 7),
  ('mobility', 'limping', 'Limping', -20, 8),
  ('mobility', 'difficulty_standing', 'Difficulty standing', -22, 9),
  ('mobility', 'difficulty_stairs', 'Difficulty with stairs', -12, 10),
  ('mobility', 'difficulty_car_furniture', 'Difficulty getting into car/furniture', -10, 11),
  ('mobility', 'stiff_after_resting', 'Seemed stiff after resting', -10, 12),

  -- breathing
  ('breathing', 'normal', 'Normal', 0, 1),
  ('breathing', 'coughing', 'Coughing', -10, 2),
  ('breathing', 'panting_at_rest', 'Panting at rest', -15, 3),
  ('breathing', 'breathing_harder', 'Breathing harder than usual', -22, 4),
  ('breathing', 'sneezing_discharge', 'Sneezing / nasal discharge', -8, 5),

  -- itching
  ('itching', 'normal', 'Normal', 0, 1),
  ('itching', 'scratching_more', 'Scratching more', -5, 2),
  ('itching', 'licking_paws_body', 'Licking paws/body', -6, 3),
  ('itching', 'chewing_skin', 'Chewing skin', -8, 4),
  ('itching', 'new_hair_loss_irritation', 'New hair loss or irritated area', -10, 5),

  -- behavior
  ('behavior', 'normal', 'Normal', 0, 1),
  ('behavior', 'hiding_more', 'Hiding more', -8, 2),
  ('behavior', 'restless', 'Restless', -6, 3),
  ('behavior', 'clingier', 'Clingier than usual', -4, 4),
  ('behavior', 'less_interested', 'Less interested in people/play', -8, 5),
  ('behavior', 'aggressive_reactive', 'Aggressive or unusually reactive', -15, 6),
  ('behavior', 'confused_pacing', 'Confused / pacing', -18, 7),

  -- medication
  ('medication_exception', 'no_change', 'No change', 0, 1),
  ('medication_exception', 'missed_dose', 'Missed dose', -10, 2),
  ('medication_exception', 'dose_changed', 'Dose changed', -8, 3),
  ('medication_exception', 'new_medication', 'New medication', -2, 4),
  ('medication_exception', 'side_effect_noticed', 'Side effect noticed', -15, 5),
  ('medication_exception', 'stopped_medication', 'Stopped medication', -18, 6)
) as v(code, value, label, severity_score, sort_order) on v.code = t.code;
