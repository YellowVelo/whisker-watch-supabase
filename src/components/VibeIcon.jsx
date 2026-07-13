import { Sun, CloudRainWind, CloudHail, BadgeHelp } from 'lucide-react';
import { PALETTE } from '@/lib/toneColors';

// Daily Check-In, Vibe & Trends (spec v5) — replaces the retired 0-100
// Wellness rings and 0-10 Health Score circle everywhere on Home and Pet
// Profile. Vibe is a self-report, not a graded metric, so it renders as a
// single icon in one flat color (PALETTE.sky) for every state — no tone-
// based (good/warn/bad) color mapping, deliberately simplifying away the
// old STATUS_TONE logic for this element.
const VIBE_ICON = { great: Sun, off: CloudRainWind, tough: CloudHail };

// `status`: 'great' | 'off' | 'tough' | 'skipped' | null (no check-in yet
// today, or a legacy migrated day with no Vibe recorded — both render the
// same "unknown" badge; distinguishing them further isn't required this
// round).
export default function VibeIcon({ status, size = 28, className = '' }) {
  const Icon = VIBE_ICON[status] || BadgeHelp;
  return <Icon className={className} style={{ width: size, height: size, color: PALETTE.sky }} aria-hidden="true" />;
}

export function vibeAccessibleLabel(status) {
  if (status === 'great') return 'Great Day';
  if (status === 'off') return 'Off Day';
  if (status === 'tough') return 'Tough Day';
  if (status === 'skipped') return 'Skipped';
  return 'No check-in yet';
}
