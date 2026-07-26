// Daily Check-In data layer (spec: "Daily Check-In, Vibe & Trends" v5). All
// Daily Check-In / observation reads and writes go through here —
// components never call entities.* for these tables directly, per
// Technical Standards ("all data access goes through entityClient.js and
// entities.js" / "never call Supabase directly inside UI components",
// extended here to mean "never scatter check-in persistence logic across
// components").
//
// This replaces every prior scoring system. There is no wellness_scores
// write path left in this module at all — Vibe (daily_check_ins.status)
// and Symptom Count (daily_check_ins.symptom_count) are the only two
// signals persisted per day, and they never inform each other (spec Core
// Model III).
//
// Two multi-pet reads (getCheckInsForPets) use the Supabase client
// directly rather than entities.*, because entityClient's generic filter
// only supports equality matches and this needs `.in(pet_id, [...])` —
// this module is a data-access layer (same role as entityClient.js
// itself), not a UI component, so that's consistent with "never call
// Supabase directly inside UI components".

import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import { assertNotDemoAccount } from '@/lib/demoWriteGuard';
import { resolveDailyAttributeCount, computeAttributeDirection, computeSymptomCount } from './scoring';
import { CATEGORIES, getCategory, HEALTH_ATTRIBUTES, WELLBEING_ATTRIBUTES, COUNTED_CATEGORIES } from './config';
import { todayInTimezone, yesterdayInTimezone, dateStrInTimezone, dateStrForInstant } from '@/lib/timezone';

// Answer values that represent "no change from normal" across every
// enum category — these are never worth surfacing as an observation
// summary line, and never count as a symptom.
export const BASELINE_VALUES = new Set(['normal', 'none', 'no_change']);

// "Not Observed" (water_intake, bathroom) is a real, explicit logged
// answer, distinct from Normal — the owner didn't have the opportunity to
// observe, not "observed and nothing changed". Never counts as a symptom,
// but must never be silently merged into BASELINE_VALUES since chips/
// charts have to render it as its own state (spec Attribute Model).
export const NOT_OBSERVED_VALUES = new Set(['not_observed']);

function isCountableSymptom(value) {
  return value != null && !BASELINE_VALUES.has(value) && !NOT_OBSERVED_VALUES.has(value);
}

// The 11 categories (6 Health + 5 Wellbeing) that get an explicit row
// every completed day — a baseline row when nothing was selected, one row
// per distinct symptom otherwise — so "no row" never needs to be
// interpreted as an assumption (spec Business Rules).
const MULTI_SELECT_CODES = CATEGORIES.filter((c) => c.multiSelect && COUNTED_CATEGORIES.includes(c.code)).map((c) => c.code);

function baselineValueFor(category) {
  return category.options?.find((o) => BASELINE_VALUES.has(o.value))?.value ?? 'normal';
}

// `timezone` is optional — callers that haven't threaded the signed-in
// user's profile timezone through yet keep the previous UTC-based
// behavior via timezone.js's own UTC fallback.
export const todayStr = (timezone) => todayInTimezone(timezone);
export const yesterdayStr = (timezone) => yesterdayInTimezone(timezone);

// Catch Up (spec 0015) never looks back further than this, regardless of
// how old the pet or account is — an owner who's never checked in should
// never be handed a multi-month backlog. Exported so the UI (the "How has
// {pet} been?" long-gap copy, etc.) can reference the same constant rather
// than hardcoding 180 elsewhere.
export const CATCH_UP_MAX_LOOKBACK_DAYS = 180;

// Plain calendar-date-string arithmetic (YYYY-MM-DD), independent of any
// timezone — once a day string has been resolved via dateStr*(timezone,
// ...), it's just a calendar date, not an instant, so this parses/adds/
// re-formats in UTC purely to walk the calendar, never to resolve "now".
function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

