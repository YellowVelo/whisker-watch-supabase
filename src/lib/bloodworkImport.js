import { BLOODWORK_FIELDS } from '@/lib/bloodworkFields';
import { UploadRejectedError, UPLOAD_MESSAGES } from '@/api/storageClient';
import { SPREADSHEET_MESSAGES, SpreadsheetReadError, spreadsheetErrorText } from '@/lib/bloodworkSpreadsheet';
import { scanErrorText } from '@/lib/scannedDocuments';
import { dateStrInTimezone } from '@/lib/timezone';

/**
 * The Bloodwork tab's import review (spec 0081, FR30, FR31, FR35, FR36):
 * turns the answer from either bloodwork AI task (`scan_bloodwork` for a
 * photo or PDF, `bloodwork_spreadsheet` for a spreadsheet) into the
 * per-visit cards BloodworkImportReview.jsx shows, and a ticked card back
 * into a bloodwork record.
 *
 * The server's answer (supabase/functions/ask-vet-assistant/bloodwork.ts):
 *   { visits: [{ date, lab_name?, vet_name?, notes?, urine_specific_gravity?,
 *                urine_protein?, values: { <field key>: number },
 *                weight_lbs?, not_tracked: string[], conflict: boolean }],
 *     skipped: [{ visit, date, field, label, unit, value }] }
 * Servers deployed before spec 0081 answered the scan with one flat record
 * (lab values at the top level); that becomes one visit, so the review
 * works whichever server is live during the rollout.
 */

// What a photo or PDF scan with no visits shows (Lynn, 2026-11-26),
// presented like the spreadsheet's nothing_found message.
export const SCAN_NOTHING_FOUND = "We couldn't find any bloodwork results in this file.";

// The record's own text fields a visit card edits, besides the lab values.
export const VISIT_TEXT_FIELDS = ['date', 'lab_name', 'vet_name', 'notes', 'urine_specific_gravity', 'urine_protein'];

const FIELD_KEYS = new Set(BLOODWORK_FIELDS.map((f) => f.key));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => typeof v === 'string' && DATE_RE.test(v);

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// A lab value as the text an <input type="number"> shows, or null. The
// server sends plain numbers; `{ value }` is accepted too, defensively.
function valueText(entry) {
  const raw = isObject(entry) ? entry.value : entry;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)) return raw.trim();
  return null;
}

function textOf(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' ? v.trim() : '';
}

// The visits in either answer shape. The old flat record becomes one
// visit with its lab values moved under `values`.
function answerVisits(result) {
  if (!isObject(result)) return { visits: [], skipped: [] };
  if (Array.isArray(result.visits)) {
    return { visits: result.visits.filter(isObject), skipped: Array.isArray(result.skipped) ? result.skipped.filter(isObject) : [] };
  }
  const values = {};
  for (const key of FIELD_KEYS) if (result[key] != null) values[key] = result[key];
  const visit = { values };
  for (const key of VISIT_TEXT_FIELDS) if (result[key] != null) visit[key] = result[key];
  const hasAnything = Object.keys(values).length > 0 || VISIT_TEXT_FIELDS.some((k) => textOf(visit[k]) !== '');
  return { visits: hasAnything ? [visit] : [], skipped: [] };
}

function skippedItem(s) {
  const label = textOf(s.label) || textOf(s.field);
  return label ? { label, unit: textOf(s.unit) || null } : null;
}

