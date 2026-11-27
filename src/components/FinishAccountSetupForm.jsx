import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import PasswordFields from '@/components/PasswordFields';
import { finishAccountSetup, getAccountSetupStatus, setupScreenFor } from '@/lib/accountSetup';

// The one form that finishes an account (spec 0086): optional password,
// the required Terms checkbox and the optional marketing checkbox. Used by
// /verify-email, /accept-invite and the consent screen; each page supplies
// its own title, subtitle and button label, and asks the server (status)
// beforehand whether to show the password fields.
//
// Props:
//   needsPassword  show Password + Confirm Password (from status)
//   showMarketing  show the marketing checkbox (not on the consent screen
//                  for accounts that already have a password)
//   submitLabel    'Finish' or 'Continue' (approved copy)
//   onSuccess      called once setup is done and the browser is signed in
//   onSignedOut    optional; called instead of showing an error when this
//                  browser no longer has a session (accountSetup.js's
//                  `signedOut`, e.g. the password was saved but signing in
//                  again failed). Pages send the person to /login.
//
// Partial failure (planning decision 3): if the finish call fails after
// the password was saved, accountSetup.js has already signed in with it,
// so this form drops the password fields, re-checks status, and finishes
// with just the checkbox (or calls onSuccess if status says nothing is
// left to do).
export default function FinishAccountSetupForm({ needsPassword, showMarketing, submitLabel = 'Finish', onSuccess, onSignedOut }) {
  const id = useId();
  const [askPassword, setAskPassword] = useState(needsPassword === true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreedToTerms) return;
    if (askPassword && password !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    setError('');
    const result = await finishAccountSetup({
      password: askPassword ? password : undefined,
      acceptedTerms: true,
      marketingOptIn: showMarketing ? marketingOptIn : undefined,
    });
    if (result.ok === true) {
      onSuccess();
      return;
    }
    if (result.signedOut && onSignedOut) {
      onSignedOut();
      return;
    }
    if (result.passwordSaved) {
      setAskPassword(false);
      setPassword('');
      setConfirm('');
      const status = await getAccountSetupStatus();
      if (status.ok && !status.needsConsent) {
        onSuccess();
        return;
      }
      if (setupScreenFor(status) === 'signedOut' && onSignedOut) {
        onSignedOut();
        return;
      }
    }
    setError(result.error);
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-base text-destructive text-center">{error}</p>}
      {askPassword && (
        <PasswordFields password={password} confirm={confirm} onPasswordChange={setPassword} onConfirmChange={setConfirm} />
      )}
      <label htmlFor={`${id}-agree-terms`} className="flex items-start gap-3 min-h-11 py-1 cursor-pointer">
        <Checkbox
          id={`${id}-agree-terms`}
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
      {showMarketing && (
        <label htmlFor={`${id}-marketing-optin`} className="flex items-start gap-3 min-h-11 py-1 cursor-pointer">
          <Checkbox
            id={`${id}-marketing-optin`}
            checked={marketingOptIn}
            onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-muted-foreground">
            Send me tips, product updates, and other marketing communications.
          </span>
        </label>
      )}
      <Button type="submit" className="w-full" disabled={saving || !agreedToTerms}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}</Button>
    </form>
  );
}
