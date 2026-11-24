// Weight data layer (spec 0081, PA-71). Weight has one home: `observations`
// rows of type `weight` with `numeric_value` set (in lbs). Two kinds of row
// live there:
//
//   - A check-in weight: typed in the daily check-in's Weight box. It has a
//     `daily_check_in_id` and is dated by that check-in's `check_in_date`.
//   - A standalone weight: logged outside a check-in (Log weight sheet,
//     onboarding, ticked spreadsheet/scan weights). `daily_check_in_id` is
//     null and the day is stored in the existing `observed_at` as noon UTC
//     of the chosen calendar date (Amendment 1, no new column).
//
// Every screen that shows weight reads through this file, so no screen
// dates a weight differently. Writes go through `entities.Observation`;
// `observations` RLS already allows owners/co-owners to write and owners,
// co-owners and open-sit sitters to read (migrations 0014/0045).
//
// Weight never affects the Vibe or the symptom count (spec 0012), and there
// is no weight score or label of any kind here.

import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';
import { loadObservationCatalog } from '@/lib/checkin/checkinClient';
import { dateStrInTimezone } from '@/lib/timezone';
import { RANGE_DAYS } from '@/lib/checkin/trendsRanges';

export const WEIGHT_MIN_LBS = 0.1;
export const WEIGHT_MAX_LBS = 300;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The one dating rule for weight, both directions. Calendar dates are
// plain 'YYYY-MM-DD' strings already resolved in the owner's time zone by
// the caller (the sheet's date picker defaults to today in
// `profiles.timezone`). Neither direction uses the device's local time, so
// a weight logged at 11:50pm in Los Angeles or 12:10am in Auckland keeps
// the calendar date the owner picked. The server functions read the same
// rule as `coalesce(daily_check_ins.check_in_date,
// (observed_at at time zone 'UTC')::date)`.
export const weightDate = {
  // Chosen calendar date -> the `observed_at` value a standalone weight is
  // saved with (noon UTC of that date).
  toObservedAt(dateStr) {
    if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) {
      throw new Error(`weightDate.toObservedAt: expected YYYY-MM-DD, got ${dateStr}`);
    }
    return `${dateStr}T12:00:00.000Z`;
  },

  // An `observations` row (with its embedded `daily_check_ins`) -> the
  // weight's calendar date. A check-in weight takes its check-in's date;
  // a standalone weight takes the UTC date of `observed_at`.
  fromRow(row) {
    const checkInDate = row?.daily_check_ins?.check_in_date;
    if (checkInDate) return checkInDate;
    if (!row?.observed_at) return null;
    const instant = new Date(row.observed_at);
    if (Number.isNaN(instant.getTime())) return null;
    return instant.toISOString().slice(0, 10);
  },
};

const roundLbs = (n) => Math.round(Number(n) * 10) / 10;

// Throws an Error with a `code` the caller maps to approved wording
// ('weight_out_of_range' -> wording B, 'weight_date_invalid',
// 'weight_date_in_future'). `timezone` is the owner's profiles.timezone.
// Leave `date` out to check only the value.
/** @param {{ lbs: any, date?: string }} input @param {string} [timezone] */
export function validateWeightInput({ lbs, date }, timezone) {
  const n = Number(lbs);
  if (lbs === null || lbs === undefined || lbs === '' || !Number.isFinite(n)
    || roundLbs(n) < WEIGHT_MIN_LBS || roundLbs(n) > WEIGHT_MAX_LBS) {
    throw Object.assign(new Error('weight out of range'), { code: 'weight_out_of_range' });
  }
  if (date !== undefined) {
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      throw Object.assign(new Error('weight date invalid'), { code: 'weight_date_invalid' });
    }
    if (date > dateStrInTimezone(timezone, 0)) {
      throw Object.assign(new Error('weight date in future'), { code: 'weight_date_in_future' });
    }
  }
  return roundLbs(n);
}

async function weightTypeId() {
  const catalog = await loadObservationCatalog();
  const id = catalog.weight?.type?.id;
  if (!id) throw new Error('weight observation type missing from catalog');
  return id;
}

const SELECT_COLUMNS = 'id, pet_id, numeric_value, observed_at, updated_at, daily_check_in_id, daily_check_ins(check_in_date)';

