import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import AuthLayout from '@/components/AuthLayout';
import FinishAccountSetupForm from '@/components/FinishAccountSetupForm';
import { getAccountSetupStatus, GENERIC_ERROR } from '@/lib/accountSetup';
import { Loader2, Mail } from 'lucide-react';

// Landing page for the co-owner invite email (sent via the send-email
// Edge Function — see supabase/functions/invite-co-owner/index.ts) and,
// as of the sitter-invite fix, the sitter invite email as well (see
// supabase/functions/invite-sitter/index.ts). Both emails' CTAs link here
// (our own domain, required by the email system's CTA allowlist) carrying
// a raw token_hash rather than Supabase's own ready-made action_link, so
// — unlike ResetPassword.jsx, where Supabase establishes the session
// automatically before the page even mounts — we have to redeem it
// ourselves via verifyOtp() before anything else can happen.
//
// `role=sitter` (present only on sitter invite links) distinguishes the
// two: a co-owner invite carries `petId` and redirects to that pet's
// profile afterward, while a sitter invite carries `petSitId` instead and
// redirects to the Pets screen, since a pet-sit can cover multiple pets
// with no single profile to land on.
//
// Once redeemed, this asks finish-account-setup (status) what's left to
// do before showing anything (spec 0086), since the form reads
// needsPassword once. A new invitee creates a password and agrees to the
// Terms on the shared FinishAccountSetupForm (also used by
// /verify-email). Someone whose account is already finished (password
// set, consent recorded) skips the form and goes straight to the pet or
// the Pet Sitter page (planning decision 2). Every exit is a full-page
// load, so AuthContext runs the invite claims again now that the email
// is confirmed.
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
  const isSitterInvite = searchParams.get('role') === 'sitter';

  const [status, setStatus] = useState('verifying'); // verifying | ready | invalid | error | done
  const [needsPassword, setNeedsPassword] = useState(false);

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');
    if (!tokenHash || !ALLOWED_TYPES.includes(type)) {
      setStatus('invalid');
      return;
    }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(async ({ error }) => {
      if (error) {
        // A single-use token can fail to redeem here without the invite
        // itself having failed — e.g. the link was opened in two tabs, or
        // an email client's link-preview/security scanner prefetched it
        // before the real click. In that case the first redemption already
        // succeeded and established a session, so check for one before
        // concluding the invite is actually invalid.
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          setStatus('invalid');
          return;
        }
      }

      const setup = await getAccountSetupStatus();
      if (!setup.ok) {
        setStatus('error');
        return;
      }
      if (!setup.needsPassword && !setup.needsConsent) {
        setStatus('done');
        handleSuccess();
        return;
      }
      setNeedsPassword(setup.needsPassword);
      setStatus('ready');
    });
    // handleSuccess only reads searchParams-derived values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSuccess = () => {
    if (isSitterInvite) {
      // The household Pet Sitter page (spec 0023 step 6) — not /pets,
      // since that screen's own "My Pets" list only distinguishes
      // owned/co-owned pets from sitter-only ones for the bottom-nav case
      // (see src/lib/petsClient.js's getSitterOnlyPetIds and Pets.jsx).
      window.location.href = '/pet-sitter';
      return;
    }
    // Lands on Pets with the pet's card scrolled into view (collapsed, not
    // expanded — spec 0023 decision) rather than the retiring standalone
    // /pet/:petId page.
    window.location.href = petId ? `/pets?highlight=${petId}` : '/';
  };

  const goToLogin = () => { window.location.href = '/login'; };

  if (status === 'verifying' || status === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthLayout icon={Mail} title="Invite Link Invalid">
        <p className="text-sm text-muted-foreground text-center">
          This invitation link is invalid or has expired. Ask the pet owner to send a new invite.
        </p>
      </AuthLayout>
    );
  }

  if (status === 'error') {
    return (
      <AuthLayout icon={Mail} title="Welcome to Wysker Watch">
        <p className="text-base text-destructive text-center">{GENERIC_ERROR}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Mail} title="Welcome to Wysker Watch" subtitle="Create a password and review our terms to finish accepting your invitation.">
      <FinishAccountSetupForm
        needsPassword={needsPassword}
        showMarketing
        submitLabel="Continue"
        onSuccess={handleSuccess}
        onSignedOut={goToLogin}
      />
    </AuthLayout>
  );
}
