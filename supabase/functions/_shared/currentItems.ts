// Server copy of the app's "is this food or medication current?" rule
// (spec 0087). Edge Functions can't read the app's files, so
// ask-vet-assistant and generate-vet-report use this file. It must match
// src/lib/currentItems.js:
//   - isCurrentItem()  = isCurrentItem()
//   - splitCurrent()   = splitCurrent()
// src/lib/aiServerParity.test.js fails if the two copies drift apart.
// No imports, so Vitest can load it under Node.
//
// An item is current when `active` is true AND its end date (if any) is
// today or later on the caller's calendar. A missing end date, or one that
// isn't exactly YYYY-MM-DD, counts as "not ended".

export interface CurrentItemRow {
  active?: boolean | null;
  end_date?: unknown;
  start_date?: unknown;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function hasEnded(endDate: unknown, todayStr: string): boolean {
  if (typeof endDate !== 'string' || !DATE_ONLY.test(endDate)) return false;
  return endDate < todayStr;
}

export function isCurrentItem(row: CurrentItemRow | null | undefined, todayStr: string): boolean {
  if (!row || row.active !== true) return false;
  return !hasEnded(row.end_date, todayStr);
}

export function splitCurrent<T extends CurrentItemRow>(
  rows: T[] | null | undefined,
  todayStr: string,
): { current: T[]; past: T[] } {
  const current: T[] = [];
  const past: T[] = [];
  for (const row of rows || []) {
    (isCurrentItem(row, todayStr) ? current : past).push(row);
  }
  return { current, past };
}

// Vet report: the Status column for a medication row.
export function medicationStatus(row: CurrentItemRow | null | undefined, todayStr: string): 'Active' | 'Inactive' {
  return isCurrentItem(row, todayStr) ? 'Active' : 'Inactive';
}

// Vet report: current medications first, then the rest. Stable, so rows
// already ordered by start_date (newest first) keep that order within each
// group. Returns a new array.
export function sortCurrentFirst<T extends CurrentItemRow>(rows: T[] | null | undefined, todayStr: string): T[] {
  const { current, past } = splitCurrent(rows, todayStr);
  return [...current, ...past];
}
