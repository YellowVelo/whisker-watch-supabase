// Server check of the AI's bloodwork answers (spec 0081, FR29, FR35-FR37).
// Used for both bloodwork tasks: `scan_bloodwork` (a photo or PDF) and
// `bloodwork_spreadsheet` (a spreadsheet read into text by the app). The
// instructions live in ./prompts.ts; this file never trusts the AI to have
// followed them.
//
// What it does to the AI's answer:
//   - Keeps only the 16 tracked lab values (BLOODWORK_FIELDS), the urine
//     fields, date, lab, vet, notes, weight and the "not tracked" test names.
//     Anything malformed (not a plain number, an unknown field, a bad date,
//     an unknown urine protein answer) is dropped.
//   - A lab value whose stated unit isn't the field's unit is moved to
//     `skipped`, even if the AI put it in `values`. Lab values are never
//     converted (FR29, Before You Approve item 7). mmol/L for sodium and
//     potassium, and IU/L for ALT, AST and Alk Phos, count as the field's
//     unit (EQUIVALENT_UNITS, Lynn 2026-11-25). A value with no stated
//     unit is taken as the field's unit (Lynn 2026-11-25, "keep them").
//   - Weight (FR36): lbs is kept, kg is converted to lbs (the one stated
//     exception: weight isn't a lab value), rounded to one decimal and kept
//     only inside 0.1-300 lbs. A weight with no unit, or any other unit, is
//     moved to `skipped`.
//   - A "not tracked" entry that names one of the 16 tracked tests (by
//     key, label or a common alias such as TP, Urea or ALKP,
//     TRACKED_FIELD_ALIASES) is moved to `skipped`, with whatever unit and
//     value the AI wrote beside it. It's never moved into `values`.
//   - Merges visits with the same date and the same results (FR37: a
//     workbook with near-identical sheets gives each visit once). Same date
//     with different results stays as separate visits, each marked
//     `conflict: true` (wording K).
//
// Answer shape sent to the app:
//   {
//     visits: [{ date, lab_name?, vet_name?, notes?, urine_specific_gravity?,
//                urine_protein?, values: { <field key>: number },
//                weight_lbs?, not_tracked: string[], conflict: boolean }],
//     skipped: [{ visit, date, field, label, unit, value }]
//   }
// Visits are newest first (undated last). `skipped[].visit` is the index of
// the visit it belongs to in `visits`, or null if it couldn't be placed.
//
// Pure on purpose (no network, no Deno APIs): unit-tested in
// supabase/tests/ai_prompts.test.ts.

import { BLOODWORK_FIELDS, URINE_PROTEIN_VALUES, type BloodworkField } from './rules.ts';
import { isShowableLbs, roundLbs } from '../_shared/weight.ts';

export const WEIGHT_FIELD = 'weight';
export const WEIGHT_LABEL = 'Weight';

// Bounds on what's passed back, so a runaway answer stays small.
export const MAX_VISITS = 50;
export const MAX_NOT_TRACKED = 50;
const MAX_NAME_CHARS = 200;
const MAX_NOTES_CHARS = 2000;
const MAX_UNIT_CHARS = 40;

const KG_TO_LBS = 1 / 0.45359237;

export interface BloodworkVisit {
  date: string | null;
  lab_name?: string;
  vet_name?: string;
  notes?: string;
  urine_specific_gravity?: string;
  urine_protein?: string;
  values: Record<string, number>;
  weight_lbs?: number;
  not_tracked: string[];
  conflict: boolean;
}

export interface SkippedValue {
  visit: number | null;
  date: string | null;
  field: string; // a BLOODWORK_FIELDS key, or 'weight'
  label: string;
  unit: string | null;
  value: number | null;
}

export interface BloodworkAnswer {
  visits: BloodworkVisit[];
  skipped: SkippedValue[];
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

const FIELD_BY_KEY = new Map<string, BloodworkField>(BLOODWORK_FIELDS.map((f) => [f.key, f]));
const FIELD_BY_LABEL = new Map<string, BloodworkField>(BLOODWORK_FIELDS.map((f) => [f.label.toLowerCase(), f]));

// ---------------------------------------------------------------------------
// Small value checks
// ---------------------------------------------------------------------------

// A plain non-negative number, or null. Strings like "<5", ">1000", "2.1 H"
// or "N/A" aren't one exact result, so they're dropped.
export function plainNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

// A real calendar date as YYYY-MM-DD, or null.
export function validDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t ? t.slice(0, max) : undefined;
}