// Row -> entry shape every screen uses.
function toEntry(row) {
  return {
    id: row.id,
    petId: row.pet_id,
    date: weightDate.fromRow(row),
    lbs: roundLbs(row.numeric_value),
    fromCheckIn: row.daily_check_in_id != null,
    checkInId: row.daily_check_in_id ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

// Newest first. Primary key is the weight's date, never `created_at`:
// `save_daily_check_ins` (0034) deletes and re-inserts a check-in's
// observation rows on every re-save, so `created_at` on a check-in weight
// is "when that check-in was last saved," which would let an edit to an
// old day's check-in jump ahead of a newer weight. Within one day the
// tiebreak is `updated_at` (the last time the owner saved that value: a
// sheet edit, or a check-in save that wrote it again), which is FR6's
// "most recently saved one is the day's weight." `id` makes the order
// fully deterministic when two rows share both.
export function compareWeightsNewestFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ua = a.updatedAt || '';
  const ub = b.updatedAt || '';
  if (ua !== ub) return ua < ub ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

// One query for any number of pets. Returns { [petId]: entries newest-first }.
async function fetchWeightEntriesForPets(petIds) {
  const byPet = {};
  for (const petId of petIds) byPet[petId] = [];
  if (petIds.length === 0) return byPet;

  const typeId = await weightTypeId();
  const { data, error } = await supabase
    .from('observations')
    .select(SELECT_COLUMNS)
    .in('pet_id', petIds)
    .eq('observation_type_id', typeId)
    .not('numeric_value', 'is', null);
  if (error) throw error;

  for (const row of data || []) {
    const entry = toEntry(row);
    if (!entry.date || !byPet[entry.petId]) continue;
    byPet[entry.petId].push(entry);
  }
  for (const petId of petIds) byPet[petId].sort(compareWeightsNewestFirst);
  return byPet;
}

// One point per calendar day (the day's weight per FR6), oldest first.
// `entries` must already be newest-first.
function dailyPoints(entries) {
  const seen = new Set();
  const points = [];
  for (const e of entries) {
    if (seen.has(e.date)) continue;
    seen.add(e.date);
    points.push({ date: e.date, lbs: e.lbs });
  }
  return points.reverse();
}

function summarize(entries, days) {
  const sparkline = dailyPoints(entries).slice(-days);
  if (sparkline.length === 0) return { currentLbs: null, deltaLbs: null, sparkline: [] };
  const currentLbs = sparkline[sparkline.length - 1].lbs;
  const deltaLbs = sparkline.length >= 2 ? roundLbs(currentLbs - sparkline[sparkline.length - 2].lbs) : null;
  return { currentLbs, deltaLbs, sparkline };
}

// The pet's most recent weights, newest first, both kinds merged. Same-day
// weights are all listed (FR6).
export async function listWeights(petId, limit = 10) {
  const byPet = await fetchWeightEntriesForPets([petId]);
  return byPet[petId].slice(0, limit);
}

// Saves a standalone weight (no check-in). `timezone` is the owner's
// profiles.timezone, used only to refuse a future date.
export async function addWeight(petId, { date, lbs }, timezone) {
  const value = validateWeightInput({ lbs, date }, timezone);
  const typeId = await weightTypeId();
  const row = await entities.Observation.create({
    pet_id: petId,
    daily_check_in_id: null,
    observation_type_id: typeId,
    numeric_value: value,
    observed_at: weightDate.toObservedAt(date),
  });
  return row;
}

// `entry` is one item from listWeights. A check-in weight's date belongs to
// its check-in and can't change (FR3); only its value is updated.
export async function updateWeight(entry, { date, lbs }, timezone) {
  if (entry.fromCheckIn) {
    if (date !== undefined && date !== entry.date) {
      throw Object.assign(new Error('check-in weight date cannot change'), { code: 'weight_date_locked' });
    }
    const value = validateWeightInput({ lbs }, timezone);
    return entities.Observation.update(entry.id, { numeric_value: value });
  }
  const nextDate = date ?? entry.date;
  const value = validateWeightInput({ lbs, date: nextDate }, timezone);
  return entities.Observation.update(entry.id, {
    numeric_value: value,
    observed_at: weightDate.toObservedAt(nextDate),
  });
}

// Removes one weight row. For a check-in weight this clears that day's
// Weight answer and leaves the check-in itself in place.
export async function deleteWeight(entry) {
  return entities.Observation.delete(entry.id);
}

// Pet Profile's Weight card: current weight, change versus the previous
// day that has a weight, and the last `days` daily points for the sparkline.
// There is no baseline weight, so the change compares the two most recent
// days only.
export async function getWeightSummary(petId, days = 30) {
  const byPet = await fetchWeightEntriesForPets([petId]);
  return summarize(byPet[petId], days);
}

// Batched getWeightSummary for Home's Weight chip: one observations query
// for every pet on screen.
export async function getWeightSummariesForPets(petIds, days = 30) {
  const byPet = await fetchWeightEntriesForPets(petIds);
  const result = {};
  for (const petId of petIds) result[petId] = summarize(byPet[petId], days);
  return result;
}

// Trends' Weight card and chart. `timezone` is the owner's, so the range
// cutoff agrees with the rest of the Trends screen.
export async function getWeightTrend(petId, range, timezone) {
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['24H'];
  const byPet = await fetchWeightEntriesForPets([petId]);
  const entries = byPet[petId];
  const hasAnyData = entries.length > 0;
  const cutoff = dateStrInTimezone(timezone, -days);

  const series = dailyPoints(entries)
    .filter((p) => p.date >= cutoff)
    .map((p) => ({ date: p.date, value: p.lbs }));
  if (series.length === 0) return { hasAnyData, series: [], currentLbs: null, deltaLbs: null };

  const currentLbs = series[series.length - 1].value;
  const deltaLbs = series.length >= 2 ? roundLbs(currentLbs - series[series.length - 2].value) : null;
  return { hasAnyData, series, currentLbs, deltaLbs };
}
