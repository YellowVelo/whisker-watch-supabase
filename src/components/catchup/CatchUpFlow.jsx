import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, CircleDashed, Minus, Check, Loader2, ClipboardList } from 'lucide-react';
import { PALETTE } from '@/lib/toneColors';
import VibeIcon from '@/components/VibeIcon';
import DailyCheckInSheet from '@/components/DailyCheckInSheet';
import BulkApplySheet from './BulkApplySheet';
import { getCheckInsForDateRange, markGreatDaysBulk } from '@/lib/checkin/checkinClient';
import { DemoAccountBlockedError } from '@/lib/demoWriteGuard';
import { track } from '@/lib/analytics';

// Spec 0015 (Multi-Day Catch-Up Check-In). Calendar/exceptions UI (PR 2)
// plus the save path (PR 3): bulk-apply across selected exception days,
// and "Finish Catch Up" — the bulk write (markGreatDaysBulk) for every
// missed day the owner never flagged, i.e. the ones still just "assumed
// Great Day". Every exception-day save, bulk-applied or individual, goes
// through the exact same DailyCheckInSheet/markOffTough path a normal day
// already uses.
const LONG_GAP_THRESHOLD_DAYS = 30;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateStr(date) {
  return date.toISOString().split('T')[0];
}

function formatDayLabel(dateStr) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parseDateStr(dateStr));
}

function formatMonthLabel(year, monthIndex) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

// Full 6-week grid (42 cells) starting on the Sunday on/before the 1st of
// the given month — a fixed-size grid keeps row count stable across months
// instead of the layout jumping between 5 and 6 rows.
function buildMonthGrid(year, monthIndex) {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const startOffset = firstOfMonth.getUTCDay();
  const gridStart = new Date(Date.UTC(year, monthIndex, 1 - startOffset));
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i));
    return { dateStr: formatDateStr(date), inMonth: date.getUTCMonth() === monthIndex, dayOfMonth: date.getUTCDate() };
  });
}

