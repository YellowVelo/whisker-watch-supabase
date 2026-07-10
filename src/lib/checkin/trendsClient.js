// Trends screen data layer (Feature Spec: Trends). Same precedent as
// petProfileClient.js/checkinClient.js — batched/derived reads live here,
// never as direct Supabase calls inside components (Technical Standards).
//
// Range -> lookback-day mapping. wellness_scores/daily_check_ins are one
// row per calendar day, so a literal "24 hours" has no meaning; 24H is
// treated as a short trailing window for chart context, while the
// headline number/annotation always compares today vs. yesterday.
import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';
import { invokeAI } from '@/api/aiClient';
import { computeTrend, computeHealthScoreDirection } from './scoring';
import { loadObservationCatalog } from './checkinClient';
import { getCategory } from './config';
import { PALETTE } from '@/lib/toneColors';
import { dateStrInTimezone } from '@/lib/timezone';

export const RANGE_DAYS = { '24H': 5, '7D': 7, '30D': 30, '90D': 90, '1Y': 365 };
export const RANGE_OPTIONS = ['24H', '7D', '30D', '90D', '1Y'];

// `timezone` is threaded through from the caller (PetTrends.jsx, via the
// signed-in user's stored timezone) so "today"/"yesterday" here agree with
// Home's — a plain UTC comparison would disagree with a check-in saved
// under the user's local date in the evening (spec §24: "Daily date
// boundaries must use the user's stored timezone, not UTC midnight").
// Falls back to UTC (dateStrInTimezone's own default) if omitted.
const todayStr = (timezone) => dateStrInTimezone(timezone, 0);

function cutoffDateStr(days, timezone) {
  return dateStrInTimezone(timezone, -days);
}

// Behavioral scale shared by every ObservationCard (Appetite/Water
// Intake/Energy), per the spec's 5-point legend (Much More/More/Normal/
// Less/Much Less) and semantic colors (green=above baseline, gray=
// baseline, amber=below, red=significantly below). Derived from each
// option's *value* rather than its severity_score, since severity_score
// only encodes deductions (negative changes) — an "ate more"/"higher than
// usual" option carries no deduction but is still a real deviation the
// legend needs to show as green, not gray.
export const OBSERVATION_LEVELS = {
  appetite: { normal: 0, ate_little_less: -1, ate_much_less: -2, did_not_eat: -2, ate_more: 1 },
  water_intake: { normal: 0, less_than_usual: -1, more_than_usual: 1, much_more_than_usual: 2 },
  energy: { normal: 0, slightly_lower: -1, much_lower: -2, higher_than_usual: 1 },
};
export const LEVEL_LABEL = { '-2': 'Much Less', '-1': 'Less', 0: 'Normal', 1: 'More', 2: 'Much More' };
export const LEVEL_COLOR = { '-2': PALETTE.red, '-1': PALETTE.amber, 0: PALETTE.gray, 1: PALETTE.teal, 2: PALETTE.teal };

