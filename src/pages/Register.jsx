import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'react-router-dom';
import { Loader2, Heart, MailCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { TOS_LAST_UPDATED } from '@/lib/termsOfServiceContent';
import { PRIVACY_POLICY_LAST_UPDATED } from '@/lib/privacyPolicyContent';
import { setPendingOAuthConsent } from '@/lib/pendingOAuthConsent';

// Calls the sign-up Edge Function (supabase/functions/sign-up/index.ts)
// instead of supabase.auth.signUp() directly, so the confirmation email
// is our own branded template (via Resend) instead of Supabase's default
// one — see docs/features/0021_Branded_Signup_Confirmation_Email_Specification_v1.md.
// The function creates the account server-side and sends a link to
// /verify-email; clicking it lands the user back in the app already
// authenticated, the same end result as the old flow.
export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true); setError('');
    const { error } = await supabase.functions.invoke('sign-up', {
      body: {
        action: 'signup',
        email,
        password,
        first_name: firstName.trim() || undefined,
        accepted_terms: agreedToTerms,
        marketing_opt_in: marketingOptIn,
      },
    });
    if (error) {
      // The Edge Function returns a JSON { error } body on non-2xx
      // responses (bad input, rate-limited, provider failure) — supabase-js
      // doesn't surface that message on `error` itself, so read it from the
      // raw response when available, falling back to a generic message.
      const serverMessage = await error?.context?.json?.().then((b) => b?.error).catch(() => null);
      setError(serverMessage || 'Registration failed. Please try again.');
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    // The Google OAuth flow does its own full-page redirect, so this
    // page's React state (agreedToTerms/marketingOptIn) doesn't survive
    // it — persist the answer first so AuthContext.jsx can pick it up
    // and record it once the redirect completes and a session exists.
    setPendingOAuthConsent({
      termsVersion: TOS_LAST_UPDATED,
      privacyVersion: PRIVACY_POLICY_LAST_UPDATED,
      marketingOptIn,
    });
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
          <div className="space-y-1.5"><Label htmlFor="register-password">Password</Label><Input id="register-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="register-confirm-password">Confirm Password</Label><Input id="register-confirm-password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
          <label htmlFor="register-agree-terms" className="flex items-start gap-3 min-h-11 py-1 cursor-pointer">
            <Checkbox
              id="register-agree-terms"
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground">
              I agree to the{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</Link>.
            </span>
          </label>
          <label htmlFor="register-marketing-optin" className="flex items-start gap-3 min-h-11 py-1 cursor-pointer">
            <Checkbox
              id="register-marketing-optin"
              checked={marketingOptIn}
              onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground">
              Send me tips, product updates, and other marketing communications.
            </span>
          </label>
          <Button type="submit" className="w-full" disabled={loading || !agreedToTerms}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign Up'}</Button>
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={!agreedToTerms}>Continue with Google</Button>
        </form>
      )}
    </AuthLayout>
  );
}
