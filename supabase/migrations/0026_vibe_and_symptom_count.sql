-- Wysker Watch — Daily Check-In, Vibe & Trends (Feature Spec v5)
--
-- Replaces every numeric score in the app (Wellness Score V1, Health Score
-- V2, and the never-shipped severity-weighted N/100 blend) with two
-- independent daily signals: a subjective owner-reported Vibe and an
-- objective, unweighted symptom count. Neither is ever derived from the
-- other (spec Core Model III — a hard rule, not a display nicety).
--
-- Nothing here drops wellness_scores, observation_options.severity_score,
-- health_score_deduction, or direction_ordinal — those retired columns are
-- left in place, unused, per this codebase's existing precedent of not
-- making destructive schema changes when a value simply stops being read
-- (see migration 0022's comment for the same call).

-- ============================================================
-- daily_check_ins.status — 'normal'/'changed'/'skipped' becomes
-- 'great'/'off'/'tough'/'skipped'. Existing live rows are remapped first
-- (per product decision): normal -> great, changed -> off (the prior
-- binary model has no record of which of Off/Tough a 'changed' day was,
-- so this is a one-time, documented assumption, not a recoverable fact),
-- skipped -> skipped.
--
-- status is also made nullable: a migrated legacy day (Phase 2 backfill,
-- see 0027) has a real, computable symptom_count but Base44 never asked
-- "how did the day feel," so it must render as "Vibe not recorded" —
-- visually and semantically distinct from both a live Skipped day (status
-- = 'skipped', symptom_count null) and a live completed day (status is
-- one of great/off/tough). Spec Migration Plan: "Base44 never asked ...
-- that data doesn't exist and must not be fabricated."
-- ============================================================
-- Every statement below is guarded to be safe to (re-)run regardless of
-- partial prior state — several pieces of this migration were, at
-- various points during troubleshooting, applied by hand against one
-- environment or another outside the normal migration flow.
--
-- Constraint must be relaxed *before* remapping values — the old
-- constraint only allows 'normal'/'changed'/'skipped', so writing 'great'/
-- 'off' while it's still in effect fails immediately on any environment
-- that actually has live rows.
alter table public.daily_check_ins alter column status drop not null;

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
    and pg_get_constraintdef(con.oid) ilike '%status%';

  if v_constraint_name is not null then
    execute format('alter table public.daily_check_ins drop constraint %I', v_constraint_name);
  end if;
end $$;

update public.daily_check_ins set status = 'great' where status = 'normal';
update public.daily_check_ins set status = 'off' where status = 'changed';

alter table public.daily_check_ins add constraint daily_check_ins_status_check
  check (status is null or status in ('great', 'off', 'tough', 'skipped'));

comment on column public.daily_check_ins.status is
  'great/off/tough = live Vibe self-report. skipped = owner explicitly skipped. null = no Vibe recorded (legacy migrated day only — never set by the live app).';

-- ============================================================
-- daily_check_ins.symptom_count — persisted once per completed day at
-- save time (spec: "never computed live at read time"). Null for a
-- skipped/no-check-in day. Independent of status — a migrated day can
-- have a real count and a null status at the same time.
-- ============================================================
alter table public.daily_check_ins
  add column if not exists symptom_count integer check (symptom_count >= 0);

comment on column public.daily_check_ins.symptom_count is
  'Total distinct symptoms logged across the 11 counted categories (6 Health + 5 Wellbeing). Excludes Medication Exception, Weight, Other, and any "Not Observed" answer. Null for a skipped or not-yet-completed day.';

-- ============================================================
-- Nausea — new Health category, multi-select, 5 options carried over
-- verbatim from the legacy symptom_logs.nausea_symptoms array (spec:
-- "same values, no ambiguity").
-- ============================================================
-- sort_order 6 ties with 'energy' (also 6) — harmless; this column isn't
-- read by the client (CATEGORIES in config.js drives display order), and
-- placing Nausea immediately after Vomiting (5) matches HEALTH_ATTRIBUTES.
insert into public.observation_types (code, label, category, species_applicability, answer_type, sort_order)
select 'nausea', 'Nausea', 'nausea', 'both', 'enum', 6
where not exists (select 1 from public.observation_types where code = 'nausea');

insert into public.observation_options (observation_type_id, value, label, severity_score, sort_order)
select t.id, v.value, v.label, 0, v.sort_order
from public.observation_types t
join (values
  ('nausea', 'normal', 'Normal', 1),
  ('nausea', 'lip_licking', 'Lip licking', 2),
  ('nausea', 'burping', 'Burping', 3),
  ('nausea', 'drooling', 'Drooling', 4),
  ('nausea', 'ate_non_food_items', 'Ate non-food items', 5),
  ('nausea', 'hunched_posture', 'Hunched posture', 6)
) as v(code, value, label, sort_order) on v.code = t.code
where not exists (
  select 1 from public.observation_options o where o.observation_type_id = t.id and o.value = v.value
);

-- ============================================================
-- New answer options on existing categories.
-- "Not Observed" is a real, explicit logged answer — distinct from
-- "Normal" (owner actively observed no change) and excluded from the
-- symptom count entirely (spec: "not the same as Normal ... must keep
-- these visually and semantically distinct").
-- ============================================================
insert into public.observation_options (observation_type_id, value, label, severity_score, sort_order)
select t.id, 'not_observed', 'Not observed', 0, 99
from public.observation_types t
where t.code = 'water_intake'
  and not exists (select 1 from public.observation_options o where o.observation_type_id = t.id and o.value = 'not_observed');

insert into public.observation_options (observation_type_id, value, label, severity_score, sort_order)
select t.id, 'not_observed', 'Not observed', 0, 99
from public.observation_types t
where t.code = 'bathroom'
  and not exists (select 1 from public.observation_options o where o.observation_type_id = t.id and o.value = 'not_observed');

insert into public.observation_options (observation_type_id, value, label, severity_score, sort_order)
select t.id, 'regurgitated', 'Regurgitated', 0, 5
from public.observation_types t
where t.code = 'vomiting'
  and not exists (select 1 from public.observation_options o where o.observation_type_id = t.id and o.value = 'regurgitated');
