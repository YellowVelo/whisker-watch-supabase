// Shared short chip-word labels for observation enum values — the single
// source of truth for both the Pets screen (PetCard.jsx) and Pet Profile
// (PetProfile.jsx). These two screens previously carried independent
// copies that had already drifted (e.g. "Low"/"High" on one screen vs.
// "Lower"/"Higher" on the other for the same stored value), violating
// "maintain consistency across ... terminology" (UX Principles). Anything
// that renders a one-word chip for an observation value must import from
// here rather than hand-rolling its own mapping.

export const CHIP_VALUE_LABELS = {
  appetite: { normal: 'Normal', ate_little_less: 'Lower', ate_much_less: 'Lower', did_not_eat: 'None', ate_more: 'Higher' },
  water_intake: { normal: 'Normal', less_than_usual: 'Lower', more_than_usual: 'Higher', much_more_than_usual: 'Higher' },
  energy: { normal: 'Normal', slightly_lower: 'Lower', much_lower: 'Lower', higher_than_usual: 'Higher' },
  stool: { normal: 'Normal', softer_than_usual: 'Soft', diarrhea: 'Loose', constipated: 'Hard', blood_noticed: 'Blood' },
  mobility: { normal: 'Normal' },
};

// `unavailable` covers the Pets screen's "fetch failed" case (distinct
// from "no check-in today"); PetProfile never sets it since it treats
// that failure as a card-level error state instead.
export function getChipState(code, status, values, { unavailable = false } = {}) {
  if (unavailable) return { label: 'Unavailable', tone: 'unknown' };

  // No check-in today, or today was explicitly skipped: genuinely unknown,
  // never presented as "Normal" (Product Principle #6: Unknown ≠ Normal).
  if (!status || status === 'skipped') return { label: 'Unknown', tone: 'unknown' };

  if (code === 'other') {
    return values?.other?.notes ? { label: 'Noted', tone: 'good' } : { label: 'None', tone: 'good' };
  }

  const observed = values?.[code];
  if (!observed) return { label: 'Normal', tone: 'good' };
  const label = CHIP_VALUE_LABELS[code]?.[observed.value] ?? 'Changed';
  const tone = observed.severityScore != null && observed.severityScore < 0 ? 'warn' : 'good';
  return { label, tone };
}
