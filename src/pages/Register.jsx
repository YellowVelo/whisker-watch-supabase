import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'react-router-dom';
import { Loader2, Heart, MailCheck } from 'lucide-react';

// Uses Supabase's default email-confirmation flow: signUp() sends a
// confirmation link (not a 6-digit code). The user clicks it, lands
// back in the app already authenticated, and AuthContext's
// onAuthStateChange listener picks up the new session automatically.
// No OTP-entry screen, no Supabase dashboard config required.
export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError('');
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { first_name: firstName.trim() || undefined },
      },
    });
    if (error) {
      setError(error.message || 'Registration failed');
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
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
          <h1 className="font-serif text-[28px]">Create Account</h1>
        </div>
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
            <div className="space-y-1.5"><Label>First Name</Label><Input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={100} required /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>Confirm Password</Label><Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign Up'}</Button>
            <Button type="button" variant="outline" className="w-full" onClick={handleGoogleLogin}>Continue with Google</Button>
          </form>
        )}
        <p className="text-center text-sm text-muted-foreground">Already have an account? <Link to="/login" className="text-primary hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