function unitText(value: unknown): string | null {
  return text(value, MAX_UNIT_CHARS) ?? null;
}

// Unit spelling differences that aren't different units: case, spaces, the
// micro sign vs the Greek mu, and "u" or "mc" for micro (ug, mcg, µg).
export function normalizeUnit(unit: string): string {
  return unit
    .normalize('NFKC') // micro sign U+00B5 -> Greek mu U+03BC
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/μ/g, 'u')
    .replace(/^mc(?=g\/)/, 'u');
}

// Other names for a field's own unit that give the same number (Lynn,
// 2026-11-25, "accept them"). Each is listed only for the fields where it's
// numerically true, and the value is kept exactly as written, never
// converted:
//   - mmol/L = mEq/L only for the monovalent electrolytes, sodium and
//     potassium (chloride isn't one of the 16 tracked fields). Never for
//     calcium or phosphorus, which aren't monovalent and are tracked in
//     mg/dL anyway.
//   - IU/L = U/L for the enzymes: ALT, AST and Alk Phos.
// Any other unit difference still goes to `skipped`.
export const EQUIVALENT_UNITS: Readonly<Record<string, readonly string[]>> = {
  sodium: ['mmol/L'],
  potassium: ['mmol/L'],
  alt: ['IU/L'],
  ast: ['IU/L'],
  alkaline_phosphatase: ['IU/L'],
};

// True if a stated unit is the field's own unit, or one of its
// EQUIVALENT_UNITS. A value with no stated unit is taken as the field's own
// unit (Lynn, 2026-11-25, "keep them"); the review shows the app's unit
// beside every value so the owner can check it.
export function unitMatches(stated: string | null, field: BloodworkField): boolean {
  if (stated === null) return true;
  const s = normalizeUnit(stated);
  if (s === normalizeUnit(field.unit)) return true;
  return (EQUIVALENT_UNITS[field.key] ?? []).some((u) => normalizeUnit(u) === s);
}

const LBS_UNITS = new Set(['lb', 'lbs', 'pound', 'pounds']);
const KG_UNITS = new Set(['kg', 'kgs', 'kilogram', 'kilograms']);

// A weight in lbs (one decimal, 0.1-300), 'skip' for a missing or other
// unit, or null if the value itself is malformed.
function weightLbs(value: number, unit: string | null): number | 'skip' | null {
  const u = unit === null ? null : normalizeUnit(unit).replace(/\.$/, '');
  let lbs: number;
  if (u !== null && LBS_UNITS.has(u)) lbs = value;
  else if (u !== null && KG_UNITS.has(u)) lbs = value * KG_TO_LBS;
  else return 'skip';
  return isShowableLbs(lbs) ? roundLbs(lbs) : null;
}

function urineSpecificGravity(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value)) return value.trim();
  return undefined;
}

function urineProtein(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim().toLowerCase();
  return URINE_PROTEIN_VALUES.find((v) => v.toLowerCase() === t);
}

// A field named by key ("creatinine") or label ("Creatinine"), or 'weight'.
function skippedField(value: unknown): { field: string; label: string } | null {
  if (typeof value !== 'string') return null;
  const t = value.trim().toLowerCase();
  if (t === WEIGHT_FIELD) return { field: WEIGHT_FIELD, label: WEIGHT_LABEL };
  const f = FIELD_BY_KEY.get(t) ?? FIELD_BY_LABEL.get(t);
  return f ? { field: f.key, label: f.label } : null;
}

// ---------------------------------------------------------------------------
// A tracked test listed as "not tracked"
// ---------------------------------------------------------------------------

