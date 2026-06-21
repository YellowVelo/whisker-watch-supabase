import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Settings } from 'lucide-react';

const tabs = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function BottomTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => path === '/' ? pathname === '/' : pathname.startsWith(path);

  const handleTabPress = (e, path) => {
    if (isActive(path)) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around h-14 max-w-2xl mx-auto">
        {tabs.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              to={path}
              onClick={(e) => handleTabPress(e, path)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:opacity-70 min-h-0 ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`h-5 w-5 transition-transform ${active ? 'scale-110' : 'scale-100'}`} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}