// Catch Up's gap detection (spec 0015). Finds every calendar day between a
// floor date and yesterday that has no daily_check_ins row for this pet.
// The floor is the latest (most restrictive) of: 6 months ago, the
// account's created_at, and the pet's created_at — so a brand-new pet or
// account never surfaces a backlog (floor lands on/after today, before
// yesterday, so the loop below never runs), and an old pet that's simply
// never been checked in only ever gets asked about the last 6 months, not
// its entire history (spec: "never looks back further than 6 months").
export async function getMissedDaysForPet(petId, { timezone, userCreatedAt, petCreatedAt } = {}) {
  const yesterday = yesterdayStr(timezone);
  const floors = [dateStrInTimezone(timezone, -CATCH_UP_MAX_LOOKBACK_DAYS)];
  if (userCreatedAt) floors.push(dateStrForInstant(new Date(userCreatedAt), timezone));
  if (petCreatedAt) floors.push(dateStrForInstant(new Date(petCreatedAt), timezone));
  const startDate = floors.reduce((max, d) => (d > max ? d : max));

  if (startDate > yesterday) return { missedDates: [], count: 0 };

  const { data, error } = await supabase
    .from('daily_check_ins')
    .select('check_in_date')
    .eq('pet_id', petId)
    .gte('check_in_date', startDate)
    .lte('check_in_date', yesterday);
  if (error) throw error;
  const existingDates = new Set(data.map((row) => row.check_in_date));

  const missedDates = [];
  for (let cursor = startDate; cursor <= yesterday; cursor = addDaysToDateStr(cursor, 1)) {
    if (!existingDates.has(cursor)) missedDates.push(cursor);
  }
  return { missedDates, count: missedDates.length };
}

// observation_types + observation_options rarely change — cache for the
// lifetime of the tab instead of refetching on every check-in.
let catalogPromise = null;
export async function loadObservationCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [types, options] = await Promise.all([
        entities.ObservationType.list(),
        entities.ObservationOption.list(),
      ]);
      const byCode = {};
      for (const type of types) {
        byCode[type.code] = { type, optionsByValue: {} };
      }
      for (const opt of options) {
        const type = types.find((t) => t.id === opt.observation_type_id);
        if (type && byCode[type.code]) {
          byCode[type.code].optionsByValue[opt.value] = opt;
        }
      }
      return byCode;
    })().catch((err) => {
      catalogPromise = null; // allow retry on next call
      throw err;
    });
  }
  return catalogPromise;
}

export async function getCheckIn(petId, date) {
  const rows = await entities.DailyCheckIn.filter({ pet_id: petId, check_in_date: date });
  return rows[0] || null;
}

export async function getCheckInsForPets(petIds, date) {
  if (petIds.length === 0) return {};
  const { data, error } = await supabase
    .from('daily_check_ins')
    .select('*')
    .in('pet_id', petIds)
    .eq('check_in_date', date);
  if (error) throw error;
  return Object.fromEntries(data.map((row) => [row.pet_id, row]));
}

// One pet, many dates — the counterpart to getCheckInsForPets' "many pets,
// one date". Used by the Catch Up calendar (spec 0015) to tell which of a
// pet's missed days already have a real, saved row (from a previous
// partial Catch Up session) versus which are still just the "assumed
// Great Day" default. Keyed by check_in_date so the calendar can look a
// given day up directly.
export async function getCheckInsForDateRange(petId, dates) {
  if (dates.length === 0) return {};
  const { data, error } = await supabase
    .from('daily_check_ins')
    .select('*')
    .eq('pet_id', petId)
    .in('check_in_date', dates);
  if (error) throw error;
  return Object.fromEntries(data.map((row) => [row.check_in_date, row]));
}

// Exported (rather than kept module-private) so it can be unit tested
// directly — it's the one piece of business logic in this file that
// doesn't need a network call to verify.
export function describeObservation(obs, typeIdToCode) {
  const category = getCategory(typeIdToCode[obs.observation_type_id]);
  if (!category) return null;

  if (category.answerType === 'enum') {
    if (obs.value == null || BASELINE_VALUES.has(obs.value) || NOT_OBSERVED_VALUES.has(obs.value)) return null;
    return category.options.find((o) => o.value === obs.value)?.label ?? null;
  }
  if (category.answerType === 'number') {
    return obs.numeric_value != null ? `${category.label} updated` : null;
  }
  if (category.answerType === 'text') {
    return obs.notes ? category.label : null;
  }
  return null;
}

