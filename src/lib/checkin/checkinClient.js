// Daily Check-In data layer. All Daily Check-In / observation / wellness
// score reads and writes go through here — components never call
// entities.* for these tables directly, per Technical Standards
// ("all data access goes through entityClient.js and entities.js" /
// "never call Supabase directly inside UI components", extended here to
// mean "never scatter check-in persistence logic across components").
//
// Two multi-pet reads (getCheckInsForPets, getRecentWellnessForPets) use
// the Supabase client directly rather than entities.*.filter(), because
// entityClient's generic filter only supports equality matches and these
// need `.in(pet_id, [...])` — this module is a data-access layer (same
// role as entityClient.js itself), not a UI component, so that's
// consistent with "never call Supabase directly inside UI components".

import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import {
  computeDayScore, computeTrend, computeHealthScore,
  resolveDailyAttributeCount, computeAttributeDirection, computeHealthScoreDirection,
} from './scoring';
import { CATEGORIES, getCategory, HEALTH_SCORE_ATTRIBUTES, WELLBEING_ATTRIBUTES } from './config';
import { todayInTimezone, yesterdayInTimezone } from '@/lib/timezone';

// Answer values that represent "no change from normal" across every
// enum category — these are never worth surfacing as an observation
// summary line, even though they're stored as real observations.
//
// supabase/migrations/0022_health_score_equal_weight_multiselect.sql's
// one-time backfill independently hardcodes this same normal/none mapping
// and the 9-category list below in raw SQL (applied migrations aren't
// rewritten after the fact). If either changes here, check whether a new
// migration is needed to keep historical backfills consistent — there is
// no shared source of truth between this file and that SQL.
export const BASELINE_VALUES = new Set(['normal', 'none', 'no_change']);

// The 9 categories (5 Health + 4 Wellbeing) that allow more than one
// symptom per day (equal weight — product decision, not clinical
// grading). Every one of these always gets an explicit row per day, per
// category — a baseline row when nothing was selected, one row per
// distinct symptom otherwise — so "no row" never needs to be interpreted
// as an assumption.
const MULTI_SELECT_CODES = CATEGORIES.filter((c) => c.multiSelect).map((c) => c.code);

function baselineValueFor(category) {
  return category.options?.find((o) => BASELINE_VALUES.has(o.value))?.value ?? 'normal';
}

// `timezone` is optional (spec: "use the user's stored timezone when
// resolving today and yesterday") — callers that haven't threaded the
// signed-in user's profile timezone through yet keep the previous
// UTC-based behavior via timezone.js's own UTC fallback.
export const todayStr = (timezone) => todayInTimezone(timezone);
export const yesterdayStr = (timezone) => yesterdayInTimezone(timezone);

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

export async function getRecentWellnessScores(petId, limit = 14) {
  return entities.WellnessScore.filter({ pet_id: petId }, '-check_in_date', limit);
}

