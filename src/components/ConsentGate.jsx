import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import FinishAccountSetupForm from '@/components/FinishAccountSetupForm';
import SignOutButton from '@/components/SignOutButton';
import { useAuth } from '@/lib/AuthContext';
import { getAccountSetupStatus, setupScreenFor, GENERIC_ERROR } from '@/lib/accountSetup';
import { reportClientError } from '@/lib/errorMonitoring';

// The blocking consent screen (spec 0086 FR6, AC10-AC12). ProtectedRoute
// and AdminRoute render this, with the page as `children`, instead of the
// page when shouldShowConsentGate() (src/lib/consentGate.js) says so: a
// signed-in person whose profile loaded with no terms_accepted_at, on any
// page but Terms and Privacy. A full page (AuthLayout), not an overlay,
// so it needs no focus trap.
//
// It asks finish-account-setup (status) first, since the form reads
// needsPassword once, and setupScreenFor() picks the screen:
//   'finish'      a session from an email link that hasn't finished setup:
//                 the "Finish setting up your account" page (password,
//                 Terms, marketing), the same as /verify-email
//   'consentOnly' a password session: Terms only, Continue + Sign out
//   'skip'        nothing left to do (the profile was stale): refresh it
//                 and show the page
//   'signedOut'   the session is gone: full-page load to /login
//   'error'       the generic error, with Sign out so it isn't a dead end
// Once setup is done the page shows straight away and the profile is
// refreshed so the gate goes away for good; if that refresh fails, the
// page reloads.

const goToLogin = () => { window.location.href = '/login'; };

/**
 * What the gate shows for a given screen. Split out so each state can be
 * rendered in tests without running the status call.
 *
 * @param {{ screen: 'loading' | 'finish' | 'consentOnly' | 'error', onSuccess: () => void, onSignedOut: () => void }} props
 */
export function ConsentGateScreen({ screen, onSuccess, onSignedOut }) {
  if (screen === 'finish') {
    return (
      <AuthLayout
        icon={ShieldCheck}
        title="Finish setting up your account"
        subtitle="Create a password and review our terms to start using Wysker Watch."
      >
        <FinishAccountSetupForm
          needsPassword
          showMarketing
          submitLabel="Finish"
          onSuccess={onSuccess}
          onSignedOut={onSignedOut}
        />
      </AuthLayout>
    );
  }

  if (screen === 'consentOnly') {
    return (
      <AuthLayout
        icon={ShieldCheck}
        title="One quick thing before you continue"
        subtitle="We need your OK on our Terms of Service and Privacy Policy. It only takes a moment."
      >
        <FinishAccountSetupForm
          needsPassword={false}
          showMarketing={false}
          submitLabel="Continue"
          onSuccess={onSuccess}
          onSignedOut={onSignedOut}
        />
        <SignOutButton />
      </AuthLayout>
    );
  }

  if (screen === 'error') {
    return (
      <AuthLayout icon={ShieldCheck} title="One quick thing before you continue">
        <p className="text-base text-destructive text-center">{GENERIC_ERROR}</p>
        <SignOutButton />
      </AuthLayout>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background" data-consent-gate="loading">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export default function ConsentGate({ children }) {
  const { refreshProfile } = useAuth();
  // loading | finish | consentOnly | error | done
  const [screen, setScreen] = useState('loading');

  const finished = async () => {
    setScreen('done');
    try {
      await refreshProfile();
    } catch (err) {
      reportClientError(err, { feature: 'account_setup', note: 'Profile refresh after consent failed' });
      window.location.reload();
    }
  };

  useEffect(() => {
    let cancelled = false;
    getAccountSetupStatus().then((status) => {
      if (cancelled) return;
      const next = setupScreenFor(status);
      if (next === 'signedOut') {
        goToLogin();
        return;
      }
      if (next === 'skip') {
        finished();
        return;
      }
      setScreen(next);
    });
    return () => { cancelled = true; };
    // Runs once per gate: the form reads needsPassword once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (screen === 'done') return children;
  return <ConsentGateScreen screen={/** @type {any} */ (screen)} onSuccess={finished} onSignedOut={goToLogin} />;
}
