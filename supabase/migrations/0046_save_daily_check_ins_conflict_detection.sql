-- Wysker Watch — Co-Owner Check-In Conflict Detection (spec 0043)
--
-- Extends save_daily_check_ins (migration 0034) so a caller can optionally
-- assert "this is the daily_check_ins.updated_at I loaded before starting
-- this edit" per day. If the row has since changed (a different co-owner
-- saved first) or now exists when the caller believed it didn't, this
-- function refuses to overwrite it and instead reports the conflict, along
-- with what's currently actually saved, so the UI can show it before any
-- data is lost.
--
-- Backward compatible: a payload that omits `expected_updated_at` entirely
-- gets no conflict check at all (today's exact save-and-overwrite
-- behavior) — this is what markGreatDaysBulk/markOffToughBulk (Catch Up's
-- multi-day "Finish" flow) still do; conflict detection is scoped to the
-- single-day interactive flow (markGreatDay/markOffTough) for this spec,
-- per its Non-Goals.
--
-- Return shape changes for every caller: each element of the returned
-- array is now `{ conflict: boolean, check_in: {...}, observations?: [...] }`
-- instead of the bare daily_check_ins row — checkinClient.js updated
-- accordingly. `observations` is only populated on a conflict, so the UI
-- can show what the other co-owner actually saved without a second call.
create or replace function public.save_daily_check_ins(payloads jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  day jsonb;
  v_checkin_id uuid;
  v_check_conflict boolean;
  v_expected_updated_at timestamptz;
  v_existing_id uuid;
  v_existing_updated_at timestamptz;
  v_pet_id uuid;
  v_check_in_date date;
  v_result jsonb := '[]'::jsonb;
  v_day_result jsonb;
begin
  for day in select * from jsonb_array_elements(payloads)
  loop
    v_pet_id := (day->>'pet_id')::uuid;
    v_check_in_date := (day->>'check_in_date')::date;
    v_check_conflict := day ? 'expected_updated_at';
    v_expected_updated_at := nullif(day->>'expected_updated_at', '')::timestamptz;
    v_existing_id := null;
    v_existing_updated_at := null;

    if v_check_conflict then
      -- Serializes concurrent conflict-checked saves for this exact
      -- pet/day, so two co-owners racing to save the same still-blank day
      -- can't both slip past the "nothing saved yet" check at once.
      -- Auto-released when this function call's transaction ends.
      perform pg_advisory_xact_lock(hashtext(v_pet_id::text || v_check_in_date::text));

      select id, updated_at into v_existing_id, v_existing_updated_at
      from public.daily_check_ins
      where pet_id = v_pet_id and check_in_date = v_check_in_date;

      if (v_existing_id is not null and (v_expected_updated_at is null or v_existing_updated_at <> v_expected_updated_at))
         or (v_existing_id is null and v_expected_updated_at is not null) then
        select jsonb_build_object(
          'conflict', true,
          'check_in', to_jsonb(dc),
          'observations', coalesce((select jsonb_agg(to_jsonb(o)) from public.observations o where o.daily_check_in_id = dc.id), '[]'::jsonb)
        ) into v_day_result
        from public.daily_check_ins dc where dc.id = v_existing_id;

        v_result := v_result || jsonb_build_array(v_day_result);
        continue;
      end if;
    end if;

    insert into public.daily_check_ins (
      pet_id, check_in_date, status, symptom_count, completed_at, source, created_by
    )
    values (
      v_pet_id,
      v_check_in_date,
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
      v_pet_id,
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

    select jsonb_build_object('conflict', false, 'check_in', to_jsonb(dc)) into v_day_result
    from public.daily_check_ins dc where dc.id = v_checkin_id;

    v_result := v_result || jsonb_build_array(v_day_result);
  end loop;

  return v_result;
end;
$function$;

grant execute on function public.save_daily_check_ins(jsonb) to authenticated;
