import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {}
    setSent(true);
    setLoading(false);
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
          <div className="space-y-1.5"><Label htmlFor="forgot-password-email">Email</Label><Input id="forgot-password-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
