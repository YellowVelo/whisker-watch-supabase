-- Nightly-computed analytics rollup so daily active/returning users and
-- check-in completion can be read with one query instead of raw event
-- aggregation every time. Not exposed via the Data API (RLS enabled, no
-- policies) — view via the Supabase SQL Editor / Table Editor with
-- project owner access, which bypasses RLS.

create extension if not exists pg_cron;

create table if not exists public.analytics_daily_summary (
  summary_date date primary key,
  daily_active_users integer not null default 0,
  returning_users integer not null default 0,
  new_users integer not null default 0,
  checkins_started integer not null default 0,
  checkins_completed integer not null default 0,
  checkins_skipped integer not null default 0,
  computed_at timestamptz not null default now()
);

alter table public.analytics_daily_summary enable row level security;

-- Aggregates across all users' analytics_events, which per-user RLS on
-- that table would otherwise block — runs with elevated privileges
-- deliberately, and only ever writes to analytics_daily_summary.
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
    and created_at::date = target_date;

  select count(distinct user_id) into v_returning
  from analytics_events e
  where e.event_name = 'app_opened'
    and e.created_at::date = target_date
    and exists (
      select 1 from analytics_events e2
      where e2.event_name = 'app_opened'
        and e2.user_id = e.user_id
        and e2.created_at::date < target_date
    );

  select count(distinct user_id) into v_new
  from analytics_events e
  where e.event_name = 'app_opened'
    and e.created_at::date = target_date
    and not exists (
      select 1 from analytics_events e2
      where e2.event_name = 'app_opened'
        and e2.user_id = e.user_id
        and e2.created_at::date < target_date
    );

  select count(*) into v_started
  from analytics_events
  where event_name = 'daily_check_in_started'
    and created_at::date = target_date;

  select count(*) into v_completed
  from analytics_events
  where event_name in ('daily_check_in_marked_normal', 'daily_check_in_marked_changed')
    and created_at::date = target_date;

  select count(*) into v_skipped
  from analytics_events
  where event_name = 'daily_check_in_skipped'
    and created_at::date = target_date;

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

-- Runs at 00:00 UTC daily, summarizing the day that just ended. UTC, not
-- local time — adjust the schedule string below if a specific local
-- midnight is wanted instead.
do $cron_setup$
begin
  if not exists (select 1 from cron.job where jobname = 'nightly-analytics-summary') then
    perform cron.schedule(
      'nightly-analytics-summary',
      '0 0 * * *',
      $cron_job$select public.compute_daily_analytics_summary((current_date - 1))$cron_job$
    );
  end if;
end;
$cron_setup$;
