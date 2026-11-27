import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { Loader2, Heart, MailCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { GOOGLE_SIGN_IN_ENABLED } from '@/lib/authProviders';
import { functionErrorMessage } from '@/lib/errorMonitoring';

// Calls the sign-up Edge Function (supabase/functions/sign-up/index.ts)
// instead of supabase.auth.signUp() directly, so the confirmation email
// is our own branded template (via Resend) instead of Supabase's default
// one — see docs/features/0021_Branded_Signup_Confirmation_Email_Specification_v1.md.
// The function creates the account server-side and sends a link to
// /verify-email.
//
// Since spec 0086 this form asks only for a first name and email. No
// password is set here and no consent is recorded: whoever opens the
// confirmation email creates the password and agrees to the Terms on
// /verify-email, so someone signing up at another person's address can
// never get into that account.

export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { data, error } = await supabase.functions.invoke('sign-up', {
      body: {
        action: 'signup',
        email,
        first_name: firstName.trim() || undefined,
      },
    });
    if (error) {
      // The Edge Function returns a JSON { error } body on non-2xx
      // responses (bad input, rate-limited, provider failure).
      setError(await functionErrorMessage(error, data, 'Registration failed. Please try again.'));
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    // A first-time Google user agrees to the Terms on the consent screen
    // after sign-in (spec 0086), so nothing is carried across the redirect.
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  return (
    <AuthLayout
      icon={Heart}
      title="Create Account"
      footer={<p className="text-sm text-muted-foreground">Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link></p>}
    >
      {sent ? (
        <div className="text-center space-y-3">
          <MailCheck className="h-10 w-10 text-primary mx-auto" />
          <p className="text-base text-muted-foreground">
            We sent a confirmation link to <span className="font-medium">{email}</span>.
            Click it to finish creating your account.
          </p>
        </div>
      ) : (
        <form onSubmit={handleRegister} className="space-y-4">
          {error && <p className="text-base text-destructive text-center">{error}</p>}
          <div className="space-y-1.5"><Label htmlFor="register-first-name">First Name</Label><Input id="register-first-name" type="text" value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={100} required /></div>
          <div className="space-y-1.5"><Label htmlFor="register-email">Email</Label><Input id="register-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign Up'}</Button>
          <p className="text-sm text-muted-foreground">
            After you confirm your email, you&apos;ll create a password and review our{' '}
            <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</Link>.
          </p>
          {/* Hidden while Google sign-in is off (spec 0076 / PA-20). */}
          {GOOGLE_SIGN_IN_ENABLED && (
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>Continue with Google</Button>
          )}
        </form>
      )}
    </AuthLayout>
  );
}
