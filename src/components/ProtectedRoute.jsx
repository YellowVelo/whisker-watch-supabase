import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AppShell from '@/components/AppShell';
import ConsentGate from '@/components/ConsentGate';
import { legalPageWithoutShell, shouldShowConsentGate } from '@/lib/consentGate';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

// shell=false is used for authenticated routes that sit outside the App
// Shell by design (spec 0023) — currently just Pet Onboarding.
export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement, shell = true }) {
  const { user, isAuthenticated, isLoadingAuth, authChecked, authError, profileLoadError, checkUserAuth } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  // authError is only ever { type: 'unknown' } (the session check itself
  // threw); treat it like being signed out.
  if (authError || !isAuthenticated) {
    return unauthenticatedElement;
  }

  const gateArgs = { isAuthenticated, user, profileLoadError, pathname };

  // Spec 0086 FR6/AC12: with no consent on record, Terms and Privacy stay
  // readable, but bare, the way a signed-out visitor sees them (App.jsx's
  // unauthenticatedElement={<Outlet />}): no App Shell, so its header
  // (Ask Wysker, notifications) and nav can't be used before agreeing.
  if (legalPageWithoutShell(gateArgs)) {
    return <Outlet />;
  }

  const page = shell ? <AppShell><Outlet /></AppShell> : <Outlet />;

  // Spec 0086 FR6: no consent on record -> the consent screen instead of
  // the page (see consentGate.js).
  if (shouldShowConsentGate(gateArgs)) {
    return <ConsentGate>{page}</ConsentGate>;
  }

  return page;
}
