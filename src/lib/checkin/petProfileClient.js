// Pet Profile data layer. Same precedent as checkinClient.js/petsClient.js:
// batched/derived reads the UI needs live here, never as direct Supabase
// calls inside PetProfile.jsx (Technical Standards — never query Supabase
// directly from UI components).
//
// The retired Wellness/Appetite/Energy/Symptoms ring scores (computed
// here at read time from computeDayScore/computeTrend) are gone along
// with the 5-ring row itself. Only Weight-related reads remain here.

import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';
import { getObservationValuesForCheckIns } from './checkinClient';
import { COUNTED_CATEGORIES, getCategory } from './config';
import { getChipState } from './chipLabels';

// Shared by getWeightSummary/getWeightSummariesForPets — turns a pet's
// weight-bearing symptom_logs rows (already sorted oldest-first, already
// capped to `days`) into the ring/card shape. Kept pure/sync so the batched
// path below can reuse it without a second round trip per pet.
function summarizeWeightLogs(withWeight) {
  if (withWeight.length === 0) {
    return { currentLbs: null, deltaLbs: null, score: null, statusLabel: null, sparkline: [] };
  }

  const toLbs = (grams) => grams / 453.59237;
  const sparkline = withWeight.map((l) => ({ date: l.date, lbs: toLbs(l.weight_grams) }));
  const currentLbs = sparkline[sparkline.length - 1].lbs;

  if (sparkline.length < 2) {
    return { currentLbs, deltaLbs: null, score: null, statusLabel: null, sparkline };
  }

  const prevLbs = sparkline[sparkline.length - 2].lbs;
  const deltaLbs = currentLbs - prevLbs;
  const pctChange = (currentLbs - prevLbs) / prevLbs;
  const deduction = Math.min(40, Math.round(Math.abs(pctChange) * 1000));
  const score = Math.max(0, 100 - deduction);
  const statusLabel = Math.abs(pctChange) >= 0.02 ? 'Monitor' : 'Stable';

  return { currentLbs, deltaLbs, score, statusLabel, sparkline };
}

// Weight ring + card data, from symptom_logs.weight_grams — the only place
// weight is currently written (Data Model §3.8). Score is a deterministic
// deduction from the day-over-day percent change, not a stored value;
// there's no baseline-weight field yet, so "trend" compares the two most
// recent entries rather than a true baseline (documented limitation,
// carried over from the previous Pet Profile implementation).
export async function getWeightSummary(petId, days = 30) {
  const logs = await entities.SymptomLog.filter({ pet_id: petId }, '-date', 200);
  const withWeight = logs.filter((l) => l.weight_grams != null).slice(0, days).reverse();
  return summarizeWeightLogs(withWeight);
}

// Batched equivalent of calling getWeightSummary per pet — one
// symptom_logs query instead of N (Health Score Revision V2, Home's
// Weight chip needs this for every active pet on every load/pull-to-
// refresh, so the same batching discipline as getCheckInsForPets/
// getRecentWellnessForPets applies here too).
export async function getWeightSummariesForPets(petIds, days = 30) {
  const result = {};
  for (const petId of petIds) result[petId] = summarizeWeightLogs([]);
  if (petIds.length === 0) return result;

  const { data, error } = await supabase
    .from('symptom_logs')
    .select('pet_id, date, weight_grams')
    .in('pet_id', petIds)
    .not('weight_grams', 'is', null)
    .order('date', { ascending: false });
  if (error) throw error;

  const byPet = {};
  for (const row of data) (byPet[row.pet_id] ||= []).push(row);

  for (const petId of petIds) {
    const withWeight = (byPet[petId] || []).slice(0, days).reverse();
    result[petId] = summarizeWeightLogs(withWeight);
  }
  return result;
}

