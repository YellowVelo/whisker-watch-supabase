# 0030_Analytics_Test_Account_Filter_Specification_v1

**Status:** Draft
**Date:** 2026-08-01
**Related files:** `supabase/migrations/0023_analytics_daily_summary.sql`, `supabase/migrations/0024_analytics_summary_eastern_time.sql`, `src/lib/analytics.js`, `src/lib/accountType.js`, `docs/features/Analytics Feature.md`, `docs/launch-punch-list.md` (P2), `docs/documentation-review-punch-list-2026-07-18.md` (P3)

## Before You Approve This

- **This is a database-only change.** Nothing in `src/` needs to change — `account_type` is already tagged on every analytics event (has been since migration 0010). The fix is entirely inside one Postgres function, `compute_daily_analytics_summary()`, which is what the hourly rollup job calls.
- **Bundling in the `checkins_completed` bug fix, per your decision.** That function has a second, already-known bug unrelated to account types: it counts completed check-ins by looking for two event names (`daily_check_in_marked_normal`, `daily_check_in_marked_changed`) that haven't been fired by the app since 2026-07-13, when the "Vibe" check-in model shipped and the real completion event was renamed to `vibe_recorded`. Since this spec already has to rewrite the function to add the account-type filter, it fixes this in the same migration rather than touching the function twice. This closes the `docs/documentation-review-punch-list-2026-07-18.md` P3 item about `checkins_completed`.
- **Backfill included, per your decision.** Every row already sitting in `analytics_daily_summary` (one per calendar day since the rollup started) was computed under the old, unfiltered logic. This migration re-runs the (now-fixed) function for every `summary_date` that already has a row, so historical and future numbers are computed the same way and stay comparable. This does not touch `analytics_events` (the raw log) at all — only the daily aggregate table gets recomputed.
- **`test` accounts are excluded; `demo` and `owner` accounts are not, per your decision.** Only two accounts currently classify as `test` (`test1@wyskerwatch.com`, `test2@wyskerwatch.com`, migration 0010's allowlist) — those are the only accounts whose activity will disappear from the rollup. `demo1@wyskerwatch.com` (demo) and any `owner`-tagged account (Lynn's personal account, migration 0025) will still be counted, exactly as `production` accounts are today. If that assumption about which accounts currently hold `test` status is stale, say so before this ships — the filter is written against the `account_type` value itself, not against specific emails, so it will automatically apply to any future account classified as `test`.
- **No change to raw event storage or to what individual users can see.** `analytics_events` keeps every row, from every account type, forever — this only changes what the aggregate rollup counts. Nothing here changes RLS, and `analytics_daily_summary` still has no client-facing access (SQL Editor / Table Editor only, same as today).

## Functional Requirements

1. The nightly/hourly rollup (`compute_daily_analytics_summary()`) excludes any event where the acting user's `account_type` was `test`, for every metric it computes: `daily_active_users`, `returning_users`, `new_users`, `checkins_started`, `checkins_completed`, `checkins_skipped`.
2. `demo`, `owner`, and `production` account activity all continue to count exactly as they do today — no behavior change for those three.
3. `checkins_completed` is corrected in the same migration to count `vibe_recorded` events instead of the two retired event names, so the column reflects real completions going forward.
4. Every row currently in `analytics_daily_summary` is recomputed once, using the corrected function, so historical rows are consistent with rows computed after this ships.
5. No changes to `src/`, to the event catalog, to `track()`, or to RLS policies on either table.

## Acceptance Criteria

- Given an event fired by a `test`-classified account (e.g. `test1@wyskerwatch.com`) on a given day, when the rollup computes that day's summary, then that event is excluded from every count in `analytics_daily_summary` for that day.
- Given an event fired by a `demo`, `owner`, or `production` account, when the rollup computes that day's summary, then that event is still included, unchanged from current behavior.
- Given a `vibe_recorded` event fired on a given day, when the rollup computes that day's summary, then it is counted in `checkins_completed` for that day.
- Given the migration has run, when `analytics_daily_summary` is queried for any `summary_date` that existed before this migration, then its values reflect the corrected, test-excluded computation, not the old blended numbers.
- Given the migration has run, when a new day is computed by the next scheduled hourly run, then it uses the same corrected, filtered logic with no further manual steps.

## Technical Spec

