import { BLOODWORK_FIELDS } from '@/lib/bloodworkFields';

// The record fields a scanned visit can prefill (besides the lab values).
const VISIT_FIELDS = ['date', 'lab_name', 'vet_name', 'notes', 'urine_specific_gravity', 'urine_protein'];

/**
 * Turns the bloodwork scan's answer into the flat record the Add Bloodwork
 * form is prefilled with.
 *
 * Spec 0081 (FR35): the server now answers `{ visits, skipped }`, one entry
 * per visit, newest first, with lab values under `values`. Servers deployed
 * before it answered one flat record, which is passed through unchanged, so
 * this works whichever is live during the rollout. From the new shape only
 * the first visit is used, and only the bloodwork record's own fields:
 * weight, "not tracked" names and skipped values aren't part of the form.
 *
 * @param {any} result - invokeAI's answer for task 'scan_bloodwork'
 * @returns {any} the flat record (`{}` when no visit was found), or the
 *   answer itself if it's empty or in the old flat shape
 */
export function scannedBloodworkToForm(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.visits)) return result;
  const visit = result.visits[0];
  if (!visit || typeof visit !== 'object') return {};
  /** @type {Record<string, unknown>} */
  const record = {};
  for (const key of VISIT_FIELDS) {
    if (visit[key] != null) record[key] = visit[key];
  }
  const values = visit.values && typeof visit.values === 'object' ? visit.values : {};
  for (const { key } of BLOODWORK_FIELDS) {
    if (typeof values[key] === 'number') record[key] = values[key];
  }
  return record;
}
