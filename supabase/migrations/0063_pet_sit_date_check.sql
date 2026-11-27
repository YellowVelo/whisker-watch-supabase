-- Wysker Watch — a database rule for sane pet sit dates (spec 0085)
--
-- What this does (after the two safety checks below): adds the check
-- constraint pet_sits_dates_sane to public.pet_sits, so a sit's start and
-- end dates must both fall between 2000-01-01 and 2100-12-31, the end can't
-- be before the start, and a sit can be at most 30 days long (end - start
-- <= 30). The app already checks the same rule on Save (spec 0085); this is
-- the backstop for anything that reaches the table another way.
--
-- No function, policy or grant changes, so who can see or do what is
-- unchanged except that a sit with bad dates can no longer be saved by
-- anyone (including the service role).
--
-- Why a plain (validated) constraint and not NOT VALID (spec 0085, flag 3):
-- Postgres still checks a NOT VALID constraint on any later update of a row.
-- Account deletion (migration 0058) updates pet_sits.created_by, so one
-- leftover bad sit would make deleting that person's account fail. Instead
-- this file refuses to run while any bad sit exists (check 2 below), and it
-- never edits or deletes data itself: fix or delete the bad sits in the app
-- (Pet Sitter shows them as "Dates not set"), then push again.
--
-- UNDO:
--   alter table public.pet_sits drop constraint if exists pet_sits_dates_sane;
--
-- RESTORING A BACKUP (risk accepted by Lynn, 2026-11-26: prod has no active
-- users): any backup taken before prod's bad sit is fixed still contains it,
-- so restoring that backup's pet_sits data fails this rule, and its child
-- tables (pet_sit_logs, pet_sitter_access) then fail their foreign keys.
--
-- Once this file is on main, every restore drill (scripts/restore-test.sh,
-- run by hand or by the quarterly 15 Jan/Apr/Jul/Oct schedule) restores
-- prod's NEWEST backup by default, so the drill fails on
-- pet_sits_dates_sane from the merge until prod's bad sit is fixed and at
-- least one nightly backup has run since. After that, older backups (kept
-- 30 days) still contain the bad sit and still fail.
--
-- If the drill fails on pet_sits_dates_sane: don't drop the constraint and
-- rerun, because the drill replays every migration and adds it back. Rerun
-- the "Database Restore Test" GitHub workflow with its backup_key input set
-- to a backup taken after prod's bad sit was fixed. (A failed drill run
-- stops before handle_new_user is switched back on; that only matters for
-- the disposable scratch database, and the next successful run fixes it.)
--
-- For a real restore by hand:
--   1. Replay the migrations (including this one).
--   2. BEFORE the first data load:
--        alter table public.pet_sits drop constraint if exists pet_sits_dates_sane;
--      (Not after a failed load: a second pg_restore hits duplicate keys on
--      the rows the first one already loaded.)
--   3. Load the data.
--   4. Fix (update public.pet_sits set start_date = ..., end_date = ...
--      where id = ...) or delete the bad sit(s).
--   5. alter table public.pet_sits add constraint pet_sits_dates_sane check (
--        start_date between '2000-01-01' and '2100-12-31'
--        and end_date between '2000-01-01' and '2100-12-31'
--        and end_date >= start_date
--        and end_date - start_date <= 30
--      );
--
-- SAFETY CHECK 1: this must run only after the spec-0085 frontend is live on
-- that environment, because the old Pet Sitter page has no error handling on
-- Save: an owner who typed a bad date would be left on "Saving..." with no
-- message. It refuses to run until the environment has been marked ready,
-- by hand (run in that project's SQL editor, or with
-- `supabase db query --linked`):
--
--   create schema if not exists private;
--   create table if not exists private.deploy_markers (key text primary key, created_at timestamptz not null default now());
--   revoke all on schema private from anon, authenticated;
--   revoke all on private.deploy_markers from anon, authenticated;
--   insert into private.deploy_markers (key) values ('spec_0085_frontend_live') on conflict do nothing;
--
-- (The table is created there, not only below, because a blocked run of
-- this file rolls back everything in it, including its own table.)
--
-- SAFETY CHECK 2: refuses to run if any existing sit breaks the rule,
-- printing how many and up to 20 of their ids with their dates.
--
-- Rollout order on each project:
--   1. Frontend promoted (Cloudflare, branch main, "Spec 0085 ...").
--   2. Marker set (snippet above).
--   3. Any bad sits fixed or deleted in the app (Pet Sitter, pencil or
--      trash can on the "Dates not set" card).
--   4. `supabase db push`.
--
-- `supabase db push` applies this file as one transaction: a blocked or
-- failed run changes nothing.

create schema if not exists private;
create table if not exists private.deploy_markers (
  key text primary key,
  created_at timestamptz not null default now()
);
revoke all on schema private from anon, authenticated;
revoke all on private.deploy_markers from anon, authenticated;

-- Check 1: frontend marker --------------------------------------------------
do $$
begin
  if not exists (select 1 from private.deploy_markers where key = 'spec_0085_frontend_live') then
    raise exception 'Spec 0085 migration 0063 blocked: this environment''s frontend is not marked live yet. '
      'After confirming the spec-0085 build is live here, run the marker snippet '
      'in the header of 0063_pet_sit_date_check.sql, then push again.';
  end if;
end $$;

-- Check 2: no existing sit breaks the rule ----------------------------------
do $$
declare
  bad_count integer;
  bad_list text;
begin
  select count(*) into bad_count
  from public.pet_sits
  where not (
    start_date between date '2000-01-01' and date '2100-12-31'
    and end_date between date '2000-01-01' and date '2100-12-31'
    and end_date >= start_date
    and end_date - start_date <= 30
  );

  if bad_count > 0 then
    select string_agg(format('%s (start %s, end %s)', id, start_date, end_date), '; '
                      order by created_at, id)
      into bad_list
    from (
      select id, start_date, end_date, created_at
      from public.pet_sits
      where not (
        start_date between date '2000-01-01' and date '2100-12-31'
        and end_date between date '2000-01-01' and date '2100-12-31'
        and end_date >= start_date
        and end_date - start_date <= 30
      )
      order by created_at, id
      limit 20
    ) bad;

    raise exception 'Spec 0085 migration 0063 blocked: % pet sit(s) have dates that break the new rule. '
      'Fix or delete them in the app (Pet Sitter shows them as "Dates not set"), then push again. '
      'First up to 20: %', bad_count, bad_list;
  end if;
end $$;

-- The rule ------------------------------------------------------------------
alter table public.pet_sits
  add constraint pet_sits_dates_sane check (
    start_date between '2000-01-01' and '2100-12-31'
    and end_date between '2000-01-01' and '2100-12-31'
    and end_date >= start_date
    and end_date - start_date <= 30
  );
