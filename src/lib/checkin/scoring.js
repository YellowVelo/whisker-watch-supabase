// Wellness Score V1 — pure, deterministic scoring logic, kept separate
// from any UI component per the spec ("Keep scoring logic separate from
// UI components", "Keep score calculations explainable and deterministic").
//
// This module never talks to Supabase; callers pass in plain data
// (observations for the day, recent wellness_scores rows) and get back
// plain results.

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