// Other names a lab report uses for the 16 tracked tests, compared after
// trackedNameKey(). The field's key and label are always matched too.
// Kept to names that only ever mean that test: "protein" alone (urine
// protein?), "ionized calcium" or "free T4" are different tests and are
// deliberately not listed.
export const TRACKED_FIELD_ALIASES: Readonly<Record<string, readonly string[]>> = {
  bun: ['urea', 'urea nitrogen', 'blood urea nitrogen', 'serum urea nitrogen', 'sun'],
  creatinine: ['creat', 'crea', 'crt'],
  sdma: ['idexx sdma', 'symmetric dimethylarginine'],
  phosphorus: ['phos', 'phosphorous', 'phosphate', 'inorganic phosphorus', 'inorganic phosphate'],
  potassium: ['k'],
  sodium: ['na'],
  calcium: ['ca', 'total calcium'],
  hematocrit: ['hct', 'pcv', 'haematocrit', 'packed cell volume'],
  hemoglobin: ['hgb', 'hb', 'haemoglobin'],
  total_protein: ['tp', 'tpro', 'total protein serum', 'serum total protein', 'protein total', 'total serum protein'],
  albumin: ['alb'],
  alt: ['sgpt', 'alt sgpt', 'alanine aminotransferase', 'alanine transaminase'],
  ast: ['sgot', 'ast sgot', 'aspartate aminotransferase', 'aspartate transaminase'],
  alkaline_phosphatase: ['alkp', 'alp', 'alk phos', 'alk phosphatase', 'alkaline phos', 'sap', 'serum alkaline phosphatase'],
  glucose: ['glu', 'gluc', 'blood glucose'],
  t4: ['tt4', 'total t4', 't4 total', 'thyroxine', 'total thyroxine', 't4 thyroid'],
};

// "Alk. Phos", "ALKP", "K+", "total_protein" -> "alk phos", "alkp", "k",
// "total protein".
export function trackedNameKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const FIELD_BY_NAME = new Map<string, BloodworkField>();
for (const f of BLOODWORK_FIELDS) {
  for (const n of [f.key, f.label, ...(TRACKED_FIELD_ALIASES[f.key] ?? [])]) FIELD_BY_NAME.set(trackedNameKey(n), f);
}

/** The tracked field a test name means, by key, label or alias, or null. */
export function trackedFieldForName(name: string): BloodworkField | null {
  return FIELD_BY_NAME.get(trackedNameKey(name)) ?? null;
}

interface NamedTracked {
  field: BloodworkField;
  unit: string | null;
  value: number | null;
}

const NUMBER_RE = /^(\d+(?:\.\d+)?)\s*(.*)$/;

// "65 g/L" -> { value: 65, unit: 'g/L' }; "g/L" -> { value: null, unit: 'g/L' }.
function valueAndUnit(rest: string): { value: number | null; unit: string | null } {
  const t = rest.trim();
  if (!t) return { value: null, unit: null };
  const m = NUMBER_RE.exec(t);
  if (m) return { value: plainNumber(m[1]), unit: unitText(m[2]) };
  return /\d/.test(t) ? { value: null, unit: null } : { value: null, unit: unitText(t) };
}

// A "not tracked" entry that is really one of the 16 tracked tests, with
// whatever unit and value the AI wrote beside its name: "Total Protein",
// "TP (g/L)", "Total Protein: 65 g/L", "Urea (BUN) 12.1 mmol/L". null if
// the entry names any other test.
export function trackedNameInNotTracked(entry: string): NamedTracked | null {
  const whole = trackedFieldForName(entry);
  if (whole) return { field: whole, unit: null, value: null };
  // "Name (x)" with anything after: x is another name for it, or its unit
  // (and maybe its value).
  const paren = /^(.*?)\s*\(([^)]*)\)\s*(.*)$/.exec(entry);
  if (paren) {
    const field = trackedFieldForName(paren[1]);
    if (field) {
      const inner = trackedFieldForName(paren[2]) ? '' : paren[2];
      const after = valueAndUnit(paren[3]);
      const within = valueAndUnit(inner);
      return { field, value: after.value ?? within.value, unit: after.unit ?? within.unit };
    }
  }
  // "Name: 65 g/L", "Name - g/L", "Name 65 g/L".
  for (const re of [/^(.*?)\s*[:=–—-]\s*(.+)$/, /^(.*?)\s+(\d.*)$/]) {
    const split = re.exec(entry);
    const field = split && trackedFieldForName(split[1]);
    if (split && field) return { field, ...valueAndUnit(split[2]) };
  }
  return null;
}

