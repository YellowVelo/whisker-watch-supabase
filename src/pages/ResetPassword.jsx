import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    try {
      await base44.auth.resetPassword({ resetToken: token, newPassword: password });
      window.location.href = '/login';
    } catch (err) { setError(err.message || 'Reset failed'); setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="font-serif text-2xl">Set New Password</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <div className="space-y-1.5"><Label>New Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Confirm Password</Label><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset Password'}</Button>
        </form>
      </div>
    </div>
  );
}