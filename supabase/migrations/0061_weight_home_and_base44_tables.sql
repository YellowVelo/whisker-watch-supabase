-- Wysker Watch — weight's new home and the Base44-era tables (spec 0081,
-- punch list PA-71, PA-50, PA-51)
--
-- What this does (after the safety check below):
--   1. Adds the three spreadsheet file types to the private `uploads`
--      bucket (FR27), keeping everything 0054 allowed: text/csv,
--      application/vnd.ms-excel (Windows labels many .csv files this way)
--      and the .xlsx type. The 10 MB limit is unchanged.
--   2. Drops symptom_logs, wellness_scores and food_logs (FR12, FR15,
--      FR16, AC9). Nothing is moved first (Amendment 2): weight already
--      lives in `observations` (type `weight`), and migration 0027 moved
--      the Base44 symptom-log answers into check-ins.
--
-- No schema change for weight (Amendment 1): a standalone weight is an
-- `observations` row with daily_check_in_id null, dated by observed_at
-- (noon UTC of the chosen day). observations' existing rules (0014, 0045,
-- 0057) already let owners and co-owners read and write it and let a
-- sitter read it during an open sit.
--
-- Dependencies checked before dropping (repo migrations 0001-0062, and the
-- live catalog on wysker-watch-dev, 2026-11-25): no view, foreign key,
-- publication, policy on another table or stored function body names these
-- tables. Their own policies, indexes and triggers (0062's
-- stamp_record_author on all three) go with them; the shared trigger
-- function stays, used by the other record tables. 0058's foreign-key loop
-- and 0062's trigger loop were one-time DO blocks that already skip missing
-- tables (to_regclass), and prepare_account_deletion() /
-- transfer_pet_ownership() (0058) don't name them. So the drops use no
-- CASCADE: if some project has an unexpected dependency, the drop fails and
-- this whole file rolls back instead of silently taking it with it.
--
-- FR11 counts (2026-11-24, Amendment 2): dev 3 old symptom logs (all on
-- days with a check-in, no weights); staging 0; prod 16 (11 known Base44
-- days, 5 others; 3 with a weight, 4 with notes, 4 with medication given,
-- all 14 answered rows on days that already have a check-in), plus 83
-- wellness scores and 1 food log. Lynn chose to delete without copying.
--
-- UNDO: there is no code undo for dropped data. The nightly encrypted
-- pg_dump in R2 (docs/features/requirements-database-backups.md) holds the
-- three tables as they were the night before this ran, for 30 days. To
-- undo, first recreate everything the drop took with it, in this order:
--   a. the tables, from their original migrations (food_logs and
--      symptom_logs from 0001, wellness_scores from 0014, plus 0021's and
--      0022's added columns), with RLS enabled;
--   b. their access rules: 0004's co-owner policies on food_logs and
--      symptom_logs (food_logs_/symptom_logs_{select,insert,update,
--      delete}_owner, all public.is_pet_owner(pet_id, auth.uid())) and
--      0014's matching wellness_scores_*_owner policies, replacing 0001's
--      *_own ones (0004 drops those);
--   c. 0058's created_by foreign keys (on delete set null);
--   d. 0062's stamp_record_author trigger on all three (before insert or
--      update, for each row, execute public.stamp_record_author()).
-- Then restore their rows from that dump with
-- pg_restore --data-only -t <table>. Restoring rows before (b) leaves them
-- readable only by the service role; before (d), rows written afterwards
-- aren't stamped. The bucket change is undone by setting
-- allowed_mime_types back to 0054's list.
--
-- SAFETY CHECK: this must run only after the spec-0081 frontend is live on
-- that environment, because the old frontend still reads and writes these
-- tables. It refuses to run until the environment has been marked ready, by
-- hand (run in that project's SQL editor, or with
-- `supabase db query --linked`):
--
--   create schema if not exists private;
--   create table if not exists private.deploy_markers (key text primary key, created_at timestamptz not null default now());
--   revoke all on schema private from anon, authenticated;
--   revoke all on private.deploy_markers from anon, authenticated;
--   insert into private.deploy_markers (key) values ('spec_0081_frontend_live') on conflict do nothing;
--
-- (The table is created there, not only below, because a blocked run of
-- this file rolls back everything in it, including its own table.)
--
-- EDGE FUNCTIONS FIRST: on each project, the spec-0081 versions of
-- ask-vet-assistant and generate-vet-report must be deployed BEFORE
-- `supabase db push` runs this file. The older deployed versions still read
-- symptom_logs / wellness_scores / food_logs, so once these tables are
-- dropped they fail until the new versions are live. The marker check below
-- does not check this; it only covers the frontend.
--
-- Rollout order on each project (AC10):
--   1. Frontend promoted (Cloudflare, branch main, "Spec 0081 ...").
--   2. Marker set (snippet above).
--   3. Edge Functions deployed (ask-vet-assistant, generate-vet-report),
--      then scripts/check-functions-start.sh <project-url>. Must finish
--      before step 4.
--   4. `supabase db push --include-all` (this file is numbered 0061 but
--      lands after 0062, so a plain push skips it).
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

do $$
begin
  if not exists (select 1 from private.deploy_markers where key = 'spec_0081_frontend_live') then
    raise exception 'Spec 0081 migration 0061 blocked: this environment''s frontend is not marked live yet. '
      'After confirming the spec-0081 build is live here, run the marker snippet '
      'in the header of 0061_weight_home_and_base44_tables.sql, then push again.';
  end if;
end $$;

-- 1. Spreadsheet file types (FR27) -------------------------------------------
update storage.buckets
set allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'uploads';

-- 2. Base44-era tables (AC9) -------------------------------------------------
drop table if exists public.symptom_logs;
drop table if exists public.wellness_scores;
drop table if exists public.food_logs;
