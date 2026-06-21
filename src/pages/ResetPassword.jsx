import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

// NOTE: Supabase's password-reset flow differs from Base44's. Clicking the
// emailed reset link logs the user into a temporary "recovery" session
// automatically (Supabase handles the token in the URL itself before this
// component even mounts) — we just need to call updateUser() with the new
// password while that session is active. There's no manual resetToken to
// read or pass, unlike the old Base44 implementation.
export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Give Supabase a moment to process the recovery token from the URL
    // and establish the temporary session before allowing submission.
    supabase.auth.getSession().then(() => setSessionReady(true));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message || 'Reset failed');
      setLoading(false);
      return;
    }
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="font-serif text-2xl">Set New Password</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <div className="space-y-1.5"><Label>New Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Confirm Password</Label><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={loading || !sessionReady}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset Password'}</Button>
        </form>
      </div>
    </div>
  );
}
