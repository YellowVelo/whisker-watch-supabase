import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// The Password + Confirm Password inputs, shared by SetPasswordForm.jsx
// (password reset) and FinishAccountSetupForm.jsx (spec 0086) so the two
// forms can't drift. The parent owns the values and the "Passwords do not
// match" check.
export default function PasswordFields({ password, confirm, onPasswordChange, onConfirmChange }) {
  const id = useId();
  return (
    <>
      <div className="space-y-1.5"><Label htmlFor={`${id}-password`}>Password</Label><Input id={`${id}-password`} type="password" value={password} onChange={e => onPasswordChange(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label htmlFor={`${id}-confirm`}>Confirm Password</Label><Input id={`${id}-confirm`} type="password" value={confirm} onChange={e => onConfirmChange(e.target.value)} required /></div>
    </>
  );
}
