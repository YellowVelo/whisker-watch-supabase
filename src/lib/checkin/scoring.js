// Daily Check-In, Vibe & Trends (spec v5) — pure, deterministic helpers,
// kept separate from any UI component. This module never talks to
// Supabase; callers pass in plain data and get back plain results.
//
// This replaces every prior scoring system (Wellness Score V1's
// computeDayScore/computeTrend/scoreLabel/explainScore, Health Score V2's
// computeHealthScore/computeHealthScoreDirection). No score of any kind is
// computed here or anywhere else in the app — see Core Model, Business
// Rules: "No severity or graded weighting is used anywhere in this model."
//
// computeAttributeDirection survives unchanged and is now reused at two
// granularities: per-attribute chips (as before) and the new aggregate
// Symptom Count direction (spec: "same function, called at two
// granularities, not two implementations").

// `symptomCounts` — { [code]: count } — count is the number of distinct
// non-baseline, non-"Not Observed" symptoms selected for that category
// today. Sums across all 11 counted categories (spec Core Model II).
export function computeSymptomCount(symptomCounts = {}) {
  return Object.values(symptomCounts).reduce((sum, n) => sum + (n || 0), 0);
}

// Resolves what a single attribute's state was on a given day. `status` is
// the daily_check_ins.status for that date ('great' | 'off' | 'tough' |
// 'skipped' | null/undefined for no row, or a legacy migrated day with no
// Vibe recorded). `count` is the number of distinct non-baseline symptoms
// logged for this attribute that day (0 for a confirmed-normal day).
//
// A migrated day (status null but a real symptom_count on the check-in)
// is still "known" for direction purposes — the objective count is real
// and comparable even though no Vibe was recorded (spec Migration Plan:
// "independent of the missing Vibe"). Only a genuinely absent check-in or
// an explicitly skipped one is unknown.
export function resolveDailyAttributeCount({ status, hasCheckIn = !!status, count = 0 }) {
  if (!hasCheckIn || status === 'skipped') return { count: null, known: false };
  return { count, known: true };
}

// Direction describes movement only — never medical interpretation, never
// a score. Fewer symptoms today than yesterday = up (better); more = down
// (worse); same count = equal. Unknown whenever either day isn't known.
export function computeAttributeDirection(todayState, yesterdayState) {
  if (!todayState?.known || !yesterdayState?.known) return 'unknown';
  if (todayState.count < yesterdayState.count) return 'up';
  if (todayState.count > yesterdayState.count) return 'down';
  return 'equal';
}

// Weight is compared to the previous logged entry, not necessarily
// yesterday — a missing value is never treated as 0.
export function computeWeightDirection(latestWeight, previousWeight) {
  if (latestWeight == null || previousWeight == null) return 'unknown';
  if (latestWeight > previousWeight) return 'up';
  if (latestWeight < previousWeight) return 'down';
  return 'equal';
}
