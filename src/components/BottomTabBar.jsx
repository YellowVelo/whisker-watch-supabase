import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';

const tabs = [
  { path: '/', label: 'Home', icon: Home },
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
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t border-white/8"
      style={{ background: 'rgba(10,12,22,0.92)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch h-14 max-w-2xl mx-auto px-5">
        {tabs.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              to={path}
              onClick={(e) => handleTabPress(e, path)}
              className={`flex items-center gap-2 justify-start transition-colors active:opacity-70 min-h-0 ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`h-6 w-6 transition-transform ${active ? 'scale-110' : 'scale-100'}`} />
              <span className="text-[16px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}