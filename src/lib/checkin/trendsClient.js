// Trends screen data layer (Daily Check-In, Vibe & Trends spec v5). Same
// precedent as petProfileClient.js/checkinClient.js — batched/derived
// reads live here, never as direct Supabase calls inside components
// (Technical Standards).
//
// No numeric point-value system exists anymore — this fully reverses the
// prior Wellness Score V1 / Health Score V2 chart. Every chart here
// represents raw, unweighted symptom counts per attribute per day.
//
// Range -> lookback-day mapping. daily_check_ins is one row per calendar
// day, so a literal "24 hours" has no meaning; 24H is treated as a short
// trailing window for chart context, while the headline number/annotation
// always compares today vs. yesterday.
import { supabase } from '@/api/supabaseClient';
import { entities } from '@/api/entities';
import { invokeAI } from '@/api/aiClient';
import { loadObservationCatalog, BASELINE_VALUES, NOT_OBSERVED_VALUES } from './checkinClient';
import { PALETTE } from '@/lib/toneColors';
import { dateStrInTimezone } from '@/lib/timezone';

export const RANGE_DAYS = { '24H': 5, '7D': 7, '30D': 30, '90D': 90, '1Y': 365 };
export const RANGE_OPTIONS = ['24H', '7D', '30D', '90D', '1Y'];

// `timezone` is threaded through from the caller (PetTrends.jsx, via the
// signed-in user's stored timezone) so "today"/"yesterday" here agree with
// Home's — a plain UTC comparison would disagree with a check-in saved
// under the user's local date in the evening. Falls back to UTC
// (dateStrInTimezone's own default) if omitted.
const todayStr = (timezone) => dateStrInTimezone(timezone, 0);

function cutoffDateStr(days, timezone) {
  return dateStrInTimezone(timezone, -days);
}

// Shared by every ObservationCard, across all 11 counted categories (6
// Health + 5 Wellbeing) — per-day chart color/label is a count of distinct
// non-baseline, non-"Not Observed" symptoms logged that day, not a graded
// direction (spec Attribute Model: "no score of any kind").
export const SYMPTOM_COUNT_LABEL = { 0: 'Normal', 1: '1 Symptom', 2: '2+ Symptoms' };
export const SYMPTOM_COUNT_COLOR = { 0: PALETTE.gray, 1: PALETTE.amber, 2: PALETTE.red };

// Per-day states a chart must be able to render (spec Trends & Overview
// Charts): normal (0 symptoms), 1 symptom, 2+ symptoms, not observed
// (Water Intake/Bathroom only), skipped, no check-in (a date with no
// daily_check_ins row at all — a real gap, distinct from skipped).
async function fetchDailyCheckIns(petId, days, timezone) {
  const cutoff = cutoffDateStr(days, timezone);
  const checkIns = await entities.DailyCheckIn.filter({ pet_id: petId }, '-check_in_date', Math.max(days, 14));
  const hasAnyData = checkIns.length > 0;
  const inRange = checkIns.filter((c) => c.check_in_date >= cutoff).slice().reverse();
  return { hasAnyData, inRange };
}

