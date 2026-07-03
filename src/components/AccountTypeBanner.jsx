import { FlaskConical, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isTestAccount, isDemoAccount } from '@/lib/accountType';

// Persistent, non-dismissable banner so a user is never confused
// about which environment they're in. Deliberately styled far from
// the app's normal palette (amber/purple vs. the primary teal) so it
// can't be mistaken for a regular in-app notice.
export default function AccountTypeBanner() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || !user) return null;

  if (isTestAccount(user)) {
    return (
      <Banner
        icon={FlaskConical}
        className="bg-amber-400 text-amber-950"
        title="TEST ACCOUNT"
        message="Changes made here are for testing only."
      />
    );
  }

  if (isDemoAccount(user)) {
    return (
      <Banner
        icon={Sparkles}
        className="bg-violet-600 text-white"
        title="DEMO MODE"
        message="Explore Wysker Watch with sample pets and health history."
      />
    );
  }

  return null;
}

function Banner({ icon: Icon, className, title, message }) {
  return (
    <div
      className={`sticky top-0 z-[70] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium ${className}`}
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.375rem)' }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-bold tracking-wide">{title}</span>
      <span className="opacity-90">— {message}</span>
    </div>
  );
}
