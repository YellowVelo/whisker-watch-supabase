// Server copy of the app's weight rules (spec 0081, PA-71). Edge Functions
// can't read the app's files, so ask-vet-assistant (Insights and the Trends
// summary) and generate-vet-report read weight through this file. It must
// match src/lib/weightClient.js:
//   - weightDateFromRow()          = weightDate.fromRow()
//   - compareWeightsNewestFirst()  = compareWeightsNewestFirst()
//   - WEIGHT_MIN_LBS/MAX_LBS, the one-decimal rounding and the
//     out-of-range skip             = isShowableLbs() / roundLbs()
//   - dailyWeights()               = dailyPoints() (one weight per day)
//   - weightsInRange()             = getWeightTrend()'s range cutoff
// src/lib/aiServerParity.test.js fails if the two copies drift apart.
//
// Weight's one home is `observations` rows of type `weight` with
// `numeric_value` set (in lbs). Two kinds of row live there:
//   - a check-in weight (`daily_check_in_id` set), dated by that check-in's
//     `check_in_date`;
//   - a standalone weight (no check-in), dated by the UTC calendar date of
//     `observed_at` (noon UTC of the chosen date, Amendment 1).
// One weight per pet per day (Lynn, 2026-11-25): when older data has more
// than one on a day, compareWeightsNewestFirst picks the day's weight.
//
// Weight never affects the Vibe or the symptom count (spec 0012), and there
// is no weight score or label of any kind here.
//
// Only a type-only import, so Vitest (under Node) can load this file too.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';

export const WEIGHT_MIN_LBS = 0.1;
export const WEIGHT_MAX_LBS = 300;

// Rows per request, as in weightClient.js. The server may cap a response
// below this (Supabase's max_rows), so paging never relies on a full page
// meaning "more".
export const WEIGHT_PAGE_SIZE = 1000;

export const WEIGHT_SELECT = 'id, pet_id, numeric_value, observed_at, updated_at, daily_check_in_id, daily_check_ins(check_in_date)';

export interface WeightRow {
  id: string;
  pet_id?: string | null;
  numeric_value: number | string | null;
  observed_at?: string | null;
  updated_at?: string | null;
  daily_check_in_id?: string | null;
  daily_check_ins?: { check_in_date?: string | null } | null;
}

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  lbs: number;
  fromCheckIn: boolean;
  updatedAt: string | null;
}

// One point per calendar day: the day's weight.
export interface DailyWeight {
  date: string; // YYYY-MM-DD
  lbs: number;
}

export const roundLbs = (n: number | string): number => Math.round(Number(n) * 10) / 10;

// Same 0.1–300 lbs rule (after rounding to one decimal) as the app. A saved
// value outside it is not a weight: no chart, summary or report shows it.
export function isShowableLbs(value: unknown): boolean {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return false;
  return roundLbs(n) >= WEIGHT_MIN_LBS && roundLbs(n) <= WEIGHT_MAX_LBS;
}

// A weight row -> its calendar date, or null. A check-in weight takes its
// check-in's date; a standalone weight the UTC date of `observed_at`. A row
// with a check-in whose date didn't come back (the embed was missing or
// unreadable) has no date: its `observed_at` is when the check-in was
// saved, not the day it's for.
export function weightDateFromRow(row: WeightRow | null | undefined): string | null {
  const checkInDate = row?.daily_check_ins?.check_in_date;
  if (checkInDate) return checkInDate;
  if (row?.daily_check_in_id != null) return null;
  if (!row?.observed_at) return null;
  const instant = new Date(row.observed_at);
  if (Number.isNaN(instant.getTime())) return null;
  return instant.toISOString().slice(0, 10);
}

// Row -> entry, or null when the row has no date or an out-of-range value.
export function toWeightEntry(row: WeightRow): WeightEntry | null {
  const date = weightDateFromRow(row);
  if (!date || !isShowableLbs(row.numeric_value)) return null;
  return {
    id: row.id,
    date,
    lbs: roundLbs(row.numeric_value as number | string),
    fromCheckIn: row.daily_check_in_id != null,
    updatedAt: row.updated_at ?? null,
  };
}

