-- Wysker Watch — rate-limit windows (spec 0080, FR9/FR13)
--
-- The bug: check_and_record_rate_limit() and check_and_record_rate_limits()
-- (migration 0039) cleaned up by deleting every rate_limit_hits row older
-- than the CALLING check's own window, across ALL keys. ask-vet-assistant
-- checks a 10-minute window, so every AI request erased every other key's
-- history older than 10 minutes. Whenever anyone was using Ask Wysker, the
-- hourly limits on sign-up, beta/early-adopter sign-up and invite emails
-- (_shared/inviteRateLimit.ts) quietly acted like 10-minute limits. A new
-- 24-hour AI cap would also have reset every 10 minutes.
--
-- The fix: both functions keep their signatures and behavior, except
-- cleanup now deletes only rows older than 2 days, which is longer than any
-- window in use (10 minutes, 1 hour, 24 hours). A check for one key never
-- erases history another key's window still needs.
--
-- Also adds check_and_record_rate_limits_windowed(): the same
-- all-or-nothing multi-key check as check_and_record_rate_limits(), but
-- each key is counted over its own window, so one request can be checked
-- against a 10-minute and a 24-hour limit at once. Server-only, like the
-- other two (migration 0059's locked-by-default rule).
--
-- Who can do what: unchanged. All three functions run only as the service
-- role; logged-out and signed-in callers are refused (tested in
-- supabase/tests/function_permissions.test.ts). rate_limit_hits still has
-- RLS on with no policies.
--
-- Undo plan: a follow-up migration that restores 0039's two function bodies
-- exactly (cleanup by the call's own window) and runs
--   drop function public.check_and_record_rate_limits_windowed(text[], integer[], integer[]);
-- (after any caller of the new function has been switched back). Existing
-- callers of the two original functions are unaffected either way: their
-- signatures and return values don't change. Rows kept longer by this
-- migration are harmless; the old cleanup would remove them on its next call.

create or replace function public.check_and_record_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from rate_limit_hits
  where created_at < now() - interval '2 days';

  select count(*) into v_count
  from rate_limit_hits
  where rate_key = p_key
    and created_at > now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_limit then
    return false;
  end if;

  insert into rate_limit_hits (rate_key) values (p_key);
  return true;
end;
$$;

revoke execute on function public.check_and_record_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limit(text, integer, integer) to service_role;

create or replace function public.check_and_record_rate_limits(
  p_keys text[],
  p_limits integer[],
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  i integer;
begin
  delete from rate_limit_hits
  where created_at < now() - interval '2 days';

  for i in 1 .. array_length(p_keys, 1) loop
    select count(*) into v_count
    from rate_limit_hits
    where rate_key = p_keys[i]
      and created_at > now() - (p_window_seconds || ' seconds')::interval;

    if v_count >= p_limits[i] then
      return false;
    end if;
  end loop;

  insert into rate_limit_hits (rate_key)
  select unnest(p_keys);

  return true;
end;
$$;

revoke execute on function public.check_and_record_rate_limits(text[], integer[], integer) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limits(text[], integer[], integer) to service_role;

-- p_keys[i] is allowed p_limits[i] hits within the trailing p_windows[i]
-- seconds. Returns 0 when every key is under its limit (and records one hit
-- for every key). Otherwise returns the 1-based index of the first key over
-- its limit and records nothing, so a rejected request never uses up quota
-- on any key. Same read-then-write margin as 0039's functions (accepted
-- there for the same reasons).
create or replace function public.check_and_record_rate_limits_windowed(
  p_keys text[],
  p_limits integer[],
  p_windows integer[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_len integer := coalesce(array_length(p_keys, 1), 0);
  v_count integer;
  i integer;
begin
  if v_len = 0
     or coalesce(array_length(p_limits, 1), 0) <> v_len
     or coalesce(array_length(p_windows, 1), 0) <> v_len then
    raise exception 'check_and_record_rate_limits_windowed: p_keys, p_limits and p_windows must be non-empty and the same length'
      using errcode = '22023';
  end if;

  delete from rate_limit_hits
  where created_at < now() - interval '2 days';

  for i in 1 .. v_len loop
    select count(*) into v_count
    from rate_limit_hits
    where rate_key = p_keys[i]
      and created_at > now() - (p_windows[i] || ' seconds')::interval;

    if v_count >= p_limits[i] then
      return i;
    end if;
  end loop;

  insert into rate_limit_hits (rate_key)
  select unnest(p_keys);

  return 0;
end;
$$;

revoke execute on function public.check_and_record_rate_limits_windowed(text[], integer[], integer[]) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limits_windowed(text[], integer[], integer[]) to service_role;
