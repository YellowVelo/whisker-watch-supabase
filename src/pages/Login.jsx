import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Heart, CheckCircle2 } from 'lucide-react';

const RESEND_COOLDOWN_SECONDS = 60;

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
  const [error, setError] = useState('');
  const [showResend, setShowResend] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendError, setResendError] = useState('');
  const cooldownTimerRef = useRef(null);

  useEffect(() => () => clearInterval(cooldownTimerRef.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShowResend(false);
    setResendError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message || 'Login failed');
      if (isEmailNotConfirmedError(error)) {
        setShowResend(true);
      }
      setLoading(false);
      return;
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
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Heart className="h-6 w-6 text-primary" />
          </div>
          <h1 className="font-serif text-[28px]">Wysker Watch</h1>
          <p className="text-base text-muted-foreground mt-1">Sign in to track your pet's health</p>
        </div>
        {accountDeleted && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-sm text-emerald-500">
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
            <Label>Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>
            Continue with Google
          </Button>
        </form>
        <div className="text-center text-sm space-y-1">
          <Link to="/forgot-password" className="text-muted-foreground hover:text-foreground">Forgot password?</Link>
          <p className="text-muted-foreground">Don't have an account? <Link to="/register" className="text-primary hover:underline">Sign up</Link></p>
        </div>
      </div>
    </div>
  );
}
