-- Wysker Watch — Atomic Daily Check-In Writes (spec 0016)
--
-- Replaces checkinClient.js's sequential upsert -> delete -> insert (-> update)
-- calls for markGreatDay/markOffTough/markGreatDaysBulk with one Postgres
-- function that does all of it inside a single plpgsql function body — which
-- Postgres already runs as one transaction, so a failure partway through
-- rolls every day in the call back together instead of leaving a check-in
-- row with stale or missing observations (punch list P5).
--
-- security invoker (the default — not stated as a clause, its absence means
-- invoker), not security definer: the calling user already has RLS
-- permission to do exactly these writes today (daily_check_ins/observations
-- insert/update/delete policies are is_pet_owner(pet_id, auth.uid())-based,
-- see 0014_daily_checkins_wellness.sql), so this function runs as the caller
-- and RLS still applies normally. created_by is set here via auth.uid()
-- (both tables' created_by is `not null`) since that stamping used to happen
-- client-side in entityClient.js and no longer can, once the write moves
-- into this function.
--
-- payloads shape — a jsonb array, one element per day:
--   {
--     "pet_id": "...", "check_in_date": "2026-01-01", "status": "great",
--     "symptom_count": 0, "source": "app", "completed_at": "2026-01-01T12:00:00Z",
--     "observations": [
--       { "observation_type_id": "...", "value": "normal", "numeric_value": null, "notes": null, "photo_url": null }
--     ]
--   }
-- completed_at is passed from JS (new Date().toISOString(), same as today)
-- rather than computed with now() here, so the saved value is byte-for-byte
-- identical to what today's non-atomic code would have written.
--
-- Loop shape: the outer array is looped with jsonb_array_elements rather
-- than jsonb_to_recordset, because each day also carries a nested
-- observations array that itself needs row-shaping — jsonb_to_recordset
-- flattens one level to typed columns but can't unnest a second, nested
-- array in the same pass, so a second unnest step per row would be needed
-- either way. The inner, flat observations array uses jsonb_to_recordset
-- directly, since it has no further nesting.
create or replace function public.save_daily_check_ins(payloads jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  day jsonb;
  v_checkin_id uuid;
  v_result jsonb := '[]'::jsonb;
begin
  for day in select * from jsonb_array_elements(payloads)
  loop
    insert into public.daily_check_ins (
      pet_id, check_in_date, status, symptom_count, completed_at, source, created_by
    )
    values (
      (day->>'pet_id')::uuid,
      (day->>'check_in_date')::date,
      day->>'status',
      nullif(day->>'symptom_count', '')::int,
      (day->>'completed_at')::timestamptz,
      day->>'source',
      auth.uid()
    )
    on conflict (pet_id, check_in_date) do update set
      status = excluded.status,
      symptom_count = excluded.symptom_count,
      completed_at = excluded.completed_at,
      source = excluded.source
    returning id into v_checkin_id;

    delete from public.observations where daily_check_in_id = v_checkin_id;

    insert into public.observations (
      pet_id, daily_check_in_id, observation_type_id, value, numeric_value, notes, photo_url, observed_at, created_by
    )
    select
      (day->>'pet_id')::uuid,
      v_checkin_id,
      o.observation_type_id,
      o.value,
      o.numeric_value,
      o.notes,
      o.photo_url,
      now(),
      auth.uid()
    from jsonb_to_recordset(coalesce(day->'observations', '[]'::jsonb)) as o(
      observation_type_id uuid, value text, numeric_value numeric, notes text, photo_url text
    );

    select v_result || jsonb_build_array(to_jsonb(dc))
    into v_result
    from public.daily_check_ins dc
    where dc.id = v_checkin_id;
  end loop;

  return v_result;
end;
$function$;

grant execute on function public.save_daily_check_ins(jsonb) to authenticated;