// Health Score V2 card + chart (spec §22). `series` is oldest-first for
// charting and only ever includes V2-scored rows (health_score_version ===
// 'health_score_v2') — legacy 0-100 rows are never mixed into this line,
// even though they live in the same `wellness_scores` table (spec §12.4:
// "Begin the V2 Health Score chart on the first V2 score date" / "Do not
// mix legacy 0-100 and V2 0-10 values in one chart line").
export async function getWellnessScoreTrend(petId, range, timezone) {
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['24H'];
  const rows = await entities.WellnessScore.filter({ pet_id: petId }, '-check_in_date', Math.max(days, 14));
  const v2Rows = rows.filter((r) => r.health_score_version === 'health_score_v2' && r.health_score != null);
  const hasAnyData = v2Rows.length > 0;
  const cutoff = cutoffDateStr(days, timezone);
  const inRange = v2Rows.filter((r) => r.check_in_date >= cutoff).slice().reverse();

  if (inRange.length === 0) {
    return { hasAnyData, series: [], current: null, max: 10, direction: 'unknown', directionReason: hasAnyData ? null : 'no_checkin_today' };
  }

  // "Current"/"Today" values only surface when the most recent row is
  // actually dated today — mirrors the existing, deliberate rule in
  // getWellnessRingScores (petProfileClient.js): a stale score from a
  // missed check-in must never be presented as today's, per Product
  // Principle 10 ("Honest Uncertainty"). The chart's `series` still shows
  // whatever history exists in range regardless — only the "current"
  // headline is gated.
  const latest = v2Rows[0];
  const isLatestToday = latest.check_in_date === todayStr(timezone);
  if (!isLatestToday) {
    return { hasAnyData, series: inRange.map((r) => ({ date: r.check_in_date, value: r.health_score })), current: null, max: 10, direction: 'unknown', directionReason: 'no_checkin_today' };
  }

  const yesterdayCutoff = cutoffDateStr(1, timezone);
  const yesterdayRow = v2Rows.find((r) => r.check_in_date === yesterdayCutoff);
  const direction = computeHealthScoreDirection(latest.health_score, yesterdayRow?.health_score ?? null, 'normal', yesterdayRow ? 'normal' : null);
  let directionReason = null;
  if (direction === 'unknown') {
    // `rows` is bounded to Math.max(days, 14) entries, so "no V2 row for
    // yesterday in that window" doesn't by itself distinguish a genuinely
    // first-ever scored day (spec: "First day logged") from a pet with
    // real but sparse history further back (spec: "Not enough data") — a
    // single targeted existence check resolves it rather than trusting
    // the bounded window's row count.
    const { data: earlierRows, error: earlierError } = await supabase
      .from('wellness_scores')
      .select('id')
      .eq('pet_id', petId)
      .eq('health_score_version', 'health_score_v2')
      .lt('check_in_date', latest.check_in_date)
      .limit(1);
    if (earlierError) throw earlierError;
    directionReason = earlierRows.length > 0 ? 'missing_yesterday' : 'first_day';
  }

  return {
    hasAnyData,
    series: inRange.map((r) => ({ date: r.check_in_date, value: r.health_score })),
    current: latest.health_score,
    max: 10,
    direction,
    directionReason,
  };
}

// Behavioral observation trend (Appetite / Water Intake / Energy), shared
// by every ObservationCard instance — one generic function, not one per
// metric (Product Principle 19/20).
//
// Per-day state, per Product Principle 6 ("Missing Data Is Meaningful"):
//   - no daily_check_ins row for that date -> "missing" (gap)
//   - status === 'skipped' -> "skipped" (visually distinct from missing)
//   - a scorable check-in with no observation for this code -> "normal"/baseline
//   - a scorable check-in with an observation for this code -> that option's bucket
export async function getObservationTrend(petId, code, range, timezone) {
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['24H'];
  const category = getCategory(code);
  const cutoff = cutoffDateStr(days, timezone);

  const [catalog, checkIns] = await Promise.all([
    loadObservationCatalog(),
    entities.DailyCheckIn.filter({ pet_id: petId }, '-check_in_date', Math.max(days, 14)),
  ]);
  const hasAnyData = checkIns.length > 0;

  const entry = catalog[code];
  const inRange = checkIns.filter((c) => c.check_in_date >= cutoff).slice().reverse();

  if (inRange.length === 0 || !entry) {
    return { hasAnyData, series: [], currentLabel: null, currentSubtitle: null };
  }

  const scorableIds = inRange.filter((c) => c.status !== 'skipped').map((c) => c.id);
  let observationsByCheckIn = {};
  if (scorableIds.length > 0) {
    const { data, error } = await supabase
      .from('observations')
      .select('daily_check_in_id, value, severity_score')
      .in('daily_check_in_id', scorableIds)
      .eq('observation_type_id', entry.type.id);
    if (error) throw error;
    for (const obs of data) observationsByCheckIn[obs.daily_check_in_id] = obs;
  }

  const levels = OBSERVATION_LEVELS[code] || {};
  const series = inRange.map((c) => {
    if (c.status === 'skipped') return { date: c.check_in_date, state: 'skipped', value: null, level: null };
    const obs = observationsByCheckIn[c.id];
    if (!obs || obs.value == null) return { date: c.check_in_date, state: 'normal', value: 'normal', level: 0 };
    const level = levels[obs.value] ?? 0;
    return { date: c.check_in_date, state: 'observed', value: obs.value, level };
  });

  // Same "must actually be today" rule as getWellnessScoreTrend — a stale
  // in-range point must never be presented as today's current state.
  const latest = series[series.length - 1];
  const isLatestToday = latest?.date === todayStr(timezone);
  const { currentLabel, currentSubtitle } = isLatestToday
    ? describeCurrentState(category, entry, latest)
    : { currentLabel: null, currentSubtitle: null };

  return { hasAnyData, series, currentLabel, currentSubtitle };
}

