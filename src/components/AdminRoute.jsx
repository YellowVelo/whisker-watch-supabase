import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import ConsentGate from '@/components/ConsentGate';
import { shouldShowConsentGate } from '@/lib/consentGate';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

// Admin-only route gate (spec 0053) — modeled on ProtectedRoute.jsx, with
// an added role==='admin' check. It is the app's only admin-gated route
// boundary. Logged-out visitors go to /login same as any other
// protected route; logged-in non-admins are redirected to / rather than
// shown any error that would confirm the route exists.
export default function AdminRoute() {
  const { user, isAuthenticated, isLoadingAuth, authChecked, profileLoadError, checkUserAuth } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return <DefaultFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  // Spec 0086 FR6: the admin page sits outside ProtectedRoute, so it
  // applies the same consent gate itself.
  if (shouldShowConsentGate({ isAuthenticated, user, profileLoadError, pathname })) {
    return <ConsentGate><Outlet /></ConsentGate>;
  }

  return <Outlet />;
}
