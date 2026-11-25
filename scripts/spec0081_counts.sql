-- Spec 0081 FR11: counts only, read-only. Returns no names, notes or IDs.
-- known_imported: the original app's 11 imported days (one owner, two pets).
with s as (
  select sl.*,
         exists (select 1 from public.daily_check_ins c
                 where c.pet_id = sl.pet_id and c.check_in_date = sl.date) as has_check_in,
         (sl.pet_id in ('67c4d8f8-057e-4169-b540-aa4bdf16ad6b','6bd06bf6-d00c-4b6a-8786-cd3fbfcf542d')
          and sl.created_by = 'fa875b03-2788-47cf-b0a7-75bc86783a21') as known_imported
  from public.symptom_logs sl
)
select json_build_object(
  'symptom_logs_total', (select count(*) from s),
  'known_imported_rows', (select count(*) from s where known_imported),
  'other_rows', (select count(*) from s where not known_imported),
  'with_weight', (select count(*) from s where weight_grams is not null),
  'weight_out_of_range', (select count(*) from s where weight_grams is not null
                            and (weight_grams / 453.59237 < 0.1 or weight_grams / 453.59237 > 300)),
  'same_pet_same_day_duplicates', (select count(*) from (select pet_id, date from s group by 1,2 having count(*) > 1) d),
  'other_answers_with_check_in', (select count(*) from s where has_check_in and (appetite is not null or vomiting is not null
       or stool_quality is not null or energy_level is not null or water_intake is not null or urination is not null
       or coalesce(array_length(nausea_symptoms,1),0) > 0)),
  'other_answers_without_check_in', (select count(*) from s where not has_check_in and (appetite is not null or vomiting is not null
       or stool_quality is not null or energy_level is not null or water_intake is not null or urination is not null
       or coalesce(array_length(nausea_symptoms,1),0) > 0)),
  'with_notes', (select count(*) from s where coalesce(btrim(notes),'') <> ''),
  'with_pain', (select count(*) from s where pain_signs),
  'with_medication', (select count(*) from s where medication_given),
  'distinct_appetite', (select json_agg(distinct appetite) from s),
  'distinct_stool', (select json_agg(distinct stool_quality) from s),
  'distinct_energy', (select json_agg(distinct energy_level) from s),
  'distinct_water', (select json_agg(distinct water_intake) from s),
  'distinct_urination', (select json_agg(distinct urination) from s),
  'distinct_vomiting', (select json_agg(distinct vomiting) from s),
  'distinct_nausea', (select json_agg(distinct n) from s, unnest(nausea_symptoms) n),
  'observations_without_check_in', (select count(*) from public.observations where daily_check_in_id is null),
  'food_logs_total', (select count(*) from public.food_logs),
  'wellness_scores_total', (select count(*) from public.wellness_scores)
) as counts;