// Newest first by the weight's date. On one day: a standalone weight beats
// a check-in weight (a check-in weight's times move on every check-in
// re-save), then the later `updated_at`, then the larger `id`.
export function compareWeightsNewestFirst(
  a: Pick<WeightEntry, 'id' | 'date' | 'fromCheckIn' | 'updatedAt'>,
  b: Pick<WeightEntry, 'id' | 'date' | 'fromCheckIn' | 'updatedAt'>,
): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (!!a.fromCheckIn !== !!b.fromCheckIn) return a.fromCheckIn ? 1 : -1;
  const ua = a.updatedAt || '';
  const ub = b.updatedAt || '';
  if (ua !== ub) return ua < ub ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

// Raw weight rows -> one weight per day (the day's weight), newest first.
// Rows with no date or an out-of-range value are skipped.
export function dailyWeights(rows: readonly WeightRow[]): DailyWeight[] {
  const entries = rows
    .map(toWeightEntry)
    .filter((e): e is WeightEntry => e !== null)
    .sort(compareWeightsNewestFirst);
  const seen = new Set<string>();
  const days: DailyWeight[] = [];
  for (const e of entries) {
    if (seen.has(e.date)) continue;
    seen.add(e.date);
    days.push({ date: e.date, lbs: e.lbs });
  }
  return days;
}

// getWeightTrend's range rule: days on or after `cutoff` (a YYYY-MM-DD in
// the owner's time zone, `dateStrInTimezone(timezone, -days)`). Keeps the
// input's order.
export function weightsInRange<T extends { date: string }>(days: readonly T[], cutoff: string): T[] {
  return days.filter((d) => d.date >= cutoff);
}

// getWeightTrend's currentLbs/deltaLbs from newest-first daily weights:
// the newest day's weight and its change from the day before it that has
// a weight (both rounded to one decimal).
export function currentAndDelta(daysNewestFirst: readonly DailyWeight[]): { currentLbs: number | null; deltaLbs: number | null } {
  if (daysNewestFirst.length === 0) return { currentLbs: null, deltaLbs: null };
  const currentLbs = daysNewestFirst[0].lbs;
  const deltaLbs = daysNewestFirst.length >= 2 ? roundLbs(currentLbs - daysNewestFirst[1].lbs) : null;
  return { currentLbs, deltaLbs };
}

// The `weight` observation type's id, or null if the catalog has none.
export async function loadWeightTypeId(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.from('observation_types').select('id').eq('code', 'weight').maybeSingle();
  if (error) throw new Error(`weight type lookup failed: ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}

// Every weight row for one pet, read with the CALLER's client so the
// database's access rules decide what comes back (owners and co-owners
// always; a sitter only during an open sit, migrations 0014/0045). A
// weight's date can come from its check-in, so no server-side order gives
// a correct "newest N" cutoff: every row is read, keyset-paged on `id`
// with an exact count, as weightClient.js does, so a capped response never
// silently drops a weight.
export async function loadWeightRows(
  client: SupabaseClient,
  petId: string,
  typeId?: string | null,
): Promise<WeightRow[]> {
  const weightTypeId = typeId === undefined ? await loadWeightTypeId(client) : typeId;
  if (!weightTypeId) return [];
  const rows: WeightRow[] = [];
  let lastId: string | null = null;
  for (;;) {
    let query = client
      .from('observations')
      .select(WEIGHT_SELECT, { count: 'exact' })
      .eq('pet_id', petId)
      .eq('observation_type_id', weightTypeId)
      .not('numeric_value', 'is', null);
    if (lastId !== null) query = query.gt('id', lastId);
    const { data, error, count } = await query.order('id', { ascending: true }).limit(WEIGHT_PAGE_SIZE);
    if (error) throw new Error(`weight lookup failed: ${error.message}`);
    const page = (data ?? []) as unknown as WeightRow[];
    rows.push(...page);
    if (page.length === 0) break;
    if (typeof count === 'number' && page.length >= count) break;
    lastId = page[page.length - 1].id;
  }
  return rows;
}

// One weight per day for one pet, newest first (the rules above).
export async function loadDailyWeights(
  client: SupabaseClient,
  petId: string,
  typeId?: string | null,
): Promise<DailyWeight[]> {
  return dailyWeights(await loadWeightRows(client, petId, typeId));
}