function describeCurrentState(category, catalogEntry, latestPoint) {
  if (!latestPoint || latestPoint.state === 'skipped') return { currentLabel: null, currentSubtitle: null };
  if (latestPoint.state === 'normal') return { currentLabel: 'Normal', currentSubtitle: 'No change from usual' };

  const option = catalogEntry.optionsByValue?.[latestPoint.value];
  const optionLabel = option?.label || category?.options?.find((o) => o.value === latestPoint.value)?.label || 'No Data';
  const currentLabel = LEVEL_LABEL[latestPoint.level] || 'Normal';
  return { currentLabel, currentSubtitle: optionLabel };
}

// Weight card + chart, from symptom_logs.weight_grams — the only place
// weight is written (Data Model §3.8). Delta compares the two most recent
// entries (no true baseline exists yet), same documented limitation as
// the existing Pet Profile Weight card.
export async function getWeightTrend(petId, range, timezone) {
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['24H'];
  const logs = await entities.SymptomLog.filter({ pet_id: petId }, '-date', 400);
  const hasAnyData = logs.some((l) => l.weight_grams != null);
  const cutoff = cutoffDateStr(days, timezone);

  const toLbs = (grams) => Math.round((grams / 453.59237) * 10) / 10;
  const withWeight = logs
    .filter((l) => l.weight_grams != null && l.date >= cutoff)
    .slice()
    .reverse();

  if (withWeight.length === 0) {
    return { hasAnyData, series: [], currentLbs: null, deltaLbs: null };
  }

  const series = withWeight.map((l) => ({ date: l.date, value: toLbs(l.weight_grams) }));
  const currentLbs = series[series.length - 1].value;
  const deltaLbs = series.length >= 2 ? currentLbs - series[series.length - 2].value : null;

  return { hasAnyData, series, currentLbs, deltaLbs };
}

// One-paragraph Insight Summary, built from the already-fetched trend
// data for the other four cards (no extra queries). Returns null when
// there isn't enough underlying history to say anything meaningful, so
// the card can show "Complete more check-ins to unlock AI insights."
// instead of calling the AI. Throws on AI failure so the card can show
// "Insights unavailable." while every other card keeps working.
export async function getInsightSummary(petId, petName, { wellness, appetite, waterIntake, energy, weight }) {
  // Require at least 2 *scorable* check-ins (not skipped) — two skipped
  // days shouldn't be enough to justify a live LLM call with nothing but
  // "No Data" for every field.
  const recentCheckIns = await entities.DailyCheckIn.filter({ pet_id: petId }, '-check_in_date', 10);
  const scorableCount = recentCheckIns.filter((c) => c.status !== 'skipped').length;
  if (scorableCount < 2) return null;

  const describe = (label, obs) => `${label}: ${obs?.currentLabel || 'No Data'}${obs?.currentSubtitle ? ` (${obs.currentSubtitle})` : ''}`;
  const context = [
    `Pet: ${petName}`,
    `Health Score: ${wellness?.current ?? 'No Data'} / 10`,
    describe('Appetite', appetite),
    describe('Water Intake', waterIntake),
    describe('Energy', energy),
    `Weight: ${weight?.currentLbs ?? 'No Data'} lbs${weight?.deltaLbs != null ? ` (${weight.deltaLbs > 0 ? '+' : ''}${weight.deltaLbs} lbs vs. previous entry)` : ''}`,
  ].join('\n');

  const result = await invokeAI({
    prompt: `You are summarizing recorded pet health observations for an owner, not diagnosing anything. Based only on the data below, write exactly one short paragraph (2-3 sentences) describing what has changed recently for ${petName}. Never diagnose, recommend treatment, or create alarm — describe observations only.

${context}

Respond in JSON: { "summary": "..." }`,
    response_json_schema: { type: 'object', properties: { summary: { type: 'string' } } },
  });

  return result?.summary || null;
}