// Batched "raw values per category" read for a set of today's check-ins,
// keyed by pet_id -> { [categoryCode]: { values, notes, notObserved } } —
// `values` is every non-baseline, non-"Not Observed" symptom logged for
// that category that day; `notObserved` flags a Water/Bathroom day where
// the owner didn't have the opportunity to observe.
export async function getObservationValuesForCheckIns(checkInsByPetId) {
  const checkInIds = Object.values(checkInsByPetId).filter(Boolean).map((c) => c.id);
  if (checkInIds.length === 0) return {};

  const [{ data, error }, catalog] = await Promise.all([
    supabase
      .from('observations')
      .select('*')
      .in('daily_check_in_id', checkInIds)
      .order('created_at', { ascending: true }),
    loadObservationCatalog(),
  ]);
  if (error) throw error;

  const typeIdToCode = {};
  for (const [code, entry] of Object.entries(catalog)) typeIdToCode[entry.type.id] = code;

  const observationsByCheckIn = {};
  for (const obs of data) {
    (observationsByCheckIn[obs.daily_check_in_id] ||= []).push(obs);
  }

  const result = {};
  for (const [petId, checkIn] of Object.entries(checkInsByPetId)) {
    if (!checkIn) continue;
    const values = {};
    for (const obs of observationsByCheckIn[checkIn.id] || []) {
      const code = typeIdToCode[obs.observation_type_id];
      if (!code) continue;
      const entry = values[code] || { values: [], notes: null, notObserved: false };
      if (obs.value != null && NOT_OBSERVED_VALUES.has(obs.value)) entry.notObserved = true;
      else if (isCountableSymptom(obs.value)) entry.values.push(obs.value);
      if (obs.notes && !entry.notes) entry.notes = obs.notes;
      values[code] = entry;
    }
    result[petId] = values;
  }
  return result;
}

// Shared by getHealthAttributeDirectionsForPets/getWellbeingDirections:
// fetches today+yesterday observations for the given codes across a set
// of pets in one query, then resolves each pet/code's up/equal/down/
// unknown direction from a same-day symptom *count* comparison
// (resolveDailyAttributeCount + computeAttributeDirection, scoring.js —
// fewer symptoms today than yesterday = up, more = down, same = equal).
// `checkInsByPetId` maps pet_id -> that day's daily_check_ins row (or
// null); a pet missing from the map is treated as no check-in. A
// check-in with status === null (migrated day, no Vibe recorded) is still
// a real, known day for this comparison — only a missing row or an
// explicitly skipped one is unknown (spec Migration Plan).
async function getAttributeDirectionsForPets(codes, petIds, todayCheckInsByPetId, yesterdayCheckInsByPetId) {
  const result = {};
  for (const petId of petIds) result[petId] = Object.fromEntries(codes.map((c) => [c, 'unknown']));
  if (petIds.length === 0) return result;

  const catalog = await loadObservationCatalog();
  const relevantTypeIds = codes.map((c) => catalog[c]?.type.id).filter(Boolean);

  const checkInIds = [];
  for (const petId of petIds) {
    if (todayCheckInsByPetId[petId]) checkInIds.push(todayCheckInsByPetId[petId].id);
    if (yesterdayCheckInsByPetId[petId]) checkInIds.push(yesterdayCheckInsByPetId[petId].id);
  }
  if (checkInIds.length === 0 || relevantTypeIds.length === 0) return result;

  const { data, error } = await supabase
    .from('observations')
    .select('daily_check_in_id, observation_type_id, value')
    .in('daily_check_in_id', checkInIds)
    .in('observation_type_id', relevantTypeIds);
  if (error) throw error;

  const countsByCheckInType = {};
  for (const obs of data) {
    if (!isCountableSymptom(obs.value)) continue;
    const key = `${obs.daily_check_in_id}:${obs.observation_type_id}`;
    countsByCheckInType[key] = (countsByCheckInType[key] || 0) + 1;
  }

  for (const petId of petIds) {
    const todayCheckIn = todayCheckInsByPetId[petId];
    const yesterdayCheckIn = yesterdayCheckInsByPetId[petId];
    for (const code of codes) {
      const typeId = catalog[code]?.type.id;
      const todayCount = typeId && todayCheckIn ? (countsByCheckInType[`${todayCheckIn.id}:${typeId}`] || 0) : 0;
      const yesterdayCount = typeId && yesterdayCheckIn ? (countsByCheckInType[`${yesterdayCheckIn.id}:${typeId}`] || 0) : 0;

      const todayState = resolveDailyAttributeCount({ status: todayCheckIn?.status, hasCheckIn: !!todayCheckIn, count: todayCount });
      const yesterdayState = resolveDailyAttributeCount({ status: yesterdayCheckIn?.status, hasCheckIn: !!yesterdayCheckIn, count: yesterdayCount });
      result[petId][code] = computeAttributeDirection(todayState, yesterdayState);
    }
  }
  return result;
}

