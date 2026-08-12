import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

// Admin-only route gate (spec 0053) — modeled on ProtectedRoute.jsx, with
// an added role==='admin' check. This is the first fully admin-gated
// route in the app; every existing "admin" check before this was a
// single small UI conditional (PageNotFound.jsx's Admin Note), not a
// route boundary. Logged-out visitors go to /login same as any other
// protected route; logged-in non-admins are redirected to / rather than
// shown any error that would confirm the route exists.
export default function AdminRoute() {
  const { user, isAuthenticated, isLoadingAuth, authChecked, checkUserAuth } = useAuth();

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

  return <Outlet />;
}
