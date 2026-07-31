import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, PawPrint, Menu } from 'lucide-react';

// Menu's own account/settings/support/legal subpages (Account,
// Notifications, Privacy, Terms, Preferences, Support, About) previously
// activated no tab at all once you navigated off the bare /settings route —
// found while writing tests for spec 0023 step 11, and a real miss against
// the original written requirement ("Menu is active for account, settings,
// support, and legal routes"), not just a style nit.
const MENU_PATHS = ['/settings', '/account', '/notifications', '/privacy', '/terms', '/preferences', '/support', '/about'];

// Exported so active-tab logic can be unit tested against the exact
// production array (spec 0023 step 11) rather than a copy that could drift.
export const tabs = [
  { path: '/', label: 'Home', icon: Home, isActive: (p) => p === '/' || p === '/pet-sitter' },
  { path: '/pets', label: 'Pets', icon: PawPrint, isActive: (p) => p === '/pets' || p.startsWith('/pet/') },
  { path: '/settings', label: 'Menu', icon: Menu, isActive: (p) => MENU_PATHS.some((base) => p === base || p.startsWith(`${base}/`)) },
];

export default function BottomTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleTabPress = (e, path, active) => {
    if (active) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t border-border bg-background/90"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="navigation"
      aria-label="Primary"
    >
      <div className="flex items-stretch h-16 max-w-2xl mx-auto">
        {tabs.map(({ path, label, icon: Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <Link
              key={path}
              to={path}
              onClick={(e) => handleTabPress(e, path, active)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] transition-colors active:opacity-70 ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`h-6 w-6 transition-transform ${active ? 'scale-110' : 'scale-100'}`} aria-hidden="true" />
              <span className="text-[12px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
