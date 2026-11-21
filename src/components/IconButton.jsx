import { Link } from 'react-router-dom';

// Design System Amendment #8/#11 (2026-07-30) — the canonical circular
// icon button, replacing 4+ independently hand-built back-button styles
// across page headers, plus AppHeader's own action buttons (no separate
// "header action" style is allowed per Amendment #11). Renders a <Link>
// when `to` is provided, otherwise a plain <button>.
//
// variant="plain" (spec 0076, PA-55) drops the circle's background and
// border but keeps the 44px tap area, for controls that sit inside
// something that already has its own surface, such as a chip's remove
// "x" (chips have no outlines, Amendment #5). Pass a smaller icon via
// iconClassName and negative margins via className to keep the chip's
// visible size unchanged.
const VARIANT_CLASSES = {
  default: 'bg-card border border-border',
  plain: 'bg-transparent',
};

export default function IconButton({ icon: Icon, to = undefined, onClick = undefined, 'aria-label': ariaLabel, className = '', iconClassName = 'text-foreground', variant = 'default', children = undefined, ...props }) {
  const classes = `relative h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70 transition-opacity ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.default} ${className}`;

  const content = (
    <>
      <Icon className={`${variant === 'plain' ? '' : 'h-5 w-5 '}${iconClassName}`} aria-hidden="true" />
      {children}
    </>
  );

  if (to) {
    return (
      <Link to={to} aria-label={ariaLabel} className={classes} {...props}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={classes} {...props}>
      {content}
    </button>
  );
}
