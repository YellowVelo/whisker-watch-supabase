-- Wysker Watch — Health Score equal-weight, multi-select symptoms
--
-- Supersedes the per-option severity grading from migrations 0014/0021 for
-- the Health Score's 5 Health Attributes (appetite, water_intake, bathroom,
-- stool, vomiting) and the 4 Wellbeing attributes (energy, mobility,
-- breathing, itching). Product decision: owners are reporting their own
-- observations, not a clinician's graded assessment, so every symptom
-- within a category now carries equal weight. `observation_options.
-- severity_score`/`health_score_deduction`/`direction_ordinal` are left in
-- place (legacy V1 rings still read severity_score; nothing reads
-- health_score_deduction/direction_ordinal after this migration) rather
-- than dropped, to avoid an unnecessary destructive schema change.
--
-- New model (src/lib/checkin/scoring.js computeHealthScore/
-- computeAttributeDirection):
--   - These 9 categories become multi-select: an owner can log more than
--     one symptom per category per day.
--   - Per Health Attribute, per day: deduction = min(count of distinct
--     non-baseline symptoms logged, 2). Total day deduction = sum across
--     the 5 Health Attributes (0-10). Score = 10 - total deduction.
--   - Direction (up/down/equal) for all 9 categories compares today's
--     symptom count to yesterday's, not a graded ordinal.
--   - Every completed (non-skipped) check-in now gets an explicit row per
--     category — a baseline ("normal"/"none") row when nothing was
--     selected, one row per distinct symptom otherwise — so "no row" is
--     never interpreted as an assumption. This migration backfills that
--     for existing data and recomputes historical V2 Health Scores so
--     trends/history stay consistent with the new rule retroactively.

-- ============================================================
-- Backfill explicit baseline rows for every completed check-in that's
-- missing one, for each of the 9 multi-select categories. A 'normal' day
-- previously wrote zero observations at all; a 'changed' day only wrote
-- rows for categories the owner actually touched. Both cases are filled
-- in here — existing rows (real answers) are left untouched.
-- ============================================================
insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, severity_score, observed_at)
select
  dci.created_by,
  dci.pet_id,
  dci.id,
  ot.id,
  case when ot.code = 'vomiting' then 'none' else 'normal' end,
  0,
  coalesce(dci.completed_at, dci.check_in_date::timestamptz)
from public.daily_check_ins dci
cross join public.observation_types ot
where dci.status in ('normal', 'changed')
  and ot.code in ('appetite', 'water_intake', 'bathroom', 'stool', 'vomiting', 'energy', 'mobility', 'breathing', 'itching')
  and not exists (
    select 1 from public.observations o
    where o.daily_check_in_id = dci.id and o.observation_type_id = ot.id
  );

-- ============================================================
-- Recompute V2 Health Score for every completed check-in (not just ones
-- that already had a V2 score) from the now-complete observations data,
-- using the equal-weight count rule above instead of the old per-option
-- health_score_deduction values.
-- ============================================================
with health_counts as (
  select
    o.daily_check_in_id,
    ot.code,
    count(*) as symptom_count
  from public.observations o
  join public.observation_types ot on ot.id = o.observation_type_id
  where ot.code in ('appetite', 'water_intake', 'bathroom', 'stool', 'vomiting')
    and o.value is not null
    and o.value not in ('normal', 'none', 'no_change')
  group by o.daily_check_in_id, ot.code
),
deductions as (
  select
    daily_check_in_id,
    code,
    least(2, symptom_count) as deduction
  from health_counts
),
totals as (
  select
    daily_check_in_id,
    sum(deduction) as total_deduction,
    jsonb_object_agg(code, deduction) filter (where deduction > 0) as deductions_by_attribute
  from deductions
  group by daily_check_in_id
)
update public.wellness_scores ws
set
  health_score = greatest(0, least(10, 10 - coalesce(t.total_deduction, 0))),
  health_score_version = 'health_score_v2',
  total_deductions = coalesce(t.total_deduction, 0),
  deductions_by_attribute = coalesce(t.deductions_by_attribute, '{}'::jsonb)
from public.daily_check_ins dci
left join totals t on t.daily_check_in_id = dci.id
where ws.daily_check_in_id = dci.id
  and dci.status in ('normal', 'changed');
