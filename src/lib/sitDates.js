// Spec 0085: one place for pet sit date rules, so a sit with an impossible
// saved date (e.g. year 20266) can never crash the Pet Sitter page or build a
// huge/backwards checklist, and Save refuses the same dates the database does.
import { differenceInCalendarDays, eachDayOfInterval, format } from 'date-fns';

export const SIT_MIN_DATE = '2000-01-01';
export const SIT_MAX_DATE = '2100-12-31';
export const SIT_MAX_DAYS = 30;

// Approved copy (spec 0085, "Copy for approval").
export const SIT_DATE_MESSAGES = {
  invalid: 'Please enter a real date with a 4-digit year.',
  endBeforeStart: "The end date can't be before the start date.",
  tooLong: 'A pet sit can be up to 30 days. For a longer trip, add a second sit.',
};

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns a local-midnight Date only for a real YYYY-MM-DD date between
 * SIT_MIN_DATE and SIT_MAX_DATE; otherwise null.
 * @param {unknown} str
 * @returns {Date | null}
 */
export function parseSitDate(str) {
  if (typeof str !== 'string' || !DATE_SHAPE.test(str)) return null;
  if (str < SIT_MIN_DATE || str > SIT_MAX_DATE) return null;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * The days of a sit, or [] unless both dates parse, end >= start and the
 * span is at most SIT_MAX_DAYS.
 * @param {{ start_date?: unknown, end_date?: unknown } | null | undefined} sit
 * @returns {Date[]}
 */
export function sitDays(sit) {
  const start = parseSitDate(sit?.start_date);
  const end = parseSitDate(sit?.end_date);
  if (!start || !end) return [];
  const span = differenceInCalendarDays(end, start);
  if (span < 0 || span > SIT_MAX_DAYS) return [];
  return eachDayOfInterval({ start, end });
}

/**
 * null when the dates are acceptable, otherwise one of the approved messages.
 * @param {unknown} start
 * @param {unknown} end
 * @returns {string | null}
 */
export function validateSitDates(start, end) {
  const s = parseSitDate(start);
  const e = parseSitDate(end);
  if (!s || !e) return SIT_DATE_MESSAGES.invalid;
  const span = differenceInCalendarDays(e, s);
  if (span < 0) return SIT_DATE_MESSAGES.endBeforeStart;
  if (span > SIT_MAX_DAYS) return SIT_DATE_MESSAGES.tooLong;
  return null;
}

/**
 * The sit's header text, or 'Dates not set' when either date doesn't parse.
 * @param {{ start_date?: unknown, end_date?: unknown } | null | undefined} sit
 * @returns {string}
 */
export function formatSitRange(sit) {
  const start = parseSitDate(sit?.start_date);
  const end = parseSitDate(sit?.end_date);
  if (!start || !end) return 'Dates not set';
  return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
}

/**
 * Opens the browser's calendar for a date input, where supported. Called
 * by DateField's calendar button with the input as `currentTarget` (spec
 * 0088); the box itself has no click handler, so clicking it lets you type.
 * Does nothing if the input or showPicker is missing, or showPicker throws.
 * @param {{ currentTarget: { showPicker?: () => void } }} e
 */
export function openDatePicker(e) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    // Unsupported or not allowed here; typing still works.
  }
}
