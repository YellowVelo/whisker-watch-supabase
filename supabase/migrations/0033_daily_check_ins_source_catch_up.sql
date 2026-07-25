-- Wysker Watch — Catch-Up Check-In (Feature Spec 0015), PR 3
--
-- Adds 'catch_up' as an allowed daily_check_ins.source value, alongside
-- the existing 'app' | 'notification' | 'widget' | 'sitter'. Purely
-- additive — no existing rows are touched. Lets a catch-up-authored day
-- (backfilled possibly weeks after the fact, via the multi-day Catch Up
-- flow or the pre-existing single-day "Catch up yesterday" flow — both go
-- through DailyCheckInSheet with isCatchUp=true) be told apart later from
-- a day logged live that same day, for debugging and trust-in-the-data
-- questions ("was this really logged on Jul 16, or backfilled on Jul 25").
--
-- Constraint is located dynamically and dropped before being re-added,
-- following the same safe-to-re-run pattern as migration 0026's status
-- constraint change — robust against the constraint's generated name
-- differing across environments.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'daily_check_ins'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%source%';

  if v_constraint_name is not null then
    execute format('alter table public.daily_check_ins drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.daily_check_ins add constraint daily_check_ins_source_check
  check (source in ('app', 'notification', 'widget', 'sitter', 'catch_up'));

comment on column public.daily_check_ins.source is
  'Where this check-in was authored. catch_up = backfilled via the Catch-Up Check-In flow (single-day or multi-day), possibly days/weeks after check_in_date — distinct from app, which means logged live that day.';