/**
 * Build the review's cards.
 *
 * - Every card starts ticked, except a visit whose date already has a
 *   bloodwork record ("Already on file", FR30/AC16) or one found twice
 *   with different values ("Found twice…", FR37/AC23).
 * - A weight line (FR36) starts ticked unless the pet already has a weight
 *   on that date or the visit has no date. `weightDates` null means the
 *   pet's weights couldn't be loaded: every weight line then starts
 *   unticked, so a check-in weight is never replaced without the owner
 *   choosing it. Changing a card's date works these out again
 *   (changeVisitDate).
 *
 * @param {any} result - either bloodwork task's answer
 * @param {{ bloodworkDates: Set<string>, weightDates: Set<string>|null }} onFile
 * @returns {{ visits: ReviewVisit[], unplacedSkipped: { label: string, unit: string|null }[] }}
 *
 * @typedef {{
 *   key: string,
 *   form: Record<string, string>,
 *   valueKeys: string[],
 *   skipped: { label: string, unit: string|null }[],
 *   notTracked: string[],
 *   conflict: boolean,
 *   onFile: boolean,
 *   included: boolean,
 *   weightLbs: number|null,
 *   includeWeight: boolean,
 *   weightConfirmedDate: string|null,
 *   savedId?: string,
 * }} ReviewVisit
 *
 * `weightConfirmedDate` is the date the owner ticked the weight line for
 * themselves; only then may the save replace a weight already on that date
 * (weightToSave). `savedId` is the record a visit already saved, if its
 * weight then failed: a retry updates that record instead of adding another.
 */
export function buildReviewVisits(result, { bloodworkDates, weightDates }) {
  const { visits: rawVisits, skipped: rawSkipped } = answerVisits(result);

  const visits = rawVisits.map((raw, index) => {
    /** @type {Record<string, string>} */
    const form = {};
    for (const key of VISIT_TEXT_FIELDS) form[key] = textOf(raw[key]);
    if (!isDate(form.date)) form.date = '';

    const values = isObject(raw.values) ? raw.values : {};
    // In the app's field order, so every card reads the same way.
    const valueKeys = [];
    for (const { key } of BLOODWORK_FIELDS) {
      const text = valueText(values[key]);
      if (text !== null) {
        form[key] = text;
        valueKeys.push(key);
      }
    }

    const weight = typeof raw.weight_lbs === 'number' && Number.isFinite(raw.weight_lbs) ? raw.weight_lbs : null;
    const onFile = form.date !== '' && bloodworkDates.has(form.date);
    const conflict = raw.conflict === true;
    return {
      key: `visit-${index}`,
      form,
      valueKeys,
      skipped: [],
      notTracked: Array.isArray(raw.not_tracked) ? raw.not_tracked.map(textOf).filter(Boolean) : [],
      conflict,
      onFile,
      included: !onFile && !conflict,
      weightLbs: weight,
      includeWeight: weightStartsTicked(weight, form.date, weightDates),
      weightConfirmedDate: null,
    };
  });

  const unplacedSkipped = [];
  for (const s of rawSkipped) {
    const item = skippedItem(s);
    if (!item) continue;
    const target = Number.isInteger(s.visit) ? visits[s.visit] : undefined;
    if (target) target.skipped.push(item);
    else unplacedSkipped.push(item);
  }

  return { visits, unplacedSkipped };
}

// A weight line starts ticked only for a dated visit whose date has no
// weight on file, and only if the pet's weights could be loaded.
function weightStartsTicked(weight, date, weightDates) {
  return weight !== null && isDate(date) && weightDates !== null && !weightDates.has(date);
}

/**
 * A card after the owner changes its date (FR30, FR36): "Already on file"
 * and the weight line's tick are worked out again for the new date, as if
 * the card had opened with it. A card moved onto a date that already has a
 * bloodwork record is unticked, like one that opened there. The owner's
 * own weight tick doesn't carry over to a different date.
 *
 * @param {ReviewVisit} visit
 * @param {string} date
 * @param {{ bloodworkDates: Set<string>, weightDates: Set<string>|null }} onFile
 * @returns {ReviewVisit}
 */
export function changeVisitDate(visit, date, { bloodworkDates, weightDates }) {
  if (visit.form.date === date) return visit;
  const onFile = isDate(date) && bloodworkDates.has(date);
  return {
    ...visit,
    form: { ...visit.form, date },
    onFile,
    included: onFile && !visit.onFile ? false : visit.included,
    includeWeight: weightStartsTicked(visit.weightLbs, date, weightDates),
    weightConfirmedDate: null,
  };
}

/** The owner ticks or unticks a card's weight line, for the card's current date. */
export function toggleVisitWeight(visit) {
  const includeWeight = !visit.includeWeight;
  return { ...visit, includeWeight, weightConfirmedDate: includeWeight ? visit.form.date : null };
}

