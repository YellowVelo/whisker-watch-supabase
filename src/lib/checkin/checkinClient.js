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
  resolveDailyAttributeState, computeAttributeDirection, computeHealthScoreDirection,
} from './scoring';
import { CATEGORIES, getCategory, HEALTH_SCORE_ATTRIBUTES, WELLBEING_ATTRIBUTES } from './config';
import { todayInTimezone, yesterdayInTimezone } from '@/lib/timezone';

// Answer values that represent "no change from normal" across every
// enum category — these are never worth surfacing as an observation
// summary line, even though they're stored as real observations.
const BASELINE_VALUES = new Set(['normal', 'none', 'no_change']);

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
// keyed by pet_id -> { [categoryCode]: { value, severityScore } } — used to
// render short chip labels (Normal/Low/High/etc.) per fixed category slot.
export async function getObservationValuesForCheckIns(checkInsByPetId) {
  const checkInIds = Object.values(checkInsByPetId).filter(Boolean).map((c) => c.id);
  if (checkInIds.length === 0) return {};

  const [{ data, error }, catalog] = await Promise.all([
    supabase
      .from('observations')
      .select('*')
      .in('daily_check_in_id', checkInIds)
      // Oldest first, so if a stale duplicate row for the same check-in/
      // type ever exists (see saveChangedCheckIn), the most recently
      // created one is assigned last below and wins deterministically,
      // rather than depending on Postgres's unspecified default order.
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
      values[code] = { value: obs.value, notes: obs.notes, severityScore: obs.severity_score };
    }
    result[petId] = values;
  }
  return result;
}

// Shared by getHealthAttributeDirectionsForPets/getWellbeingDirections:
// fetches today+yesterday observations for the given codes across a set
// of pets in one query, then resolves each pet/code's up/equal/down/
// unknown direction via resolveDailyAttributeState + computeAttributeDirection
// (scoring.js). `checkInsByPetId` maps pet_id -> that day's daily_check_ins
// row (or null); a pet missing from the map is treated as no check-in.
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

  // observation_options isn't FK-linked from observations (options are
  // looked up by `value`, not by id), so the option's direction_ordinal is
  // resolved afterward from the already-cached catalog rather than via a
  // PostgREST embed.
  //
  // saveChangedCheckIn deletes a check-in's prior observations before
  // inserting the current selection set, so under normal operation there's
  // only ever one row per (daily_check_in_id, observation_type_id). This
  // ordering + "first match wins" is defense-in-depth for the narrow
  // window where two co-owners save the same check-in concurrently (spec
  // edge case: "Two co-owners edit the same check-in") — it guarantees the
  // most-recently-created row is used rather than depending on whatever
  // order Postgres happens to return.
  const { data, error } = await supabase
    .from('observations')
    .select('daily_check_in_id, observation_type_id, value, created_at')
    .in('daily_check_in_id', checkInIds)
    .in('observation_type_id', relevantTypeIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const observationsByCheckIn = {};
  for (const obs of data) (observationsByCheckIn[obs.daily_check_in_id] ||= []).push(obs);

  for (const petId of petIds) {
    const todayCheckIn = todayCheckInsByPetId[petId];
    const yesterdayCheckIn = yesterdayCheckInsByPetId[petId];
    for (const code of codes) {
      const typeId = catalog[code]?.type.id;
      const todayObs = typeId ? (observationsByCheckIn[todayCheckIn?.id] || []).find((o) => o.observation_type_id === typeId) : null;
      const yesterdayObs = typeId ? (observationsByCheckIn[yesterdayCheckIn?.id] || []).find((o) => o.observation_type_id === typeId) : null;
      const todayOption = todayObs?.value != null ? catalog[code]?.optionsByValue[todayObs.value] : null;
      const yesterdayOption = yesterdayObs?.value != null ? catalog[code]?.optionsByValue[yesterdayObs.value] : null;

      const todayState = resolveDailyAttributeState({ status: todayCheckIn?.status, observation: todayOption });
      const yesterdayState = resolveDailyAttributeState({ status: yesterdayCheckIn?.status, observation: yesterdayOption });
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

// "Today was normal" — no observations, baseline assumed unchanged.
export async function markNormal(petId, date = todayStr(), source = 'app') {
  const checkIn = await entities.DailyCheckIn.upsert(
    { pet_id: petId, check_in_date: date, status: 'normal', completed_at: new Date().toISOString(), source },
    'pet_id,check_in_date',
  );
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

// "Something changed" — selections: [{ code, value, numericValue, notes, photoUrl }]
// Only categories the owner actually answered should be passed in.
//
// Every call is a full re-save of the day's *complete* current selection
// set (see DailyCheckInSheet.jsx), so any observation from a previous save
// of this same check-in that isn't part of `selections` this time must be
// removed first — otherwise a stale row lingers in `observations` for that
// daily_check_in_id/observation_type_id, and every reader that resolves
// "today's value for this attribute" (getHealthAttributeDirectionsForPets,
// getWellbeingDirections, getObservationValuesForCheckIns) would have two
// candidate rows to choose between with no defined order, i.e. a
// non-deterministic read. Deleting existing observations for this check-in
// up front makes every subsequent insert the single source of truth again,
// satisfying spec §11.7 ("ensure removed observations no longer affect the
// score" — and, by extension, no longer affect direction either).
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

  const contributingObservations = []; // legacy 0-100 deductions (severity_score < 0)
  const healthScoreObservations = []; // V2 deductions (health_score_deduction), Health Attributes only
  await Promise.all(selections.map(async (sel) => {
    const entry = catalog[sel.code];
    if (!entry) return;
    const option = sel.value != null ? entry.optionsByValue[sel.value] : null;
    const severityScore = option?.severity_score ?? 0;
    const healthScoreDeduction = option?.health_score_deduction ?? 0;

    await entities.Observation.create({
      pet_id: petId,
      daily_check_in_id: checkIn.id,
      observation_type_id: entry.type.id,
      value: sel.value ?? null,
      numeric_value: sel.numericValue ?? null,
      severity_score: severityScore,
      notes: sel.notes || null,
      photo_url: sel.photoUrl || null,
      observed_at: new Date().toISOString(),
    });

    if (severityScore < 0) {
      const categoryLabel = CATEGORIES.find((c) => c.code === sel.code)?.label;
      contributingObservations.push({ severity_score: severityScore, categoryLabel });
    }
    if (healthScoreDeduction > 0) {
      healthScoreObservations.push({ code: sel.code, health_score_deduction: healthScoreDeduction });
    }
  }));

  // saveChangedCheckIn only ever receives selections for attributes the
  // owner actually answered — every editing call re-saves the *complete*
  // set of currently-selected categories (see DailyCheckInSheet.jsx), so
  // recomputing both scores here from `selections` alone is always a full
  // recalculation of the day, never an incremental patch (spec §11.7).
  const score = computeDayScore(contributingObservations);
  const reasonSummary = contributingObservations.length > 0
    ? contributingObservations.map((o) => o.categoryLabel).join(', ')
    : null;
  const healthScoreResult = computeHealthScore(healthScoreObservations);
  await upsertWellnessScore(petId, date, checkIn.id, score, reasonSummary, healthScoreResult);

  return { checkIn, healthScoreResult };
}
