Data Model (V2 — as-built)

Revision note: originally written against migrations 0001–0014. Updated in place (not re-versioned) to add migrations 0015–0017 (profile first/last name, timezone settings, the co-owner-invite-linking fix) and the pre-existing `notifications` table (migration 0005), which was missed in the original pass. Updated in place again (2026-07-18) to reflect migrations 0018–0027, most significantly the retirement of the wellness-score model in favor of Vibe + Symptom Count (migrations 0026/0027) — the previous revision described `daily_check_ins.status` and `wellness_scores` as they existed before that change; both were wrong by the time this correction was made, since `docs/foundation/` is treated as ground truth and nothing prompts a re-check of it. Everything below reflects migrations 0001–0027.

Purpose

This document defines the canonical data model for Wysker Watch as it actually exists in the Supabase/Postgres schema today. It supersedes `0007 Data Model_V1.md` (moved to `Old/`), which described an 11-table schema that predates Pet Onboarding, Co-Owners, Analytics, Account Types, and the entire Daily Check-In / Observation / Wellness Score / Baseline system. V1 is out of date and should not be used as a reference.

Wysker Watch uses a relational, owner-scoped schema built on Supabase/Postgres with strict Row Level Security (RLS).

1. Design Principles

- Owner-Scoped: every pet-linked table is readable/writable only by the pet's owner or co-owner, via `auth.uid()`.
- Relational: all relationships use real foreign keys with `on delete cascade` from `pets`.
- Shared owner check: every pet-scoped table's RLS uses a single `is_pet_owner(pet_id, user_id)` SQL function (migration 0004) rather than duplicating owner-or-co-owner logic per table.
- Baseline-Driven: the schema supports both a legacy, form-based baseline (`pet_onboarding`) and a newer, generalized per-metric baseline model (`pet_baselines`) — see section 6.
- Two independent daily signals, never blended: `daily_check_ins.status` is a subjective, owner-reported **Vibe** (`great`/`off`/`tough`/`skipped`), and `daily_check_ins.symptom_count` is an objective, unweighted count of distinct symptoms logged that day across `observations`. Per Product Principle 6 ("Missing Data Is Meaningful"), `skipped` is itself a real, distinct answer, not an absence of one. (This replaced an earlier `normal`/`changed`/`skipped` enum and a computed 0–100/0–10 wellness score — see §3.14 and §3.19.)
- Additive evolution: newer systems (Daily Check-In/Observations) were added alongside older ones (`symptom_logs`) rather than replacing them; both are currently live. See section 7 for what still uses which.

2. Entity Overview

21 tables in the `public` schema, introduced across migrations 0001–0017:

| Table | Introduced | Owner-scoped via |
|---|---|---|
| profiles | 0001 (+0010, 0011, 0015, 0017) | `id = auth.uid()` |
| notifications | 0005 | `user_id = auth.uid()` |
| pets | 0001 (+0008) | `is_pet_owner()` |
| pet_foods | 0001 | `is_pet_owner()` |
| food_logs | 0001 | `is_pet_owner()` |
| medications | 0001 (+0012 reminder_enabled) | `is_pet_owner()` |
| vaccinations | 0001 | `is_pet_owner()` |
| bloodwork | 0001 | `is_pet_owner()` |
| symptom_logs | 0001 | `is_pet_owner()` |
| pet_sits | 0001 | `is_pet_owner()` on any pet in `pet_ids`, or `created_by` |
| pet_sit_logs | 0001 | `is_pet_owner()` or matching sitter access |
| pet_sitter_access | 0001 | owner via related `pet_sits`, or the sitter themself |
| pet_co_owners | 0004 | `owner_id` (list/manage) or `co_owner_user_id` (self) |
| pet_onboarding | 0012 (+0013 skipped_at) | `is_pet_owner()` |
| daily_check_ins | 0014 | `is_pet_owner()` |
| observation_types | 0014 | read-only reference data, any authenticated user |
| observation_options | 0014 | read-only reference data, any authenticated user |
| observations | 0014 | `is_pet_owner()` |
| pet_baselines | 0014 | `is_pet_owner()` |
| wellness_scores | 0014 | `is_pet_owner()` — **dead: schema only, nothing writes or reads it since migration 0026 (see §3.19)** |
| analytics_events | 0009 | `user_id = auth.uid()` |

