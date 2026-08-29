import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import VibeIcon from '@/components/VibeIcon';
import IconButton from '@/components/IconButton';
import DailyCheckInModal from '@/components/DailyCheckInModal';
import { getCheckInsForDateRange, CATCH_UP_MAX_LOOKBACK_DAYS } from '@/lib/checkin/checkinClient';
import { formatDayLabel, formatMonthLabel, buildMonthGrid, parseDateStr, formatDateStr } from '@/lib/checkin/calendarDates';
import { useAuth } from '@/lib/AuthContext';
import { detectTimezone, dateStrInTimezone } from '@/lib/timezone';
import { track } from '@/lib/analytics';
import useFocusTrap from '@/hooks/useFocusTrap';
import { Z } from '@/lib/zIndex';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function enumerateDates(startStr, endStr) {
  const dates = [];
  let cursor = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  while (cursor <= end) {
    dates.push(formatDateStr(cursor));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return dates;
}

// Spec 0060 — a general-purpose calendar for reopening ANY day in the last
// CATCH_UP_MAX_LOOKBACK_DAYS (180) days, whether it already has a saved
// check-in or is completely blank. Unlike Catch-Up's calendar
// (CatchUpFlow.jsx), which only ever shows currently-missed days in an
// open gap and loses a day for good the moment it's saved, this stays
// reachable any time for the full window. Shares the same month-grid date
// math (calendarDates.js) and the same DailyCheckInModal/checkinClient.js
// save path every other edit flow already uses — the only new behavior is
// `confirmBeforeSave`, since overwriting a possibly-long-past day deserves
// a confirmation step that today's same-day edit (spec 0026) deliberately
// doesn't have.
//
// `isCatchUp` is deliberately always false here (source stays 'app', the
// same as spec 0026's today-edit) rather than true for past days — passing
// true would also fire DailyCheckInSheet's `catch_up_completed` analytics
// event, which belongs to the actual multi-day Catch-Up flow, not this one.
export default function CheckInHistoryCalendar({ pet, onClose, onProgress }) {
  const { user } = useAuth();
  const timezone = user?.timezone || detectTimezone() || 'UTC';
  const todayDate = dateStrInTimezone(timezone, 0);
  const floorDate = dateStrInTimezone(timezone, -CATCH_UP_MAX_LOOKBACK_DAYS);
  const todayParsed = parseDateStr(todayDate);
  const floorParsed = parseDateStr(floorDate);

  const [displayMonth, setDisplayMonth] = useState({ year: todayParsed.getUTCFullYear(), monthIndex: todayParsed.getUTCMonth() });
  const [checkInsByDate, setCheckInsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [detailDate, setDetailDate] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    track('check_in_history_opened', { pet_id: pet.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCheckInsForDateRange(pet.id, enumerateDates(floorDate, todayDate))
      .then((rows) => { if (!cancelled) setCheckInsByDate(rows); })
      .catch((err) => console.error(err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // floorDate/todayDate are fixed for the life of this overlay — only a
    // pet change should re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pet.id]);

  const handleClose = () => {
    track('check_in_history_dismissed', { pet_id: pet.id });
    onClose();
  };

  useFocusTrap(dialogRef, handleClose);

  const canGoEarlier = displayMonth.year > floorParsed.getUTCFullYear()
    || (displayMonth.year === floorParsed.getUTCFullYear() && displayMonth.monthIndex > floorParsed.getUTCMonth());
  const canGoLater = displayMonth.year < todayParsed.getUTCFullYear()
    || (displayMonth.year === todayParsed.getUTCFullYear() && displayMonth.monthIndex < todayParsed.getUTCMonth());

  const changeMonth = (delta) => {
    setDisplayMonth((prev) => {
      const next = new Date(Date.UTC(prev.year, prev.monthIndex + delta, 1));
      return { year: next.getUTCFullYear(), monthIndex: next.getUTCMonth() };
    });
  };

  const handleDaySaved = (dateStr) => {
    setDetailDate(null);
    track('check_in_history_day_saved', { pet_id: pet.id, check_in_date: dateStr });
    getCheckInsForDateRange(pet.id, [dateStr])
      .then((rows) => setCheckInsByDate((prev) => ({ ...prev, ...rows })))
      .catch((err) => console.error(err));
    onProgress?.();
  };

  const grid = buildMonthGrid(displayMonth.year, displayMonth.monthIndex);
  const isInWindow = (dateStr) => dateStr >= floorDate && dateStr <= todayDate;

  return createPortal((
    // Same portal-to-body + Z.overlay pattern as CatchUpFlow.jsx (see that
    // file's comment for why: PageTransition's motion.div makes Home a
    // containing block for `position: fixed`, so this has to escape it).
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Check-In History"
      className={`fixed inset-0 ${Z.overlay} flex flex-col bg-background`}
      style={{ paddingTop: 'calc(var(--account-banner-height, 0px) + env(safe-area-inset-top))', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <header className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-border">
        <h2 className="text-lg font-bold text-white truncate">Check-In History</h2>
        <IconButton icon={X} onClick={handleClose} aria-label="Close" />
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-tier-tertiary" aria-hidden="true" />
          </div>
        ) : (
          <div>
            <p className="text-[15px] font-semibold text-white text-center mb-2">{formatMonthLabel(displayMonth.year, displayMonth.monthIndex)}</p>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => changeMonth(-1)} disabled={!canGoEarlier} aria-label="Previous month" className="h-11 w-11 rounded-full flex items-center justify-center disabled:opacity-30">
                <ChevronLeft className="h-4 w-4 text-tier-secondary" />
              </button>
              <button onClick={() => changeMonth(1)} disabled={!canGoLater} aria-label="Next month" className="h-11 w-11 rounded-full flex items-center justify-center disabled:opacity-30">
                <ChevronRight className="h-4 w-4 text-tier-secondary" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-y-2 text-center">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d} className="text-[13px] font-medium text-tier-tertiary pb-1">{d}</div>
              ))}
              {grid.map(({ dateStr, inMonth, dayOfMonth }) => {
                if (!inMonth || !isInWindow(dateStr)) {
                  return (
                    <div key={dateStr} className="flex flex-col items-center gap-1 py-1 min-h-[44px] justify-center">
                      <span className="text-[13px] text-tier-tertiary">{inMonth ? dayOfMonth : ''}</span>
                    </div>
                  );
                }
                const checkIn = checkInsByDate[dateStr];
                return (
                  <button
                    key={dateStr}
                    onClick={() => setDetailDate(dateStr)}
                    aria-label={`${formatDayLabel(dateStr)}, ${checkIn ? (checkIn.status || 'logged') : 'no check-in yet'}`}
                    className="flex flex-col items-center gap-1 py-1 rounded-lg active:opacity-70 min-h-[44px]"
                  >
                    <span className="text-[13px] text-tier-secondary">{dayOfMonth}</span>
                    <VibeIcon status={checkIn?.status ?? null} size={20} />
                  </button>
                );
              })}
            </div>

            <p className="text-sm text-tier-tertiary mt-5 text-center">
              Tap any day to view or edit its check-in.
            </p>
          </div>
        )}
      </div>

      {detailDate && (
        <DailyCheckInModal
          pet={pet}
          checkInDate={detailDate}
          isCatchUp={false}
          dayLabel={formatDayLabel(detailDate)}
          existingCheckIn={checkInsByDate[detailDate] || null}
          confirmBeforeSave
          onClose={() => setDetailDate(null)}
          onComplete={() => handleDaySaved(detailDate)}
        />
      )}
    </div>
  ), document.body);
}
