import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import SetPasswordForm from '@/components/SetPasswordForm';
import { Loader2 } from 'lucide-react';

// Landing page for the co-owner invite email (sent via the send-email
// Edge Function — see supabase/functions/invite-co-owner/index.ts). That
// email's CTA links here (our own domain, required by the email system's
// CTA allowlist) carrying a raw token_hash rather than Supabase's own
// ready-made action_link, so — unlike ResetPassword.jsx, where Supabase
// establishes the session automatically before the page even mounts —
// we have to redeem it ourselves via verifyOtp() before anything else
// can happen.
//
// Once redeemed, the invited co-owner is asked to set a password (via
// the shared SetPasswordForm, also used by ResetPassword.jsx) rather
// than being silently dropped into the app with a passwordless session
// they'd have no way to log back into later.
//
// `type` is 'invite' for a first-time invite, or 'recovery' when
// invite-co-owner/index.ts is re-inviting someone who was invited before
// but never finished accepting — admin.generateLink({type:'invite'})
// only works for emails with no auth.users row yet, so a re-invite uses
// a 'recovery' link instead (works for any existing user regardless of
// password/confirmation state). Both are legitimate, server-minted types
// this page is meant to redeem; anything else is rejected.
const ALLOWED_TYPES = ['invite', 'recovery'];

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const petId = searchParams.get('petId');

  const [status, setStatus] = useState('verifying'); // verifying | ready | invalid

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    if (!tokenHash || !ALLOWED_TYPES.includes(type)) {
      setStatus('invalid');
      return;
    }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(async ({ error }) => {
      if (!error) {
        setStatus('ready');
        return;
      }
      // A single-use token can fail to redeem here without the invite
      // itself having failed — e.g. the link was opened in two tabs, or
      // an email client's link-preview/security scanner prefetched it
      // before the real click. In that case the first redemption already
      // succeeded and established a session, so check for one before
      // concluding the invite is actually invalid.
      const { data: sessionData } = await supabase.auth.getSession();
      setStatus(sessionData?.session ? 'ready' : 'invalid');
    });
  }, [searchParams]);

  const handleSuccess = () => {
    window.location.href = petId ? `/pet/${petId}` : '/';
  };

  if (status === 'verifying') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="font-serif text-[28px]">Invite Link Invalid</h1>
          <p className="text-sm text-muted-foreground">
            This invitation link is invalid or has expired. Ask the pet owner to send a new invite.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1.5">
          <h1 className="font-serif text-[28px]">Welcome to Wysker Watch</h1>
          <p className="text-sm text-muted-foreground">Create a password to finish accepting your invitation.</p>
        </div>
        <SetPasswordForm submitLabel="Continue" onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
