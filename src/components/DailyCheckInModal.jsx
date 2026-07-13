import DailyCheckInSheet from './DailyCheckInSheet';
import { todayStr } from '@/lib/checkin/checkinClient';

// Public entry point for the Daily Check-In pop-up. All actual save/stage
// logic lives in DailyCheckInSheet (markGreatDay/markSkipped/markOffTough
// against daily_check_ins/observations) — this wrapper only normalizes the
// prop contract (`pet`, `checkInDate`, `existingCheckIn`, `onComplete`,
// `onClose`) so callers don't need to know the sheet's catch-up-specific
// prop names.
//
// `isCatchUp` is accepted as an explicit override so callers that already
// know which date they resolved `checkInDate` from (e.g. Home.jsx, which
// resolves "today"/"yesterday" using the user's stored timezone) don't
// have to rely on this component's own UTC-based `todayStr()` fallback,
// which could disagree with a timezone-aware caller right at day
// boundaries (spec: "Daily date boundaries must use the user's stored
// timezone, not UTC midnight").
export default function DailyCheckInModal({ pet, checkInDate, existingCheckIn, onComplete, onClose, isCatchUp: isCatchUpProp }) {
  const isCatchUp = isCatchUpProp ?? (checkInDate !== todayStr());
  return (
    <DailyCheckInSheet
      pet={pet}
      date={checkInDate}
      isCatchUp={isCatchUp}
      existingCheckIn={existingCheckIn}
      onClose={onClose}
      onSaved={onComplete}
    />
  );
}
