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
// dates a weight differently. Writes go through `entities.Observation`
// (deletes use the client directly so a no-row delete is detected);
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
import { WEIGHT_MIN_LBS, WEIGHT_MAX_LBS, roundLbs, checkWeightLbs, isValidWeight } from '@/lib/weightRange';

// The value rule lives in weightRange.js (shared with checkinClient.js
// without a circular import); re-exported so screens import from here.
export { WEIGHT_MIN_LBS, WEIGHT_MAX_LBS, isValidWeight };

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
  // a standalone weight takes the UTC date of `observed_at`. A row that
  // has a check-in but whose check-in date didn't come back (the embed
  // was missing or unreadable) has no date (null, so it's skipped): its
  // `observed_at` is when the check-in was saved, not the day it's for.
  fromRow(row) {
    const checkInDate = row?.daily_check_ins?.check_in_date;
    if (checkInDate) return checkInDate;
    if (row?.daily_check_in_id != null) return null;
    if (!row?.observed_at) return null;
    const instant = new Date(row.observed_at);
    if (Number.isNaN(instant.getTime())) return null;
    return instant.toISOString().slice(0, 10);
  },
};

// Throws an Error with a `code` the caller maps to approved wording
// ('weight_out_of_range' -> wording B, 'weight_date_invalid',
// 'weight_date_in_future'). `timezone` is the owner's profiles.timezone.
// Leave `date` out to check only the value.
/** @param {{ lbs: any, date?: string }} input @param {string} [timezone] */
export function validateWeightInput({ lbs, date }, timezone) {
  const value = checkWeightLbs(lbs);
  if (date !== undefined) {
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      throw Object.assign(new Error('weight date invalid'), { code: 'weight_date_invalid' });
    }
    if (date > dateStrInTimezone(timezone, 0)) {
      throw Object.assign(new Error('weight date in future'), { code: 'weight_date_in_future' });
    }
  }
  return value;
}

// What the Log weight sheet shows for a failed save, edit or delete.
// Wording B is the approved out-of-range line (spec 0081); the others
// are the sheet's plain fallbacks. `action` is 'save' or 'delete'.
// PostgREST's PGRST116 ("no row") from an update means the row is gone
// or the caller can't change it, the same as weight_not_found.
export const WEIGHT_MESSAGES = {
  weight_out_of_range: 'Enter a weight between 0.1 and 300 lbs.',
  weight_date_invalid: 'Choose a date.',
  weight_date_in_future: 'Choose today or an earlier date.',
  weight_date_locked: "This weight came from a daily check-in, so its date can't be changed.",
  weight_not_found: 'This weight has already been deleted.',
  save_failed: "We couldn't save this weight. Please try again.",
  delete_failed: "We couldn't delete this weight. Please try again.",
  load_failed: 'Unable to load recent weights.',
};

// Codes the owner can fix by changing what they typed; anything else is
// unexpected and worth reporting.
export const WEIGHT_INPUT_ERROR_CODES = new Set(['weight_out_of_range', 'weight_date_invalid', 'weight_date_in_future', 'weight_date_locked']);

/** @param {any} err @param {'save' | 'delete'} action */
export function weightErrorText(err, action) {
  const code = err?.code === 'PGRST116' ? 'weight_not_found' : err?.code;
  if (code && Object.prototype.hasOwnProperty.call(WEIGHT_MESSAGES, code) && code.startsWith('weight_')) {
    return WEIGHT_MESSAGES[code];
  }
  return action === 'delete' ? WEIGHT_MESSAGES.delete_failed : WEIGHT_MESSAGES.save_failed;
}

async function weightTypeId() {
  const catalog = await loadObservationCatalog();
  const id = catalog.weight?.type?.id;
  if (!id) throw new Error('weight observation type missing from catalog');
  return id;
}

const SELECT_COLUMNS = 'id, pet_id, numeric_value, observed_at, updated_at, daily_check_in_id, daily_check_ins(check_in_date)';

// A saved value the app would refuse today (the old check-in Weight box
// didn't check its range) is not a weight: summaries and charts never
// show it. The Log weight sheet still lists it, flagged `outOfRange`, so
// the owner can fix or delete it.
const isShowableLbs = isValidWeight;

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
    outOfRange: !isShowableLbs(row.numeric_value),
  };
}