/** Whether the weight line can be ticked: the visit is ticked and has a date. */
export function weightLineEnabled(visit) {
  return visit.included && isDate(visit.form.date);
}

/**
 * Whether saving this visit also logs its weight (FR36). One weight per pet
 * per day, and an import never silently replaces one: if the pet has a
 * weight on the visit's date (checked against `freshWeightDates`, loaded
 * just before saving; null if that failed), the weight is logged only if
 * the owner ticked the line themselves for that same date.
 *
 * @param {ReviewVisit} visit
 * @param {Set<string>|null} freshWeightDates
 */
export function weightToSave(visit, freshWeightDates) {
  const { date } = visit.form;
  if (!visit.included || !visit.includeWeight || visit.weightLbs === null || !isDate(date)) return false;
  if (visit.weightConfirmedDate === date) return true;
  return freshWeightDates !== null && !freshWeightDates.has(date);
}

/** "Creatinine µmol/L, BUN mmol/L": the list after "Not imported (different unit):". */
export function skippedText(items) {
  return items.map((s) => (s.unit ? `${s.label} ${s.unit}` : s.label)).join(', ');
}

/**
 * Skipped values split by why: `differentUnit` (a stated unit the app
 * doesn't use) and `noUnit` (no unit stated; only a weight is ever skipped
 * for that, since a lab value with no unit is taken as the field's own).
 */
export function skippedGroups(items) {
  return {
    differentUnit: items.filter((s) => s.unit),
    noUnit: items.filter((s) => !s.unit),
  };
}

/** The ticked visits. */
export function includedVisits(visits) {
  return visits.filter((v) => v.included);
}

/** True if `date` is after today on the owner's calendar (`timezone`, profiles.timezone). */
export function isFutureDate(date, timezone) {
  return isDate(date) && date > dateStrInTimezone(timezone, 0);
}

/**
 * Save is allowed when at least one visit is ticked and every ticked visit
 * has a date that isn't in the future on the owner's calendar.
 */
export function canSaveReview(visits, timezone) {
  const chosen = includedVisits(visits);
  return chosen.length > 0 && chosen.every((v) => isDate(v.form.date) && !isFutureDate(v.form.date, timezone));
}

/**
 * A ticked card as a `bloodwork` row: empty fields left out, lab values
 * as numbers.
 *
 * @param {ReviewVisit} visit
 * @param {string} petId
 */
export function reviewVisitToRecord(visit, petId) {
  /** @type {Record<string, string|number>} */
  const record = { pet_id: petId };
  for (const key of VISIT_TEXT_FIELDS) {
    const text = textOf(visit.form[key]);
    if (text !== '') record[key] = text;
  }
  for (const { key } of BLOODWORK_FIELDS) {
    const text = textOf(visit.form[key]);
    if (text === '') continue;
    const n = parseFloat(text);
    if (Number.isFinite(n)) record[key] = n;
  }
  return record;
}

/**
 * The toast text for a failed import: wording G for spreadsheet problems
 * (including the server's own too-large refusal), the upload's own
 * messages, the too-large-to-scan message, then the shared AI error copy
 * (rate limits keep their own message). Anything else, such as the .xlsx
 * reader failing to load, gets the generic failure message.
 */
export function bloodworkImportErrorText(err) {
  const sheet = spreadsheetErrorText(err);
  if (sheet) return sheet;
  if (err?.code === 'sheet_too_large') return SPREADSHEET_MESSAGES.too_large;
  return scanErrorText(err);
}

/**
 * Whether an import failure is worth a Sentry report: not the owner's own
 * file problems, not a rate limit, and not one the reader already reported.
 */
export function shouldReportImportError(err) {
  if (err instanceof SpreadsheetReadError) return false;
  if (err instanceof UploadRejectedError && err.message !== UPLOAD_MESSAGES.failed) return false;
  if (err?.status === 429) return false;
  if (err?.status === 413) return false;
  return !err?.reported;
}
