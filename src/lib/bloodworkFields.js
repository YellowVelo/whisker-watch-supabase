// The bloodwork lab values shown in BloodworkSection.jsx and asked for by
// the bloodwork scan. Moved out of the component (spec 0080) so the Vitest
// parity test can compare it with the server copy in
// supabase/functions/ask-vet-assistant/rules.ts (key, label, unit; and
// URINE_PROTEIN_VALUES).
//
// Design System Amendment #10 (2026-07-30) — 16 lab values need more
// colors than the original 5 --chart-* tokens, so the token set itself
// was extended (--chart-6 through --chart-16 in index.css) rather than
// falling back to raw hex here.
export const BLOODWORK_FIELDS = [
  { key: 'bun', label: 'BUN', unit: 'mg/dL', normal: '14–36', color: 'hsl(var(--chart-1))' },
  { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', normal: '0.6–2.4', color: 'hsl(var(--chart-5))' },
  { key: 'sdma', label: 'SDMA', unit: 'µg/dL', normal: '<14', color: 'hsl(var(--chart-4))' },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg/dL', normal: '2.4–8.2', color: 'hsl(var(--chart-2))' },
  { key: 'potassium', label: 'Potassium', unit: 'mEq/L', normal: '3.5–5.8', color: 'hsl(var(--chart-8))' },
  { key: 'sodium', label: 'Sodium', unit: 'mEq/L', normal: '149–164', color: 'hsl(var(--chart-3))' },
  { key: 'calcium', label: 'Calcium', unit: 'mg/dL', normal: '8.8–11.9', color: 'hsl(var(--chart-7))' },
  { key: 'hematocrit', label: 'Hematocrit', unit: '%', normal: '24–45', color: 'hsl(var(--chart-6))' },
  { key: 'hemoglobin', label: 'Hemoglobin', unit: 'g/dL', normal: '8–15', color: 'hsl(var(--chart-10))' },
  { key: 'total_protein', label: 'Total Protein', unit: 'g/dL', normal: '5.4–8.2', color: 'hsl(var(--chart-9))' },
  { key: 'albumin', label: 'Albumin', unit: 'g/dL', normal: '2.2–4.0', color: 'hsl(var(--chart-13))' },
  { key: 'alt', label: 'ALT', unit: 'U/L', normal: '10–100', color: 'hsl(var(--chart-16))' },
  { key: 'ast', label: 'AST', unit: 'U/L', normal: '0–48', color: 'hsl(var(--chart-11))' },
  { key: 'alkaline_phosphatase', label: 'Alk Phos', unit: 'U/L', normal: '14–111', color: 'hsl(var(--chart-12))' },
  { key: 'glucose', label: 'Glucose', unit: 'mg/dL', normal: '70–150', color: 'hsl(var(--chart-14))' },
  { key: 't4', label: 'T4 Thyroid', unit: 'µg/dL', normal: '0.8–4.7', color: 'hsl(var(--chart-15))' },
];

// The urine protein answers the bloodwork form offers. The server copy
// (rules.ts) tells the bloodwork scans which answers they may return.
export const URINE_PROTEIN_VALUES = ['Negative', 'Trace', '1+', '2+', '3+', '4+'];
