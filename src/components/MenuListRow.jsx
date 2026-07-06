import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// Reusable full-row-tappable menu item: icon, title, subtitle, chevron.
// Used by the Menu screen for Account/Notifications/Privacy/Settings/Support
// (Menu Feature Spec #3) — kept generic so it can render either a router
// Link (has `to`) or a button (has `onClick`), since Sign Out/Delete Account
// need to open a dialog instead of navigating.
export default function MenuListRow({ to, onClick, icon: Icon, iconClassName, iconBg, title, subtitle, destructive = false }) {
  const content = (
    <>
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg || 'rgba(255,255,255,0.06)' }}
      >
        <Icon className={`h-5 w-5 ${iconClassName || 'text-white/80'}`} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] font-semibold truncate ${destructive ? 'text-destructive' : 'text-white'}`}>{title}</p>
        <p className="text-[13px] text-white/45 truncate">{subtitle}</p>
      </div>
      <ChevronRight className="h-4.5 w-4.5 text-white/30 flex-shrink-0" aria-hidden="true" />
    </>
  );

  const className = 'w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity min-h-[64px]';

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}
