// Plain calendar-date-string helpers shared by every screen that renders a
// month-grid calendar of check-in days (Catch-Up's CalendarStep, spec 0015;
// the Check-In History calendar, spec 0060). Extracted out of
// CatchUpFlow.jsx (spec 0060) so a second calendar screen doesn't have to
// duplicate this date math — there is exactly one copy of it now.
export function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDateStr(date) {
  return date.toISOString().split('T')[0];
}

export function formatDayLabel(dateStr) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parseDateStr(dateStr));
}

export function formatMonthLabel(year, monthIndex) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

// Full 6-week grid (42 cells) starting on the Sunday on/before the 1st of
// the given month — a fixed-size grid keeps row count stable across months
// instead of the layout jumping between 5 and 6 rows.
export function buildMonthGrid(year, monthIndex) {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const startOffset = firstOfMonth.getUTCDay();
  const gridStart = new Date(Date.UTC(year, monthIndex, 1 - startOffset));
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i));
    return { dateStr: formatDateStr(date), inMonth: date.getUTCMonth() === monthIndex, dayOfMonth: date.getUTCDate() };
  });
}