Every entity above has a corresponding client in `src/api/entities.js` (Pet, PetFood, FoodLog, Medication, Vaccination, Bloodwork, SymptomLog, PetSit, PetSitLog, PetSitterAccess, PetCoOwner, PetOnboarding, DailyCheckIn, ObservationType, ObservationOption, Observation, PetBaseline, WellnessScore), each exposing `list/filter/get/create/update/delete/bulkCreate/upsert` via the shared `entityClient.js`. UI components must go through these, never call Supabase table access directly (see Technical Standards). The `WellnessScore` client still exists but, like the table it wraps, has no current caller anywhere in the app (§3.19).

3. Table Definitions

3.1 profiles
Extends `auth.users`.
- `id` uuid PK, references `auth.users(id)` on delete cascade
- `role` text, default `'user'`, check in (`admin`, `user`)
- `email` text
- `account_type` text, default `'production'`, check in (`production`, `test`, `demo`) — added 0010, auto-classified by email allowlist at signup
- `first_name` text, max 100 chars — added 0015; populated at signup from auth metadata when provided, otherwise self-editable (covered by the existing `profiles_update_own` policy, no RLS change needed)
- `last_name` text, max 100 chars — added 0017, same pattern as `first_name`
- `timezone` text, nullable — added 0017; populated client-side on first authenticated load via `Intl.DateTimeFormat` detection (`src/lib/timezone.js`), not backfilled for existing rows. Enforced to be a valid IANA identifier by a `BEFORE INSERT/UPDATE` trigger checking against Postgres's own `pg_timezone_names` catalog (a CHECK constraint can't do this, since checks can't query other relations) — this matters because RLS alone only restricts *who* can write a profiles row, not *what* value they write, so without the trigger a direct REST API call could store an arbitrary string.
- `timezone_is_manual` boolean, default `false` — added 0017; once a timezone is set (auto-detected or manually chosen), the app never silently overwrites it again. This is enforced in application code (`shouldAutoPopulateTimezone()` in `timezone.js`), not the database, same as the read side of `first_name`.
- `created_at`, `updated_at` timestamptz

`role` and `account_type` can only be changed by a service-role process (trigger-enforced, migration 0011) — a regular authenticated user cannot self-promote to admin or test/demo.

3.2 pets
Central entity for all health data.
- `id` uuid PK
- `created_by` uuid, references `auth.users(id)` — the original creator; permission checks use `is_pet_owner()`, not this column directly, once a pet has co-owners
- `species` text, default `'Cat'`, check in (`Cat`, `Dog`)
- `name` text, max 100 chars
- `photo_url`, `breed` text
- `birth_date` date (not future), `birth_date_precision` text, default `'UNKNOWN'`, check in (`EXACT`, `MONTH_YEAR`, `YEAR`, `UNKNOWN`)
- `conditions`, `nicknames`, `favorite_activities` text[], default `{}`
- `medications` text — free-text field, distinct from the `medications` table (legacy, still present)
- `notes` text, max 500 chars
- `is_memorial` boolean, `memorial_date` date
- `sex` text, check in (`Female`, `Male`, `Unknown`) — added 0008
- `altered_status` text, check in (`Yes`, `No`, `Unknown`) — added 0008
- `gotcha_date` date (not future), `gotcha_date_precision` text — added 0008
- `microchip_number` text, max 50 chars — added 0008
- `akc_registered` boolean, `akc_registered_name`, `akc_registration_number`, `breeder` text — added 0008
- `created_at`, `updated_at` timestamptz

Life stage (Kitten/Puppy, Adult, Senior) and display age are derived at read time from species + birth_date + birth_date_precision (`src/lib/lifeStage.js`) — never stored, so they can't go stale.

3.3 pet_foods
Diet baseline. `id`, `created_by`, `pet_id`, `name`, `brand`, `food_type` (enum), `prescription` bool, `start_date`, `end_date`, `active` bool, `notes`, timestamps.