export default function CatchUpFlow({ pets, missedDaysByPet, onClose, onPetProgress }) {
  const multiPet = pets.length > 1;
  const [step, setStep] = useState(multiPet ? 'petSelect' : 'entry');
  const [selectedPet, setSelectedPet] = useState(multiPet ? null : pets[0]);
  const [checkInsByDate, setCheckInsByDate] = useState({}); // date -> real daily_check_ins row (this session's saves only)
  const [exceptionDates, setExceptionDates] = useState(new Set()); // dates flagged "Needs Details", not yet detailed
  const [detailDate, setDetailDate] = useState(null);
  const [longGapFeeling, setLongGapFeeling] = useState(null); // analytics-only warm-up answer, never persisted per day
  const [bulkSelectedDates, setBulkSelectedDates] = useState(new Set()); // exception-list multi-select, for bulk apply
  const [bulkApplyDates, setBulkApplyDates] = useState(null); // array of dates currently open in BulkApplySheet, or null
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(null);

  // Snapshotted once per selected pet, deliberately NOT re-derived from the
  // live missedDaysByPet prop on every render. Home refetches that prop
  // after each detail save (so its own banner count stays accurate), which
  // would otherwise shrink this list mid-session and make a day the owner
  // just resolved vanish from the calendar into a blank "not part of
  // catch-up" cell instead of showing its saved icon — the calendar needs
  // a stable record of which days were originally in the gap, independent
  // of Home's live "still needs catching up" tracking.
  const [missedDates, setMissedDates] = useState([]);
  const isLongGap = missedDates.length >= LONG_GAP_THRESHOLD_DAYS;

  const [displayMonth, setDisplayMonth] = useState(null); // { year, monthIndex } | null until missedDates load

  useEffect(() => {
    if (!selectedPet) { setMissedDates([]); return; }
    setCheckInsByDate({});
    setExceptionDates(new Set());
    setMissedDates(missedDaysByPet[selectedPet.id]?.missedDates || []);
    // Deliberately only re-runs when the SELECTED PET changes, not when
    // missedDaysByPet itself updates — see comment above.
  }, [selectedPet]);

  useEffect(() => {
    if (missedDates.length === 0) { setDisplayMonth(null); return; }
    const latest = parseDateStr(missedDates[missedDates.length - 1]);
    setDisplayMonth({ year: latest.getUTCFullYear(), monthIndex: latest.getUTCMonth() });
  }, [missedDates]);

  const selectPet = (pet) => {
    setSelectedPet(pet);
    setStep('entry');
  };

  const startCatchUp = () => {
    track('multi_day_catch_up_flow_entered', { pet_id: selectedPet.id, missed_day_count: missedDates.length });
    setStep(isLongGap ? 'longGapPrompt' : 'calendar');
  };

  const proceedToCalendar = () => {
    if (longGapFeeling) track('multi_day_catch_up_feeling_selected', { pet_id: selectedPet.id, feeling: longGapFeeling });
    setStep('calendar');
  };

  const toggleException = (date) => {
    if (checkInsByDate[date]) { setDetailDate(date); return; } // already resolved this session — tap to review/edit
    setExceptionDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const clearAllExceptions = () => setExceptionDates(new Set());

  const handleDetailSaved = () => {
    if (!selectedPet || !detailDate) return;
    const savedDate = detailDate;
    setDetailDate(null);
    getCheckInsForDateRange(selectedPet.id, [savedDate])
      .then((rows) => {
        const nextCheckInsByDate = { ...checkInsByDate, ...rows };
        setCheckInsByDate(nextCheckInsByDate);
        // Spec 0017: once the day just saved was the last one still
        // flagged as needing details, return to Calendar automatically
        // instead of leaving the owner on an empty "No days need details
        // right now" screen with no obvious next step.
        const stillNeedsDetails = missedDates.some((d) => exceptionDates.has(d) && !nextCheckInsByDate[d]);
        if (!stillNeedsDetails) setStep('calendar');
      })
      .catch((err) => console.error(err));
    track('multi_day_catch_up_day_saved', { pet_id: selectedPet.id, check_in_date: savedDate });
    onPetProgress?.(selectedPet);
  };

  const handleClose = () => {
    track('multi_day_catch_up_dismissed', selectedPet ? { pet_id: selectedPet.id, step } : { step });
    onClose();
  };

  const toggleBulkSelect = (date) => {
    setBulkSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  const handleBulkApplySaved = (savedDates) => {
    if (!selectedPet) return;
    setBulkApplyDates(null);
    setBulkSelectedDates(new Set());
    getCheckInsForDateRange(selectedPet.id, savedDates)
      .then((rows) => {
        const nextCheckInsByDate = { ...checkInsByDate, ...rows };
        setCheckInsByDate(nextCheckInsByDate);
        // Spec 0017: same auto-return rule as handleDetailSaved — bulk
        // resolving the last flagged days should also return to Calendar,
        // not leave the owner on the dead-looking empty exceptions list.
        const stillNeedsDetails = missedDates.some((d) => exceptionDates.has(d) && !nextCheckInsByDate[d]);
        if (!stillNeedsDetails) setStep('calendar');
      })
      .catch((err) => console.error(err));
    onPetProgress?.(selectedPet);
  };

  // "Finish Catch Up" — every missed day the owner neither detailed nor
  // flagged gets the bulk "assumed Great Day" write in one batched call
  // (spec Requirement 3). Only reachable once every flagged exception has
  // actually been detailed (exceptionList is empty) — a day the owner
  // flagged but never explained is a dangling "something was wrong but I
  // don't know what" state that finishing silently as Great Day would
  // quietly erase, so the UI blocks it instead (see the disabled button
  // below) rather than deciding for the owner.
  const handleFinish = async () => {
    if (!selectedPet || exceptionList.length > 0) return;
    const daysToMarkGreat = missedDates.filter((d) => !checkInsByDate[d] && !exceptionDates.has(d));
    setFinishing(true);
    setFinishError(null);
    try {
      if (daysToMarkGreat.length > 0) {
        await markGreatDaysBulk(selectedPet.id, daysToMarkGreat, 'catch_up');
      }
      track('multi_day_catch_up_completed', {
        pet_id: selectedPet.id,
        missed_day_count: missedDates.length,
        great_day_count: daysToMarkGreat.length,
        detailed_day_count: resolvedCount,
      });
      onPetProgress?.(selectedPet);
      setStep('complete');
    } catch (err) {
      console.error(err);
      // A blocked demo write already showed its own toast (demoWriteGuard.js)
      // — no need to duplicate that message in this inline banner too.
      if (!(err instanceof DemoAccountBlockedError)) {
        setFinishError("Couldn't finish catch up — check your connection and try again.");
      }
    } finally {
      setFinishing(false);
    }
  };

  const exceptionList = missedDates.filter((d) => exceptionDates.has(d) && !checkInsByDate[d]);
  const resolvedCount = missedDates.filter((d) => checkInsByDate[d]).length;

  const changeMonth = (delta) => {
    if (!displayMonth) return;
    const next = new Date(Date.UTC(displayMonth.year, displayMonth.monthIndex + delta, 1));
    setDisplayMonth({ year: next.getUTCFullYear(), monthIndex: next.getUTCMonth() });
  };

  const canGoEarlier = displayMonth && missedDates.length > 0
    && (displayMonth.year > parseDateStr(missedDates[0]).getUTCFullYear()
      || (displayMonth.year === parseDateStr(missedDates[0]).getUTCFullYear() && displayMonth.monthIndex > parseDateStr(missedDates[0]).getUTCMonth()));
  const canGoLater = displayMonth && missedDates.length > 0
    && (displayMonth.year < parseDateStr(missedDates[missedDates.length - 1]).getUTCFullYear()
      || (displayMonth.year === parseDateStr(missedDates[missedDates.length - 1]).getUTCFullYear() && displayMonth.monthIndex < parseDateStr(missedDates[missedDates.length - 1]).getUTCMonth()));

  // Portaled straight to document.body rather than rendered inline. Home is
  // wrapped in PageTransition's motion.div, which Framer Motion gives a
  // `transform` style even at rest — per the CSS spec, ANY transform on an
  // ancestor (even an identity one) makes it the containing block for
  // `position: fixed` descendants. Rendered inline, this overlay's "fixed
  // inset-0" would size itself to Home's full scrollable content height
  // instead of the actual viewport, putting the header and footer far
  // off-screen the moment Home is scrolled at all (confirmed while
  // building this — the header/footer weren't just visually covered, they
  // were positioned thousands of pixels away). Portaling to body escapes
  // that transformed ancestor entirely, so "fixed" means the viewport
  // again, matching what every other full-screen overlay in this app
  // assumes. DailyCheckInSheet/DailyCheckInModal have the same latent bug
  // but happen to mostly render at scrollY≈0, which masks it — worth a
  // follow-up, not fixed here since it's pre-existing and out of scope.
  return createPortal((
    // z-[60] (not z-50) and the --account-banner-height offset match the
    // precedent set by CareMenu.jsx — the only other full-screen overlay
    // in the app: z-50 sits *below* both AccountTypeBanner (z-[70], always
    // on top by design) and BottomTabBar (z-50, same layer, paints after),
    // so a top-anchored header/bottom-anchored footer at plain z-50 gets
    // silently covered by both. z-[60] clears the tab bar; the padding
    // clears the account banner instead of hiding behind it.
    <div className="fixed inset-0 z-[60] flex flex-col bg-background" style={{ paddingTop: 'calc(var(--account-banner-height, 0px) + env(safe-area-inset-top))', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <header className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 min-w-0">
          {step === 'exceptions' && (
            <button onClick={() => setStep('calendar')} aria-label="Back" className="h-9 w-9 -ml-2 rounded-full flex items-center justify-center flex-shrink-0">
              <ChevronLeft className="h-5 w-5 text-white/70" />
            </button>
          )}
          <h2 className="text-lg font-bold text-white truncate">
            {step === 'petSelect' && 'Catch Up Check-In'}
            {step === 'entry' && 'Catch Up Check-In'}
            {step === 'longGapPrompt' && `How has ${selectedPet?.name} been?`}
            {step === 'calendar' && (displayMonth ? formatMonthLabel(displayMonth.year, displayMonth.monthIndex) : 'Calendar')}
            {step === 'exceptions' && `Exceptions (${exceptionList.length})`}
            {step === 'complete' && 'All Caught Up'}
          </h2>
        </div>
        <button onClick={handleClose} aria-label="Close" className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
          <X className="h-4 w-4 text-white" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {step === 'petSelect' && (
          <PetSelectStep pets={pets} missedDaysByPet={missedDaysByPet} onSelect={selectPet} />
        )}

        {step === 'entry' && selectedPet && (
          <EntryStep petName={selectedPet.name} missedCount={missedDates.length} onGetStarted={startCatchUp} onMaybeLater={handleClose} />
        )}

        {step === 'longGapPrompt' && selectedPet && (
          <LongGapPromptStep petName={selectedPet.name} feeling={longGapFeeling} onSelectFeeling={setLongGapFeeling} onContinue={proceedToCalendar} />
        )}

        {step === 'calendar' && selectedPet && displayMonth && (
          <CalendarStep
            grid={buildMonthGrid(displayMonth.year, displayMonth.monthIndex)}
            missedDates={missedDates}
            checkInsByDate={checkInsByDate}
            exceptionDates={exceptionDates}
            onToggle={toggleException}
            onClearAll={clearAllExceptions}
            monthLabel={formatMonthLabel(displayMonth.year, displayMonth.monthIndex)}
            onPrevMonth={() => changeMonth(-1)}
            onNextMonth={() => changeMonth(1)}
            canGoEarlier={canGoEarlier}
            canGoLater={canGoLater}
          />
        )}

        {step === 'exceptions' && selectedPet && (
          <ExceptionsStep
            dates={exceptionList}
            selectedDates={bulkSelectedDates}
            onToggleSelect={toggleBulkSelect}
            onOpenDetails={(d) => setDetailDate(d)}
            onBulkApply={() => setBulkApplyDates([...bulkSelectedDates])}
          />
        )}

        {step === 'complete' && selectedPet && (
          <CompleteStep petName={selectedPet.name} onDone={onClose} />
        )}
      </div>

      {step === 'calendar' && (
        <div className="flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
          {finishError && <p className="text-xs text-red-400 text-center pt-2">{finishError}</p>}
          {exceptionList.length > 0 ? (
            <button
              onClick={() => setStep('exceptions')}
              className="w-full flex items-center justify-between px-5 py-4 text-sm"
            >
              <span className="text-white/70">
                <span className="font-semibold text-white">{missedDates.length}</span> days missed
                {resolvedCount > 0 && <span className="text-white/40"> · {resolvedCount} saved</span>}
              </span>
              <span className="flex items-center gap-1 font-semibold" style={{ color: PALETTE.sky }}>
                {exceptionList.length} need details <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          ) : (
            <div className="px-5 py-4">
              <p className="text-xs text-white/40 text-center mb-2">
                {missedDates.length} days missed{resolvedCount > 0 && ` · ${resolvedCount} saved`}
              </p>
              <button
                onClick={handleFinish}
                disabled={finishing}
                className="w-full flex items-center justify-center text-base font-bold rounded-2xl h-14 disabled:opacity-40 transition-opacity"
                style={{ background: PALETTE.sky, color: 'hsl(var(--background))' }}
              >
                {finishing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Finishing…</> : 'Finish Catch Up'}
              </button>
            </div>
          )}
        </div>
      )}

      {detailDate && selectedPet && (
        <DailyCheckInSheet
          pet={selectedPet}
          date={detailDate}
          isCatchUp
          dayLabel={formatDayLabel(detailDate)}
          existingCheckIn={checkInsByDate[detailDate] || null}
          onClose={() => setDetailDate(null)}
          onSaved={handleDetailSaved}
        />
      )}

      {bulkApplyDates && selectedPet && (
        <BulkApplySheet
          pet={selectedPet}
          dates={bulkApplyDates}
          onClose={() => setBulkApplyDates(null)}
          onSaved={handleBulkApplySaved}
        />
      )}
    </div>
  ), document.body);
}

function PetSelectStep({ pets, missedDaysByPet, onSelect }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-2">Which pet would you like to catch up for?</p>
      {pets.map((pet) => (
        <button
          key={pet.id}
          onClick={() => onSelect(pet)}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 text-left"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div>
            <p className="text-base font-semibold text-white">{pet.name}</p>
            <p className="text-sm text-white/50">{missedDaysByPet[pet.id]?.count || 0} days missed</p>
          </div>
          <ChevronRight className="h-4 w-4 text-white/40" />
        </button>
      ))}
    </div>
  );
}

function EntryStep({ petName, missedCount, onGetStarted, onMaybeLater }) {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-8">
      <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <ClipboardList className="h-8 w-8" style={{ color: PALETTE.sky }} aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-2xl font-bold text-white mb-2">We missed you!</h3>
        <p className="text-base text-white/60">Let's get {petName} caught up.</p>
      </div>
      <div className="w-full rounded-2xl px-4 py-4 text-sm text-white/60" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <p className="text-white font-semibold mb-1">Looks like {missedCount} days were missed.</p>
        <p>We assume most days were Great Days unless you tell us otherwise.</p>
      </div>
      <button onClick={onGetStarted} className="w-full text-base font-bold rounded-2xl h-14" style={{ background: PALETTE.sky, color: 'hsl(var(--background))' }}>
        Get Started
      </button>
      <button onClick={onMaybeLater} className="text-sm font-semibold text-white/50">
        Maybe later
      </button>
    </div>
  );
}

const LONG_GAP_FEELINGS = [
  { value: 'great', label: 'Great', description: 'has been doing well' },
  { value: 'some_challenges', label: "We've had some challenges", description: 'There were some off or tough days' },
  { value: 'rather_not_say', label: "I'd rather not say right now", description: 'I can choose days myself' },
];

function LongGapPromptStep({ petName, feeling, onSelectFeeling, onContinue }) {
  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-sm text-white/50">This helps us get the right context. It's OK if you aren't sure about every day.</p>
      <div className="space-y-3">
        {LONG_GAP_FEELINGS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelectFeeling(opt.value)}
            aria-pressed={feeling === opt.value}
            className="w-full text-left rounded-2xl px-4 py-3.5"
            style={feeling === opt.value
              ? { background: PALETTE.sky, color: 'hsl(var(--background))' }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          >
            <p className="text-base font-semibold">{opt.label}</p>
            <p className={`text-sm ${feeling === opt.value ? 'opacity-80' : 'text-white/50'}`}>{petName} {opt.description}</p>
          </button>
        ))}
      </div>
      <button onClick={onContinue} className="w-full text-base font-bold rounded-2xl h-14 mt-2" style={{ background: PALETTE.sky, color: 'hsl(var(--background))' }}>
        Continue
      </button>
    </div>
  );
}

