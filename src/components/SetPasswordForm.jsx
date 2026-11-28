import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import PasswordFields from '@/components/PasswordFields';
import { Loader2 } from 'lucide-react';

// Shared by ResetPassword.jsx and AcceptInvite.jsx — both need the same
// "enter a new password twice, call supabase.auth.updateUser" form under
// an already-established Supabase session, just with different framing
// copy and a different post-success destination. Kept as one component
// so a future validation rule or copy fix only has to be made in one
// place instead of drifting between two near-identical forms.
export default function SetPasswordForm({ onSuccess, submitLabel = 'Set Password', disabled = false }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message || 'Could not set password');
      setSaving(false);
      return;
    }
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-base text-destructive text-center">{error}</p>}
      <PasswordFields password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} />
      <Button type="submit" className="w-full" disabled={saving || disabled}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}</Button>
    </form>
  );
}
