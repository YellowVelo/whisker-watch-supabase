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
//     converted (FR29, Before You Approve item 7). A value with no stated
//     unit is taken as the field's unit.
//   - Weight (FR36): lbs is kept, kg is converted to lbs (the one stated
//     exception: weight isn't a lab value), rounded to one decimal and kept
//     only inside 0.1-300 lbs. A weight with no unit, or any other unit, is
//     moved to `skipped`.
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

// True if a stated unit is the field's own unit (no unit stated counts).
export function unitMatches(stated: string | null, field: BloodworkField): boolean {
  if (stated === null) return true;
  return normalizeUnit(stated) === normalizeUnit(field.unit);
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
}

const skippedKey = (s: Omit<SkippedValue, 'visit'>) => `${s.field}|${s.unit === null ? '' : normalizeUnit(s.unit)}|${s.value ?? ''}`;

function addSkipped(w: WorkingVisit, s: Omit<SkippedValue, 'visit'>) {
  if (!w.skipped.some((x) => skippedKey(x) === skippedKey(s))) w.skipped.push(s);
}

function cleanVisit(raw: Raw): WorkingVisit {
  const date = validDate(raw.date);
  const visit: BloodworkVisit = { date, values: {}, not_tracked: notTracked(raw.not_tracked), conflict: false };
  const w: WorkingVisit = { visit, skipped: [] };

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
      const w: WorkingVisit = { visit: { date, values: {}, not_tracked: [], conflict: false }, skipped: [] };
      addSkipped(w, s);
      working.push(w);
    } else {
      unplaced.push(s);
    }
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
