import { forwardRef, useEffect, useRef } from 'react';
import { FlaskConical, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isTestAccount, isDemoAccount } from '@/lib/accountType';

// Persistent, non-dismissable banner so a user is never confused
// about which environment they're in. Deliberately styled far from
// the app's normal palette (amber/purple vs. the primary teal) so it
// can't be mistaken for a regular in-app notice.
//
// Publishes its rendered height as --account-banner-height so other
// sticky/fixed top-0 elements (page headers, full-screen sheets) can
// offset by that amount instead of being covered by this banner, which
// always renders above them (z-[70]).
export default function AccountTypeBanner() {
  const { user, isAuthenticated } = useAuth();
  const ref = useRef(null);

  const variant = isAuthenticated && user && isTestAccount(user)
    ? 'test'
    : isAuthenticated && user && isDemoAccount(user)
      ? 'demo'
      : null;

  useEffect(() => {
    if (!variant) {
      document.documentElement.style.setProperty('--account-banner-height', '0px');
      return;
    }
    const el = ref.current;
    if (!el) return;
    const setHeight = () => {
      document.documentElement.style.setProperty('--account-banner-height', `${el.offsetHeight}px`);
    };
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty('--account-banner-height', '0px');
    };
  }, [variant]);

  if (variant === 'test') {
    return (
      <Banner
        ref={ref}
        icon={FlaskConical}
        className="bg-amber-400 text-amber-950"
        title="TEST ACCOUNT"
        message="Changes made here are for testing only."
      />
    );
  }

  if (variant === 'demo') {
    return (
      <Banner
        ref={ref}
        icon={Sparkles}
        className="bg-violet-600 text-white"
        title="DEMO MODE"
        message="Explore Wysker Watch with sample pets and health history."
      />
    );
  }

  return null;
}

const Banner = forwardRef(function Banner({ icon: Icon, className, title, message }, ref) {
  return (
    <div
      ref={ref}
      className={`sticky top-0 z-[70] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium ${className}`}
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.375rem)' }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-bold tracking-wide">{title}</span>
      <span className="opacity-90">— {message}</span>
    </div>
  );
});
