// Server copy of the app's daily check-in counting rules (spec 0080,
// Before You Approve item 3). Edge Functions can't read the app's files, so
// the Vet Report and the AI features use this copy. The lists here must
// match the app's:
//   - COUNTED_ATTRIBUTES      = src/lib/checkin/config.js COUNTED_CATEGORIES
//   - BASELINE_VALUES /
//     NOT_OBSERVED_VALUES     = src/lib/checkin/checkinClient.js
//   - attributeDaySeries()    = observationDaySeries() in
//                               src/lib/checkin/observationSeries.js (the
//                               Trends cards' per-day rules)
//   - dateStrInTimezone()     = src/lib/timezone.js
// src/lib/aiServerParity.test.js fails if the lists or the per-day rules
// drift apart.
// supabase/tests/checkin_rules.test.ts tests the counting and date code.
//
// No imports on purpose, so Vitest (under Node) can load this file too.
//
// Spec 0012 v5: the symptom count never looks at the day's Vibe
// (great/off/tough). The only status this code reads is `skipped`.

// The 11 categories that get an explicit row every completed day and feed
// the daily symptom count: 6 Health, then 5 Wellbeing.
export const HEALTH_ATTRIBUTES: readonly string[] = [
  'appetite',
  'water_intake',
  'bathroom',
  'stool',
  'vomiting',
  'nausea',
];

export const WELLBEING_ATTRIBUTES: readonly string[] = [
  'energy',
  'mobility',
  'breathing',
  'itching',
  'behavior',
];

export const COUNTED_ATTRIBUTES: readonly string[] = [...HEALTH_ATTRIBUTES, ...WELLBEING_ATTRIBUTES];

// "No change from normal" answers. Never a symptom.
export const BASELINE_VALUES: ReadonlySet<string> = new Set(['normal', 'none', 'no_change']);

// "Not observed" (Water, Bathroom): a real answer, distinct from Normal.
// Never a symptom, and never merged into BASELINE_VALUES.
export const NOT_OBSERVED_VALUES: ReadonlySet<string> = new Set(['not_observed']);

export function isCountableSymptom(value: string | null | undefined): boolean {
  return value != null && !BASELINE_VALUES.has(value) && !NOT_OBSERVED_VALUES.has(value);
}

export interface CheckInRow {
  id: string;
  check_in_date: string; // YYYY-MM-DD
  status: string | null; // great | off | tough | skipped
}

export interface ObservationRow {
  daily_check_in_id: string;
  value: string | null;
}

export type DayState = 'skipped' | 'not_observed' | 'normal' | 'observed';

export interface DayPoint {
  date: string;
  state: DayState;
  count: number | null;
}

// One attribute's per-day series, same rules as getObservationTrend:
//   - skipped check-in                       -> 'skipped', count null
//   - any "Not observed" answer that day     -> 'not_observed', count null
//   - zero countable symptoms                -> 'normal', count 0
//   - 1+ countable symptoms                  -> 'observed', count = n
// `observations` must already be limited to the one attribute. Observations
// on skipped check-ins are ignored (the app never fetches them). Days with
// no check-in row at all aren't in the output; the caller decides how to
// show those gaps. Output is oldest first.
export function attributeDaySeries(
  checkIns: readonly CheckInRow[],
  observations: readonly ObservationRow[],
): DayPoint[] {
  const scorableIds = new Set(checkIns.filter((c) => c.status !== 'skipped').map((c) => c.id));
  const counts: Record<string, number> = {};
  const notObserved: Record<string, boolean> = {};
  for (const obs of observations) {
    if (!scorableIds.has(obs.daily_check_in_id)) continue;
    if (obs.value == null) continue;
    if (NOT_OBSERVED_VALUES.has(obs.value)) { notObserved[obs.daily_check_in_id] = true; continue; }
    if (BASELINE_VALUES.has(obs.value)) continue;
    counts[obs.daily_check_in_id] = (counts[obs.daily_check_in_id] || 0) + 1;
  }

  const ordered = [...checkIns].sort((a, b) => (a.check_in_date < b.check_in_date ? -1 : a.check_in_date > b.check_in_date ? 1 : 0));
  return ordered.map((c): DayPoint => {
    if (c.status === 'skipped') return { date: c.check_in_date, state: 'skipped', count: null };
    if (notObserved[c.id]) return { date: c.check_in_date, state: 'not_observed', count: null };
    const count = counts[c.id] || 0;
    return { date: c.check_in_date, state: count > 0 ? 'observed' : 'normal', count };
  });
}

// Timezone date helpers, same behavior as src/lib/timezone.js: the
// calendar date (YYYY-MM-DD) in an IANA timezone, falling back to UTC for
// a missing or invalid zone. `nowMs` defaults to the current time.
const SAFE_TIMEZONE = 'UTC';

export function isValidIanaTimezone(timezone: unknown): timezone is string {
  if (!timezone || typeof timezone !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function dateStrForInstant(instant: Date | number, timezone: string | null | undefined): string {
  const tz = isValidIanaTimezone(timezone) ? timezone : SAFE_TIMEZONE;
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export function dateStrInTimezone(
  timezone: string | null | undefined,
  offsetDays = 0,
  nowMs: number = Date.now(),
): string {
  return dateStrForInstant(new Date(nowMs + offsetDays * 86400000), timezone);
}
