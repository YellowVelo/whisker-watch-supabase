// Design System §1 core/semantic palette — reads the CSS variables defined
// in src/index.css so there is one source of truth for these hex values
// instead of each component hardcoding its own copy.
export const PALETTE = {
  sky: 'var(--accent-sky)',
  teal: 'var(--tone-good)',
  amber: 'var(--tone-warn)',
  red: 'var(--tone-bad)',
  gray: 'var(--tone-neutral)',
};

// Spec 0079 Part B: the same five colors as space-separated RGB channels
// (--…-rgb in src/index.css), so a screen can use any strength of one
// shared definition instead of hand-typing the numbers.
const CHANNEL_VAR = {
  sky: '--accent-sky-rgb',
  teal: '--tone-good-rgb',
  amber: '--tone-warn-rgb',
  red: '--tone-bad-rgb',
  gray: '--tone-neutral-rgb',
};

// tint('teal', 0.15) → 'rgb(var(--tone-good-rgb) / 0.15)'
export function tint(name, alpha) {
  const channels = CHANNEL_VAR[name];
  if (!channels) throw new Error(`Unknown palette color: ${name}`);
  return `rgb(var(${channels}) / ${alpha})`;
}

// The common 15% strength used for chip and icon backgrounds.
export const PALETTE_SOFT = {
  sky: tint('sky', 0.15),
  teal: tint('teal', 0.15),
  amber: tint('amber', 0.15),
  red: tint('red', 0.15),
  gray: tint('gray', 0.15),
};

export const TONE_COLOR = { good: PALETTE.teal, warn: PALETTE.amber, bad: PALETTE.red, unknown: PALETTE.gray };
export const TREND_COLOR = { stable: PALETTE.teal, improving: PALETTE.sky, monitor: PALETTE.amber, declining: PALETTE.red, unknown: PALETTE.gray };
export const RING_COLOR = TONE_COLOR;
