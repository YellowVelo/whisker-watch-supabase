import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import SetPasswordForm from '@/components/SetPasswordForm';
import AuthLayout from '@/components/AuthLayout';
import { KeyRound } from 'lucide-react';

// NOTE: Supabase's password-reset flow differs from Base44's. Clicking the
// emailed reset link logs the user into a temporary "recovery" session
// automatically (Supabase handles the token in the URL itself before this
// component even mounts) — we just need to call updateUser() with the new
// password while that session is active. There's no manual resetToken to
// read or pass, unlike the old Base44 implementation.
export default function ResetPassword() {
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Give Supabase a moment to process the recovery token from the URL
    // and establish the temporary session before allowing submission.
    supabase.auth.getSession().then(() => setSessionReady(true));
  }, []);

  return (
    <AuthLayout icon={KeyRound} title="Set New Password">
      <SetPasswordForm
        submitLabel="Reset Password"
        disabled={!sessionReady}
        onSuccess={() => { window.location.href = '/login'; }}
      />
    </AuthLayout>
  );
}
