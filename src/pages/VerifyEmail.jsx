import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import AuthLayout from '@/components/AuthLayout';
import SignOutButton from '@/components/SignOutButton';
import FinishAccountSetupForm from '@/components/FinishAccountSetupForm';
import { getAccountSetupStatus, setupScreenFor, GENERIC_ERROR } from '@/lib/accountSetup';
import { Loader2, Mail } from 'lucide-react';

// Landing page for the branded signup-confirmation email (sent via the
// sign-up Edge Function — see supabase/functions/sign-up/index.ts) and
// its resend variant. Mirrors src/pages/AcceptInvite.jsx's structure
// (manual token_hash redemption via verifyOtp(), rather than Supabase's
// auto-URL-fragment session flow used by ResetPassword.jsx). Since spec
// 0086 no password is set at sign-up: the account is created with no
// password and no consent. Redeeming the link gives it a random password
// nobody knows (Supabase does this itself); the inbox owner sets the real
// one, and agrees to the Terms, on spec 0086's finish step. That step
// asks for a password because this session signed in from an email link
// (JWT amr 'otp'), not because of anything stored (planning decision 7).
//
// `type` is 'signup' for a new sign-up's link (sign-up/index.ts mints it
// with generateLink({type:'invite'}), and the invite token redeems as
// 'signup'), or 'recovery' when sign-up/index.ts sends a fresh link to an
// account that already exists but is unconfirmed or has no consent
// recorded yet.
// 'invite' is also accepted for completeness.
//
// After verifyOtp() succeeds, this asks finish-account-setup (status)
// what's left to do, and only then shows the finish form, since the form
// reads needsPassword once. Supabase confirms the email itself when the
// signup or invite link is redeemed here; finish-account-setup also sets
// email_confirm when the person finishes, so there's no separate confirm
// call on this page. Finishing does a full-page load to '/', so
// AuthContext runs the invite claims again now that the email is
// confirmed (migration 0064 links invites only to confirmed accounts).
// The consent-only screen also offers Sign out (SignOutButton.jsx).
// setupScreenFor() (accountSetup.js) picks the screen: the full finish
// form, the consent-only form (consent missing but this browser already
// has a password session), straight on to Home, /login if the session is
// gone, or the generic error. A 'recovery' link's PASSWORD_RECOVERY event
// is deliberately not redirected to /reset-password on this page
// (passwordRecovery.js).
const ALLOWED_TYPES = ['signup', 'recovery', 'invite'];

const goHome = () => { window.location.href = '/'; };
const goToLogin = () => { window.location.href = '/login'; };

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  // verifying | finish | consentOnly | invalid | error | done
  const [status, setStatus] = useState('verifying');

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    if (!tokenHash || !ALLOWED_TYPES.includes(type)) {
      setStatus('invalid');
      return;
    }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(async ({ error }) => {
      if (error) {
        // A single-use token can fail to redeem here without the link
        // itself having failed — e.g. opened in two tabs, or an email
        // client's link-preview scanner prefetched it before the real
        // click. In that case the first redemption already succeeded and
        // established a session, so check for one before concluding the
        // link is actually invalid — same fallback AcceptInvite.jsx uses.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          setStatus('invalid');
          return;
        }
      }

      const screen = setupScreenFor(await getAccountSetupStatus());
      if (screen === 'skip') {
        setStatus('done');
        goHome();
        return;
      }
      if (screen === 'signedOut') {
        setStatus('done');
        goToLogin();
        return;
      }
      setStatus(screen);
    });
  }, [searchParams]);

  if (status === 'invalid') {
    return (
      <AuthLayout icon={Mail} title="Link Invalid">
        {/* Copy pending Lynn's approval (spec 0086 T6) */}
        <p className="text-sm text-muted-foreground text-center">
          This link is invalid or has expired. To get a new one, sign up again with the same email address.
          If you've already finished setting up,{' '}
          <Link to="/login" className="text-primary hover:underline">sign in</Link> instead.
        </p>
      </AuthLayout>
    );
  }

  if (status === 'error') {
    return (
      <AuthLayout icon={Mail} title="Finish setting up your account">
        <p className="text-base text-destructive text-center">{GENERIC_ERROR}</p>
      </AuthLayout>
    );
  }

  if (status === 'consentOnly') {
    return (
      <AuthLayout
        icon={Mail}
        title="One quick thing before you continue"
        subtitle="We need your OK on our Terms of Service and Privacy Policy. It only takes a moment."
      >
        <FinishAccountSetupForm
          needsPassword={false}
          showMarketing={false}
          submitLabel="Continue"
          onSuccess={goHome}
          onSignedOut={goToLogin}
        />
        <SignOutButton />
      </AuthLayout>
    );
  }

  if (status === 'finish') {
    return (
      <AuthLayout
        icon={Mail}
        title="Finish setting up your account"
        subtitle="Create a password and review our terms to start using Wysker Watch."
      >
        <FinishAccountSetupForm
          needsPassword
          showMarketing
          submitLabel="Finish"
          onSuccess={goHome}
          onSignedOut={goToLogin}
        />
      </AuthLayout>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
