# **Analytics Feature**

**Document:** `Analytics Feature.md`

**Status:** New as-built documentation, written 2026-07-18. Never
previously documented as its own feature — only the base `analytics_events`
table gets a two-line mention in `docs/foundation/0007 Data Model_V2.md`
§3.20. Everything below was verified directly against
`src/lib/analytics.js`, every `track(...)` call site in `src/`,
`supabase/migrations/0009_analytics_events.sql`,
`supabase/migrations/0023_analytics_daily_summary.sql`, and
`supabase/migrations/0024_analytics_summary_eastern_time.sql`.

**Owner:** Product

**Audience:** Claude Code (Engineering)

**Purpose:**

Wysker Watch has no third-party analytics provider wired up (no
Mixpanel/Amplitude/Segment/etc.) — this is a first-party, in-house event
log plus a nightly rollup, both living in the app's own Supabase project.

**Important scope correction:** this system is a **usage analytics
pipeline, not a database backup.** It exists to answer product questions
("how many people opened the app today," "are check-ins getting
completed") — it does not protect or duplicate any of the app's real data
(pets, check-ins, medications, etc.). The project currently has **no
database backup or point-in-time recovery configured at all**
(`pitr_enabled: false`, `backups: []` on the live Supabase project —
already the cause of one real data-loss incident). If the goal is actual
data protection, that's a separate, still-open gap — this feature doesn't
touch it. See "Relationship to Backups" below.

This feature has two parts:
1. **Event logging** (`analytics_events`) — every significant user action, fired client-side, one row per event.
2. **Nightly rollup** (`analytics_daily_summary`) — a `pg_cron` job that recomputes daily aggregate metrics (DAU, new/returning users, check-in funnel counts) from the raw event log.

---

# **Functional Requirements**

## **1. Event Logging**

`src/lib/analytics.js` exports a single `track(eventName, properties)`
helper, used everywhere in the app that fires an event:

- Fire-and-forget: wrapped in try/catch, only `console.warn`s on failure — a tracking failure must never block the feature it's instrumenting.
- Silently no-ops if there's no authenticated user (`supabase.auth.getUser()` returns nothing) — **logged-out actions are never tracked**, since `analytics_events.user_id` is not nullable and every insert requires a real `auth.uid()`.
- Every event is automatically tagged with `account_type` (`production` / `test` / `demo` / `owner`, from `profiles.account_type` via `src/lib/accountType.js`), merged into the caller's own `properties`. This is what lets test/demo/internal usage be filtered out of real-user metrics later, without dropping it entirely.
- `account_type` is cached per user for 5 minutes (`accountTypeCache`) rather than queried on every single `track()` call, since it rarely changes mid-session and `track()` fires very often (multiple calls during onboarding alone).
- Writes one row to `analytics_events` per call: `user_id`, `event_name`, `properties` (jsonb, includes the merged `account_type`), `created_at` (server default `now()`).

## **2. Nightly Rollup**

`compute_daily_analytics_summary(target_date date)` (Postgres function,
`security definer`) aggregates the previous day's `analytics_events` into
one row of `analytics_daily_summary`:

- `daily_active_users` — distinct users with an `app_opened` event that day
- `returning_users` — of those, users who also have an `app_opened` on any *earlier* day
- `new_users` — of those, users with no `app_opened` on any earlier day (so `returning_users + new_users = daily_active_users`, always)
- `checkins_started` — count of `daily_check_in_started` events that day
- `checkins_completed` — **see "Known Issue" below; this number is currently wrong**
- `checkins_skipped` — count of `daily_check_in_skipped` events that day

Scheduling (`pg_cron`, extension enabled in migration 0023):
- Originally ran once daily at 00:00 UTC (migration 0023).
- Migration 0024 changed this: it now runs **hourly** (`0 * * * *`), and the function itself computes "yesterday in **America/New_York**" fresh on every run via `AT TIME ZONE` conversion, rather than the job trying to fire at a fixed local-midnight offset. Supabase's managed Postgres doesn't allow setting `cron.timezone` (a postmaster-level setting requiring a full server restart), so this was the workaround. Because the insert is an upsert (`on conflict (summary_date) do update`), re-running for the same day multiple times a day is harmless — the row is simply recomputed until the next Eastern calendar day rolls over.
- `security definer` is required and deliberate: per-row RLS on `analytics_events` (§4 below) would otherwise block a single query from aggregating across *all* users' events. The function only ever writes to `analytics_daily_summary`.

## **3. Account Type Tagging**

Four values exist (`src/lib/accountType.js`): `production`, `test`,
`demo`, `owner`. All are attached to every event via `properties.account_type`,
but **the rollup function does not filter by `account_type` at all** — every
DAU/started/completed/skipped count in `analytics_daily_summary` currently
blends production, test, demo, and owner usage together. Filtering by
account type is only possible today by querying `analytics_events` directly
(e.g. via the SQL Editor) and reading `properties->>'account_type'`.

## **4. Access / Exposure**

- `analytics_events`: RLS enabled, `insert`/`select` both restricted to `auth.uid() = user_id` — a user can only ever see their own events, never anyone else's, via the normal Data API.
- `analytics_daily_summary`: RLS enabled, **but no policies exist on it at all** — per migration 0023's own comment, this is deliberate: the table is not exposed via the Data API to any client at any privilege level. It's only readable via the Supabase SQL Editor / Table Editor with project-owner credentials, which bypass RLS entirely.
- **No screen in the app reads either table.** Confirmed via full-codebase search: nothing in `src/` queries `analytics_events` or `analytics_daily_summary` for display — there is no in-app analytics dashboard. This is a backend-only, SQL-Editor-only reporting system today.

---

# **Event Catalog**

All event names currently fired by `track(...)`, grouped by the screen/flow
that fires them (`properties` always additionally includes `account_type`;
only other notable properties are called out):

**App lifecycle** — `app_opened` (`AuthContext.jsx`), `timezone_auto_detected`, `timezone_detection_failed`

**Daily check-in** (`DailyCheckInSheet.jsx`, `Home.jsx`, `PetProfileContent.jsx`) — `daily_check_in_started`, `daily_check_in_vibe_selected` (`vibe` property), `vibe_recorded` (`status`, `symptom_count` — **this is the real completion event**, see Known Issue below), `daily_check_in_skipped`, `observation_category_selected`, `observation_saved`, `catch_up_started`, `catch_up_completed`, `check_in_abandoned` (`stage`)

**Trends** (`PetTrends.jsx`) — `trends_viewed`, `trends_section_changed`, `trends_group_changed`, `trends_range_changed`

**Add Pet / Onboarding** (`AddPetDialog.jsx`, `PetOnboarding.jsx`, `OnboardingWizard.jsx`) — `add_pet_started`, `photo_added`, `species_selected`, `birth_date_precision_selected`, `akc_toggle_enabled`, `pet_created`, `add_pet_cancelled`, `continue_to_onboarding`, `add_pet_onboarding_skipped`, `onboarding_started`, `onboarding_card_completed`, `onboarding_completed`

**Pet Profile** (`PetProfileContent.jsx`) — `pet_delete_started`, `pet_delete_cancelled`, `pet_deleted` (`mode`), `pet_profile_shared`

**Account / Settings** (`Account.jsx`, `Settings.jsx`) — `profile_opened`, `profile_saved`, `timezone_manual_changed`, `menu_opened`, `menu_pet_sitter_selected`, `menu_ai_selected`, `menu_notifications_selected`, `menu_privacy_selected`, `menu_terms_selected`, `menu_settings_selected`, `menu_support_selected`, `install_app_selected`, `install_app_prompt_result` (`outcome`, see `docs/features/PWA Feature.md`), `sign_out_selected`, `sign_out_confirmed`, `delete_account_selected`, `delete_account_confirmed`, `sandbox_account_reset`, `sandbox_account_seeded` (`scenario`)

**Retired events — present in historical data, fired by nothing in current code:**
- `menu_pet_profiles_selected` — visible in live `analytics_events` rows (screenshot reviewed 2026-07-18); doesn't match any of the 7 current `Settings.jsx` menu items' event names. Almost certainly left over from the "Pet Profiles" Menu directory that `docs/foundation/0008 Navigation & Information Architecture_V4.md` previously (incorrectly) described as still current — that directory doesn't exist in the code anymore, so this event stopped firing whenever it was removed.
- `daily_check_in_marked_normal` / `daily_check_in_marked_changed` — see Known Issue immediately below.

---

# **Known Issue: `checkins_completed` has been wrong since 2026-07-13**

`compute_daily_analytics_summary()` counts completions by querying for
`event_name in ('daily_check_in_marked_normal', 'daily_check_in_marked_changed')`.
**Neither event name is fired anywhere in the current codebase.** The
Vibe model (migration 0026) replaced the old `normal`/`changed` status
values, and the actual check-in-completion event was renamed to
`vibe_recorded` (`DailyCheckInSheet.jsx:70,131`) — but the rollup function
was never updated to match. Since then, `checkins_completed` in
`analytics_daily_summary` has undercounted (visible directly in the
Table Editor: `checkins_started` values of 9/26/13/4/5/6/7 against
`checkins_completed` values of 6/0/1/0/0/0/0 for 2026-07-11 through
2026-07-17 — the near-total drop-off from 07-12 onward lines up with the
Vibe rename, not an actual collapse in real completions).

`daily_active_users`, `returning_users`, `new_users`,
`checkins_started`, and `checkins_skipped` all query events that are
still fired correctly and are unaffected.

This is a code bug, not a documentation problem — already tracked in
`docs/documentation-review-punch-list-2026-07-18.md` P3. Fixing it means
a new migration updating the function to query `vibe_recorded` instead
of the two retired event names; out of scope for this document, called
out here so the requirement ("`checkins_completed` reflects real
completions") is recorded even though the current implementation doesn't
meet it.

---

# **Relationship to Backups**

This system does **not** back up, replicate, or protect any of the app's
actual data. It is a write path for behavioral events only —
`analytics_events` and `analytics_daily_summary` hold no pet, check-in,
medication, or account data themselves; they only record *that* certain
actions happened and *when*.

The nightly/hourly rollup schedule (`pg_cron`) is easy to mistake for a
"we're backing up every 24 hours" mechanism because it runs on a
recurring schedule and writes a new row per day — but it recomputes
aggregate counts from already-durable event rows, it doesn't copy or
snapshot any other table, and it isn't retained as point-in-time history
of anything beyond the 6 numeric columns in `analytics_daily_summary`.

The project's actual database backup posture is a separate, still-open
item: `pitr_enabled: false` and `backups: []` on the live Supabase
project — no backups exist for pets, check-ins, medications, accounts,
or any other real data, and this feature does nothing to change that.

---

# **Business Rules**

- Only authenticated users generate events — there is no anonymous/pre-login tracking.
- Every event carries `account_type` so test/demo/internal usage can be excluded from real-user reporting, but no current query (including the rollup) actually does this filtering — it must be done manually per-query today.
- `analytics_daily_summary` rows are idempotent per `summary_date` — recomputing a day multiple times (as happens every hour under the current schedule) always converges to the same numbers for that day, never accumulates or double-counts.
- Both tables are internal/operational only — never exposed to end users, never rendered in any app UI.
- A tracking failure must never surface to the user or block the action being tracked (enforced by `track()`'s try/catch).

---

# **Data Requirements**

### **`analytics_events`** (migration 0009)
- `id` uuid, PK
- `user_id` uuid, FK → `auth.users(id)`, `on delete cascade`
- `event_name` text, not null
- `properties` jsonb, not null, default `{}`
- `created_at` timestamptz, not null, default `now()`
- Index: `(event_name, created_at)`
- RLS: `insert`/`select` both `auth.uid() = user_id`

### **`analytics_daily_summary`** (migration 0023)
- `summary_date` date, PK
- `daily_active_users`, `returning_users`, `new_users` integer, default 0
- `checkins_started`, `checkins_completed`, `checkins_skipped` integer, default 0
- `computed_at` timestamptz, not null, default `now()`
- RLS: enabled, no policies (SQL-Editor/owner access only)

No new database changes are required by this document — it describes
what already exists.

---

# **Acceptance Criteria**

Current, as-built behavior:
- ✓ Every tracked user action writes one `analytics_events` row, tagged with `account_type`
- ✓ A logged-out user never generates events
- ✓ A tracking failure never blocks the underlying feature
- ✓ `analytics_daily_summary` is recomputed automatically without manual intervention
- ✓ Recomputing the same day multiple times produces stable, non-duplicated results
- ✗ `checkins_completed` accurately reflects real check-in completions (see Known Issue — currently false)
- ✗ Rollup numbers can be filtered by `account_type` without a manual query (not currently possible)

---

# **Edge Cases**

- A user completes an action that fires `track()` but loses connectivity before the insert completes: the event is silently dropped (fire-and-forget, no retry/queue) — this is the same "no offline queueing" limitation as the Offline Banner in `docs/features/PWA Feature.md`.
- A user's `account_type` changes mid-session (e.g. a demo account gets promoted): the cached value can be stale for up to 5 minutes, so a handful of events could be tagged with the old `account_type`.
- `analytics_daily_summary` for "today" is never fully accurate until the day has fully ended in Eastern time and the next hourly run has fired — querying it for the current, still-in-progress day will show a partial, growing count, not a final one.
- Historical rows already tagged with retired event names (`menu_pet_profiles_selected`, `daily_check_in_marked_normal`, `daily_check_in_marked_changed`) will never be produced again but remain in `analytics_events` permanently — any historical query spanning that period needs to account for the vocabulary change.

---

# **Implementation Notes for Claude Code**

- Always fire events through the existing `track()` helper — don't insert into `analytics_events` directly, since that would skip the `account_type` tagging and the auth/error handling.
- When renaming or retiring an event name that the rollup function depends on (`app_opened`, `daily_check_in_started`, `daily_check_in_skipped`, and whatever eventually replaces the broken completion check), update `compute_daily_analytics_summary()` in the same change — this is exactly how `checkins_completed` broke.
- `analytics_daily_summary` has no policies and is not meant to be queried by the client — don't build an in-app dashboard against it without first adding RLS policies deliberately scoped for that purpose.
- This document does not fix the `checkins_completed` bug; that requires a new migration and is tracked separately in `docs/documentation-review-punch-list-2026-07-18.md` P3.

---

# **Open Questions for Product**

- Should the rollup filter out `test`/`demo`/`owner` account types by default, given every metric currently blends them with real production usage?
- Is an in-app or otherwise more accessible analytics view wanted, or is SQL-Editor-only access sufficient for now?
- Separately from this feature: is the lack of any database backup/PITR being prioritized? This document doesn't change that gap, only clarifies that the analytics rollup was never meant to fill it.
