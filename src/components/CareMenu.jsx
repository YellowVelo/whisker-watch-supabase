import { useNavigate } from 'react-router-dom';
import { X, ClipboardList, TrendingUp, Pill, UtensilsCrossed, FlaskConical, Syringe, UsersRound, Sparkles, Menu as MenuIcon, Info, Heart } from 'lucide-react';

// Redesigned slide-out "Care" navigation menu for a pet's profile page.
// Ported from a Base44 prototype build of the new design.
export default function CareMenu({ open, onOpenChange, petId, petName }) {
  const navigate = useNavigate();
  if (!open) return null;

  const close = () => onOpenChange(false);
  const go = (path) => { navigate(path); close(); };

  const tabItems = petId ? [
    { label: 'History', icon: ClipboardList, path: `/pet/${petId}/profile?tab=history` },
    { label: 'Trends', icon: TrendingUp, path: `/pet/${petId}/trends` },
    { label: 'Meds', icon: Pill, path: `/pet/${petId}/profile?tab=medications` },
    { label: 'Baseline', icon: Heart, path: `/pet/${petId}/profile?tab=baseline` },
    { label: 'Food', icon: UtensilsCrossed, path: `/pet/${petId}/profile?tab=food` },
    { label: 'Labs', icon: FlaskConical, path: `/pet/${petId}/profile?tab=bloodwork` },
    { label: 'Vaccines', icon: Syringe, path: `/pet/${petId}/profile?tab=vaccines` },
    { label: 'Sitter', icon: UsersRound, path: `/pet/${petId}/profile?tab=petsit` },
    { label: 'AI', icon: Sparkles, path: `/pet/${petId}/profile?tab=ai` },
  ] : [];

  const globalItems = [
    { label: 'Menu', icon: MenuIcon, path: '/settings' },
    { label: 'About', icon: Info, path: '/about' },
  ];

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div
        className="absolute right-0 top-0 bottom-0 w-80 max-w-[85%] bg-card border-l border-border shadow-2xl flex flex-col"
        style={{ paddingTop: 'calc(var(--account-banner-height, 0px) + env(safe-area-inset-top))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-serif text-2xl">Care</h2>
          <button onClick={close} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>
        {petName && <p className="px-5 pt-3 text-xs text-muted-foreground">For {petName}</p>}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {tabItems.map((item) => (
            <MenuItem key={item.label} label={item.label} icon={item.icon} onClick={() => go(item.path)} />
          ))}
          {globalItems.length > 0 && <div className="my-2 border-t border-border" />}
          {globalItems.map((item) => (
            <MenuItem key={item.label} label={item.label} icon={item.icon} onClick={() => go(item.path)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuItem({ label, icon: Icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-start gap-3 px-3 py-3 rounded-xl hover:bg-secondary text-left transition-colors"
    >
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
