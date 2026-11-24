// Vet Report Wellness Overview wording (spec 0080, "Wording for your
// approval" B, approved by Lynn 2026-11-23). Pure text helpers so the exact
// approved strings are unit-tested (supabase/tests/vet_report_wellness.test.ts)
// without drawing a PDF. index.ts draws them.

import type { SymptomDays, VibeTotals } from './wellness.ts';

export const OVERVIEW_HEADING = 'Wellness Overview';
export const VIBE_LABEL = 'How the days went';
export const VIBE_NOTE = " (the owner's own daily rating): ";
export const SYMPTOMS_LABEL = 'Symptoms logged';
export const SYMPTOMS_NOTE = ' (counted separately from the daily rating):';
export const NO_CHECK_INS_TEXT = 'No daily check-ins were recorded in the last 30 days.';
export const NO_SYMPTOMS_TEXT = 'No symptoms were logged in the last 30 days.';

export const LEGEND_NORMAL = 'Normal';
export const LEGEND_ONE = '1 symptom';
export const LEGEND_TWO_PLUS = '2+ symptoms';
// A "Not observed" day draws nothing, like a skipped day (Lynn, 2026-11-24).
export const LEGEND_BLANK = 'Blank = skipped, no check-in, or not observed';

// "Oct 25" / "Oct 25, 2026": the report's own date style (index.ts
// formatDate, en-US short month), read as a calendar date (UTC).
function shortDate(date: string, withYear: boolean): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${date}`);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  });
}

// Takes YYYY-MM-DD dates. Same year: "last 30 days (Oct 25 – Nov 23, 2026)".
// Across New Year: "last 30 days (Dec 12, 2026 – Jan 10, 2027)" (Lynn,
// 2026-11-24).
export function windowText(startDate: string, endDate: string): string {
  const sameYear = startDate.slice(0, 4) === endDate.slice(0, 4);
  return `last 30 days (${shortDate(startDate, !sameYear)} – ${shortDate(endDate, true)})`;
}

// The Vibe totals as separate "Label N" pairs, so the PDF can wrap the line
// only between pairs, never between a label and its number.
export function vibeTotalsParts(v: VibeTotals): string[] {
  const parts = [
    `Great Day ${v.great}`,
    `Off Day ${v.off}`,
    `Tough Day ${v.tough}`,
    `Skipped ${v.skipped}`,
    `No check-in ${v.noCheckIn}`,
  ];
  if (v.notRecorded > 0) parts.push(`Not recorded ${v.notRecorded}`);
  return parts;
}

// "Great Day 21 · Off Day 6 · Tough Day 2 · Skipped 1 · No check-in 0",
// plus " · Not recorded N" only when there are any.
export function vibeTotalsText(v: VibeTotals): string {
  return vibeTotalsParts(v).join(' · ');
}

// Line breaking for one paragraph of runs, kept pure so it can be tested
// without a PDF. Each run is split at spaces into words, except a `nowrap`
// run, which stays whole (so "No check-in 0" never splits). `measure` gives
// a piece's width in the run's font. Lines never start or end with a space.
export interface LayoutRun<F> {
  text: string;
  font: F;
  nowrap?: boolean;
}

export function layoutRuns<F>(
  runs: readonly LayoutRun<F>[],
  maxWidth: number,
  measure: (text: string, font: F) => number,
): { text: string; font: F }[][] {
  const lines: { text: string; font: F }[][] = [[]];
  let width = 0;
  for (const run of runs) {
    const tokens = run.nowrap ? [run.text] : run.text.split(/(\s+)/).filter(Boolean);
    for (const token of tokens) {
      const isSpace = /^\s+$/.test(token);
      const text = isSpace ? ' ' : token;
      const w = measure(text, run.font);
      const line = lines[lines.length - 1];
      if (isSpace && line.length === 0) continue; // no leading space on a wrapped line
      if (!isSpace && width + w > maxWidth && line.length > 0) {
        while (line.length && line[line.length - 1].text === ' ') {
          width -= measure(' ', line[line.length - 1].font);
          line.pop();
        }
        lines.push([{ text, font: run.font }]);
        width = w;
        continue;
      }
      line.push({ text, font: run.font });
      width += w;
    }
  }
  const last = lines[lines.length - 1];
  while (last.length && last[last.length - 1].text === ' ') last.pop();
  return lines;
}

// "Ate a little less (18 days), Ate much less (1 day)".
export function symptomListText(symptoms: readonly SymptomDays[]): string {
  return symptoms.map((s) => `${s.label} (${s.days} ${s.days === 1 ? 'day' : 'days'})`).join(', ');
}

// A readable fallback for a raw code with no label in the catalog:
// "ate_little_less" -> "Ate little less". Never print the raw code.
export function humanizeCode(code: string): string {
  const spaced = code.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : code;
}
