import { forwardRef, useEffect, useRef } from 'react';
import { FlaskConical, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isTestAccount, isDemoAccount } from '@/lib/accountType';
import { PALETTE } from '@/lib/toneColors';

// Persistent, non-dismissable banner so a user is never confused
// about which environment they're in. Deliberately styled far from
// the app's normal palette (primary is sky blue) so it can't be
// mistaken for a regular in-app notice — still true after Design
// System Amendment #6 (spec 0028): Test/Demo now source from the
// semantic tone-good/tone-warn tokens (full-strength solid fill,
// not the usual soft-tint chip treatment) instead of raw Tailwind
// colors, but the tokens themselves are still visually distinct
// from the sky-blue primary accent used everywhere else.
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
        background={PALETTE.teal}
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
        background={PALETTE.amber}
        title="DEMO MODE"
        message="Explore Wysker Watch with sample pets and health history."
      />
    );
  }

  return null;
}

const Banner = forwardRef(function Banner({ icon: Icon, background, title, message }, ref) {
  return (
    <div
      ref={ref}
      className="sticky top-0 z-[70] flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium"
      style={{ background, color: 'hsl(var(--background))', paddingTop: 'calc(env(safe-area-inset-top) + 0.375rem)' }}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-bold tracking-wide">{title}</span>
      <span className="opacity-90">— {message}</span>
    </div>
  );
});
