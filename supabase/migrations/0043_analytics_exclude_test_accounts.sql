-- Exclude `test` account_type activity from the analytics rollup, and fix
-- checkins_completed to count the current completion event (vibe_recorded)
-- instead of two retired event names it's been querying since 2026-07-13.
-- See docs/features/0030_Analytics_Test_Account_Filter_Specification_v1.md.
--
-- account_type is not a column on analytics_events — it only exists inside
-- properties (jsonb), tagged by src/lib/analytics.js on every track() call
-- since migration 0010. `demo`/`owner`/`production` accounts are untouched;
-- only `test`-classified accounts (currently test1@/test2@wyskerwatch.com)
-- are excluded. coalesce(..., 'production') treats any event that predates
-- account_type tagging as included, matching isProductionAccount()'s
-- existing missing-value fallback in src/lib/accountType.js.

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
    and (created_at at time zone 'America/New_York')::date = target_date
    and coalesce(properties ->> 'account_type', 'production') <> 'test';

  select count(distinct user_id) into v_returning
  from analytics_events e
  where e.event_name = 'app_opened'
    and (e.created_at at time zone 'America/New_York')::date = target_date
    and coalesce(e.properties ->> 'account_type', 'production') <> 'test'
    and exists (
      select 1 from analytics_events e2
      where e2.event_name = 'app_opened'
        and e2.user_id = e.user_id
        and (e2.created_at at time zone 'America/New_York')::date < target_date
        and coalesce(e2.properties ->> 'account_type', 'production') <> 'test'
    );

  select count(distinct user_id) into v_new
  from analytics_events e
  where e.event_name = 'app_opened'
    and (e.created_at at time zone 'America/New_York')::date = target_date
    and coalesce(e.properties ->> 'account_type', 'production') <> 'test'
    and not exists (
      select 1 from analytics_events e2
      where e2.event_name = 'app_opened'
        and e2.user_id = e.user_id
        and (e2.created_at at time zone 'America/New_York')::date < target_date
        and coalesce(e2.properties ->> 'account_type', 'production') <> 'test'
    );

  select count(*) into v_started
  from analytics_events
  where event_name = 'daily_check_in_started'
    and (created_at at time zone 'America/New_York')::date = target_date
    and coalesce(properties ->> 'account_type', 'production') <> 'test';

  select count(*) into v_completed
  from analytics_events
  where event_name = 'vibe_recorded'
    and (created_at at time zone 'America/New_York')::date = target_date
    and coalesce(properties ->> 'account_type', 'production') <> 'test';

  select count(*) into v_skipped
  from analytics_events
  where event_name = 'daily_check_in_skipped'
    and (created_at at time zone 'America/New_York')::date = target_date
    and coalesce(properties ->> 'account_type', 'production') <> 'test';

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

-- Backfill: recompute every existing summary row with the corrected,
-- test-excluded logic so historical and future numbers are comparable.
-- Relies on the function's own upsert (on conflict do update) — no
-- separate delete/rebuild needed.
do $backfill$
declare
  r record;
begin
  for r in select summary_date from public.analytics_daily_summary loop
    perform public.compute_daily_analytics_summary(r.summary_date);
  end loop;
end;
$backfill$;