// Batched equivalent of calling getLatestWellness per pet — one query
// instead of N, grouped and trimmed to `limitPerPet` client-side (Supabase
// has no per-group LIMIT without an RPC). `today` (a date string) is
// optional and only used to additionally derive the V2 Health Score's
// `healthScore` shape ({ score, direction, directionReason }, spec §8.4/
// §9.2) for Home — omitted, this returns exactly the legacy `{ latest,
// trend }` shape PetProfileContent's "profile" context still relies on.
export async function getRecentWellnessForPets(petIds, limitPerPet = 14, today = null) {
  if (petIds.length === 0) return {};
  const { data, error } = await supabase
    .from('wellness_scores')
    .select('*')
    .in('pet_id', petIds)
    .order('check_in_date', { ascending: false })
    .limit(limitPerPet * petIds.length);
  if (error) throw error;

  const byPet = {};
  for (const row of data) {
    (byPet[row.pet_id] ||= []).push(row);
  }
  const result = {};
  // Pets whose direction comes back 'unknown' because there's no V2 row
  // for yesterday *within this fetch's window* — ambiguous between "this
  // is truly the pet's first-ever scored day" (spec: "First day logged")
  // and "there's real history, just older than `limitPerPet` days back"
  // (spec: "Not enough data"). Resolved below with one extra batched
  // existence query instead of trusting the bounded window, so a pet with
  // a real but sparse history doesn't get mislabeled as brand new.
  const needsHistoryCheck = [];

  for (const petId of petIds) {
    const rows = (byPet[petId] || []).slice(0, limitPerPet);
    const entry = { latest: rows[0] || null, trend: computeTrend(rows) };

    if (today) {
      const v2Rows = rows.filter((r) => r.health_score_version === 'health_score_v2' && r.health_score != null);
      const todayRow = v2Rows[0]?.check_in_date === today ? v2Rows[0] : null;
      const yesterdayRow = v2Rows.find((r) => r !== todayRow && r.check_in_date < today) || null;
      const direction = computeHealthScoreDirection(
        todayRow?.health_score ?? null, yesterdayRow?.health_score ?? null,
        todayRow ? 'normal' : null, yesterdayRow ? 'normal' : null,
      );
      // Placeholder resolved to 'first_day' or 'missing_yesterday' after
      // the batched history-existence check below.
      const directionReason = direction !== 'unknown' ? null : (!todayRow ? null : 'pending_history_check');
      if (directionReason === 'pending_history_check') needsHistoryCheck.push(petId);
      entry.healthScore = { score: todayRow?.health_score ?? null, direction, directionReason };
    }

    result[petId] = entry;
  }

  if (needsHistoryCheck.length > 0) {
    // One query for every pet that needs resolving, rather than one query
    // per pet — existence of *any* earlier V2 row is enough, so this reads
    // only pet_id (no need to fetch full rows or every match).
    const { data: earlierRows, error: earlierError } = await supabase
      .from('wellness_scores')
      .select('pet_id')
      .in('pet_id', needsHistoryCheck)
      .eq('health_score_version', 'health_score_v2')
      .lt('check_in_date', today);
    if (earlierError) throw earlierError;
    const hasEarlierHistory = new Set(earlierRows.map((r) => r.pet_id));
    for (const petId of needsHistoryCheck) {
      result[petId].healthScore.directionReason = hasEarlierHistory.has(petId) ? 'missing_yesterday' : 'first_day';
    }
  }

  return result;
}

// Exported (rather than kept module-private) so it can be unit tested
// directly — it's the one piece of business logic in this file that
// doesn't need a network call to verify.
export function describeObservation(obs, typeIdToCode) {
  const category = getCategory(typeIdToCode[obs.observation_type_id]);
  if (!category) return null;

  if (category.answerType === 'enum') {
    if (obs.value == null || BASELINE_VALUES.has(obs.value)) return null;
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
// keyed by pet_id -> { [categoryCode]: { values, notes, severityScore } } —
// `values` is every non-baseline symptom logged for that category that day
// (0+, multi-select categories can have more than one), used to render
// chip labels (Normal/Low/High/"Changed" for 2+/etc.) per fixed category
// slot.
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
      const entry = values[code] || { values: [], notes: null, severityScore: 0 };
      if (obs.value != null && !BASELINE_VALUES.has(obs.value)) entry.values.push(obs.value);
      if (obs.notes && !entry.notes) entry.notes = obs.notes;
      if (obs.severity_score) entry.severityScore += obs.severity_score;
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
// null); a pet missing from the map is treated as no check-in.
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

  // Multiple rows for the same (check-in, type) are expected now
  // (multi-select) — every non-baseline row is a distinct symptom and
  // counts, rather than the previous "one row wins" resolution.
  const countsByCheckInType = {};
  for (const obs of data) {
    if (obs.value == null || BASELINE_VALUES.has(obs.value)) continue;
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

      const todayState = resolveDailyAttributeCount({ status: todayCheckIn?.status, count: todayCount });
      const yesterdayState = resolveDailyAttributeCount({ status: yesterdayCheckIn?.status, count: yesterdayCount });
      result[petId][code] = computeAttributeDirection(todayState, yesterdayState);
    }
  }
  return result;
}

// Home's six Health Attribute chips (spec §9.3) — direction vs. yesterday
// for each of the five Health Attributes, batched across every active pet.
export async function getHealthAttributeDirectionsForPets(petIds, todayCheckInsByPetId, yesterdayCheckInsByPetId) {
  return getAttributeDirectionsForPets(HEALTH_SCORE_ATTRIBUTES, petIds, todayCheckInsByPetId, yesterdayCheckInsByPetId);
}

// Pets' four Wellbeing chips (spec §10.2) for a single pet.
export async function getWellbeingDirections(petId, todayCheckIn, yesterdayCheckIn) {
  const byPet = await getAttributeDirectionsForPets(
    WELLBEING_ATTRIBUTES, [petId],
    { [petId]: todayCheckIn }, { [petId]: yesterdayCheckIn },
  );
  return byPet[petId];
}

export async function getLatestWellness(petId) {
  const recent = await getRecentWellnessScores(petId, 14);
  return { latest: recent[0] || null, trend: computeTrend(recent) };
}

