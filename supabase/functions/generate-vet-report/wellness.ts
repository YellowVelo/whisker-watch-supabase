// Vet Report Wellness Overview data (spec 0080, FR15-FR17). Pure: check-ins
// and observations in, overview data out. No database, no PDF drawing.
// index.ts loads the rows and draws the result.
//
// Window: the last 30 days, ending today in the owner's time zone. The
// caller works out "today" with dateStrInTimezone (the owner's
// profiles.timezone) and passes it as `endDate`; the window starts 29 days
// earlier.
//
// Spec 0012 v5: Vibe (great/off/tough) and the symptom count never inform
// each other. The Vibe totals read only `status`; the attribute charts use
// attributeDaySeries, which reads `status` only to spot skipped days. So
// the same symptoms on a Great day and an Off day give the same chart.
// "Not observed" is never a symptom, and normal/baseline answers never
// count.

import {
  attributeDaySeries,
  COUNTED_ATTRIBUTES,
  dateStrInTimezone,
  isCountableSymptom,
  type CheckInRow,
  type ObservationRow,
} from '../_shared/checkinRules.ts';

export const WINDOW_DAYS = 30;

export interface WellnessObservation {
  daily_check_in_id: string;
  attribute: string; // observation_types.code, e.g. 'appetite'
  value: string | null;
  label: string | null; // observation_options.label for the value
}

export interface WellnessInput {
  endDate: string; // YYYY-MM-DD, today in the owner's time zone
  checkIns: readonly CheckInRow[];
  observations: readonly WellnessObservation[];
  attributeLabels: Readonly<Record<string, string>>; // code -> display label
}

export type WellnessDayState = 'normal' | 'observed' | 'skipped' | 'missing' | 'not_observed';

export interface WellnessDay {
  date: string;
  state: WellnessDayState;
  count: number | null; // symptom count for 'normal' (0) and 'observed' (1+), else null
}

export interface SymptomDays {
  label: string;
  days: number;
}

export interface AttributeOverview {
  code: string;
  label: string;
  days: WellnessDay[]; // 30 entries, oldest first
  symptoms: SymptomDays[]; // most days first, then label
}

export interface VibeTotals {
  great: number;
  off: number;
  tough: number;
  skipped: number;
  noCheckIn: number; // window days with no check-in row
  notRecorded: number; // rows with no status; show only when > 0
}

export interface WellnessOverview {
  startDate: string;
  endDate: string;
  dates: string[]; // 30 dates, oldest first
  vibe: VibeTotals;
  attributes: AttributeOverview[]; // COUNTED_ATTRIBUTES order, only those with a symptom
  noCheckIns: boolean; // "No daily check-ins were recorded in the last 30 days."
  noSymptoms: boolean; // check-ins exist, but "No symptoms were logged in the last 30 days."
}

function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${date}`);
  return new Date(ms + days * 86400000).toISOString().slice(0, 10);
}

// The 30 calendar dates ending on `endDate`, oldest first.
export function windowDates(endDate: string): string[] {
  const dates: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) dates.push(addDays(endDate, -i));
  return dates;
}

// The window's first and last dates, for the check-in query and the
// overview alike. The start is counted back in calendar days from today in
// the owner's time zone, not 29×24 hours of real time, so a daylight-saving
// change inside the window can't move it a day off the chart's first day.
export function overviewWindow(
  timezone: string | null | undefined,
  nowMs: number = Date.now(),
): { start: string; end: string } {
  const end = dateStrInTimezone(timezone, 0, nowMs);
  return { start: windowDates(end)[0], end };
}

export function buildWellnessOverview(input: WellnessInput): WellnessOverview {
  const dates = windowDates(input.endDate);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  // One row per pet per day (unique (pet_id, check_in_date)); anything
  // outside the window is dropped here.
  const inWindow = input.checkIns.filter((c) => c.check_in_date >= startDate && c.check_in_date <= endDate);
  const inWindowIds = new Set(inWindow.map((c) => c.id));

  const vibe: VibeTotals = { great: 0, off: 0, tough: 0, skipped: 0, noCheckIn: 0, notRecorded: 0 };
  for (const c of inWindow) {
    if (c.status === 'great') vibe.great++;
    else if (c.status === 'off') vibe.off++;
    else if (c.status === 'tough') vibe.tough++;
    else if (c.status === 'skipped') vibe.skipped++;
    else vibe.notRecorded++; // null (the database allows nothing else)
  }
  const datesWithRow = new Set(inWindow.map((c) => c.check_in_date));
  vibe.noCheckIn = dates.filter((d) => !datesWithRow.has(d)).length;

  const attributes: AttributeOverview[] = [];
  for (const code of COUNTED_ATTRIBUTES) {
    const attrObs = input.observations.filter((o) => o.attribute === code && inWindowIds.has(o.daily_check_in_id));
    const obsRows: ObservationRow[] = attrObs.map((o) => ({ daily_check_in_id: o.daily_check_in_id, value: o.value }));
    const series = attributeDaySeries(inWindow, obsRows);
    if (!series.some((p) => p.state === 'observed')) continue;

    const byDate = new Map(series.map((p) => [p.date, p]));
    const days: WellnessDay[] = dates.map((date) => {
      const p = byDate.get(date);
      return p ? { date, state: p.state, count: p.count } : { date, state: 'missing', count: null };
    });

    // Symptom labels, counted only on days the chart shows as 'observed',
    // so the list always agrees with the bars. A label logged twice on one
    // day counts once.
    const observedIds = new Set(
      inWindow.filter((c) => byDate.get(c.check_in_date)?.state === 'observed').map((c) => c.id),
    );
    const daysByLabel = new Map<string, Set<string>>();
    for (const o of attrObs) {
      if (!observedIds.has(o.daily_check_in_id) || !isCountableSymptom(o.value)) continue;
      const label = o.label || (o.value as string);
      let ids = daysByLabel.get(label);
      if (!ids) daysByLabel.set(label, (ids = new Set()));
      ids.add(o.daily_check_in_id);
    }
    const symptoms: SymptomDays[] = [...daysByLabel.entries()]
      .map(([label, ids]) => ({ label, days: ids.size }))
      .sort((a, b) => b.days - a.days || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

    attributes.push({ code, label: input.attributeLabels[code] || code, days, symptoms });
  }

  const noCheckIns = inWindow.length === 0;
  return {
    startDate,
    endDate,
    dates,
    vibe,
    attributes,
    noCheckIns,
    noSymptoms: !noCheckIns && attributes.length === 0,
  };
}
