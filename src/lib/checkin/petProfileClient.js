// Pet Profile data layer. Same precedent as checkinClient.js/petsClient.js:
// batched/derived reads the UI needs live here, never as direct Supabase
// calls inside PetProfile.jsx (Technical Standards — never query Supabase
// directly from UI components).
//
// Appetite/Energy/Symptoms/Weight "scores" shown on Pet Profile are NOT
// persisted anywhere (Data Model §3.19: wellness_scores only stores one
// total score per day). They're computed here at read time from the same
// `observations` rows and the same computeDayScore/computeTrend helpers
// Wellness Score uses, just narrowed to a category subset, per the
// Feature Spec's "derive computed values ... rather than persisting
// redundant values."

import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';
import { computeDayScore, computeTrend } from './scoring';
import { loadObservationCatalog } from './checkinClient';

// "Symptoms" rolls up every Daily Check-In category except the ones with
// their own ring (appetite/energy) or no ring (weight/other) — mirrors
// the Pets screen's LOG_SLOTS grouping but combined into a single score.
const SYMPTOM_CATEGORY_CODES = ['vomiting', 'bathroom', 'stool', 'breathing', 'itching', 'behavior', 'medication_exception'];
const RING_GROUPS = { appetite: ['appetite'], energy: ['energy'], symptoms: SYMPTOM_CATEGORY_CODES };

const TREND_STATUS_LABEL = { stable: 'Stable', improving: 'Improving', monitor: 'Monitor', declining: 'Lower', unknown: null };

const todayStr = () => new Date().toISOString().split('T')[0];

// Single fetch of the pet's recent daily_check_ins + observations, then
// scored per ring group client-side — one round trip total instead of one
// per ring (three separate DailyCheckIn + observations fetches, all
// fetching the same underlying check-ins). Mirrors the Wellness ring's own
// "only show a value if it's actually today's" rule (Data Model §3.19 has
// no concept of a stale-but-still-shown score) — a ring whose most recent
// scorable day isn't today reports no data rather than silently surfacing
// a days-old number next to a Wellness ring that would show "No Data" for
// the same gap.
export async function getWellnessRingScores(petId, days = 14) {
  const empty = { score: null, statusLabel: null };
  const result = { appetite: empty, energy: empty, symptoms: empty };

  const [catalog, checkIns] = await Promise.all([
    loadObservationCatalog(),
    entities.DailyCheckIn.filter({ pet_id: petId }, '-check_in_date', days),
  ]);
  const scorableCheckIns = checkIns.filter((c) => c.status !== 'skipped');
  if (scorableCheckIns.length === 0) return result;

  const allTypeIds = [...new Set(Object.values(RING_GROUPS).flat().map((code) => catalog[code]?.type.id).filter(Boolean))];
  const checkInIds = scorableCheckIns.map((c) => c.id);
  const { data, error } = await supabase
    .from('observations')
    .select('daily_check_in_id, observation_type_id, severity_score')
    .in('daily_check_in_id', checkInIds)
    .in('observation_type_id', allTypeIds);
  if (error) throw error;

  const byCheckIn = {};
  for (const obs of data) (byCheckIn[obs.daily_check_in_id] ||= []).push(obs);

  const isToday = scorableCheckIns[0].check_in_date === todayStr();

  for (const [ring, codes] of Object.entries(RING_GROUPS)) {
    const typeIds = new Set(codes.map((code) => catalog[code]?.type.id).filter(Boolean));
    const series = scorableCheckIns.map((c) => ({
      check_in_date: c.check_in_date,
      score: computeDayScore((byCheckIn[c.id] || []).filter((o) => typeIds.has(o.observation_type_id))),
    }));
    if (!isToday) continue; // leave as `empty` — no scorable check-in today
    const trend = computeTrend(series);
    result[ring] = { score: series[0].score, statusLabel: TREND_STATUS_LABEL[trend] };
  }

  return result;
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
