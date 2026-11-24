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
export const LEGEND_NOT_OBSERVED = 'Not observed';
export const LEGEND_BLANK = 'Blank = skipped or no check-in';

// "last 30 days (Oct 25, 2026 – Nov 23, 2026)". The dates come in already
// formatted with the report's own date format.
export function windowText(startLabel: string, endLabel: string): string {
  return `last 30 days (${startLabel} – ${endLabel})`;
}

// "Great Day 21 · Off Day 6 · Tough Day 2 · Skipped 1 · No check-in 0",
// plus " · Not recorded N" only when there are any.
export function vibeTotalsText(v: VibeTotals): string {
  const parts = [
    `Great Day ${v.great}`,
    `Off Day ${v.off}`,
    `Tough Day ${v.tough}`,
    `Skipped ${v.skipped}`,
    `No check-in ${v.noCheckIn}`,
  ];
  if (v.notRecorded > 0) parts.push(`Not recorded ${v.notRecorded}`);
  return parts.join(' · ');
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
