-- Realign the nightly analytics rollup to Eastern time instead of UTC —
-- both when the job effectively "closes out" a day and which calendar
-- day each event is bucketed into (an 11pm ET check-in should count as
-- that day, not the next).
--
-- Supabase's managed Postgres doesn't allow setting cron.timezone (it's
-- a postmaster-level GUC that requires a full server restart — confirmed
-- directly: "parameter cron.timezone cannot be changed without
-- restarting the server"). So instead of trying to make the job fire at
-- exactly Eastern midnight, the job now runs hourly, and the function
-- itself computes "yesterday in Eastern time" fresh on every run via
-- explicit AT TIME ZONE conversion. This self-corrects across DST
-- automatically (no biannual manual schedule changes needed), and
-- because analytics_daily_summary is upserted, re-running for the same
-- day 24x is harmless — the row just gets recomputed with the same
-- numbers until the next Eastern day rolls over.

create or replace function public.compute_daily_analytics_summary(target_date date)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_dau integer;
  v_returning integer;
  v_new integer;
  v_started integer;
  v_completed integer;
  v_skipped integer;
begin
  select count(distinct user_id) into v_dau
  from analytics_events
  where event_name = 'app_opened'
    and (created_at at time zone 'America/New_York')::date = target_date;

  select count(distinct user_id) into v_returning
  from analytics_events e
  where e.event_name = 'app_opened'
    and (e.created_at at time zone 'America/New_York')::date = target_date
    and exists (
      select 1 from analytics_events e2
      where e2.event_name = 'app_opened'
        and e2.user_id = e.user_id
        and (e2.created_at at time zone 'America/New_York')::date < target_date
    );

  select count(distinct user_id) into v_new
  from analytics_events e
  where e.event_name = 'app_opened'
    and (e.created_at at time zone 'America/New_York')::date = target_date
    and not exists (
      select 1 from analytics_events e2
      where e2.event_name = 'app_opened'
        and e2.user_id = e.user_id
        and (e2.created_at at time zone 'America/New_York')::date < target_date
    );

  select count(*) into v_started
  from analytics_events
  where event_name = 'daily_check_in_started'
    and (created_at at time zone 'America/New_York')::date = target_date;

  select count(*) into v_completed
  from analytics_events
  where event_name in ('daily_check_in_marked_normal', 'daily_check_in_marked_changed')
    and (created_at at time zone 'America/New_York')::date = target_date;

  select count(*) into v_skipped
  from analytics_events
  where event_name = 'daily_check_in_skipped'
    and (created_at at time zone 'America/New_York')::date = target_date;

  insert into public.analytics_daily_summary (
    summary_date, daily_active_users, returning_users, new_users,
    checkins_started, checkins_completed, checkins_skipped, computed_at
  )
  values (
    target_date, v_dau, v_returning, v_new,
    v_started, v_completed, v_skipped, now()
  )
  on conflict (summary_date) do update set
    daily_active_users = excluded.daily_active_users,
    returning_users = excluded.returning_users,
    new_users = excluded.new_users,
    checkins_started = excluded.checkins_started,
    checkins_completed = excluded.checkins_completed,
    checkins_skipped = excluded.checkins_skipped,
    computed_at = excluded.computed_at;
end;
$function$;

-- Reschedule: hourly instead of once at a fixed UTC time, computing
-- "yesterday" in Eastern time on each run (see comment above for why).
do $cron_update$
begin
  if exists (select 1 from cron.job where jobname = 'nightly-analytics-summary') then
    perform cron.unschedule('nightly-analytics-summary');
  end if;

  perform cron.schedule(
    'nightly-analytics-summary',
    '0 * * * *',
    $cron_job$select public.compute_daily_analytics_summary(((now() at time zone 'America/New_York')::date - 1))$cron_job$
  );
end;
$cron_update$;
