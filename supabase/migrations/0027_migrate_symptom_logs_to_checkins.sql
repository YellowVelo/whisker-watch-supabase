-- Wysker Watch — Phase 2 Backfill: symptom_logs -> daily_check_ins/observations
--
-- One-time migration of the 11 real symptom_logs rows (Harper, Auggie,
-- Tribble; imported by 0003/0007) into the Daily Check-In model, per the
-- Feature Spec's Migration Plan. Dev-data backfill, hand-mapped below
-- (not a generic re-runnable transform) since the dataset is small,
-- known, and has same-day duplicate rows (Tribble 2026-05-30) that need a
-- human merge decision, not a mechanical one.
--
-- Harper has zero symptom_logs rows and gets no check-ins from this
-- migration.
--
-- Vibe (status) is left NULL on every row here — Base44 never asked "how
-- did the day feel," so it must never be inferred from symptom severity
-- or count (spec Core Model III, Migration Plan). symptom_count is real
-- and computed from what was actually logged.
--
-- Legacy Vomiting is a bare integer episode count; every value present in
-- this dataset is 0 or 1, mapped 0 -> none, 1 -> once (2+ -> more_than_once
-- would apply if it occurred, but doesn't here). There is no way to
-- recover whether any of these were hairball-only or regurgitation events
-- from a bare integer, so neither of those options is ever used by this
-- migration (spec Migration Plan / Edge Cases). The raw legacy integer is
-- additionally preserved in the Vomiting row's numeric_value column
-- (unused by the current UI, which reads only `value`), so the exact
-- source count is resolvable later without re-reading symptom_logs — per
-- this session's follow-up decision to not let that precision get lost
-- in the enum mapping. The 2026-05-30 Tribble day merges two legacy rows
-- (0 and 1); numeric_value stores the max (1), consistent with the merged
-- enum value ('once').
--
-- Fields with no home in the new model — pain_signs, medication_given,
-- free-text notes — are left exactly where they are, in symptom_logs.
-- Nothing here reads, migrates, or drops them; they remain available for
-- manual review (spec: "never silently dropped or guessed").
--
-- "Not Observed" answers (water/bathroom) are excluded from symptom_count,
-- per spec. Categories with no legacy data at all for a given day
-- (Mobility, Breathing, Skin/Itching, Behavior, always; others when the
-- source field was null) get an explicit baseline row, same rule as every
-- live check-in.

do $$
declare
  v_created_by uuid := 'fa875b03-2788-47cf-b0a7-75bc86783a21';
  v_tribble uuid := '67c4d8f8-057e-4169-b540-aa4bdf16ad6b';
  v_auggie uuid := '6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d';
begin

  -- ============================================================
  -- daily_check_ins — one row per pet per day, status always null
  -- ============================================================
  insert into public.daily_check_ins (id, created_by, pet_id, check_in_date, status, symptom_count, completed_at, source)
  values
    ('b1000000-0000-4000-8000-000000000001', v_created_by, v_tribble, '2026-05-21', null, 3, '2026-05-22T12:08:48.997000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000002', v_created_by, v_tribble, '2026-05-22', null, 3, '2026-05-22T22:44:22.067000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000003', v_created_by, v_tribble, '2026-05-27', null, 2, '2026-05-29T20:37:47.396000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000004', v_created_by, v_tribble, '2026-05-30', null, 3, '2026-05-30T18:49:53.781000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000005', v_created_by, v_tribble, '2026-05-31', null, 0, '2026-06-01T11:43:28.745000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000006', v_created_by, v_tribble, '2026-06-09', null, 2, '2026-06-09T22:11:03.862000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000007', v_created_by, v_tribble, '2026-06-13', null, 1, '2026-06-15T23:25:11.869000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000008', v_created_by, v_tribble, '2026-06-15', null, 1, '2026-06-15T23:24:54.341000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000009', v_created_by, v_auggie,  '2026-05-20', null, 2, '2026-06-11T11:30:01.994000+00', 'app'),
    ('b1000000-0000-4000-8000-000000000010', v_created_by, v_auggie,  '2026-05-29', null, 1, '2026-05-29T17:43:41.885000+00', 'app')
  on conflict (id) do nothing;

  -- ============================================================
  -- observations — every one of the 11 counted categories gets an
  -- explicit row per day: baseline when nothing was logged, one row per
  -- distinct symptom otherwise (same rule live check-ins follow).
  -- `numeric_value` is null for every category except Vomiting, where it
  -- carries the raw legacy symptom_logs.vomiting integer alongside the
  -- mapped enum `value` — see file header.
  -- ============================================================

  -- 2026-05-21 Tribble: ate very little, vomited once (raw count 1), soft stool, urination not observed
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_tribble, 'b1000000-0000-4000-8000-000000000001', t.id, v.value, v.numeric_value, '2026-05-21T12:00:00+00'
  from public.observation_types t join (values
    ('appetite', 'ate_much_less', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'not_observed', null),
    ('stool', 'softer_than_usual', null), ('vomiting', 'once', 1), ('nausea', 'normal', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000001');

  -- 2026-05-22 Tribble: refused food, vomited once (raw count 1), water not observed, lip licking (given Cerenia)
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_tribble, 'b1000000-0000-4000-8000-000000000002', t.id, v.value, v.numeric_value, '2026-05-22T12:00:00+00'
  from public.observation_types t join (values
    ('appetite', 'did_not_eat', null::numeric), ('water_intake', 'not_observed', null), ('bathroom', 'normal', null),
    ('stool', 'normal', null), ('vomiting', 'once', 1), ('nausea', 'lip_licking', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000002');

  -- 2026-05-27 Tribble: ate most (slightly less), vomited once (raw count 1), dried overnight
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_tribble, 'b1000000-0000-4000-8000-000000000003', t.id, v.value, v.numeric_value, '2026-05-27T12:00:00+00'
  from public.observation_types t join (values
    ('appetite', 'ate_little_less', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'normal', null),
    ('stool', 'normal', null), ('vomiting', 'once', 1), ('nausea', 'normal', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000003');

  -- 2026-05-30 Tribble: two legacy rows merged (ate all, vomited once — raw counts 0 and 1, max kept — soft stool, urination reduced)
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_tribble, 'b1000000-0000-4000-8000-000000000004', t.id, v.value, v.numeric_value, '2026-05-30T18:49:53+00'
  from public.observation_types t join (values
    ('appetite', 'normal', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'less_frequent', null),
    ('stool', 'softer_than_usual', null), ('vomiting', 'once', 1), ('nausea', 'normal', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000004');

  -- 2026-05-31 Tribble: fully normal day (vomiting raw count 0)
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_tribble, 'b1000000-0000-4000-8000-000000000005', t.id, v.value, v.numeric_value, '2026-05-31T12:00:00+00'
  from public.observation_types t join (values
    ('appetite', 'normal', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'normal', null),
    ('stool', 'normal', null), ('vomiting', 'none', 0), ('nausea', 'normal', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000005');

  -- 2026-06-09 Tribble: ate most (slightly less), burping (vomiting raw count 0)
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_tribble, 'b1000000-0000-4000-8000-000000000006', t.id, v.value, v.numeric_value, '2026-06-09T22:11:03+00'
  from public.observation_types t join (values
    ('appetite', 'ate_little_less', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'normal', null),
    ('stool', 'normal', null), ('vomiting', 'none', 0), ('nausea', 'burping', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000006');

  -- 2026-06-13 Tribble: ate some (much less), otherwise not captured (vomiting raw count 0)
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_tribble, 'b1000000-0000-4000-8000-000000000007', t.id, v.value, v.numeric_value, '2026-06-13T12:00:00+00'
  from public.observation_types t join (values
    ('appetite', 'ate_much_less', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'normal', null),
    ('stool', 'normal', null), ('vomiting', 'none', 0), ('nausea', 'normal', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000007');

  -- 2026-06-15 Tribble: ate all, burping (vomiting raw count 0)
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_tribble, 'b1000000-0000-4000-8000-000000000008', t.id, v.value, v.numeric_value, '2026-06-15T23:24:54+00'
  from public.observation_types t join (values
    ('appetite', 'normal', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'normal', null),
    ('stool', 'normal', null), ('vomiting', 'none', 0), ('nausea', 'burping', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000008');

  -- 2026-05-20 Auggie: ate all, calm (lower energy), drooling, heavy panting (vomiting raw count 0)
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_auggie, 'b1000000-0000-4000-8000-000000000009', t.id, v.value, v.numeric_value, '2026-06-11T11:30:01+00'
  from public.observation_types t join (values
    ('appetite', 'normal', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'normal', null),
    ('stool', 'normal', null), ('vomiting', 'none', 0), ('nausea', 'drooling', null),
    ('energy', 'slightly_lower', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000009');

  -- 2026-05-29 Auggie: drooling, vomiting raw count 0 (weight_grams=15966 stays in symptom_logs, untouched — Weight is not migrated)
  insert into public.observations (created_by, pet_id, daily_check_in_id, observation_type_id, value, numeric_value, observed_at)
  select v_created_by, v_auggie, 'b1000000-0000-4000-8000-000000000010', t.id, v.value, v.numeric_value, '2026-05-29T17:43:41+00'
  from public.observation_types t join (values
    ('appetite', 'normal', null::numeric), ('water_intake', 'normal', null), ('bathroom', 'normal', null),
    ('stool', 'normal', null), ('vomiting', 'none', 0), ('nausea', 'drooling', null),
    ('energy', 'normal', null), ('mobility', 'normal', null), ('breathing', 'normal', null), ('itching', 'normal', null), ('behavior', 'normal', null)
  ) as v(code, value, numeric_value) on v.code = t.code
  where not exists (select 1 from public.observations where daily_check_in_id = 'b1000000-0000-4000-8000-000000000010');

end $$;
