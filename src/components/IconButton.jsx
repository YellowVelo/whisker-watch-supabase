import { Link } from 'react-router-dom';

// Design System Amendment #8/#11 (2026-07-30) — the canonical circular
// icon button, replacing 4+ independently hand-built back-button styles
// across page headers, plus AppHeader's own action buttons (no separate
// "header action" style is allowed per Amendment #11). Renders a <Link>
// when `to` is provided, otherwise a plain <button>.
export default function IconButton({ icon: Icon, to, onClick, 'aria-label': ariaLabel, className = '', iconClassName = 'text-foreground', children, ...props }) {
  const classes = `relative h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70 transition-opacity bg-card border border-border ${className}`;

  const content = (
    <>
      <Icon className={`h-5 w-5 ${iconClassName}`} aria-hidden="true" />
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
