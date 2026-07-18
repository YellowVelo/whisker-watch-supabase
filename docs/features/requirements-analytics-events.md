# Requirements: Analytics Events & Nightly Rollup

**Status:** Implemented (07-03 through 07-13, ongoing — new `track()` calls are added with most features), undocumented.
**Source files:** [src/lib/analytics.js](../../src/lib/analytics.js), migrations `0009`, `0023`, `0024`.

## Purpose

Whisker Watch has no third-party analytics provider (Amplitude, Mixpanel, etc.) — instead it logs first-party events to its own `analytics_events` table and computes a nightly rollup (`analytics_daily_summary`) for DAU/new/returning users and check-in funnel counts. This is real, queryable base data (the migration's own comment says so explicitly), not a placeholder — but there's no doc anywhere listing what events exist, what they mean, or how the rollup is computed, so anyone querying it cold has to reverse-engineer both from source.

## Functional Requirements

- **`track(eventName, properties)`** ([analytics.js](../../src/lib/analytics.js)): fire-and-forget client-side helper. Resolves the current user, tags every event with `account_type` (cached per-user for 5 minutes to avoid a `profiles` round-trip on every call), and inserts into `analytics_events`. A tracking failure is caught and `console.warn`'d — it must never block the feature it's instrumenting.
- **Event catalog** — document the full list of event names currently fired (grep `track(` across `src/` to regenerate this list if it drifts; as of 07-13 it includes, grouped by area):
  - **Session:** `app_opened` (once per page load, first successful auth resolution — see below), `timezone_auto_detected`, `timezone_detection_failed`, `timezone_manual_changed`.
  - **Add Pet:** `add_pet_started`, `photo_added`, `species_selected`, `pet_created`, `add_pet_cancelled`, `continue_to_onboarding`, `add_pet_onboarding_skipped`, `birth_date_precision_selected`, `akc_toggle_enabled`.
  - **Onboarding:** `onboarding_started`, `onboarding_card_completed`, `onboarding_completed`.
  - **Daily Check-In:** `daily_check_in_started`, `daily_check_in_vibe_selected`, `vibe_recorded`, `daily_check_in_skipped`, `observation_category_selected`, `observation_saved`, `catch_up_started`, `catch_up_completed`, `check_in_abandoned`.
  - **Trends:** `trends_viewed`, `trends_section_changed`, `trends_group_changed`, `trends_range_changed`.
  - **Pet profile / lifecycle:** `pet_delete_started`, `pet_delete_cancelled`, `pet_deleted`, `pet_profile_shared`.
  - **Account / Settings:** `profile_opened`, `profile_saved`, `menu_opened`, `delete_account_selected`, `delete_account_confirmed`, `install_app_selected`, `install_app_prompt_result`, `sign_out_selected`, `sign_out_confirmed`, `sandbox_account_reset`, `sandbox_account_seeded`.
- **`app_opened` firing rule:** fires exactly once per page load, on the first successful resolution of an authenticated user (existing session found on mount, or a fresh sign-in) — guarded by a ref flag so a later `onAuthStateChange` (token refresh, etc.) doesn't re-fire it and inflate visit counts.
- **Nightly rollup** (`compute_daily_analytics_summary(target_date)`): a `security definer` Postgres function that aggregates across *all* users' `analytics_events` (bypassing the per-user RLS that would otherwise block a cross-user aggregate) and upserts one row per day into `analytics_daily_summary`: `daily_active_users`, `returning_users`, `new_users`, `checkins_started`, `checkins_completed`, `checkins_skipped`.
  - DAU = distinct users with an `app_opened` event that day.
  - Returning = DAU minus anyone whose *first-ever* `app_opened` falls on that day.
  - New = the complement (first-ever `app_opened` is that day).
  - Checkins started/completed/skipped are counted from `daily_check_in_started` / (`daily_check_in_marked_normal` OR `daily_check_in_marked_changed`) / `daily_check_in_skipped` respectively.
- **Scheduling:** runs hourly via `pg_cron` (job name `nightly-analytics-summary`), recomputing "yesterday in America/New_York" fresh on every run via explicit `AT TIME ZONE` conversion, rather than trying to fire once at Eastern midnight.

## Empty States / Load Errors

- No events for a given day → rollup row still gets written with all counts at `0`, not skipped — `analytics_daily_summary` always has a row for every day the job has run since, even a dead day.
- `track()` call with no authenticated user → silently returns without inserting (not an error state — anonymous/pre-auth pages don't produce events).
- Insert failure (RLS violation, network error) → caught, `console.warn`'d, never thrown up to the calling component.

## Business Rules

1. **Realigned to Eastern time, not UTC, because Supabase's managed Postgres does not allow setting `cron.timezone`** (confirmed directly: it's a postmaster-level GUC requiring a full server restart, which Supabase doesn't expose). The workaround — running hourly and computing "yesterday in ET" via `AT TIME ZONE` inside the function — self-corrects across DST automatically; no biannual manual schedule change is needed.
2. **The rollup is idempotent by design:** `analytics_daily_summary` is upserted on `summary_date`, so re-running for the same day (which happens 24x/day now that the job is hourly) is harmless — the row is just recomputed with the same numbers until the next Eastern day boundary passes.
3. **`analytics_events` and `analytics_daily_summary` are not exposed via the Data API** — `analytics_daily_summary` has RLS enabled with no policies (view via Supabase SQL Editor / Table Editor with project-owner access, which bypasses RLS); `analytics_events` has per-user RLS (`auth.uid() = user_id`) for insert/select, so a regular user can only ever see their own raw events, never the aggregate.
4. **Every event is tagged with `account_type`** specifically so test/demo/owner traffic can be filtered out of real-user analysis later — it is *not* currently filtered out of the nightly rollup itself (the rollup counts all `app_opened`/check-in events regardless of `account_type`). Flag this explicitly: DAU/new/returning numbers as they exist today include test, demo, and owner accounts.

## Data Requirements

- `analytics_events`: `id`, `user_id` (FK → `auth.users`, cascade delete), `event_name`, `properties jsonb` (always includes `account_type`, plus event-specific fields like `pet_id`, `check_in_date`), `created_at`. Indexed on `(event_name, created_at)`.
- `analytics_daily_summary`: `summary_date` (PK), `daily_active_users`, `returning_users`, `new_users`, `checkins_started`, `checkins_completed`, `checkins_skipped`, `computed_at`.

## Acceptance Criteria

- [ ] A new doc lists every current event name, grouped by feature area, with a one-line description of when it fires (the catalog above is the starting point — regenerate/verify against `grep -rn "track(" src/` at doc-writing time since new events get added alongside most features).
- [ ] The doc explains `app_opened`'s once-per-load dedup guard so nobody "fixes" it into firing on every auth state change.
- [ ] The doc explains the DAU/new/returning definitions precisely enough that someone reading `analytics_daily_summary` doesn't have to reverse-engineer the SQL.
- [ ] The doc states plainly that rollup numbers currently include test/demo/owner accounts (no filter applied yet) — this is a known gap, not hidden behavior.
- [ ] The doc explains *why* the job runs hourly instead of once at Eastern midnight (the `cron.timezone` restriction), so a future contributor doesn't "simplify" it back to a single UTC-midnight run and reintroduce the day-boundary bug.
- [ ] No code changes — documentation only.

## Edge Cases

- A user's very first `app_opened` ever occurs, then the rollup for that day is (re-)computed multiple times before midnight ET — `new_users` counts them correctly every time because the underlying "first-ever" check is a plain `NOT EXISTS` over historical events, not something the job caches.
- A `check_in_abandoned` event and a later `daily_check_in_skipped`/`vibe_recorded` for the same check-in can both exist for one check-in attempt — the rollup only counts `daily_check_in_started` vs. completion/skip events, so an abandon followed by a same-day retry can show up as both a "start" and a "complete" for that day (not double-counted as two separate check-ins, but worth noting the funnel isn't strictly 1:1 per pet per day).
- New event names added without updating whatever doc results from this work — recommend the doc call out explicitly that it needs re-verification against `src/lib/analytics.js` call sites periodically, similar to how the 07-14 audit flagged other docs going stale.

## Implementation Notes for Claude Code

- Regenerate the event list by running `grep -rn "track(" src/` before finalizing the doc — new events are added frequently (this list was captured 2026-07-17 against the codebase as of migration 0027).
- This is documentation only — do not add an `account_type` filter to the rollup function as part of this work; if that's wanted, it's a separate, explicit change (migration + decision on whether historical rows get recomputed).