async function upsertWellnessScore(petId, date, dailyCheckInId, score, reasonSummary, healthScoreResult = null) {
  // Fetched before the upsert below writes today's row, so trend is
  // computed from the *prior* history plus the new score — excluding any
  // previous value for `date` itself (this may be a re-edit of today).
  const recent = await getRecentWellnessScores(petId, 14);
  const trend = computeTrend([{ score }, ...recent.filter((r) => r.check_in_date !== date)]);
  return entities.WellnessScore.upsert({
    pet_id: petId,
    check_in_date: date,
    daily_check_in_id: dailyCheckInId,
    score,
    trend,
    score_reason_summary: reasonSummary,
    // Health Score V2 (additive, spec §12.2) — null fields on a legacy-only
    // row are never possible here since every markNormal/saveChangedCheckIn
    // call always supplies a healthScoreResult; only reachable via this
    // default when called defensively.
    health_score: healthScoreResult?.score ?? null,
    health_score_version: healthScoreResult ? 'health_score_v2' : null,
    total_deductions: healthScoreResult?.totalDeduction ?? null,
    deductions_by_attribute: healthScoreResult?.deductionsByAttribute ?? null,
  }, 'pet_id,check_in_date');
}

// "Today was normal" — every multi-select attribute gets an explicit
// confirmed-normal (baseline) row, not just an absent one, so direction
// comparisons never have to infer "no row = normal" (spec decision: every
// attribute gets a real record, every day). Deletes any prior observations
// for this check-in first, same as saveChangedCheckIn — otherwise editing a
// previously-'changed' day back to 'normal' would leave stale symptom rows
// behind for direction/score reads to pick up.
export async function markNormal(petId, date = todayStr(), source = 'app') {
  const catalog = await loadObservationCatalog();
  const checkIn = await entities.DailyCheckIn.upsert(
    { pet_id: petId, check_in_date: date, status: 'normal', completed_at: new Date().toISOString(), source },
    'pet_id,check_in_date',
  );

  const { error: deleteError } = await supabase
    .from('observations')
    .delete()
    .eq('daily_check_in_id', checkIn.id);
  if (deleteError) throw deleteError;

  // Single bulk insert rather than N individual creates — one round trip
  // instead of up to 9, and one atomic SQL statement instead of N
  // independently-failable network calls.
  const baselineRows = MULTI_SELECT_CODES.map((code) => {
    const entry = catalog[code];
    if (!entry) return null;
    return {
      pet_id: petId,
      daily_check_in_id: checkIn.id,
      observation_type_id: entry.type.id,
      value: baselineValueFor(getCategory(code)),
      numeric_value: null,
      severity_score: 0,
      notes: null,
      photo_url: null,
      observed_at: new Date().toISOString(),
    };
  }).filter(Boolean);
  if (baselineRows.length > 0) await entities.Observation.bulkCreate(baselineRows);

  const healthScoreResult = { score: 10, totalDeduction: 0, deductionsByAttribute: {}, reasonSummary: null };
  await upsertWellnessScore(petId, date, checkIn.id, 100, null, healthScoreResult);
  return { checkIn, healthScoreResult };
}

// "Skip today" — status unknown, explicitly not scored. If an earlier
// normal/changed check-in for this date already produced a score (legacy
// and/or V2), that snapshot is now stale and must be removed entirely —
// a skipped day must never carry a leftover score of either kind (spec
// §11.6/#13). This only deletes the derived wellness_scores snapshot for
// this one date, never raw observations history.
//
// Deliberately deletes the stale score *before* flipping the check-in's
// status to 'skipped', not after: these are two separate network calls
// with no shared transaction, so ordering determines the failure mode if
// the second call never runs. Delete-then-upsert means a failure between
// the two steps leaves the check-in's previous (non-skipped) status
// intact with its score already gone — recoverable by retrying the same
// action. The reverse order would risk the worse state of a check-in
// marked 'skipped' while a stale score row still displays, which is an
// explicit spec violation (§11.6).
export async function markSkipped(petId, date = todayStr(), source = 'app') {
  const existing = await entities.WellnessScore.filter({ pet_id: petId, check_in_date: date });
  await Promise.all(existing.map((row) => entities.WellnessScore.delete(row.id)));
  return entities.DailyCheckIn.upsert(
    { pet_id: petId, check_in_date: date, status: 'skipped', completed_at: new Date().toISOString(), source },
    'pet_id,check_in_date',
  );
}