3.4 food_logs
Legacy per-meal feeding log. `id`, `created_by`, `pet_id`, `date`, `food_name`, `brand`, `food_type`, `amount_eaten` (enum), `reaction` (enum), `notes`, `created_at`. Not currently surfaced in the UI (superseded in practice by `symptom_logs.appetite` and, going forward, `observations` with `observation_types.code = 'appetite'`) but not dropped.

3.5 medications
`id`, `created_by`, `pet_id`, `name`, `med_type` (General/Flea & Tick/Heartworm), `prescribed` bool, `dosage`, `frequency` (enum), `timing_instructions`, `route` (enum), `start_date`, `next_due_date`, `end_date`, `prescribing_vet`, `active` bool, `notes`, `reminder_enabled` bool (added 0012), timestamps.

3.6 vaccinations
`id`, `created_by`, `pet_id`, `vaccine_name`, `date_given`, `next_due_date`, `administered_by`, `lot_number`, `notes`, timestamps.

3.7 bloodwork
`id`, `created_by`, `pet_id`, `date`, `lab_name`, `vet_name`, plus numeric lab values (`bun`, `creatinine`, `sdma`, `phosphorus`, `potassium`, `sodium`, `calcium`, `hematocrit`, `hemoglobin`, `total_protein`, `albumin`, `alt`, `ast`, `alkaline_phosphatase`, `total_bilirubin`, `glucose`, `t4`), `urine_specific_gravity`, `urine_protein` (enum), `notes`, `created_at`.