// Vaccination completion summary. `vaccinations` is the pet's full shot
// history (one row per administration, e.g. an annual booster logged
// every year) — there is no `active` flag on this table, so "current
// status" must be derived from the single latest record per
// `vaccine_name`, not from every historical row. Counting every row would
// inflate `total` for any pet with more than one year of boosters and
// would flag old, already-superseded shots as "overdue" even though a
// newer one exists.
export function getVaccinationSummary(vaccinations) {
  const latestByName = new Map();
  for (const v of vaccinations) {
    const existing = latestByName.get(v.vaccine_name);
    if (!existing || (v.date_given || '') > (existing.date_given || '')) {
      latestByName.set(v.vaccine_name, v);
    }
  }
  const distinct = [...latestByName.values()];
  const total = distinct.length;
  if (total === 0) return { total: 0, current: 0, isOverdue: false };

  const now = new Date();
  const overdueCount = distinct.filter((v) => v.next_due_date && new Date(v.next_due_date) < now).length;
  return { total, current: total - overdueCount, isOverdue: overdueCount > 0 };
}

// Chronological health-event list backing the Timeline card AND the
// Timeline page itself — the same array drives both, so the count shown
// on Pet Profile always matches what a tap-through actually displays
// (Business Rule: "Timeline contains all historical health events").
// There is no dedicated timeline/event table (Nav & IA: Timeline was a
// placeholder); this assembles real events from the tables that already
// represent discrete moments in the pet's history, most-recent first.
export async function getTimelineEvents(petId, limit = 200) {
  const [checkIns, medications, vaccinations, symptomLogs] = await Promise.all([
    entities.DailyCheckIn.filter({ pet_id: petId }, '-check_in_date', limit),
    entities.Medication.filter({ pet_id: petId }, '-start_date', limit),
    entities.Vaccination.filter({ pet_id: petId }, '-date_given', limit),
    entities.SymptomLog.filter({ pet_id: petId }, '-date', limit),
  ]);

  const events = [
    ...checkIns.map((c) => ({
      id: `checkin-${c.id}`, date: c.check_in_date, type: 'check_in',
      title: c.status === 'normal' ? 'Daily check-in — everything normal' : c.status === 'skipped' ? 'Daily check-in skipped' : 'Daily check-in — changes logged',
    })),
    ...medications.filter((m) => m.start_date).map((m) => ({
      id: `med-${m.id}`, date: m.start_date, type: 'medication', title: `Started ${m.name}`,
    })),
    ...vaccinations.filter((v) => v.date_given).map((v) => ({
      id: `vax-${v.id}`, date: v.date_given, type: 'vaccination', title: `${v.vaccine_name} administered`,
    })),
    ...symptomLogs.map((s) => ({
      id: `log-${s.id}`, date: s.date, type: 'symptom_log', title: 'Symptom log recorded',
    })),
  ];

  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Per-day attribute chips for every Daily Check-In, most-recent first — the
// granular detail the Timeline page shows for check-in days (vet visits
// need the actual per-attribute answers, not just "Daily check-in — Off
// Day"). Reuses getObservationValuesForCheckIns keyed by check-in id rather
// than pet id, since that function only uses the key to shape its return
// value.
export async function getTimelineCheckIns(petId, limit = 200) {
  const checkIns = await entities.DailyCheckIn.filter({ pet_id: petId }, '-check_in_date', limit);
  const checkInsById = Object.fromEntries(checkIns.map((c) => [c.id, c]));
  const valuesByCheckInId = await getObservationValuesForCheckIns(checkInsById);

  return checkIns.map((c) => ({
    id: c.id,
    date: c.check_in_date,
    status: c.status,
    chips: COUNTED_CATEGORIES.map((code) => {
      const { label, tone } = getChipState(code, c.status, valuesByCheckInId[c.id] || {});
      return { code, categoryLabel: getCategory(code)?.label || code, label, tone };
    }),
  }));
}

// Health Records count. There is no document-storage table yet (Data
// Model has no `documents` entity) — bloodwork is the only structured
// health-record data that currently exists, so it's the count shown, and
// the card links to the existing Bloodwork tab (real data) rather than
// the unrelated, always-empty Documents placeholder, so the number a
// caller sees always matches what they find on tap-through.
export async function getHealthRecordsCount(petId) {
  const { count, error } = await supabase
    .from('bloodwork')
    .select('id', { count: 'exact', head: true })
    .eq('pet_id', petId);
  if (error) throw error;
  return count || 0;
}