// "Something changed" — selections:
//   multi-select categories (5 Health + 4 Wellbeing): { code, values: [...], notes, photoUrl }
//   single-select categories (behavior, medication_exception) and
//     number/text categories (weight, other): { code, value|numericValue, notes, photoUrl }
// Only categories the owner actually answered need to be passed in for
// single-select/number/text categories; multi-select categories are always
// resolved for all 9 below (an omitted or empty one just means "no symptoms
// today" — a real, explicit baseline row, not an absence).
//
// Every call is a full re-save of the day's *complete* current selection
// set (see DailyCheckInSheet.jsx), so any observation from a previous save
// of this same check-in that isn't part of `selections` this time must be
// removed first — otherwise a stale row lingers in `observations` for that
// daily_check_in_id/observation_type_id, and every reader that resolves
// "today's value for this attribute" (getHealthAttributeDirectionsForPets,
// getWellbeingDirections, getObservationValuesForCheckIns) would have extra
// stale rows mixed into the count. Deleting existing observations for this
// check-in up front makes every subsequent insert the single source of
// truth again, satisfying "ensure removed observations no longer affect the
// score" — and, by extension, no longer affect direction either.
export async function saveChangedCheckIn(petId, date, selections, source = 'app') {
  const catalog = await loadObservationCatalog();
  const checkIn = await entities.DailyCheckIn.upsert(
    { pet_id: petId, check_in_date: date, status: 'changed', completed_at: new Date().toISOString(), source },
    'pet_id,check_in_date',
  );

  const { error: deleteError } = await supabase
    .from('observations')
    .delete()
    .eq('daily_check_in_id', checkIn.id);
  if (deleteError) throw deleteError;

  const selectionsByCode = Object.fromEntries(selections.map((sel) => [sel.code, sel]));
  const rows = []; // { code, value, numericValue, notes, photoUrl }

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
      });
    }
  }

  for (const sel of selections) {
    if (MULTI_SELECT_CODES.includes(sel.code)) continue;
    if (sel.value == null && sel.numericValue == null && !sel.notes) continue;
    rows.push({ code: sel.code, value: sel.value ?? null, numericValue: sel.numericValue ?? null, notes: sel.notes || null, photoUrl: sel.photoUrl || null });
  }

  const contributingObservations = []; // legacy 0-100 deductions (severity_score < 0)
  const symptomCounts = {}; // V2: code -> count of non-baseline symptoms today (Health Attributes only matter to the score, but Wellbeing counts are harmless to include)

  // Single bulk insert rather than N individual creates — one round trip
  // instead of up to 9+, and one atomic SQL statement instead of N
  // independently-failable network calls. The bookkeeping below only reads
  // from `row`/`entry`/`option`, never from the create response, so it's
  // safe to compute entirely before the network call.
  const dbRows = [];
  for (const row of rows) {
    const entry = catalog[row.code];
    if (!entry) continue;
    const option = row.value != null ? entry.optionsByValue[row.value] : null;
    const severityScore = option?.severity_score ?? 0;

    dbRows.push({
      pet_id: petId,
      daily_check_in_id: checkIn.id,
      observation_type_id: entry.type.id,
      value: row.value ?? null,
      numeric_value: row.numericValue ?? null,
      severity_score: severityScore,
      notes: row.notes || null,
      photo_url: row.photoUrl || null,
      observed_at: new Date().toISOString(),
    });

    if (severityScore < 0) {
      const categoryLabel = CATEGORIES.find((c) => c.code === row.code)?.label;
      contributingObservations.push({ severity_score: severityScore, categoryLabel });
    }
    if (MULTI_SELECT_CODES.includes(row.code) && row.value != null && !BASELINE_VALUES.has(row.value)) {
      symptomCounts[row.code] = (symptomCounts[row.code] || 0) + 1;
    }
  }
  if (dbRows.length > 0) await entities.Observation.bulkCreate(dbRows);

  // saveChangedCheckIn resolves every multi-select category for the full
  // day (see the MULTI_SELECT_CODES loop above) and single-select/number/
  // text categories from the complete current `selections` set, so
  // recomputing both scores here is always a full recalculation of the
  // day, never an incremental patch.
  const score = computeDayScore(contributingObservations);
  const reasonSummary = contributingObservations.length > 0
    ? contributingObservations.map((o) => o.categoryLabel).join(', ')
    : null;
  const healthScoreResult = computeHealthScore(symptomCounts);
  await upsertWellnessScore(petId, date, checkIn.id, score, reasonSummary, healthScoreResult);

  return { checkIn, healthScoreResult };
}
