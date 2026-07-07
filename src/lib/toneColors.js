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

export const TONE_COLOR = { good: PALETTE.teal, warn: PALETTE.amber, bad: PALETTE.red, unknown: PALETTE.gray };
export const TREND_COLOR = { stable: PALETTE.teal, improving: PALETTE.sky, monitor: PALETTE.amber, declining: PALETTE.red, unknown: PALETTE.gray };
export const RING_COLOR = TONE_COLOR;
