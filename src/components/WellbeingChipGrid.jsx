import AttributeTrendChip from '@/components/AttributeTrendChip';
import { WELLBEING_ATTRIBUTES } from '@/lib/checkin/config';

// Daily Check-In, Vibe & Trends (spec v5) — always Energy/Mobility/
// Breathing/Skin-Itching/Behavior, in this order.
const WELLBEING_CHIP_LABELS = { energy: 'Energy', mobility: 'Mobility', breathing: 'Breathing', itching: 'Skin / Itching', behavior: 'Behavior' };

// Shared by the owner's Pets-tab card (PetProfileContent — interactive,
// tapping a chip opens Trends filtered to that metric) and the sitter's
// read-only Pets I Sit row (SitterPetRow, spec 0037 — non-interactive,
// since the row itself is already a single tap target to Trends and a
// clickable chip inside it would be invalid nested-interactive markup).
export default function WellbeingChipGrid({ directions, unavailable, checkedInToday, interactive = false, onChipClick }) {
  if (unavailable) {
    return <p className="text-base text-tier-tertiary text-center py-4">Unable to load wellbeing.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {WELLBEING_ATTRIBUTES.map((code) => (
        <AttributeTrendChip
          key={code}
          label={WELLBEING_CHIP_LABELS[code]}
          direction={directions?.[code]}
          state={!directions ? 'loading' : !checkedInToday ? 'no-checkin' : 'ready'}
          interactive={interactive}
          onClick={interactive ? () => onChipClick?.(code) : undefined}
        />
      ))}
    </div>
  );
}
