// Pet Profile data layer. Same precedent as checkinClient.js/petsClient.js:
// batched/derived reads the UI needs live here, never as direct Supabase
// calls inside PetProfile.jsx (Technical Standards — never query Supabase
// directly from UI components).
//
// The retired Wellness/Appetite/Energy/Symptoms ring scores (computed
// here at read time from computeDayScore/computeTrend) are gone along
// with the 5-ring row itself. Weight reads moved to src/lib/weightClient.js
// (spec 0081).

import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';
import { getObservationValuesForCheckIns } from './checkinClient';
import { COUNTED_CATEGORIES, getCategory } from './config';
import { getChipState } from './chipLabels';

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
// Old symptom logs (the retired Symptoms page's records, spec 0081 FR14)
// aren't listed: their content now lives in check-ins, shown below.
export async function getTimelineEvents(petId, limit = 200) {
  const [checkIns, medications, vaccinations] = await Promise.all([
    entities.DailyCheckIn.filter({ pet_id: petId }, '-check_in_date', limit),
    entities.Medication.filter({ pet_id: petId }, '-start_date', limit),
    entities.Vaccination.filter({ pet_id: petId }, '-date_given', limit),
  ]);

  const events = [
    // 'great'/'off'/'tough'/'skipped' — the enum migration 0026 introduced.
    // Previously checked against 'normal', a retired value, which meant
    // every non-skipped check-in mislabeled as "changes logged" here, even
    // Great Days (fixed alongside the History→Timeline merge, spec 0023
    // step 10, since it's the exact line this work already touches).
    ...checkIns.map((c) => ({
      id: `checkin-${c.id}`, date: c.check_in_date, type: 'check_in',
      title: c.status === 'great' ? 'Daily check-in — everything normal' : c.status === 'skipped' ? 'Daily check-in skipped' : 'Daily check-in — changes logged',
    })),
    ...medications.filter((m) => m.start_date).map((m) => ({
      id: `med-${m.id}`, date: m.start_date, type: 'medication', title: `Started ${m.name}`,
    })),
    ...vaccinations.filter((v) => v.date_given).map((v) => ({
      id: `vax-${v.id}`, date: v.date_given, type: 'vaccination', title: `${v.vaccine_name} administered`,
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