function notTracked(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const name = text(item, MAX_NAME_CHARS);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= MAX_NOT_TRACKED) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// One visit
// ---------------------------------------------------------------------------

interface WorkingVisit {
  visit: BloodworkVisit;
  skipped: Omit<SkippedValue, 'visit'>[];
  // Tracked tests the AI listed in not_tracked (trackedNameInNotTracked),
  // moved to `skipped` once the AI's own skipped list is placed.
  namedTracked: NamedTracked[];
}

const skippedKey = (s: Omit<SkippedValue, 'visit'>) => `${s.field}|${s.unit === null ? '' : normalizeUnit(s.unit)}|${s.value ?? ''}`;

function addSkipped(w: WorkingVisit, s: Omit<SkippedValue, 'visit'>) {
  if (!w.skipped.some((x) => skippedKey(x) === skippedKey(s))) w.skipped.push(s);
}

function cleanVisit(raw: Raw): WorkingVisit {
  const date = validDate(raw.date);
  const visit: BloodworkVisit = { date, values: {}, not_tracked: [], conflict: false };
  const w: WorkingVisit = { visit, skipped: [], namedTracked: [] };
  for (const name of notTracked(raw.not_tracked)) {
    const named = trackedNameInNotTracked(name);
    if (named) w.namedTracked.push(named);
    else visit.not_tracked.push(name);
  }

  const lab = text(raw.lab_name, MAX_NAME_CHARS);
  const vet = text(raw.vet_name, MAX_NAME_CHARS);
  const notes = text(raw.notes, MAX_NOTES_CHARS);
  const usg = urineSpecificGravity(raw.urine_specific_gravity);
  const protein = urineProtein(raw.urine_protein);
  if (lab) visit.lab_name = lab;
  if (vet) visit.vet_name = vet;
  if (notes) visit.notes = notes;
  if (usg) visit.urine_specific_gravity = usg;
  if (protein) visit.urine_protein = protein;

  if (isObject(raw.values)) {
    for (const [key, entry] of Object.entries(raw.values)) {
      const field = FIELD_BY_KEY.get(key);
      if (!field) continue;
      // { value, unit } as asked, or a bare number with no unit stated.
      const value = plainNumber(isObject(entry) ? entry.value : entry);
      if (value === null) continue;
      const unit = isObject(entry) ? unitText(entry.unit) : null;
      if (unitMatches(unit, field)) visit.values[field.key] = value;
      else addSkipped(w, { date, field: field.key, label: field.label, unit, value });
    }
  }

  if (isObject(raw.weight)) {
    const value = plainNumber(raw.weight.value);
    if (value !== null) {
      const unit = unitText(raw.weight.unit);
      const lbs = weightLbs(value, unit);
      if (lbs === 'skip') addSkipped(w, { date, field: WEIGHT_FIELD, label: WEIGHT_LABEL, unit, value });
      else if (lbs !== null) visit.weight_lbs = lbs;
    }
  }
  return w;
}

const hasResults = (w: WorkingVisit) =>
  Object.keys(w.visit.values).length > 0 ||
  w.visit.weight_lbs !== undefined ||
  w.visit.urine_specific_gravity !== undefined ||
  w.visit.urine_protein !== undefined ||
  w.skipped.length > 0;

// Everything that makes two versions of a visit "the same results".
function resultsSignature(w: WorkingVisit): string {
  const v = w.visit;
  return JSON.stringify([
    Object.entries(v.values).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    v.weight_lbs ?? null,
    v.urine_specific_gravity ?? null,
    v.urine_protein ?? null,
    w.skipped.map(skippedKey).sort(),
  ]);
}