// Precedence for a missed day's icon: a real saved row (this session) wins
// over an in-progress "Needs Details" flag, which wins over the default
// "assumed Great Day" — matches the calendar's own read order in
// CatchUpFlow (checkInsByDate checked before exceptionDates).
function DayIcon({ checkIn, isException }) {
  if (checkIn) return <VibeIcon status={checkIn.status} size={20} />;
  if (isException) return <CircleDashed className="h-5 w-5" style={{ color: PALETTE.amber }} aria-hidden="true" />;
  return <VibeIcon status="great" size={20} />;
}

function CalendarStep({ grid, missedDates, checkInsByDate, exceptionDates, onToggle, onClearAll, onPrevMonth, onNextMonth, canGoEarlier, canGoLater }) {
  const missedSet = useMemo(() => new Set(missedDates), [missedDates]);
  const anyExceptions = exceptionDates.size > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrevMonth} disabled={!canGoEarlier} aria-label="Previous month" className="h-8 w-8 rounded-full flex items-center justify-center disabled:opacity-30">
          <ChevronLeft className="h-4 w-4 text-white/70" />
        </button>
        {anyExceptions && (
          <button onClick={onClearAll} className="text-xs font-semibold" style={{ color: PALETTE.sky }}>Clear All</button>
        )}
        <button onClick={onNextMonth} disabled={!canGoLater} aria-label="Next month" className="h-8 w-8 rounded-full flex items-center justify-center disabled:opacity-30">
          <ChevronRight className="h-4 w-4 text-white/70" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-xs font-medium text-white/40 pb-1">{d}</div>
        ))}
        {grid.map(({ dateStr, inMonth, dayOfMonth }) => {
          const isMissed = missedSet.has(dateStr);
          if (!inMonth || !isMissed) {
            return (
              <div key={dateStr} className="flex flex-col items-center gap-1 py-1">
                <span className={`text-xs ${inMonth ? 'text-white/25' : 'text-white/10'}`}>{dayOfMonth}</span>
                <Minus className="h-4 w-4 text-white/10" aria-hidden="true" />
              </div>
            );
          }
          const checkIn = checkInsByDate[dateStr];
          const isException = exceptionDates.has(dateStr);
          return (
            <button
              key={dateStr}
              onClick={() => onToggle(dateStr)}
              className="flex flex-col items-center gap-1 py-1 rounded-lg active:opacity-70"
            >
              <span className="text-xs text-white/70">{dayOfMonth}</span>
              <DayIcon checkIn={checkIn} isException={isException} />
            </button>
          );
        })}
      </div>

      <p className="text-sm text-white/50 mt-5 text-center">
        We assume these were <span style={{ color: PALETTE.sky }} className="font-semibold">Great Days</span>. Tap any day that wasn't a Great Day.
      </p>
    </div>
  );
}