3.8 symptom_logs
Legacy, still-live per-pet-profile daily log (predates Daily Check-In). `id`, `created_by`, `pet_id`, `date`, `appetite` (enum), `vomiting` int, `stool_quality` (enum), `energy_level` (enum), `water_intake` (enum), `weight_grams` numeric, `urination` (enum), `nausea_symptoms` text[], `pain_signs` bool, `medication_given` bool, `notes`, `created_at`. This is currently the only place `weight_grams` is written from the UI (Pet Profile's Weight quick-log bubble and the full Symptom Log form) — the newer `observations` table also has a `weight` observation type, but the two are not yet reconciled into one source of truth. See section 7.

3.9 pet_sits / 3.10 pet_sit_logs / 3.11 pet_sitter_access
Sitter session model. `pet_sits` covers multiple pets via a `pet_ids uuid[]` array (not a single FK) plus dates/instructions/contacts. `pet_sit_logs` are entries a sitter makes during a session. `pet_sitter_access` grants a sitter (by email, later linked to `sitter_user_id` once they sign up) read/log access scoped to one `pet_sit`.

3.12 pet_co_owners
Full-parity co-ownership (migration 0004) — distinct from sitter access. `id`, `pet_id`, `owner_id` (the primary owner who invited), `created_by`, `co_owner_email`, `co_owner_user_id` (filled once accepted), `created_at`. Once linked, a co-owner has identical rights to the primary owner on every pet-scoped table (edit, log, delete) via `is_pet_owner()`. Only the primary owner can invite/remove co-owners.

Bug fix (migration 0016): `co_owner_user_id` was documented as "filled in once the invited person signs up/logs in with this email" but nothing ever actually set it — the invite dialog only ever inserted `co_owner_email`, and there was no `UPDATE` policy on this table at all. Consequences while the bug was live: an invited co-owner never actually gained access (since `is_pet_owner()` checks `co_owner_user_id`), and `delete-pet`'s ownership-transfer branch never fired (it only triggers for co-owners with a non-null `co_owner_user_id`), so deleting a "shared" pet always silently took the permanent-delete path instead of transferring ownership. Fixed by `claim_pending_co_owner_invites()`, a `SECURITY DEFINER` function the client now calls once per session (login/session restore) that links any pending invite matching the signed-in user's email.

3.13 pet_onboarding
One row per pet — the "Complete {Pet}'s Profile" wizard's progress and initial behavioral baseline. `id`, `created_by`, `pet_id` (unique), `health_status`, `medications_status`, `appetite_baseline`, `water_baseline`, `energy_baseline`, `mobility_baseline`, `bathroom_baseline` (all enums), `current_step` (enum, tracks wizard resume point), `completed_at`, `skipped_at` (added 0013 — distinguishes "explicitly skipped" from "interrupted mid-flow," per Product Principle 6), timestamps. Diagnoses are NOT duplicated here — the wizard's "Known Conditions" card writes directly to `pets.conditions`.

3.14 daily_check_ins
One row per pet per day. `id`, `created_by`, `pet_id`, `check_in_date`, `status`, `completed_at`, `source` (`app`/`notification`/`widget`/`sitter`), `notes`, `symptom_count` int (added 0026), timestamps. Unique on `(pet_id, check_in_date)`.

`status` is `great`/`off`/`tough`/`skipped` as of migration `0026_vibe_and_symptom_count.sql` — the original `normal`/`changed`/`skipped` enum from migration 0014 was renamed in place (`normal`→`great`, `changed`→`off`, plus a new `tough` value; `skipped` unchanged), with existing live rows remapped by the migration itself. `symptom_count` is a persisted integer — the total count of distinct symptoms logged that day across all 11 counted `observations` categories, computed once at check-in time rather than derived live on every read. Some rows migrated from the pre-0026 era have a real `symptom_count` but a null `status` (`0027_migrate_symptom_logs_to_checkins.sql`) — code that reads this table needs to handle that combination, not just null-vs-populated on either field independently.

3.15 observation_types / 3.16 observation_options
Reference data (not owner-scoped; readable by any authenticated user, writable only by migration/service role). 14 seeded types as of migration 0026: appetite, water_intake, bathroom, stool, vomiting, **nausea** (added 0026), energy, mobility, breathing, itching, behavior, medication_exception, weight, other. Each type has `category`, `species_applicability` (`cat`/`dog`/`both`), `answer_type` (`enum`/`number`/`text`/`boolean`), `baseline_supported`, `score_supported`, `sort_order`. Each enum type has seeded `observation_options` rows with a `severity_score` column — **this column is vestigial as of migration 0026**: it's still populated on insert and still present in the schema, but nothing in `src/lib/checkin/scoring.js` reads it anymore (the Vibe/Symptom-Count model is unweighted — every logged symptom counts equally, there is no deduction). `src/lib/checkin/config.js` is the client-side mirror of the current (unweighted) attribute model used to render the Daily Check-In UI; it does not mirror `severity_score`.

3.17 observations
The actual owner-reported observations — primary truth for the Daily Check-In system. `id`, `created_by`, `pet_id`, `daily_check_in_id` (nullable FK), `observation_type_id`, `value`, `numeric_value`, `severity_score` (vestigial, see §3.15), `notes`, `photo_url`, `observed_at`, timestamps.

3.18 pet_baselines
Generalized per-metric baseline, one active row per `(pet_id, observation_type_id)` (enforced by a partial unique index where `effective_to is null`), with history preserved via `effective_from`/`effective_to` rather than overwrite. `id`, `created_by`, `pet_id`, `observation_type_id`, `baseline_value`, `baseline_numeric_value`, `baseline_notes`, `confidence_level` (`low`/`medium`/`high`), `source` (`onboarding`/`manual_edit`/`system_suggested`), `effective_from`, `effective_to`, timestamps.

Note: this table exists but is not yet populated or read by any UI. There is currently no baseline row for `weight` (or any metric) actually written anywhere in the app — `pet_onboarding`'s baseline columns (appetite/water/energy/mobility/bathroom) are the only baseline data actually in use today, and they are a fixed enum-based form, not rows in `pet_baselines`. Any feature that wants to compare "today vs. baseline" for weight or another `observation_types` metric needs to either start writing to `pet_baselines` or accept there is no baseline to compare against yet.

3.19 wellness_scores — dead table, kept for history only
Calculated score snapshot, one per pet per day. `id`, `created_by`, `pet_id`, `check_in_date`, `daily_check_in_id`, `score` int (0–100), `trend` (`stable`/`improving`/`monitor`/`declining`/`unknown`), `score_reason_summary`, `created_at`. Unique on `(pet_id, check_in_date)`.

**This table is no longer written to or read from anywhere in the app.** It was the output of `computeDayScore`/`computeTrend` in `src/lib/checkin/scoring.js` — both functions were removed when the Wellness Score model was retired in favor of Vibe + Symptom Count (migration `0026_vibe_and_symptom_count.sql`). Migration 0026 explicitly does not drop this table (nor `observation_options.severity_score`/`health_score_deduction`/`direction_ordinal`) — historical rows remain queryable for anyone who needs pre-Vibe history, but no current UI reads them and no current write path populates new rows. There is no historical, chartable per-day score series in the schema anymore; the closest equivalent today is `daily_check_ins.symptom_count` (§3.14), which is a raw count, not a score, and is never compared against a baseline or converted into a trend label.

3.20 analytics_events
First-party event log (no third-party analytics provider wired up). `id`, `user_id`, `event_name`, `properties` jsonb, `created_at`. Insert/select restricted to the event's own `user_id`.

3.21 notifications
In-app notification list (migration 0005 — present since early in the schema's history, but missed in the original pass of this document; now actively read by the Notifications screen). `id`, `user_id`, `type` text (e.g. `ownership_transfer`), `message` text (human-readable, shown as-is in the UI), `read` boolean default `false`, `created_at`. No email is sent from this table — it's purely an in-app list, surfaced via `src/lib/notifications/notificationClient.js` (`getUnreadCount`, `listNotifications`, `markRead`). Rows are inserted by Edge Functions using the service-role client (e.g. `delete-account` generates an `ownership_transfer` notice for a co-owner when the primary owner's account is deleted), which bypasses RLS — there is intentionally no client-side insert policy. Users can `select`/`update` (mark read) / `delete` only their own rows (`user_id = auth.uid()`).

4. Relationships

```
auth.users (1) ─── (1) profiles
auth.users (1) ─── (N) pets [created_by]
pets (1) ─── (N) pet_foods, food_logs, medications, vaccinations, bloodwork,
              symptom_logs, pet_onboarding (1:1), daily_check_ins,
              observations, pet_baselines, wellness_scores [dead, §3.19]
pets (1) ─── (N) pet_co_owners
pets (N) ─── (N) pet_sits  [via pet_sits.pet_ids array — not a join table]
pet_sits (1) ─── (N) pet_sit_logs, pet_sitter_access
daily_check_ins (1) ─── (N) observations, wellness_scores [optional link]
observation_types (1) ─── (N) observation_options, observations, pet_baselines
```

5. RLS Model

Every pet-scoped table's policies are `is_pet_owner(pet_id, auth.uid())` (migration 0004's `security definer` function), which returns true if the calling user is either the pet's `created_by` or a linked row in `pet_co_owners`. This means co-owners have full parity with the original owner everywhere, including delete, by design. Sitter access is a narrower, separate grant scoped only to `pet_sit_logs`/`pet_sitter_access` for a specific sitting period, matched by email or `sitter_user_id`. `observation_types`/`observation_options` are the only pet-adjacent tables with no owner scoping — they're global reference data. `profiles.role` and `profiles.account_type` can only be changed by a service-role process, never by the user themself.

6. Baseline Model — current state (important, since two systems exist)

There are two baseline mechanisms in the schema right now, at different levels of maturity:

- `pet_onboarding` — fixed-form baseline (health status, medications yes/no, appetite/water/energy/mobility/bathroom), captured once during onboarding and editable afterward. This is what `BaselineSection.jsx` and the Pet Profile "Baseline" card actually read/write today.
- `pet_baselines` — a generalized, per-`observation_type` baseline model with confidence levels and history, built in migration 0014 alongside Daily Check-In. As of this document, it is schema-only: nothing writes to it and nothing reads from it. There is no weight baseline, no appetite baseline via this table, nothing.

Any new feature (e.g. Insights) that wants a true "compared to baseline" comparison must either (a) start populating and reading `pet_baselines`, or (b) explicitly document that it's using a weaker proxy (e.g. "compared to the last logged entry") until that table is wired up. Do not assume a baseline value exists for any metric without checking.

7. Two Logging Systems — current state (mostly narrowed since this document's original pass)

`symptom_logs` (2021-era, migration 0001) and `daily_check_ins`/`observations` (migration 0014, "Daily Check-In V1") are both still live, but the gap between them has narrowed considerably following the Trends/Wellness Summary work:

- The Daily Check-In flow on Home writes to `daily_check_ins` + `observations` only. It no longer writes to `wellness_scores` — that write path was removed along with `computeDayScore`/`computeTrend` when the Vibe/Symptom-Count model shipped (migration 0026; see §3.19).
- There is no "Wellness Summary rings" UI anymore, and no `getWellnessRingScores` function — both were retired along with Wellness Score V1/Health Score V2. The standalone Pet Profile page (`context="profile"` in `PetProfileContent.jsx`) shows a single Vibe icon (today's `daily_check_ins.status`) plus a separate Weight value; the Pets-tab card (`context="pets"`) instead shows five Wellbeing direction chips (`getWellbeingDirections` in `petProfileClient.js`), comparing today's `symptom_count`-derived per-attribute state to yesterday's. The Trends screen's Appetite/Water Intake/Energy cards read from `daily_check_ins`/`observations` via `getObservationTrend` in `trendsClient.js`, as this section previously described — that part held up. The old `symptom_logs`-based 30-day recharts trend charts and their quick-log bubbles remain removed from Pet Profile.
- **Weight is the one remaining exception.** `symptom_logs.weight_grams` is still the only place weight is ever written (via `WeightQuickLogSheet` in `PetProfileContent.jsx` — this component moved out of `PetProfile.jsx` since the previous revision of this document) or read (Pet Profile's Weight card via `getWeightSummary`, and the Trends screen's Weight card via `getWeightTrend`) — there is no `weight` write path through `observations`, even though `observation_types` has a seeded `weight` type. Both surfaces document this as a known limitation ("no true baseline exists yet") rather than papering over it.
- Wellness Score no longer exists to be computed from anything (§3.19). `daily_check_ins.symptom_count` is derived only from `observations`; it does not read `symptom_logs`.

Net effect: as of this revision, `symptom_logs` is used for exactly one thing — weight — and every behavioral metric (appetite, water, energy, etc.) now consistently flows through `observations`. Any new feature touching weight should still be explicit that it's reading `symptom_logs`, not `observations`, since that asymmetry remains real.

8. AI Integration

`src/components/PetAIInsights.jsx` calls the `ask-vet-assistant` Edge Function on demand (button-triggered, not scheduled or cached) with a text summary built from `symptom_logs` + `medications` + `bloodwork` + `pets` fields. It does not read `observations`/`daily_check_ins`/`wellness_scores`, and nothing in the schema persists a generated insight — every click regenerates from scratch. There is no `ai_insights` table.

A second on-demand AI call now exists: `getInsightSummary()` in `src/lib/checkin/trendsClient.js` (backing the Trends screen's Overview sub-tab, `InsightSummaryCard.jsx`), which reuses the same `invokeAI` client helper (`src/api/aiClient.js`) as `PetAIInsights.jsx` — not a separate AI-calling path — but builds its context from only four of the Trends screen's already-fetched values: Appetite, Water Intake, Energy, and Weight. It is not given the Vibe status, the `symptom_count`, or any of the other eight Health/Wellbeing attributes (Bathroom, Stool, Vomiting, Nausea, Mobility, Breathing, Itching, Behavior) — none of those reach the prompt. It requires at least 2 non-skipped check-ins in the last 10 days before calling the AI at all; below that threshold it returns `null` and the Insight Summary card simply doesn't render — there is no explicit "Complete more check-ins to unlock AI insights" message shown, contrary to what this document previously implied. Like `PetAIInsights`, nothing here is persisted — still no `ai_insights` table.

Summary

The data model is relational and owner-scoped via a single shared RLS helper (`is_pet_owner()`, now correctly linking co-owners since migration 0016). The older symptom/baseline system (`symptom_logs`, `pet_onboarding`) and the newer, more structured one (`observations`/`pet_baselines`) have mostly converged — `symptom_logs` is now scoped to weight only — but `pet_baselines` remains unpopulated, and `pet_onboarding`'s fixed-form baseline is still the only baseline data actually in use. `wellness_scores` is dead schema, not part of the converged system (§3.19). The current per-day health signal is `daily_check_ins.status` (subjective Vibe) plus `daily_check_ins.symptom_count` (objective, unweighted) — the two never combine into a score, and neither is compared against a baseline. Any new feature should state explicitly which system it builds on for weight specifically, and should not assume `pet_baselines` is populated or that `wellness_scores` has current data.
