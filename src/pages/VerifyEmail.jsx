import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Loader2 } from 'lucide-react';

// Landing page for the branded signup-confirmation email (sent via the
// sign-up Edge Function — see supabase/functions/sign-up/index.ts) and
// its resend variant. Mirrors src/pages/AcceptInvite.jsx's structure
// (manual token_hash redemption via verifyOtp(), rather than Supabase's
// auto-URL-fragment session flow used by ResetPassword.jsx) but skips
// AcceptInvite's SetPasswordForm step, since a signup already set a
// password before this page is ever reached.
//
// `type` is 'signup' for a first confirmation, or 'recovery' when
// sign-up/index.ts's resend path re-issued the link for an account that
// was already created but never confirmed (generateLink's 'signup' type
// only works for an email with no existing auth.users row — see that
// function's header comment).
//
// After verifyOtp() succeeds, this also calls the confirm-email Edge
// Function once — see that function's header comment for why: a
// 'recovery'-type token isn't guaranteed to also flip
// auth.users.email_confirmed_at the way a 'signup'-type token does, so
// confirmation is made explicit here rather than assumed.
const ALLOWED_TYPES = ['signup', 'recovery'];

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
        console.error('confirm-email function error:', confirmError);
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
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="font-serif text-[28px]">Link Invalid</h1>
          <p className="text-sm text-muted-foreground">
            This confirmation link is invalid or has expired. Try signing up again, or use "Resend confirmation
            email" from the login screen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
