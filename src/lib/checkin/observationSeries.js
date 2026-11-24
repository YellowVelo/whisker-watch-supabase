// One attribute's per-day chart states for the Trends cards, pulled out of
// getObservationTrend (trendsClient.js) so it can be tested on its own
// (spec 0080). The server's copy is attributeDaySeries in
// supabase/functions/_shared/checkinRules.ts (used by the Vet Report and
// the AI features); src/lib/aiServerParity.test.js runs the same cases
// through both and fails if they disagree.
//
// Per day, for each check-in row (in the order given, oldest first):
//   - status === 'skipped'                 -> 'skipped', count null
//   - any "Not observed" answer that day   -> 'not_observed', count null
//   - zero countable symptoms              -> 'normal', count 0
//   - 1+ countable symptoms                -> 'observed', count = n
// Observations on skipped check-ins are ignored. Days with no check-in row
// aren't in the output. Vibe (great/off/tough) is never read.
//
// `observations` must already be limited to the one attribute.
// `labelOf(value)` gives a symptom's display label; the labels come back
// per check-in so the card can describe today's symptoms.
import { BASELINE_VALUES, NOT_OBSERVED_VALUES } from './checkinClient';

export function observationDaySeries(checkIns, observations, labelOf = (value) => value) {
  const scorableIds = new Set(checkIns.filter((c) => c.status !== 'skipped').map((c) => c.id));
  const countsByCheckIn = {};
  const notObservedByCheckIn = {};
  const symptomLabelsByCheckIn = {};
  for (const obs of observations) {
    if (!scorableIds.has(obs.daily_check_in_id)) continue;
    if (obs.value == null) continue;
    if (NOT_OBSERVED_VALUES.has(obs.value)) { notObservedByCheckIn[obs.daily_check_in_id] = true; continue; }
    if (BASELINE_VALUES.has(obs.value)) continue;
    countsByCheckIn[obs.daily_check_in_id] = (countsByCheckIn[obs.daily_check_in_id] || 0) + 1;
    (symptomLabelsByCheckIn[obs.daily_check_in_id] ||= []).push(labelOf(obs.value));
  }

  const series = checkIns.map((c) => {
    if (c.status === 'skipped') return { date: c.check_in_date, state: 'skipped', count: null };
    if (notObservedByCheckIn[c.id]) return { date: c.check_in_date, state: 'not_observed', count: null };
    const count = countsByCheckIn[c.id] || 0;
    return { date: c.check_in_date, state: count > 0 ? 'observed' : 'normal', count };
  });

  return { series, symptomLabelsByCheckIn };
}