// One weight per pet per day (Lynn, 2026-11-25). The app keeps it that way
// on every write: the Log weight sheet updates the day's existing weight
// instead of adding a second (addWeight, updateWeight), and a check-in save
// where the owner typed or cleared a weight removes that day's standalone
// weights (checkinClient.js).
//
// Newest first. Primary key is the weight's date, never `created_at`.
// Older data (or a failed cleanup) can still leave more than one weight on
// a day; the first one in this order is the day's weight, chosen like this:
//   1. A standalone weight beats a check-in weight. `save_daily_check_ins`
//      (0034/0046) deletes and re-inserts a check-in's observation rows on
//      every re-save with `observed_at`/`updated_at` = now(), so a
//      check-in weight's time says when the check-in was last saved, not
//      when the owner last set that weight. It can't be compared with a
//      standalone weight's time.
//   2. Then the later `updated_at`.
//   3. Then the larger `id`, so the order is fully deterministic.
export function compareWeightsNewestFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (!!a.fromCheckIn !== !!b.fromCheckIn) return a.fromCheckIn ? 1 : -1;
  const ua = a.updatedAt || '';
  const ub = b.updatedAt || '';
  if (ua !== ub) return ua < ub ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

// Rows per request. The server may cap a response below this (Supabase's
// max_rows setting), so paging never relies on a full page meaning "more".
export const WEIGHT_PAGE_SIZE = 1000;

// A weight's date can come from its check-in rather than its own row, so
// no server-side order on `observations` gives a correct "newest N"
// cutoff. Instead every weight row is read, in id order, one page after
// another (keyset on `id`), and sorted here. Each request asks for the
// exact count of rows still to come; a page that returns fewer rows than
// that count (whatever the server's cap) means there is another page, so
// a capped response can never silently drop a weight.
async function fetchAllWeightRows(petIds, typeId) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = supabase
      .from('observations')
      .select(SELECT_COLUMNS, { count: 'exact' })
      .in('pet_id', petIds)
      .eq('observation_type_id', typeId)
      .not('numeric_value', 'is', null);
    if (lastId !== null) query = query.gt('id', lastId);
    const { data, error, count } = await query
      .order('id', { ascending: true })
      .limit(WEIGHT_PAGE_SIZE);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length === 0) break;
    if (typeof count === 'number' && page.length >= count) break;
    lastId = page[page.length - 1].id;
  }
  return rows;
}

// Any number of pets, paged as above. Returns { [petId]: entries newest-first }.
// Out-of-range values are left out unless `includeOutOfRange` (the sheet's
// list only).
async function fetchWeightEntriesForPets(petIds, { includeOutOfRange = false } = {}) {
  const byPet = {};
  for (const petId of petIds) byPet[petId] = [];
  if (petIds.length === 0) return byPet;

  const typeId = await weightTypeId();
  const data = await fetchAllWeightRows(petIds, typeId);

  for (const row of data) {
    const entry = toEntry(row);
    if (entry.outOfRange && !includeOutOfRange) continue;
    if (!entry.date || !byPet[entry.petId]) continue;
    byPet[entry.petId].push(entry);
  }
  for (const petId of petIds) byPet[petId].sort(compareWeightsNewestFirst);
  return byPet;
}

// One point per calendar day (the day's weight, see
// compareWeightsNewestFirst), oldest first.
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

// The pet's most recent weights, newest first, both kinds merged, for the
// Log weight sheet. If older data has two weights on one day, both are
// listed, so the owner can fix or delete either. Out-of-range
// values are included, flagged `outOfRange`, so they can be edited or
// deleted; nothing else shows them.
export async function listWeights(petId, limit = 10) {
  const byPet = await fetchWeightEntriesForPets([petId], { includeOutOfRange: true });
  return byPet[petId].slice(0, limit);
}

// Every weight the pet has on one calendar date, the day's weight first
// (compareWeightsNewestFirst). Out-of-range values are included so a new
// value replaces them rather than sitting beside them.
async function weightsOnDate(petId, date) {
  const byPet = await fetchWeightEntriesForPets([petId], { includeOutOfRange: true });
  return byPet[petId].filter((e) => e.date === date);
}