// Home's six Health Attribute chips — direction vs. yesterday for each of
// the six Health Attributes (spec Attribute Model, now includes Nausea),
// batched across every active pet.
export async function getHealthAttributeDirectionsForPets(petIds, todayCheckInsByPetId, yesterdayCheckInsByPetId) {
  return getAttributeDirectionsForPets(HEALTH_ATTRIBUTES, petIds, todayCheckInsByPetId, yesterdayCheckInsByPetId);
}

// Pets'/Pet Profile's five Wellbeing chips (now includes Behavior) for a
// single pet.
export async function getWellbeingDirections(petId, todayCheckIn, yesterdayCheckIn) {
  const byPet = await getAttributeDirectionsForPets(
    WELLBEING_ATTRIBUTES, [petId],
    { [petId]: todayCheckIn }, { [petId]: yesterdayCheckIn },
  );
  return byPet[petId];
}

// Baseline (confirmed-normal) observation payload for every counted
// category — used by both markGreatDay and markGreatDaysBulk so a Great
// Day always gets an explicit row per category, not just an absent one
// (spec: "explicit baseline row is still written for every counted
// category"), matching the shape save_daily_check_ins (migration 0034)
// expects nested under each day's `observations` key.
function buildBaselineObservations(catalog) {
  return MULTI_SELECT_CODES.map((code) => {
    const entry = catalog[code];
    if (!entry) return null;
    return {
      observation_type_id: entry.type.id,
      value: baselineValueFor(getCategory(code)),
      numeric_value: null,
      notes: null,
      photo_url: null,
    };
  }).filter(Boolean);
}

// "Great Day" — every counted category gets an explicit confirmed-normal
// (baseline) row, not just an absent one, so direction comparisons never
// have to infer "no row = normal" (spec: "explicit baseline row is still
// written for every counted category"). The RPC (migration 0034,
// save_daily_check_ins) clears any prior observations for this check-in
// first, same as markOffTough — otherwise editing a previously off/tough
// day back to Great Day would leave stale symptom rows behind for
// direction reads to pick up — and does the upsert/delete/insert in one
// atomic call (spec 0016), so a failure partway through can no longer
// leave the check-in row saved without its observations.
export async function markGreatDay(petId, date = todayStr(), source = 'app') {
  await assertNotDemoAccount();
  const catalog = await loadObservationCatalog();
  const payload = {
    pet_id: petId,
    check_in_date: date,
    status: 'great',
    symptom_count: 0,
    completed_at: new Date().toISOString(),
    source,
    observations: buildBaselineObservations(catalog),
  };

  const { data, error } = await supabase.rpc('save_daily_check_ins', { payloads: [payload] });
  if (error) throw error;

  return { checkIn: data[0] };
}

// Chunk size for save_daily_check_ins RPC calls (spec 0016) — a deliberate
// speed/redo tradeoff: grouping days into one atomic call cuts round trips
// for a 6-month gap from ~180 to ~9, at the cost of redoing a whole chunk
// (not just one day) if that chunk's call is interrupted. A starting
// default, not tuned against real usage yet.
const CHECK_IN_CHUNK_SIZE = 20;

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