// Behavioral observation trend, shared by every ObservationCard instance —
// one generic function for all 11 counted categories, not one per metric.
//
// Per-day state:
//   - no daily_check_ins row for that date -> "missing" (gap)
//   - status === 'skipped' -> "skipped" (visually distinct from missing)
//   - Water Intake/Bathroom logged "Not observed" -> "not_observed"
//     (distinct from both Normal and skipped/missing)
//   - a completed check-in with zero countable symptoms -> "normal"
//   - a completed check-in with 1+ countable symptoms -> a symptom count
export async function getObservationTrend(petId, code, range, timezone) {
  const days = RANGE_DAYS[range] ?? RANGE_DAYS['24H'];
  const { hasAnyData, inRange } = await fetchDailyCheckIns(petId, days, timezone);
  const catalog = await loadObservationCatalog();
  const entry = catalog[code];

  if (inRange.length === 0 || !entry) {
    return { hasAnyData, series: [], currentLabel: null, currentSubtitle: null };
  }

  const scorableIds = inRange.filter((c) => c.status !== 'skipped').map((c) => c.id);
  const countsByCheckIn = {};
  const notObservedByCheckIn = {};
  const symptomLabelsByCheckIn = {};
  if (scorableIds.length > 0) {
    const { data, error } = await supabase
      .from('observations')
      .select('daily_check_in_id, value')
      .in('daily_check_in_id', scorableIds)
      .eq('observation_type_id', entry.type.id);
    if (error) throw error;
    for (const obs of data) {
      if (obs.value == null) continue;
      if (NOT_OBSERVED_VALUES.has(obs.value)) { notObservedByCheckIn[obs.daily_check_in_id] = true; continue; }
      if (BASELINE_VALUES.has(obs.value)) continue;
      countsByCheckIn[obs.daily_check_in_id] = (countsByCheckIn[obs.daily_check_in_id] || 0) + 1;
      (symptomLabelsByCheckIn[obs.daily_check_in_id] ||= []).push(entry.optionsByValue[obs.value]?.label || obs.value);
    }
  }

  const series = inRange.map((c) => {
    if (c.status === 'skipped') return { date: c.check_in_date, state: 'skipped', count: null };
    if (notObservedByCheckIn[c.id]) return { date: c.check_in_date, state: 'not_observed', count: null };
    const count = countsByCheckIn[c.id] || 0;
    return { date: c.check_in_date, state: count > 0 ? 'observed' : 'normal', count };
  });

  // A stale in-range point must never be presented as today's current
  // state — same rule everywhere on this screen.
  const latest = series[series.length - 1];
  const isLatestToday = latest?.date === todayStr(timezone);
  const { currentLabel, currentSubtitle } = isLatestToday
    ? describeCurrentState(latest, symptomLabelsByCheckIn[inRange[inRange.length - 1]?.id])
    : { currentLabel: null, currentSubtitle: null };

  return { hasAnyData, series, currentLabel, currentSubtitle };
}

function describeCurrentState(latestPoint, symptomLabels) {
  if (!latestPoint || latestPoint.state === 'skipped') return { currentLabel: null, currentSubtitle: null };
  if (latestPoint.state === 'not_observed') return { currentLabel: 'Not Observed', currentSubtitle: null };
  if (latestPoint.count === 0) return { currentLabel: 'Normal', currentSubtitle: 'No change from usual' };
  const currentLabel = SYMPTOM_COUNT_LABEL[Math.min(2, latestPoint.count)];
  return { currentLabel, currentSubtitle: (symptomLabels || []).join(', ') || null };
}

// Combined Vomiting + Nausea panel (Health group) — both categories'
// per-day symptom counts, for the grouped chart style the Trends screen
// reverts to (spec: "Trends should revert to previous versions"). Kept in
// this data layer, not computed twice, by calling getObservationTrend once
// per category and zipping the results by date.
export async function getVomitingNauseaTrend(petId, range, timezone) {
  const [vomiting, nausea] = await Promise.all([
    getObservationTrend(petId, 'vomiting', range, timezone),
    getObservationTrend(petId, 'nausea', range, timezone),
  ]);
  const hasAnyData = vomiting.hasAnyData || nausea.hasAnyData;
  const nauseaByDate = Object.fromEntries(nausea.series.map((p) => [p.date, p]));
  const series = vomiting.series.map((v) => ({
    date: v.date,
    vomiting: v,
    nausea: nauseaByDate[v.date] || { state: 'missing', count: null },
  }));
  return { hasAnyData, series, vomiting, nausea };
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

// One-paragraph Insight Summary, built from the already-fetched trend data
// for the other cards (no extra queries). Returns null when there isn't
// enough underlying history to say anything meaningful. Throws on AI
// failure so the card can show "Insights unavailable." while every other
// card keeps working. No score of any kind is passed to the model — only
// the same symptom-count/Not-Observed/Weight descriptions the cards show.
export async function getInsightSummary(petId, petName, { appetite, waterIntake, energy, weight }) {
  // Require at least 2 *scorable* check-ins (not skipped) — two skipped
  // days shouldn't be enough to justify a live LLM call with nothing but
  // "No Data" for every field.
  const recentCheckIns = await entities.DailyCheckIn.filter({ pet_id: petId }, '-check_in_date', 10);
  const scorableCount = recentCheckIns.filter((c) => c.status !== 'skipped').length;
  if (scorableCount < 2) return null;

  const describe = (label, obs) => `${label}: ${obs?.currentLabel || 'No Data'}${obs?.currentSubtitle ? ` (${obs.currentSubtitle})` : ''}`;
  const context = [
    `Pet: ${petName}`,
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
