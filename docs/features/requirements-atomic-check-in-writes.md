# Requirements: Atomic Daily Check-In Writes

**Status:** Draft
**Date:** 2026-07-25
**Related files:** `src/lib/checkin/checkinClient.js`, `src/components/DailyCheckInSheet.jsx`, `src/components/catchup/CatchUpFlow.jsx`, `src/components/catchup/BulkApplySheet.jsx`, `supabase/migrations/0014_daily_checkins_wellness.sql`, `docs/launch-punch-list.md` (P5)

## Before You Approve This

- **Chunked, not pure per-day — a deliberate speed/redo tradeoff.** Per-day atomicity (one committed write per day) gives zero redo ever, at the cost of up to ~180 sequential network round trips for the 6-month maximum — noticeably slow (rough estimate: 20-60+ seconds), though not unsafe. Chunking groups several days into one atomic write to cut that time down substantially, at the cost of: if a chunk is interrupted, every day in that chunk is redone, not just the one that failed. Confirmed acceptable: "less frustrating" than a long wait, given the failure case (redo a small chunk of days) is far less costly than the wait-time case (a spinner for a minute).
- No conflicts with locked decisions found — this only changes *how* a check-in is written to the database, never *what* gets written or the Vibe/Symptom Count rules themselves.
- No duplicate/overlapping functionality found — nothing else in the repo already does atomic multi-statement writes for this table.

## Functional Requirements

1. Saving a single day's check-in (Great Day, Off Day, Tough Day) — whether from a normal daily check-in, the existing "catch up yesterday" flow, or the new multi-day Catch Up flow — either fully succeeds (the day's status and all its symptom details are saved together) or fully fails (nothing is saved), never partially.
2. Today, a failure partway through a save (e.g. the network drops between two of the three-to-four separate steps) can leave the database in a mixed state — for example, a check-in row that says "Off Day" but with none of the symptom details that were supposed to go with it, because the step that deletes old symptom rows succeeded but the step that writes the new ones didn't. This must become impossible.
3. When an owner uses "Finish Catch Up" to write many days at once, the days are written in small groups (chunks) rather than one at a time or all at once. If a group is interrupted, only that group's days need to be redone — everything in groups already written stays saved. This is a deliberate middle ground between "redo everything on any hiccup" (too slow to get there safely) and "redo nothing, ever" (too slow to wait for).
4. This must not change what gets saved, only how safely and how quickly it gets saved — the Vibe value, symptom count, and observation details that end up in the database for a given save must be identical to today's behavior.

## Acceptance Criteria

- Given a normal daily check-in save (Great Day, Off Day, or Tough Day), when the save completes, then the check-in row and every one of its observation rows exist together — never the check-in row alone with stale or missing observations.
- Given a save that fails partway through (simulated network/database error between what are today separate steps), when the failure happens, then the database is left exactly as it was before the save started for that day — no partial row, no orphaned observations.
- Given a "Finish Catch Up" bulk write of many days split into chunks, when one chunk fails, then every chunk before it is still saved for real, and the failed chunk (and anything after it) is not — reopening Catch Up shows only the days in the failed chunk and beyond as still missing, never more than one chunk's worth of redo.
- Given the exact same inputs as today (pet, date, status, selections), when saved through the new path, then the resulting `daily_check_ins` and `observations` rows are identical in content to what the current (non-atomic) code would have written.

## Visual Reference

