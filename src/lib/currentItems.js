// Spec 0087: the one "is this food or medication current?" rule.
// An item is current when the owner has it switched on AND its end date
// (if any) hasn't passed yet on the viewer's calendar. An item that ends
// today is still current today.
//
// The server keeps an identical copy in
// supabase/functions/_shared/currentItems.ts (Edge Functions can't import
// app files); src/lib/aiServerParity.test.js fails if the two drift apart.
import { dateStrInTimezone, detectTimezone, isValidIanaTimezone } from './timezone';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// True only when end_date is a well-formed YYYY-MM-DD that is before today.
// A missing end_date, or any value that isn't exactly YYYY-MM-DD (a
// timestamp, "11/02/2026", a number, junk), counts as "not ended", so bad
// data never hides an item the owner switched on.
function hasEnded(endDate, todayStr) {
  if (typeof endDate !== 'string' || !DATE_ONLY.test(endDate)) return false;
  return endDate < todayStr;
}

export function isCurrentItem(row, todayStr) {
  if (!row || row.active !== true) return false;
  return !hasEnded(row.end_date, todayStr);
}

// Splits rows into { current, past }, keeping each group in input order.
export function splitCurrent(rows, todayStr) {
  const current = [];
  const past = [];
  for (const row of rows || []) {
    (isCurrentItem(row, todayStr) ? current : past).push(row);
  }
  return { current, past };
}

// Today's date (YYYY-MM-DD) on the viewer's calendar: their saved time zone,
// else the device's, else UTC. A saved zone that isn't a real IANA name
// is treated as unset, so a bad profile value never breaks the page.
export function todayForUser(user) {
  const saved = isValidIanaTimezone(user?.timezone) ? user.timezone : null;
  return dateStrInTimezone(saved || detectTimezone() || 'UTC', 0);
}