// The day's weight (lbs) for one pet and date, or null: the same weight
// every screen shows for that day (compareWeightsNewestFirst), whichever
// kind it is (check-in or standalone). Out-of-range values are skipped, as
// on every screen except the sheet's list. The check-in's Weight box
// preloads it, so the owner sees the weight that typing or clearing would
// replace.
export async function getDayWeightLbs(petId, date) {
  const [dayWeight] = (await weightsOnDate(petId, date)).filter((e) => !e.outOfRange);
  return dayWeight ? dayWeight.lbs : null;
}

// Logs a weight for a day. One weight per pet per day: if the pet already
// has a weight on that date (from a check-in or logged here), that weight
// is updated to the new value instead of a second one being added. For a
// check-in weight, updateWeight also moves the check-in's updated_at (spec
// 0043). Otherwise a standalone weight (no check-in) is saved. `timezone`
// is the owner's profiles.timezone, used only to refuse a future date.
export async function addWeight(petId, { date, lbs }, timezone) {
  const value = validateWeightInput({ lbs, date }, timezone);
  const [dayWeight] = await weightsOnDate(petId, date);
  if (dayWeight) return updateWeight(dayWeight, { lbs: value }, timezone);
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
//
// Moving a standalone weight to a date that already has a weight replaces
// that day's weight, so the day still has one: the day's existing weight
// takes the new value (a check-in weight keeps its check-in), then the
// moved row is deleted. Updating first means a failure partway never loses
// the new value; at worst the moved row is still on its old date.
/** @param {any} entry @param {{ date?: string, lbs: any }} change @param {string} [timezone] */
export async function updateWeight(entry, { date, lbs }, timezone) {
  if (entry.fromCheckIn) {
    if (date !== undefined && date !== entry.date) {
      throw Object.assign(new Error('check-in weight date cannot change'), { code: 'weight_date_locked' });
    }
    const value = validateWeightInput({ lbs }, timezone);
    if (!entry.checkInId) throw new Error('updateWeight: check-in weight has no checkInId');
    // Move the check-in's updated_at first (its set_updated_at trigger
    // stamps now() on any update), so spec 0043's expectedUpdatedAt check
    // sees this edit when a co-owner next saves that day. Doing it before
    // the value change means a failure here changes nothing, and a failure
    // after it only causes a harmless "changed by someone else" prompt.
    await entities.DailyCheckIn.update(entry.checkInId, { updated_at: new Date().toISOString() });
    return entities.Observation.update(entry.id, { numeric_value: value });
  }
  const nextDate = date ?? entry.date;
  const value = validateWeightInput({ lbs, date: nextDate }, timezone);
  if (nextDate !== entry.date) {
    if (!entry.petId) throw new Error('updateWeight: moving a weight needs its petId');
    const [dayWeight] = (await weightsOnDate(entry.petId, nextDate)).filter((e) => e.id !== entry.id);
    if (dayWeight) {
      const row = await updateWeight(dayWeight, { lbs: value }, timezone);
      try {
        await deleteWeight(entry);
      } catch (err) {
        // Already gone: the day still ends up with one weight.
        if (err?.code !== 'weight_not_found') throw err;
      }
      return row;
    }
  }
  return entities.Observation.update(entry.id, {
    numeric_value: value,
    observed_at: weightDate.toObservedAt(nextDate),
  });
}

// Removes one weight row. For a check-in weight this clears that day's
// Weight answer and leaves the check-in itself in place, after moving the
// check-in's updated_at (as updateWeight does) so spec 0043's conflict
// check sees the change when a co-owner next saves that day.
// Throws code 'weight_not_found' if no row was deleted (already gone, or
// the caller isn't allowed to delete it: RLS makes both look the same).
export async function deleteWeight(entry) {
  if (entry.fromCheckIn) {
    if (!entry.checkInId) throw new Error('deleteWeight: check-in weight has no checkInId');
    await entities.DailyCheckIn.update(entry.checkInId, { updated_at: new Date().toISOString() });
  }
  const { data, error } = await supabase
    .from('observations')
    .delete()
    .eq('id', entry.id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw Object.assign(new Error('weight not found'), { code: 'weight_not_found' });
  }
  return true;
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
