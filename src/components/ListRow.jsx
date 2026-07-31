import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// Design System Amendment #8 (2026-07-30) — the canonical icon + title +
// subtitle + chevron row, replacing PetProfileContent.jsx's `NavCard` and
// MenuListRow.jsx, which independently built the exact same pattern with
// different padding/min-heights. `standalone` (default) renders its own
// bg-card/border-border card, matching NavCard's usage (one row = one
// card). Pass `standalone={false}` for a bare row meant to sit inside an
// already-bordered `divide-y` group, matching MenuListRow's usage in
// Settings.
export default function ListRow({
  icon: Icon, iconBg, iconColor, iconClassName, title, subtitle, value, valueColor,
  to, onClick, error, destructive = false, standalone = true, children,
}) {
  const content = (
    <>
      <div className="flex items-center gap-3.5">
        <div
          className={`rounded-full flex items-center justify-center flex-shrink-0 ${standalone ? 'h-11 w-11' : 'h-10 w-10'}`}
          style={{ background: iconBg || 'rgba(255,255,255,0.06)' }}
        >
          <Icon className={`h-5 w-5 ${iconClassName || 'text-white/80'}`} style={iconColor ? { color: iconColor } : undefined} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold truncate ${standalone ? 'text-[16px] text-white' : 'text-[15px]'} ${destructive ? 'text-destructive' : standalone ? '' : 'text-white'}`}>
            {title}
          </p>
          <p className="text-[13px] text-tier-tertiary truncate">{error ? 'Unable to load' : subtitle}</p>
        </div>
        {!error && value != null && (
          <span className="text-base font-semibold flex-shrink-0" style={{ color: valueColor || '#fff' }}>{value}</span>
        )}
        {(to || onClick) && <ChevronRight className="h-4 w-4 text-tier-tertiary flex-shrink-0" aria-hidden="true" />}
      </div>
      {children}
    </>
  );

  const standaloneClass = standalone ? 'rounded-2xl px-4 py-4 bg-card border border-border' : 'px-4 py-3.5 min-h-[64px]';
  const className = `w-full text-left active:opacity-80 transition-opacity ${standaloneClass}`;

  if (to) return <Link to={to} onClick={onClick} className={className}>{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={className}>{content}</button>;
  return <div className={standaloneClass}>{content}</div>;
}