function mergeInto(target: WorkingVisit, other: WorkingVisit) {
  const t = target.visit;
  const o = other.visit;
  t.lab_name ??= o.lab_name;
  t.vet_name ??= o.vet_name;
  t.notes ??= o.notes;
  t.not_tracked = notTracked([...t.not_tracked, ...o.not_tracked]);
  for (const s of other.skipped) addSkipped(target, s);
  for (const key of ['lab_name', 'vet_name', 'notes'] as const) if (t[key] === undefined) delete t[key];
}

// ---------------------------------------------------------------------------
// The whole answer
// ---------------------------------------------------------------------------

/**
 * Checks the AI's answer to a bloodwork task and returns it in the shape
 * the app reads. Never throws: an answer with nothing usable comes back as
 * { visits: [], skipped: [] }.
 */
export function cleanBloodworkAnswer(raw: unknown): BloodworkAnswer {
  const working: WorkingVisit[] = [];
  const rawVisits = isObject(raw) && Array.isArray(raw.visits) ? raw.visits : [];
  for (const rv of rawVisits) {
    if (isObject(rv)) working.push(cleanVisit(rv));
  }

  // The AI's own skipped list: placed on every visit with the same date. A
  // dated one with no visit gets a visit of its own, so its card can still
  // say what wasn't imported (e.g. a report entirely in SI units).
  const unplaced: Omit<SkippedValue, 'visit'>[] = [];
  const rawSkipped = isObject(raw) && Array.isArray(raw.skipped) ? raw.skipped : [];
  for (const rs of rawSkipped) {
    if (!isObject(rs)) continue;
    const named = skippedField(rs.field);
    if (!named) continue;
    const date = validDate(rs.date);
    const s = { date, ...named, unit: unitText(rs.unit), value: plainNumber(rs.value) };
    const matches = date === null ? [] : working.filter((w) => w.visit.date === date);
    if (matches.length > 0) {
      for (const w of matches) addSkipped(w, { ...s });
    } else if (date !== null) {
      const w: WorkingVisit = { visit: { date, values: {}, not_tracked: [], conflict: false }, skipped: [], namedTracked: [] };
      addSkipped(w, s);
      working.push(w);
    } else {
      unplaced.push(s);
    }
  }

  // A tracked test the AI listed as "not tracked" (for example Total
  // Protein in g/L) was left out of `values` for a reason, most likely its
  // unit, so it's reported as not imported, never as not tracked and never
  // as a value. Skipped once only: not if the visit already has it as a
  // value or skipped.
  for (const w of working) {
    for (const n of w.namedTracked) {
      if (w.visit.values[n.field.key] !== undefined) continue;
      if (w.skipped.some((s) => s.field === n.field.key)) continue;
      addSkipped(w, { date: w.visit.date, field: n.field.key, label: n.field.label, unit: n.unit, value: n.value });
    }
    w.namedTracked = [];
  }

  // Merge identical visits on the same date; mark same-date differences.
  const kept = working.filter(hasResults);
  const merged: WorkingVisit[] = [];
  for (const w of kept) {
    const same = w.visit.date === null
      ? undefined
      : merged.find((m) => m.visit.date === w.visit.date && resultsSignature(m) === resultsSignature(w));
    if (same) mergeInto(same, w);
    else merged.push(w);
  }
  for (const w of merged) {
    if (w.visit.date !== null) {
      w.visit.conflict = merged.some((m) => m !== w && m.visit.date === w.visit.date);
    }
  }

  // Newest first, undated last; same-date versions keep the AI's order.
  const ordered = merged
    .map((w, i) => ({ w, i }))
    .sort((a, b) => {
      const da = a.w.visit.date;
      const db = b.w.visit.date;
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        return da < db ? 1 : -1;
      }
      return a.i - b.i;
    })
    .map(({ w }) => w)
    .slice(0, MAX_VISITS);

  const skipped: SkippedValue[] = [];
  ordered.forEach((w, index) => {
    for (const s of w.skipped) skipped.push({ visit: index, ...s });
  });
  const seenUnplaced = new Set<string>();
  for (const s of unplaced) {
    if (seenUnplaced.has(skippedKey(s))) continue;
    seenUnplaced.add(skippedKey(s));
    skipped.push({ visit: null, ...s });
  }

  return { visits: ordered.map((w) => w.visit), skipped };
}
