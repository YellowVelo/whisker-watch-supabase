import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Heart, CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { resetSandboxAccount } from '@/lib/accountClient';
import { SEED_SCENARIOS } from '@/lib/seedTestData';
import { TOS_LAST_UPDATED } from '@/lib/termsOfServiceContent';
import { PRIVACY_POLICY_LAST_UPDATED } from '@/lib/privacyPolicyContent';
import { setPendingOAuthConsent } from '@/lib/pendingOAuthConsent';

const RESEND_COOLDOWN_SECONDS = 60;
const DEMO_SHOWCASE_SCENARIO = SEED_SCENARIOS.find((s) => s.key === 'demo_showcase');

// Detects the "email not confirmed" login failure. Prefers the
// structured error code (supabase-js exposes `code` on AuthError as of
// recent versions); falls back to a message substring match for older
// versions that don't. See docs/features/0021_Branded_Signup_Confirmation_Email_Specification_v1.md.
function isEmailNotConfirmedError(error) {
  if (!error) return false;
  if (error.code === 'email_not_confirmed') return true;
  return typeof error.message === 'string' && error.message.toLowerCase().includes('email not confirmed');
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const accountDeleted = searchParams.get('deleted') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [settingUpDemo, setSettingUpDemo] = useState(false);
  const [error, setError] = useState('');
  const [showResend, setShowResend] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendError, setResendError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const cooldownTimerRef = useRef(null);

  useEffect(() => () => clearInterval(cooldownTimerRef.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShowResend(false);
    setResendError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message || 'Login failed');
      if (isEmailNotConfirmedError(error)) {
        setShowResend(true);
      }
      setLoading(false);
      return;
    }

    // Demo account (spec 0026): every login resets the account back to the
    // standard Maple/Cooper baseline first, no exception for the demo
    // admin — nothing done during a demo login survives past that login
    // for anyone. Also kicks out any other session already signed into
    // this same shared login, so two visitors can never edit the same
    // live data at once.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', data.user.id)
      .single();

    if (profile?.account_type === 'demo') {
      setSettingUpDemo(true);
      try {
        await supabase.auth.signOut({ scope: 'others' });

        const { data: resetData, error: resetError } = await resetSandboxAccount();
        if (resetError || !resetData?.success) {
          setError(resetError?.message ?? resetData?.error ?? 'Could not set up the demo account. Please try again.');
          setSettingUpDemo(false);
          setLoading(false);
          return;
        }

        await DEMO_SHOWCASE_SCENARIO.run();
      } catch (err) {
        console.error('Demo account setup failed:', err);
        setError('Could not set up the demo account. Please try again.');
        setSettingUpDemo(false);
        setLoading(false);
        return;
      }
    }

    window.location.href = '/';
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendError('');
    const { error } = await supabase.functions.invoke('sign-up', { body: { action: 'resend', email } });
    if (error) {
      // A genuine request/server failure (rate-limited, function down,
      // network error) — distinct from the generic { sent: true } success
      // shape sign-up/index.ts returns for every enumeration-safe outcome
      // (no such account, already confirmed, or a fresh link actually
      // sent). Surfaced here rather than silently showing "we've sent
      // one" for a request that never went through.
      setResendError('Something went wrong sending that. Please try again.');
      return;
    }
    // Generic response by design (see sign-up/index.ts) — shown as success
    // regardless of whether the address exists, is already confirmed, or
    // just got a fresh link, so this can't be used to enumerate accounts.
    // Derived from resendCooldown > 0 in the render below rather than its
    // own state, so the button reliably reappears once the cooldown ends
    // instead of staying hidden for the rest of the page load.
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const handleGoogleLogin = async () => {
    // Google sign-in can create a brand-new account for a first-time
    // Google user (same as Register.jsx's button) — persist the agreement
    // answer before the redirect so AuthContext.jsx can record it if this
    // turns out to be a first-time signup, not just a returning sign-in.
    // No marketing checkbox here (Login isn't the signup form) — a
    // first-time Google signup from this page is simply recorded as
    // marketingOptIn: false, same as leaving it unchecked on Register.
    setPendingOAuthConsent({
      termsVersion: TOS_LAST_UPDATED,
      privacyVersion: PRIVACY_POLICY_LAST_UPDATED,
      marketingOptIn: false,
    });
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  return (
    <AuthLayout
      icon={Heart}
      title="Wysker Watch"
      subtitle="Sign in to track your pet's health"
      footer={
        <div className="space-y-1">
          <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">Forgot password?</Link>
          <p className="text-muted-foreground">Don't have an account? <Link to="/register" className="text-primary hover:underline">Sign up</Link></p>
        </div>
      }
    >
      {accountDeleted && (
        <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-sm text-emerald-500 mb-4">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Your account has been permanently deleted.</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-base text-destructive text-center">{error}</p>}
        {showResend && (
          <div className="text-center space-y-1.5">
            {resendCooldown > 0 ? (
              <p className="text-sm text-emerald-500">
                If that address needs a new confirmation link, we've sent one. You can request another in{' '}
                {resendCooldown}s.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                className="text-sm text-primary hover:underline"
              >
                Resend confirmation email
              </button>
            )}
            {resendError && <p className="text-sm text-destructive">{resendError}</p>}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input id="login-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {settingUpDemo ? (
            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Setting up your demo…</span>
          ) : loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : 'Sign In'}
        </Button>
        <label htmlFor="login-agree-terms" className="flex items-start gap-3 min-h-11 py-1 cursor-pointer">
          <Checkbox
            id="login-agree-terms"
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
        <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={!agreedToTerms}>
          Continue with Google
        </Button>
      </form>
    </AuthLayout>
  );
}