// Catch Up's (spec 0015) "finish" action — the bulk write for every missed
// day the owner never flagged, i.e. the ones still just "assumed Great
// Day". Same rule as markGreatDay (explicit baseline row per counted
// category, prior observations cleared first) but batched across
// potentially dozens of days. Split into chunks of CHECK_IN_CHUNK_SIZE days
// per save_daily_check_ins call (spec 0016) — each chunk is atomic (all its
// days save together or none do), and chunks run sequentially (not
// parallel) so a failure's exact position is always known: every chunk
// before it is saved for real, and the failed chunk (and anything after)
// is not, leaving Catch Up's resume-from-any-point design to handle the
// rest normally.
export async function markGreatDaysBulk(petId, dates, source = 'catch_up') {
  if (dates.length === 0) return { checkIns: [] };
  await assertNotDemoAccount();
  const catalog = await loadObservationCatalog();
  const observations = buildBaselineObservations(catalog);
  const completedAt = new Date().toISOString();

  const checkIns = [];
  for (const dateChunk of chunkArray(dates, CHECK_IN_CHUNK_SIZE)) {
    const payloads = dateChunk.map((date) => ({
      pet_id: petId,
      check_in_date: date,
      status: 'great',
      symptom_count: 0,
      completed_at: completedAt,
      source,
      observations,
    }));
    const { data, error } = await supabase.rpc('save_daily_check_ins', { payloads });
    if (error) throw error;
    checkIns.push(...data);
  }

  return { checkIns };
}

// "Skip today" — status 'skipped', symptom_count null. If an earlier
// great/off/tough check-in for this date already had a symptom_count,
// that value must be cleared too — a skipped day carries no count at all.
export async function markSkipped(petId, date = todayStr(), source = 'app') {
  return entities.DailyCheckIn.upsert(
    { pet_id: petId, check_in_date: date, status: 'skipped', symptom_count: null, completed_at: new Date().toISOString(), source },
    'pet_id,check_in_date',
  );
}

// "Off Day" / "Tough Day" — selections:
//   multi-select counted categories (6 Health + 5 Wellbeing): { code, values: [...], notes, photoUrl }
//   Weight/Other (not counted, optional, unaffected by this spec): { code, value|numericValue, notes }
// Every completed counted category is always resolved for all 11 below (an
// omitted or empty one just means "no symptoms today" — a real, explicit
// baseline row, not an absence). Weight/Other only produce an observation
// if the owner actually entered something, and never affect symptom_count.
//
// Every call is a full re-save of the day's *complete* current selection
// set (see DailyCheckInSheet.jsx), so any observation from a previous save
// of this same check-in that isn't part of `selections` this time must be
// removed first — otherwise a stale row lingers in `observations` for that
// daily_check_in_id/observation_type_id, and every reader that resolves
// "today's value for this attribute" would have extra stale rows mixed
// into the count. Deleting existing observations for this check-in up
// front makes every subsequent insert the single source of truth again.
//
// `status` is 'off' or 'tough' — nothing about save behavior, validation,
// or downstream processing distinguishes them (spec Core Model I): the
// only difference is which label gets stored and, by extension, symptom
// count math is identical for both.
//
// Shared by markOffTough and markOffToughBulk (spec 0016 — BulkApplySheet's
// multi-day apply shares one set of selections across every date, so this
// only needs to run once per save rather than once per date). Resolves
// every counted category against `selections` (an omitted or empty one
// just means "no symptoms today" — a real, explicit baseline row, not an
// absence) plus the optional Weight/Other pass-through, and tallies
// symptomCounts per category as it goes.
function buildObservationRows(catalog, selections) {
  const selectionsByCode = Object.fromEntries(selections.map((sel) => [sel.code, sel]));
  const rows = []; // { code, value, notes, photoUrl }
  const symptomCounts = {}; // code -> count of non-baseline, non-"Not Observed" symptoms today

  for (const code of MULTI_SELECT_CODES) {
    if (!catalog[code]) continue;
    const category = getCategory(code);
    const sel = selectionsByCode[code];
    const chosenValues = (sel?.values || []).filter((v) => v && !BASELINE_VALUES.has(v));

    if (chosenValues.length === 0) {
      rows.push({ code, value: baselineValueFor(category), notes: sel?.notes || null, photoUrl: sel?.photoUrl || null });
    } else {
      chosenValues.forEach((value, i) => {
        // Note/photo describe the category as a whole, not one specific
        // symptom — attached only to the first row so they aren't
        // duplicated (or silently dropped) across multiple symptom rows.
        rows.push({
          code, value,
          notes: i === 0 ? (sel?.notes || null) : null,
          photoUrl: i === 0 ? (sel?.photoUrl || null) : null,
        });
        if (isCountableSymptom(value)) symptomCounts[code] = (symptomCounts[code] || 0) + 1;
      });
    }
  }

  // Weight/Other — optional, not counted categories. Only produce an
  // observation if the owner actually entered something; never contribute
  // to symptomCounts.
  for (const sel of selections) {
    if (MULTI_SELECT_CODES.includes(sel.code)) continue;
    if (sel.value == null && sel.numericValue == null && !sel.notes) continue;
    rows.push({ code: sel.code, value: sel.value ?? null, numericValue: sel.numericValue ?? null, notes: sel.notes || null, photoUrl: sel.photoUrl || null });
  }

  return { rows, symptomCounts };
}

