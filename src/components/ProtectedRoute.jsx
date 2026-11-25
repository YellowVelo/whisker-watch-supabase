import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import AppShell from '@/components/AppShell';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

// shell=false is used for authenticated routes that sit outside the App
// Shell by design (spec 0023) — currently just Pet Onboarding.
export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement, shell = true }) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();

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

  return shell ? <AppShell><Outlet /></AppShell> : <Outlet />;
}
