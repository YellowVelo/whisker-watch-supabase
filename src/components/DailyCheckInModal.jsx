import DailyCheckInSheet from './DailyCheckInSheet';
import { todayStr } from '@/lib/checkin/checkinClient';

// Public entry point for the Daily Check-In pop-up. All actual save/stage
// logic lives in DailyCheckInSheet (markNormal/markSkipped/saveChangedCheckIn
// against daily_check_ins/observations/wellness_scores) — this wrapper only
// normalizes the prop contract (`pet`, `checkInDate`, `existingCheckIn`,
// `onComplete`, `onClose`) so callers don't need to know the sheet's
// catch-up-specific prop names.
export default function DailyCheckInModal({ pet, checkInDate, existingCheckIn, onComplete, onClose }) {
  const isCatchUp = checkInDate !== todayStr();
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
