import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import AuthLayout from '@/components/AuthLayout';
import { Loader2, Mail } from 'lucide-react';
import { reportClientError } from '@/lib/errorMonitoring';

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
// After verifyOtp() succeeds, this also calls the confirm-email Edge
// Function once — see that function's header comment for why: a
// 'recovery'-type token isn't guaranteed to also flip
// auth.users.email_confirmed_at the way a 'signup'-type token does, so
// confirmation is made explicit here rather than assumed.
const ALLOWED_TYPES = ['signup', 'recovery', 'invite'];

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // verifying | ready | invalid

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

      // Make confirmation explicit and self-controlled rather than
      // relying on which token type redeemed the session — see this
      // component's header comment. Best-effort: a failure here still
      // leaves the user with a working session (verifyOtp already
      // succeeded), so it doesn't block them from continuing into the
      // app; it's logged server-side for follow-up instead.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { error: confirmError } = await supabase.functions.invoke('confirm-email', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (confirmError) {
        reportClientError(confirmError, { feature: 'verify_email', note: 'confirm-email function error' });
      }

      setStatus('ready');
    });
  }, [searchParams]);

  useEffect(() => {
    if (status === 'ready') {
      window.location.href = '/';
    }
  }, [status]);

  if (status === 'invalid') {
    return (
      <AuthLayout icon={Mail} title="Link Invalid">
        <p className="text-sm text-muted-foreground text-center">
          This confirmation link is invalid or has expired. Try signing up again, or use "Resend confirmation
          email" from the login screen.
        </p>
      </AuthLayout>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