**One new migration**, next sequential number: `supabase/migrations/0043_analytics_exclude_test_accounts.sql`.

- `account_type` is not a column on `analytics_events` — it only exists inside the `properties jsonb` column (confirmed in `docs/features/Analytics Feature.md` §3 and migration 0009's schema). The filter is therefore a `properties ->> 'account_type'` check added to each of the six per-metric subqueries inside `compute_daily_analytics_summary()`, e.g.:
  ```sql
  where event_name = 'app_opened'
    and (created_at at time zone 'America/New_York')::date = target_date
    and coalesce(properties ->> 'account_type', 'production') <> 'test'
  ```
  The `coalesce(..., 'production')` handles any pre-migration-0010 event that predates `account_type` tagging entirely (none currently expected in practice, but the raw event table has no constraint guaranteeing every historical row has it) — those are treated as included, matching how `isProductionAccount()` already treats a missing value elsewhere in the app (`src/lib/accountType.js`).
- The `checkins_completed` subquery's `event_name in (...)` list changes from `('daily_check_in_marked_normal', 'daily_check_in_marked_changed')` to `('vibe_recorded')`.
- The function is redefined with `create or replace function` (same signature, same `security definer`, same `set search_path = public`), exactly following the pattern of migrations 0023 → 0024. No changes to the `pg_cron` schedule itself.
- **Backfill step**, in the same migration, after the function is redefined:
  ```sql
  do $backfill$
  declare
    r record;
  begin
    for r in select summary_date from public.analytics_daily_summary loop
      perform public.compute_daily_analytics_summary(r.summary_date);
    end loop;
  end;
  $backfill$;
  ```
  This re-runs the corrected function once per existing `summary_date`, relying on the same `on conflict (summary_date) do update` upsert the function already uses — no separate delete/rebuild step needed.
- No changes to `analytics_events`, to any RLS policy, to `src/lib/analytics.js`, or to `src/lib/accountType.js`.
- Per `CLAUDE.md`, this backend change needs to be applied to all three Supabase projects (`Whisker-Watch` prod, `wysker-watch-dev`, `wysker-watch-staging`) as part of shipping — manual, not automated, same as any other migration.

## Repo Findings & Risks

- **No duplicate or overlapping functionality found.** This is the exact, single gap already described in `docs/features/Analytics Feature.md` ("no current query, including the rollup, actually does this filtering") and flagged as an open question in that same doc. Nothing elsewhere in the repo already filters analytics by account type.
- **No orphaned code or new tech debt introduced.** This edits one existing Postgres function in place; it doesn't add a new table, a new client-side helper, or a new code path to maintain.
- **This does touch a function with a documented history of drifting out of sync with the event catalog** — that's exactly how the `checkins_completed` bug happened in the first place (an event got renamed and the rollup function wasn't updated alongside it). Worth remembering next time any of the six event names this function depends on (`app_opened`, `daily_check_in_started`, `daily_check_in_skipped`, `vibe_recorded`) gets renamed or retired: update this function in the same change, not later.
- **No locked-decision conflict.** `CLAUDE.md`'s current data-model note (Vibe/symptom-count model) isn't touched by this — `vibe_recorded` is already the correct, current event name being adopted here, not a new invention.
- **Historical data caveat:** the backfill recomputes every `analytics_daily_summary` row using events currently in `analytics_events`. If any `test`-account events from before this migration were already deleted or a `test` account's `account_type` was reclassified after the fact, the backfilled numbers reflect current tagging, not whatever was true on the original day — this is a reasonable assumption (tagging is effectively permanent per-account) but worth naming explicitly since it can't be independently verified without reading every historical row.

## Non-Goals

- No in-app analytics dashboard. `analytics_daily_summary` remains SQL-Editor/Table-Editor-only, exactly as documented today.
- No new `account_type` value and no change to `classify_account_type()`'s allowlist or to `owner` assignment.
- No filtering added to `analytics_events` itself (the raw log) — only the aggregate rollup changes.
- No change to how individual, ad hoc SQL Editor queries against `analytics_events` work — anyone querying the raw table directly still needs to add their own `account_type` filter by hand, same as today.

## Open Questions

- None outstanding — both open questions from the original `Analytics Feature.md` write-up that applied here (whether to filter, and whether to bundle the `checkins_completed` fix) were resolved by your decisions above.
