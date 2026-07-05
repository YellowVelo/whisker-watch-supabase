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
import { computeDayScore, computeTrend } from './scoring';
import { CATEGORIES, getCategory } from './config';

// Answer values that represent "no change from normal" across every
// enum category — these are never worth surfacing as an observation
// summary line, even though they're stored as real observations.
const BASELINE_VALUES = new Set(['normal', 'none', 'no_change']);

const todayStr = () => new Date().toISOString().split('T')[0];

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
// has no per-group LIMIT without an RPC).
export async function getRecentWellnessForPets(petIds, limitPerPet = 14) {
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
  for (const petId of petIds) {
    const rows = (byPet[petId] || []).slice(0, limitPerPet);
    result[petId] = { latest: rows[0] || null, trend: computeTrend(rows) };
  }
  return result;
}

// Batched "what changed" summary for a set of today's check-ins, keyed
// by pet_id -> array of human-readable observation labels (e.g. "Ate
// less than usual"), oldest-logged first. Used by Home's Today's
// Check-Ins cards; the UI decides how many of these to show and
// whether to render a "+N more" tail.
export async function getObservationSummariesForCheckIns(checkInsByPetId) {
  const checkInIds = Object.values(checkInsByPetId).filter(Boolean).map((c) => c.id);
  if (checkInIds.length === 0) return {};

  const [{ data, error }, catalog] = await Promise.all([
    supabase
      .from('observations')
      .select('*')
      .in('daily_check_in_id', checkInIds)
      .order('observed_at', { ascending: true }),
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
    result[petId] = (observationsByCheckIn[checkIn.id] || [])
      .map((obs) => describeObservation(obs, typeIdToCode))
      .filter(Boolean);
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
// keyed by pet_id -> { [categoryCode]: { value, severityScore } }. Unlike
// getObservationSummariesForCheckIns (full sentences for Home's Today's
// Check-Ins card), this preserves the raw enum value and severity so the
// Pets screen can render short chip labels (Normal/Low/High/etc.) per
// fixed category slot.
export async function getObservationValuesForCheckIns(checkInsByPetId) {
  const checkInIds = Object.values(checkInsByPetId).filter(Boolean).map((c) => c.id);
  if (checkInIds.length === 0) return {};

  const [{ data, error }, catalog] = await Promise.all([
    supabase
      .from('observations')
      .select('*')
      .in('daily_check_in_id', checkInIds),
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

export async function getLatestWellness(petId) {
  const recent = await getRecentWellnessScores(petId, 14);
  return { latest: recent[0] || null, trend: computeTrend(recent) };
}

async function upsertWellnessScore(petId, date, dailyCheckInId, score, reasonSummary) {
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
  }, 'pet_id,check_in_date');
}

// "Today was normal" — no observations, baseline assumed unchanged.
export async function markNormal(petId, date = todayStr(), source = 'app') {
  const checkIn = await entities.DailyCheckIn.upsert(
    { pet_id: petId, check_in_date: date, status: 'normal', completed_at: new Date().toISOString(), source },
    'pet_id,check_in_date',
  );
  await upsertWellnessScore(petId, date, checkIn.id, 100, null);
  return checkIn;
}

// "Skip today" — status unknown, explicitly not scored.
export async function markSkipped(petId, date = todayStr(), source = 'app') {
  return entities.DailyCheckIn.upsert(
    { pet_id: petId, check_in_date: date, status: 'skipped', completed_at: new Date().toISOString(), source },
    'pet_id,check_in_date',
  );
}

// "Something changed" — selections: [{ code, value, numericValue, notes, photoUrl }]
// Only categories the owner actually answered should be passed in.
export async function saveChangedCheckIn(petId, date, selections, source = 'app') {
  const catalog = await loadObservationCatalog();
  const checkIn = await entities.DailyCheckIn.upsert(
    { pet_id: petId, check_in_date: date, status: 'changed', completed_at: new Date().toISOString(), source },
    'pet_id,check_in_date',
  );

  const contributingObservations = [];
  await Promise.all(selections.map(async (sel) => {
    const entry = catalog[sel.code];
    if (!entry) return;
    const option = sel.value != null ? entry.optionsByValue[sel.value] : null;
    const severityScore = option?.severity_score ?? 0;

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
  }));

  const score = computeDayScore(contributingObservations);
  const reasonSummary = contributingObservations.length > 0
    ? contributingObservations.map((o) => o.categoryLabel).join(', ')
    : null;
  await upsertWellnessScore(petId, date, checkIn.id, score, reasonSummary);

  return checkIn;
}