// Spec 0017: tapping a day's row is the default, single action — select it
// for bulk-apply (the common case: several days shared the same issue). A
// separate, small icon-only button opens that one day's full details
// instead, for the less common case of reviewing/answering a day on its
// own. This flips the previous design (checkbox to select, row-body tap to
// open details), which read as two competing, easy-to-mix-up tap targets
// on the same row. Bulk apply (spec 0015: "if several consecutive days all
// had the same issue, apply the same details to all selected days") only
// needs 2+ selected to make sense, so the action bar stays hidden below
// that, same as before.
function ExceptionsStep({ dates, selectedDates, onToggleSelect, onOpenDetails, onBulkApply }) {
  if (dates.length === 0) {
    return <p className="text-sm text-white/50 text-center py-8">No days need details right now.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-white/50">Tap a day to select it, or open it to answer alone.</p>
        {selectedDates.size >= 2 && (
          <button onClick={onBulkApply} className="text-sm font-semibold" style={{ color: PALETTE.sky }}>
            Apply to {selectedDates.size} days
          </button>
        )}
      </div>
      {dates.map((dateStr) => {
        const checked = selectedDates.has(dateStr);
        return (
          <div
            key={dateStr}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3.5"
            style={checked
              ? { background: 'rgba(255,255,255,0.05)', border: `2px solid ${PALETTE.sky}` }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <button
              onClick={() => onToggleSelect(dateStr)}
              aria-pressed={checked}
              aria-label={checked ? `Deselect ${formatDayLabel(dateStr)}` : `Select ${formatDayLabel(dateStr)}`}
              className="flex-1 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <CircleDashed className="h-4 w-4" style={{ color: checked ? PALETTE.sky : PALETTE.amber }} aria-hidden="true" />
                <div>
                  <p className="text-base font-semibold text-white">{formatDayLabel(dateStr)}</p>
                  <p className="text-sm text-white/50">{checked ? 'Selected' : 'Needs details'}</p>
                </div>
              </div>
              {checked && <Check className="h-4 w-4 flex-shrink-0" style={{ color: PALETTE.sky }} aria-hidden="true" />}
            </button>
            <button
              onClick={() => onOpenDetails(dateStr)}
              aria-label={`Open details for ${formatDayLabel(dateStr)}`}
              className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)' }}
            >
              <ChevronRight className="h-4 w-4 text-white/60" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CompleteStep({ petName, onDone }) {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-12">
      <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: PALETTE.sky }}>
        <Check className="h-8 w-8" style={{ color: 'hsl(var(--background))' }} />
      </div>
      <div>
        <h3 className="text-2xl font-bold text-white mb-2">All caught up!</h3>
        <p className="text-base text-white/60">{petName} is all set. You're back in sync.</p>
      </div>
      <button onClick={onDone} className="w-full text-base font-bold rounded-2xl h-14" style={{ background: PALETTE.sky, color: 'hsl(var(--background))' }}>
        Done
      </button>
    </div>
  );
}
