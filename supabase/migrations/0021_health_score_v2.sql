-- Wysker Watch — Health Score Revision V2
--
-- Additive migration. Does NOT touch or reinterpret the legacy 0-100
-- `wellness_scores.score`/`trend` columns from migration 0014 — those
-- remain exactly as historical data, and continue to back the existing
-- Pet Profile Wellness Summary rings (src/lib/checkin/petProfileClient.js),
-- which are explicitly out of scope for this feature.
--
-- New user-facing score is 0-10, only ever deducted by the five Health
-- Attributes (appetite, water_intake, bathroom, stool, vomiting), each
-- capped at -2. Wellbeing Attributes (energy, mobility, breathing,
-- itching) and weight never affect it.

-- ============================================================
-- wellness_scores — additive V2 columns
-- ============================================================
alter table public.wellness_scores
  add column health_score integer check (health_score >= 0 and health_score <= 10),
  add column health_score_version text,
  add column total_deductions integer check (total_deductions >= 0 and total_deductions <= 10),
  add column deductions_by_attribute jsonb;

comment on column public.wellness_scores.health_score is 'V2 0-10 Health Score. Null for legacy-only rows and for skipped days. Never derived from the legacy score column.';
comment on column public.wellness_scores.health_score_version is 'Set to ''health_score_v2'' for rows calculated by the V2 scorer (src/lib/checkin/scoring.js computeHealthScore). Null/absent means legacy-only row.';

-- ============================================================
-- observation_options — deduction + direction config, independent concepts
-- ============================================================
alter table public.observation_options
  add column health_score_deduction integer not null default 0
    check (health_score_deduction >= 0 and health_score_deduction <= 2),
  add column direction_ordinal integer;

comment on column public.observation_options.health_score_deduction is 'V2 Health Score deduction (0-2), explicit per option. Only appetite/water_intake/bathroom/stool/vomiting options should ever be non-zero here — every other category must stay 0 so Wellbeing/Weight/Other can never affect the score. Distinct from the legacy severity_score column, which is not reused.';
comment on column public.observation_options.direction_ordinal is 'Monotonic per-attribute ordinal used for up/equal/down comparisons (src/lib/checkin/scoring.js computeAttributeDirection). Baseline/normal option = 0. Not comparable across different attributes/observation_types.';

-- ============================================================
-- health_score_deduction — V1 mapping (spec Health Score Revision V2 §7)
-- ============================================================
update public.observation_options o
set health_score_deduction = v.deduction
from public.observation_types t
join (values
  ('appetite', 'normal', 0),
  ('appetite', 'ate_little_less', 1),
  ('appetite', 'ate_much_less', 2),
  ('appetite', 'did_not_eat', 2),
  ('appetite', 'ate_more', 0),

  ('water_intake', 'normal', 0),
  ('water_intake', 'less_than_usual', 1),
  ('water_intake', 'more_than_usual', 1),
  ('water_intake', 'much_more_than_usual', 2),

  ('bathroom', 'normal', 0),
  ('bathroom', 'more_frequent', 1),
  ('bathroom', 'less_frequent', 1),
  ('bathroom', 'asked_to_go_out_more', 1),
  ('bathroom', 'accident_indoors', 1),
  ('bathroom', 'outside_litter_box', 1),
  ('bathroom', 'straining', 2),
  ('bathroom', 'blood_noticed', 2),

  ('stool', 'normal', 0),
  ('stool', 'softer_than_usual', 1),
  ('stool', 'diarrhea', 2),
  ('stool', 'constipated', 2),
  ('stool', 'blood_noticed', 2),

  ('vomiting', 'none', 0),
  ('vomiting', 'hairball_only', 0),
  ('vomiting', 'once', 1),
  ('vomiting', 'more_than_once', 2)
) as v(code, value, deduction) on v.code = t.code
where o.observation_type_id = t.id and o.value = v.value;

-- ============================================================
-- direction_ordinal — monotonic per-attribute scale, baseline/normal = 0.
-- Spec (§8.6) gives vomiting explicitly; appetite/water_intake/energy
-- mirror the existing client-side OBSERVATION_LEVELS bucket order
-- (src/lib/checkin/trendsClient.js). Bathroom/stool/mobility/breathing/
-- itching are this implementation's reasonable interpretation (more
-- negative/more frequent = further from 0) and should be reviewed by
-- product, same disclaimer as migration 0014's severity_score seed.
-- ============================================================
update public.observation_options o
set direction_ordinal = v.ordinal
from public.observation_types t
join (values
  ('appetite', 'ate_much_less', -2),
  ('appetite', 'did_not_eat', -2),
  ('appetite', 'ate_little_less', -1),
  ('appetite', 'normal', 0),
  ('appetite', 'ate_more', 1),

  ('water_intake', 'less_than_usual', -1),
  ('water_intake', 'normal', 0),
  ('water_intake', 'more_than_usual', 1),
  ('water_intake', 'much_more_than_usual', 2),

  ('bathroom', 'less_frequent', -1),
  ('bathroom', 'straining', -2),
  ('bathroom', 'blood_noticed', -2),
  ('bathroom', 'normal', 0),
  ('bathroom', 'more_frequent', 1),
  ('bathroom', 'asked_to_go_out_more', 1),
  ('bathroom', 'accident_indoors', -1),
  ('bathroom', 'outside_litter_box', -1),

  ('stool', 'constipated', -2),
  ('stool', 'blood_noticed', -2),
  ('stool', 'softer_than_usual', -1),
  ('stool', 'normal', 0),
  ('stool', 'diarrhea', -1),

  ('vomiting', 'none', 0),
  ('vomiting', 'hairball_only', 1),
  ('vomiting', 'once', 2),
  ('vomiting', 'more_than_once', 3),

  ('energy', 'much_lower', -2),
  ('energy', 'slightly_lower', -1),
  ('energy', 'normal', 0),
  ('energy', 'higher_than_usual', 1),

  ('mobility', 'difficulty_standing', -3),
  ('mobility', 'could_not_reach_places', -3),
  ('mobility', 'limping', -2),
  ('mobility', 'difficulty_stairs', -2),
  ('mobility', 'difficulty_car_furniture', -2),
  ('mobility', 'jumped_less', -2),
  ('mobility', 'walked_less', -2),
  ('mobility', 'seemed_stiff', -1),
  ('mobility', 'stiff_after_resting', -1),
  ('mobility', 'hesitated_before_jumping', -1),
  ('mobility', 'normal', 0),
  ('mobility', 'stairs_ramps_different', -1),

  ('breathing', 'breathing_harder', -2),
  ('breathing', 'panting_at_rest', -2),
  ('breathing', 'coughing', -1),
  ('breathing', 'sneezing_discharge', -1),
  ('breathing', 'normal', 0),

  ('itching', 'chewing_skin', -2),
  ('itching', 'new_hair_loss_irritation', -2),
  ('itching', 'scratching_more', -1),
  ('itching', 'licking_paws_body', -1),
  ('itching', 'normal', 0)
) as v(code, value, ordinal) on v.code = t.code
where o.observation_type_id = t.id and o.value = v.value;
