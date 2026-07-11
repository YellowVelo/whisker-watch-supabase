import { ArrowUp, ArrowDown, Equal, Minus } from 'lucide-react';
import { PALETTE } from '@/lib/toneColors';

// Health Score Revision V2 — the one place that renders a direction state
// (spec §8.2/§14.1: "Create or update AttributeTrendChip" / "up: green,
// equal: blue, down: red, unknown: gray, with Not enough data"). Reused by
// Home's six Health/Weight chips and Pets' four Wellbeing chips so both
// screens describe movement identically, per "maintain consistency across
// terminology" (UX Principles).
//
// Direction is never rendered by color alone — every state also carries a
// distinct icon and an explicit accessible name (spec §23: "Never expose
// only 'green arrow' to assistive technology").
export const DIRECTION_CONFIG = {
  up: { Icon: ArrowUp, color: PALETTE.teal, word: 'increased' },
  equal: { Icon: Equal, color: PALETTE.sky, word: 'unchanged' },
  down: { Icon: ArrowDown, color: PALETTE.red, word: 'decreased' },
  unknown: { Icon: Minus, color: PALETTE.gray, word: 'unknown' },
};

// Low-level icon+color+label used both inside a full chip and standalone
// (e.g. the Home score circle's "versus yesterday" line, which has no
// attribute label of its own).
export function DirectionIcon({ direction = 'unknown', className = 'h-3.5 w-3.5' }) {
  const { Icon, color } = DIRECTION_CONFIG[direction] || DIRECTION_CONFIG.unknown;
  return <Icon className={className} style={{ color }} aria-hidden="true" />;
}

// `state`:
//   'ready'      — direction is known, render icon + comparisonLabel
//   'loading'    — skeleton placeholder
//   'no-checkin' — no check-in today; comparisonLabel is overridden to
//                  "No check-in yet" per spec §16.1
//   'unavailable'— fetch failed for this attribute; "Unable to load"
export default function AttributeTrendChip({ label, direction = 'unknown', comparisonLabel = 'versus yesterday', state = 'ready', interactive = false, onClick }) {
  if (state === 'loading') {
    return (
      <div className="rounded-xl px-3 py-2.5 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.04)' }} aria-busy="true">
        <div className="h-3.5 w-3.5 rounded-full animate-pulse flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="h-3 w-16 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
        </div>
      </div>
    );
  }

  const text = state === 'no-checkin' ? 'No check-in yet' : state === 'unavailable' ? 'Unable to load' : comparisonLabel;
  const effectiveDirection = state === 'ready' ? direction : 'unknown';
  const { word } = DIRECTION_CONFIG[effectiveDirection] || DIRECTION_CONFIG.unknown;
  const accessibleName = state === 'ready' && direction !== 'unknown'
    ? `${label} ${word} ${comparisonLabel}`
    : `${label}: ${text}`;

  // Interactive chips render as a real <button> — an explicit role would
  // override its implicit button semantics for assistive tech, so role is
  // only set for the non-interactive (plain informational) case.
  //
  // Chips are frequently embedded inside a larger clickable container
  // (Home/Pets card = one big <Link>) — stopping that outer navigation is
  // handled here, once, rather than requiring every call site to remember
  // e.preventDefault()/e.stopPropagation() itself.
  const Wrapper = interactive ? 'button' : 'div';
  const handleClick = interactive
    ? (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(e); }
    : undefined;
  return (
    <Wrapper
      type={interactive ? 'button' : undefined}
      onClick={handleClick}
      role={interactive ? undefined : 'group'}
      aria-label={accessibleName}
      className={`rounded-xl px-3 py-2.5 flex items-center gap-2 text-left ${interactive ? 'min-h-[44px] active:opacity-80 transition-opacity' : ''}`}
      style={{ background: 'rgba(255,255,255,0.04)' }}
    >
      <DirectionIcon direction={effectiveDirection} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-white truncate">{label}</p>
        <p className="text-[12px] text-white/45 truncate">{text}</p>
      </div>
    </Wrapper>
  );
}
