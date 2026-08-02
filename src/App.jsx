import { Toaster } from "@/components/ui/toaster"
import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation, useParams, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import AccountTypeBanner from './components/AccountTypeBanner';
import OfflineBanner from './components/OfflineBanner';
import IosInstallBanner from './components/IosInstallBanner';
import { InstallPromptProvider } from '@/lib/InstallPromptContext';
import Home from './pages/Home';
import Notifications from './pages/Notifications';
import Pets from './pages/Pets';
import PetProfile from './pages/PetProfile';
import PetTrends from './pages/PetTrends';
import Timeline from './pages/Timeline';
import PetOnboarding from './pages/PetOnboarding';
import PetBaseline from './pages/PetBaseline';
import PetEdit from './pages/PetEdit';
import PetConditions from './pages/PetConditions';
import PetMedications from './pages/PetMedications';
import PetVaccinations from './pages/PetVaccinations';
import PetHealthRecords from './pages/PetHealthRecords';
import PetSitter from './pages/PetSitter';
import PetSymptoms from './pages/PetSymptoms';
import PetFood from './pages/PetFood';
import About from './pages/About';
import VetExport from './pages/VetExport';
import Settings from './pages/Settings';
import AskWyskerRedirect from './components/AskWyskerRedirect';
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
import VerifyEmail from './pages/VerifyEmail';

// PetProfileTabs.jsx (the old hero-header pet profile screen) is retired
// (spec 0028) — old /pet/:petId/profile links land on Pets instead, with
// that pet's card scrolled into view and expanded, same pattern already
// used for the retired /pet/:petId route.
const PetProfileRedirect = () => {
  const { petId } = useParams();
  return <Navigate to="/pets" replace state={petId ? { expandPetId: petId } : undefined} />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
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
    }
  }

  return (
    <>
      <AccountTypeBanner />
      <OfflineBanner />
      <IosInstallBanner />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          {/* Authenticated, but outside the App Shell by design (spec 0023) — no persistent header/bottom nav */}
          <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} shell={false} />}>
            <Route path="/pet/:petId/onboarding" element={<PetOnboarding />} />
          </Route>
          <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
            <Route path="/" element={<Home />} />
            <Route path="/pet-sitter" element={<PetSitter />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/pets" element={<Pets />} />
            <Route path="/pet/:petId" element={<PetProfile />} />
            <Route path="/pet/:petId/trends" element={<PetTrends />} />
            <Route path="/pet/:petId/timeline" element={<Timeline />} />
            {/* PetProfileTabs.jsx is deleted (spec 0028) — Baseline/Medications/
                Vaccinations/Health Records are now standalone pages below.
                This stays alive as a compatibility redirect for old links. */}
            <Route path="/pet/:petId/profile" element={<PetProfileRedirect />} />
            <Route path="/pet/:petId/baseline" element={<PetBaseline />} />
            <Route path="/pet/:petId/edit" element={<PetEdit />} />
            <Route path="/pet/:petId/conditions" element={<PetConditions />} />
            <Route path="/pet/:petId/medications" element={<PetMedications />} />
            <Route path="/pet/:petId/vaccinations" element={<PetVaccinations />} />
            <Route path="/pet/:petId/health-records" element={<PetHealthRecords />} />
            <Route path="/pet/:petId/symptoms" element={<PetSymptoms />} />
            <Route path="/pet/:petId/food" element={<PetFood />} />
            <Route path="/pet/:petId/export" element={<VetExport />} />
            <Route path="/about" element={<About />} />
            <Route path="/settings" element={<Settings />} />
            {/* PetSitterMenu.jsx / AIMenu.jsx are deleted (spec 0023 step 12)
                — these routes stay alive as compatibility redirects for
                old links. */}
            <Route path="/settings/pet-sitter" element={<Navigate to="/pet-sitter" replace />} />
            <Route path="/settings/ai" element={<AskWyskerRedirect to="/" />} />
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
        <InstallPromptProvider>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </InstallPromptProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App