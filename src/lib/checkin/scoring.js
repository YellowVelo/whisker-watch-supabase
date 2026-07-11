// Wellness Score V1 — pure, deterministic scoring logic, kept separate
// from any UI component per the spec ("Keep scoring logic separate from
// UI components", "Keep score calculations explainable and deterministic").
//
// This module never talks to Supabase; callers pass in plain data
// (observations for the day, recent wellness_scores rows) and get back
// plain results.
//
// Health Score V2 (computeHealthScore and below) lives in this same file
// rather than a parallel module — same "pure, deterministic, no Supabase"
// contract, just a different formula and a smaller, fixed attribute set.
// The V1 functions above are retained unchanged: they still back the
// legacy 0-100 `wellness_scores.score`/`trend` columns, which continue to
// drive the Pet Profile Wellness Summary rings (out of scope for V2).

import { HEALTH_SCORE_ATTRIBUTES, getCategory } from './config';

// A normal or changed day always starts at 100 and loses points for
// deviations. A skipped day produces no score at all (caller must not
// call computeDayScore for a skipped day).
const STARTING_SCORE = 100;

export function computeDayScore(observations = []) {
  const totalDeduction = observations
    .filter((o) => o.severity_score != null && o.severity_score < 0)
    .reduce((sum, o) => sum + o.severity_score, 0);

  return Math.max(0, Math.min(100, STARTING_SCORE + totalDeduction));
}

export function scoreLabel(score) {
  if (score == null) return null;
  if (score >= 90) return 'Stable';
  if (score >= 75) return 'Monitor';
  if (score >= 60) return 'Review today';
  return 'Significant changes logged';
}

// Plain-language explanation naming the categories that pulled the score
// down, e.g. "Harper's score is lower today because appetite and energy
// were below normal." Never uses clinical or alarming language.
//
// `reasonSummary` is the comma-joined list of category labels persisted
// in wellness_scores.score_reason_summary (see checkinClient.js) — reusing
// the same string that's already stored, rather than a separate shape,
// keeps "what's stored" and "what's explained" the same source of truth.
export function explainScore(petName, score, reasonSummary) {
  if (score == null) return null;
  if (score >= 100 || !reasonSummary) {
    return `${petName} had a normal day — no changes logged.`;
  }
  const labels = reasonSummary.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (labels.length === 0) {
    return `${petName}'s score reflects changes logged today.`;
  }
  const joined = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `${petName}'s score is lower today because ${joined} ${labels.length === 1 ? 'was' : 'were'} below normal.`;
}

// Trend is calculated from recent wellness_scores history (most-recent
// first), independent of any single day's score. `recentScores` should be
// check-in-date descending wellness_scores rows (skipped days won't have
// a row and are simply absent from this list — never treated as normal).
export function computeTrend(recentScores = []) {
  const scored = recentScores.filter((s) => s.score != null);
  if (scored.length < 3) return 'unknown';

  const [latest, ...rest] = scored;
  const priorAvg = rest.slice(0, 4).reduce((sum, s) => sum + s.score, 0) / Math.min(rest.length, 4);
  const delta = latest.score - priorAvg;

  const recentSignificantDrop = scored.slice(0, 3).some((s) => s.score < 60);
  const repeatedModerateDip = scored.slice(0, 3).filter((s) => s.score < 90).length >= 2;

  if (recentSignificantDrop || delta <= -15) return 'declining';
  if (repeatedModerateDip || delta <= -5) return 'monitor';
  if (delta >= 5) return 'improving';
  return 'stable';
}

// ============================================================
// Health Score V2
// ============================================================

const HEALTH_SCORE_STARTING_SCORE = 10;
const HEALTH_SCORE_MAX_PER_ATTRIBUTE = 2;

// Only these codes may ever deduct from the Health Score (spec §6.3).
// Imported from config.js rather than redeclared, so there is exactly one
// place that defines "which attributes are Health Attributes".
const HEALTH_SCORE_ATTRIBUTE_SET = new Set(HEALTH_SCORE_ATTRIBUTES);

// `symptomCounts` — { [code]: count } — count is the number of distinct
// non-baseline symptoms selected for that Health Attribute today (multi-
// select: an attribute can have 0, 1, or more symptoms logged the same
// day). Every symptom carries equal weight (product decision — these are
// owner-observed, not clinically graded); each attribute's own deduction
// is capped at HEALTH_SCORE_MAX_PER_ATTRIBUTE regardless of how many
// symptoms were logged for it.
export function computeHealthScore(symptomCounts = {}) {
  const deductionsByAttribute = {};

  for (const code of HEALTH_SCORE_ATTRIBUTE_SET) {
    const count = symptomCounts[code] || 0;
    if (count <= 0) continue;
    deductionsByAttribute[code] = Math.min(HEALTH_SCORE_MAX_PER_ATTRIBUTE, count);
  }

  const totalDeduction = Object.values(deductionsByAttribute).reduce((sum, d) => sum + d, 0);
  const score = Math.max(0, Math.min(HEALTH_SCORE_STARTING_SCORE, HEALTH_SCORE_STARTING_SCORE - totalDeduction));

  const reasonSummary = Object.keys(deductionsByAttribute)
    .map((code) => getCategory(code)?.label || code)
    .join(', ') || null;

  return { score, totalDeduction, deductionsByAttribute, reasonSummary };
}

// Resolves what a single attribute's state was on a given day. `status` is
// the daily_check_ins.status for that date ('normal' | 'changed' |
// 'skipped' | undefined/null for no row at all). `count` is the number of
// distinct non-baseline symptoms logged for this attribute that day (0 for
// a confirmed-normal day/attribute).
export function resolveDailyAttributeCount({ status, count = 0 }) {
  if (!status || status === 'skipped') return { count: null, known: false };
  return { count, known: true };
}

// Direction describes movement only — never medical interpretation.
// Fewer symptoms today than yesterday = up (better); more = down (worse);
// same count = equal. Unknown whenever either day isn't actually known.
export function computeAttributeDirection(todayState, yesterdayState) {
  if (!todayState?.known || !yesterdayState?.known) return 'unknown';
  if (todayState.count < yesterdayState.count) return 'up';
  if (todayState.count > yesterdayState.count) return 'down';
  return 'equal';
}

// Compares today's Health Score to the immediately preceding calendar
// day only — never skips backward to manufacture a comparison (spec
// §8.4). Both days must be completed and non-skipped, with a real score.
export function computeHealthScoreDirection(todayScore, yesterdayScore, todayStatus, yesterdayStatus) {
  if (todayScore == null || yesterdayScore == null) return 'unknown';
  if (!todayStatus || todayStatus === 'skipped') return 'unknown';
  if (!yesterdayStatus || yesterdayStatus === 'skipped') return 'unknown';
  if (todayScore > yesterdayScore) return 'up';
  if (todayScore < yesterdayScore) return 'down';
  return 'equal';
}

// Weight is compared to the previous logged entry, not necessarily
// yesterday (spec §4.4/§13.4) — a missing value is never treated as 0.
export function computeWeightDirection(latestWeight, previousWeight) {
  if (latestWeight == null || previousWeight == null) return 'unknown';
  if (latestWeight > previousWeight) return 'up';
  if (latestWeight < previousWeight) return 'down';
  return 'equal';
}