Not applicable — this is a data-layer reliability fix with no UI change. Every screen that saves a check-in (Daily Check-In sheet, single-day Catch Up, multi-day Catch Up's calendar/exceptions/bulk-apply) keeps its current appearance and behavior exactly as-is.

## Technical Spec

- **New Postgres function, `public.save_daily_check_ins`** (plural — migration, next sequential number after `0033`): takes a single `jsonb` **array** of day-payloads, each `{ pet_id, check_in_date, status, symptom_count, source, observations: [{ observation_type_id, value, numeric_value, notes, photo_url }, ...] }`. In one `plpgsql` function body — which Postgres already runs as a single transaction — it loops over the array and, for each day: upserts the `daily_check_ins` row (`on conflict (pet_id, check_in_date) do update`, matching the existing `pet_id,check_in_date` unique constraint), deletes that check-in's existing `observations` rows, and inserts the new ones. If any day in the array fails, every day in that same call rolls back together — this is what makes each *call* atomic. A single day is simply an array of length 1, which is exactly what `markGreatDay`/`markOffTough` pass; a chunk is an array of length N.
- **No `security definer` needed** — confirmed via `0014_daily_checkins_wellness.sql`'s existing RLS policies (`daily_check_ins_insert_owner`/`update_owner`, `observations_insert_owner`/`delete_owner`, all `is_pet_owner(pet_id, auth.uid())`-based): the calling user already has RLS permission to do exactly these writes today, so the function runs as the caller (`security invoker`, the default) and RLS still applies normally — lower privilege than the `claim_pending_co_owner_invites()` precedent (`0016_link_pending_co_owner_invites.sql`), which genuinely needed `security definer` because that function writes rows the caller doesn't yet own.
- **`checkinClient.js` — drop-in replacement, per your decision.** `markGreatDay`, `markOffTough`, and `markGreatDaysBulk` keep their exact current exported names and signatures. Internally, each builds its observation rows (the same logic already there today — baseline rows for Great Day, symptom rows for Off/Tough) and calls `supabase.rpc('save_daily_check_ins', { payloads: [...] })`. No caller anywhere (`DailyCheckInSheet.jsx`, `CatchUpFlow.jsx`, `BulkApplySheet.jsx`, the existing 1-day catch-up flow) needs to change.
- **Chunk size: 20 days per call, as a starting default.** `markGreatDaysBulk` splits its date list into chunks of 20 and calls the RPC once per chunk, sequentially (not parallel) so a failure's exact position is always known — a 180-day gap becomes 9 round trips instead of 180 (or 1). `BulkApplySheet.jsx`'s multi-day apply gets the same chunking treatment for consistency, though it rarely selects more than a handful of days so it'll almost always be a single chunk in practice. 20 is a reasonable starting point (~1-2 seconds per chunk, ~10-20 seconds worst case total) but isn't a hard product requirement — fine to tune after real use.
- **`symptom_count` stays computed in JavaScript**, exactly as today (`computeSymptomCount` in `scoring.js`) — the RPC's only job is making each chunk's write atomic, not reimplementing scoring logic in SQL. Already-computed values are simply part of each day's payload.
- **`markSkipped` is unaffected** — it's already a single upsert call (confirmed while auditing the punch list this session), so there's nothing non-atomic about it to fix. Out of scope.

## Repo Findings & Risks

- **Duplicate/overlapping functionality:** none found — no existing atomic multi-statement write path for this table to reuse or conflict with.
- **Technical debt nearby:** this fix directly resolves the P5 punch-list item it's scoped from. The other P5 item on the same line item's neighborhood — direction-read defense-in-depth being "a safety net, not a guarantee" — is a separate, unrelated concern about read-side ordering, not write-side atomicity; not addressed by this work and not claimed to be.
- **Orphaned features nearby:** none found.
- **Punch list / known issues in this area:** this *is* the punch-list item (P5, "checkinClient.js's multi-step writes aren't truly transactional") — implementing this resolves it. Once shipped, that line should move to Resolved.

## Non-Goals

- Does not change `markSkipped` (already atomic, single call).
- Does not change what data gets saved, the Vibe/Symptom Count model, or any UI.
- Does not guarantee zero redo on interruption — chunking is a deliberate speed/redo tradeoff (see "Before You Approve This"), not the "each day independently atomic" pure version originally discussed.
- Does not address the separate, unrelated direction-read dedup punch-list item.

## Open Questions

1. **[Engineering]** Migration number — this doc assumes `0034` (next after this session's `0033`), to be confirmed at implementation time against whatever's actually landed by then.
2. **[Engineering]** Chunk size of 20 is a starting default, not a tested/tuned number — worth revisiting once this has run against a real 6-month gap (timing) or gets user feedback (does a ~10-20s worst-case wait feel acceptable in practice).
3. **[Engineering]** Whether to add a lightweight retry/backoff for a failed chunk (e.g. automatically retry that one chunk once before giving up) versus just stopping and letting the owner see the remaining days as still-missing, same as any other interrupted session. Leaning toward the latter (simpler, and Catch Up's resume-from-any-point design already handles this gracefully) but flagging since it wasn't explicitly decided.