// Turns buildObservationRows' intermediate { code, value, ... } rows into
// the flat shape save_daily_check_ins (migration 0034) expects nested under
// a day's `observations` key.
function rowsToObservationPayload(catalog, rows) {
  return rows.map((row) => {
    const entry = catalog[row.code];
    return entry && {
      observation_type_id: entry.type.id,
      value: row.value ?? null,
      numeric_value: row.numericValue ?? null,
      notes: row.notes || null,
      photo_url: row.photoUrl || null,
    };
  }).filter(Boolean);
}

export async function markOffTough(petId, date, status, selections, source = 'app') {
  await assertNotDemoAccount();
  const catalog = await loadObservationCatalog();
  const { rows, symptomCounts } = buildObservationRows(catalog, selections);
  // markOffTough resolves every counted category for the full day (see
  // buildObservationRows), so this is always a full recalculation of the
  // day's symptom count, never an incremental patch.
  const symptomCount = computeSymptomCount(symptomCounts);

  const payload = {
    pet_id: petId,
    check_in_date: date,
    status,
    symptom_count: symptomCount,
    completed_at: new Date().toISOString(),
    source,
    observations: rowsToObservationPayload(catalog, rows),
  };

  const { data, error } = await supabase.rpc('save_daily_check_ins', { payloads: [payload] });
  if (error) throw error;

  return { checkIn: data[0], symptomCount };
}

// BulkApplySheet.jsx's multi-day apply (spec 0016) — every date in one
// bulk-apply session shares the same status and selections (a bulk-flagged
// day is never "Great" by definition), so buildObservationRows only needs
// to run once, not once per date. Chunked the same way as markGreatDaysBulk
// (CHECK_IN_CHUNK_SIZE per call, sequential, not parallel) so a failure's
// exact position is always known and each chunk's write is atomic.
export async function markOffToughBulk(petId, dates, status, selections, source = 'catch_up') {
  if (dates.length === 0) return { checkIns: [] };
  await assertNotDemoAccount();
  const catalog = await loadObservationCatalog();
  const { rows, symptomCounts } = buildObservationRows(catalog, selections);
  const symptomCount = computeSymptomCount(symptomCounts);
  const observations = rowsToObservationPayload(catalog, rows);
  const completedAt = new Date().toISOString();

  const checkIns = [];
  for (const dateChunk of chunkArray(dates, CHECK_IN_CHUNK_SIZE)) {
    const payloads = dateChunk.map((date) => ({
      pet_id: petId,
      check_in_date: date,
      status,
      symptom_count: symptomCount,
      completed_at: completedAt,
      source,
      observations,
    }));
    const { data, error } = await supabase.rpc('save_daily_check_ins', { payloads });
    if (error) throw error;
    checkIns.push(...data);
  }

  return { checkIns, symptomCount };
}
