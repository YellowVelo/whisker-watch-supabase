import { Toaster } from "@/components/ui/toaster"
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import BottomTabBar from './components/BottomTabBar';
import AccountTypeBanner from './components/AccountTypeBanner';
import Home from './pages/Home';
import Notifications from './pages/Notifications';
import Pets from './pages/Pets';
import PetProfile from './pages/PetProfile';
import PetTrends from './pages/PetTrends';
import Timeline from './pages/Timeline';
import PetProfileTabs from './pages/PetProfileTabs';
import PetOnboarding from './pages/PetOnboarding';
import PetSymptoms from './pages/PetSymptoms';
import PetFood from './pages/PetFood';
import Insurance from './pages/Insurance';
import Documents from './pages/Documents';
import About from './pages/About';
import VetExport from './pages/VetExport';
import Settings from './pages/Settings';
import PetSitterMenu from './pages/PetSitterMenu';
import AIMenu from './pages/AIMenu';
import Account from './pages/Account';
import Privacy from './pages/Privacy';
import PrivacyPolicySection from './pages/PrivacyPolicySection';
import Terms from './pages/Terms';
import TermsOfServiceSection from './pages/TermsOfServiceSection';
import Preferences from './pages/Preferences';
import Support from './pages/Support';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AcceptInvite from './pages/AcceptInvite';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const location = useLocation();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <>
      <AccountTypeBanner />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
            <Route path="/" element={<Home />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/pets" element={<Pets />} />
            <Route path="/pet/:petId" element={<PetProfile />} />
            <Route path="/pet/:petId/trends" element={<PetTrends />} />
            <Route path="/pet/:petId/timeline" element={<Timeline />} />
            <Route path="/pet/:petId/profile" element={<PetProfileTabs />} />
            <Route path="/pet/:petId/onboarding" element={<PetOnboarding />} />
            <Route path="/pet/:petId/symptoms" element={<PetSymptoms />} />
            <Route path="/pet/:petId/food" element={<PetFood />} />
            <Route path="/pet/:petId/insurance" element={<Insurance />} />
            <Route path="/pet/:petId/documents" element={<Documents />} />
            <Route path="/pet/:petId/export" element={<VetExport />} />
            <Route path="/about" element={<About />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/pet-sitter" element={<PetSitterMenu />} />
            <Route path="/settings/ai" element={<AIMenu />} />
            <Route path="/account" element={<Account />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/privacy/:sectionId" element={<PrivacyPolicySection />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/terms/:sectionId" element={<TermsOfServiceSection />} />
            <Route path="/preferences" element={<Preferences />} />
            <Route path="/support" element={<Support />} />
          </Route>
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </AnimatePresence>
      <BottomTabBar />
    </>
  );
};

function App() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (e) => document.documentElement.classList.toggle('dark', e.matches);
    apply(mq);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App