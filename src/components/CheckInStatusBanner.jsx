import { Link } from 'react-router-dom';
import { Sun, Minus, CloudRainWind, CloudHail, Clock } from 'lucide-react';
import { PALETTE } from '@/lib/toneColors';

// One-line Daily Check-In status row nested directly under a pet's card on
// Home — a single compact row per pet rather than a separate "Today's
// Check-Ins" list. Covers every state: not completed (tappable prompt),
// Great/Off/Tough Day completed (links to Trends), and error — never
// collapses these into one generic "done" state.
const CONFIG = {
  great: { Icon: Sun, color: PALETTE.teal, text: (name) => `${name} had a Great Day` },
  off: { Icon: CloudRainWind, color: PALETTE.amber, text: (name) => `${name} had an Off Day` },
  tough: { Icon: CloudHail, color: PALETTE.amber, text: (name) => `${name} had a Tough Day` },
  skipped: { Icon: Minus, color: 'rgba(255,255,255,0.4)', text: (name) => `${name} skipped today` },
};

export default function CheckInStatusBanner({ pet, checkIn, onStartCheckIn, error = false, onRetry }) {
  const trendsHref = `/pet/${pet.id}/trends`;

  if (error) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(229,115,115,0.08)' }}>
        <span className="text-[13px] text-white/60">Unable to load {pet.name}'s check-in.</span>
        {onRetry && (
          <button onClick={onRetry} className="text-[13px] font-semibold text-primary flex-shrink-0 min-h-[44px] px-2">Retry</button>
        )}
      </div>
    );
  }

  const status = checkIn?.status;

  if (!status) {
    return (
      <button
        type="button"
        onClick={() => onStartCheckIn?.()}
        className="w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 active:opacity-80 transition-opacity min-h-[44px] text-left"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <Clock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: PALETTE.amber }} aria-hidden="true" />
        <span className="text-[13px] font-semibold text-white/85 truncate">Start {pet.name}'s Daily Check-In</span>
      </button>
    );
  }

  const { Icon, color, text } = CONFIG[status] || CONFIG.skipped;

  return (
    <Link
      to={trendsHref}
      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 active:opacity-80 transition-opacity min-h-[44px]"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} aria-hidden="true" />
      <span className="text-[13px] text-white/80 truncate">{text(pet.name)}</span>
    </Link>
  );
}
