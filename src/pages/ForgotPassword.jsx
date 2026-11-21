import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Sentry } from '@/lib/errorMonitoring';

// Copy approved by Lynn, 2026-11-20 (spec 0074).
const RATE_LIMIT_MESSAGE = 'Too many reset requests. Please wait a few minutes, then try again.';
const GENERAL_ERROR_MESSAGE = "We couldn't send your reset email. Please try again, or email support@wyskerwatch.com if it keeps happening.";

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Spec 0074 (PA-09): resetPasswordForEmail returns its errors rather than
  // throwing them, and this page used to ignore them, so a failed send still
  // said "sent". The success copy stays enumeration-safe ("If an account
  // exists…"); Supabase doesn't reveal unknown addresses as errors either.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    let failure = null;
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      failure = resetError;
    } catch (err) {
      failure = err;
    }
    setLoading(false);

    if (!failure) {
      setSent(true);
      return;
    }
    // 429 = Supabase's over_email_send_rate_limit / over_request_rate_limit:
    // expected, not a bug, so it isn't sent to Sentry.
    if (failure.status === 429) {
      setError(RATE_LIMIT_MESSAGE);
      return;
    }
    // Never include the email address in the report.
    Sentry.captureException(failure, { tags: { feature: 'forgot-password' } });
    setError(GENERAL_ERROR_MESSAGE);
  };

  return (
    <AuthLayout
      icon={KeyRound}
      title="Reset Password"
      footer={<Link to="/login" className="flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to login</Link>}
    >
      {sent ? (
        <p className="text-base text-muted-foreground">If an account exists for {email}, you'll receive a reset link shortly.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="forgot-password-email">Email</Label><Input id="forgot-password-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} required /></div>
          {error && <p className="text-base text-destructive text-center" role="alert">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
