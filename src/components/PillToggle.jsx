import { PALETTE } from '@/lib/toneColors';

// Design System Amendment #8 (2026-07-30) — the canonical toggle/pill
// button, replacing 5-6 independently hand-built copies across
// DailyCheckInSheet, BulkApplySheet, CatchUpFlow, PetInfoCard (onboarding),
// EditPetSheet, and PetTrends. Sky-accent is the winning color family.
// Padding/layout (flex-1, px/py, truncate, grid placement) stays owned by
// each call site via `className`; this component owns color, shape, and
// the active/inactive state contract.
// `variant="segmented"` is for a pill already sitting inside its own
// pre-backgrounded track (e.g. a time-range switcher) — it skips the
// standalone inactive background/border so the two don't double up,
// showing only a color change between active/inactive.
export default function PillToggle({ active, onClick, children, icon: Icon = undefined, className = '', disabled = false, type = 'button', variant = 'standalone', ...props }) {
  const inactiveStyle = variant === 'segmented'
    ? { color: 'var(--text-tertiary)' }
    : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)' };
  return (
    <button
      type={/** @type {"button" | "submit" | "reset"} */ (type)}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all min-h-[44px] disabled:opacity-40 ${className}`}
      style={active ? { background: PALETTE.sky, color: 'hsl(var(--background))' } : inactiveStyle}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
      {children}
    </button>
  );
}
